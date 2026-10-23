import { z } from "zod"
import type { ProveedorLLM } from "../llm/adapter.ts"
import type { Store } from "../store/store.ts"
import { rutaSegura } from "../store/store.ts"
import { SapMock } from "../sap/mock.ts"
import { listarCasos } from "../domain/paquete.ts"
import { CLAVE_COSTO, ejecutarTurno } from "../agent/ciclo.ts"
import type { Limites } from "../agent/ciclo.ts"
import { ID_SESION, cargarSesion, guardarSesion } from "../agent/sesion.ts"

export type Config = {
  proveedor: string
  modelo: string
  limites: Limites
  maxCaracteres: number
  allowedOrigins: string[]
  accessKey: string | null
  adminKey: string | null
}

export type Entorno = {
  store: Store
  config: Config
  /** null si falta la clave del proveedor. */
  llm: ProveedorLLM | null
  directory: string
  ahora: () => Date
  /** Borra out/ (solo con ADMIN_KEY). */
  reiniciar?: () => Promise<void>
}

const CuerpoChat = z.object({
  sessionId: z.string().regex(ID_SESION, "sessionId inválido"),
  message: z.string().default(""),
  confirm: z.boolean().optional(),
})

const TIPOS: Record<string, string> = {
  json: "application/json; charset=utf-8",
  jsonl: "application/x-ndjson; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
}

/** API HTTP del agente (contrato en CONTRATO-API.md). Independiente de Cloudflare para poder probarla. */
export async function manejar(req: Request, env: Entorno): Promise<Response> {
  const cors = encabezadosCors(req.headers.get("Origin"), env.config.allowedOrigins)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
  const respuesta = await enrutar(req, env).catch((e: unknown) => {
    // El detalle queda en los logs del Worker; al cliente solo un mensaje genérico.
    console.error("Error interno:", e instanceof Error ? e.message : String(e))
    return json({ error: "Error interno del agente. Intenta de nuevo." }, 500)
  })
  for (const [k, v] of Object.entries(cors)) respuesta.headers.set(k, v)
  return respuesta
}

async function enrutar(req: Request, env: Entorno): Promise<Response> {
  const { pathname } = new URL(req.url)
  if (req.method === "GET" && pathname === "/api/health") {
    return json({ ok: true, provider: env.config.proveedor, model: env.config.modelo, llm_configurado: env.llm !== null })
  }
  if (!pathname.startsWith("/api/")) return json({ error: "Ruta no encontrada. La API vive en /api/*." }, 404)
  if (env.config.accessKey && req.headers.get("x-access-key") !== env.config.accessKey) {
    return json({ error: "Falta la clave de acceso (encabezado x-access-key)." }, 401)
  }
  if (req.method === "POST" && pathname === "/api/chat") return chat(req, env)
  if (req.method === "POST" && pathname === "/api/reset") return reiniciar(req, env)
  if (req.method !== "GET") return json({ error: "Método no permitido." }, 405)
  if (pathname === "/api/casos") return json({ casos: await listarCasos(env.store) })
  if (pathname === "/api/files") {
    const archivos = (await env.store.listar("out/")).filter((r) => !r.startsWith("out/sesiones/"))
    return json({ archivos })
  }
  if (pathname.startsWith("/api/files/")) {
    const ruta = decodificar(pathname.slice("/api/files/".length))
    return ruta === null ? json({ error: "Ruta no permitida." }, 400) : archivo(ruta, env)
  }
  const sesion = pathname.match(/^\/api\/sessions\/([^/]+)$/)
  if (sesion) return historial(decodificar(sesion[1]!) ?? "", env)
  return json({ error: "Ruta no encontrada." }, 404)
}

async function chat(req: Request, env: Entorno): Promise<Response> {
  let crudo: unknown
  try {
    crudo = await req.json()
  } catch {
    return json({ error: "El cuerpo debe ser JSON: { sessionId, message, confirm? }." }, 400)
  }
  const cuerpo = CuerpoChat.safeParse(crudo)
  if (!cuerpo.success) return json({ error: cuerpo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400)
  const { sessionId, message, confirm } = cuerpo.data
  if (message.length > env.config.maxCaracteres) return json({ error: `El mensaje supera ${env.config.maxCaracteres} caracteres.` }, 400)
  if (!message.trim() && !confirm) return json({ error: "El mensaje está vacío." }, 400)
  if (!env.llm) return json({ error: "El modelo no está configurado en el servidor (falta OPENROUTER_API_KEY)." }, 503)

  const usoDia = await env.store.sumar(`uso/${env.ahora().toISOString().slice(0, 10)}`, 0)
  if (usoDia >= env.config.limites.maxTokensDia) return json({ error: "Se alcanzó el tope diario de uso del modelo. Intenta mañana." }, 429)
  const maxCosto = env.config.limites.maxCostoUsd
  if (maxCosto && (await env.store.sumar(CLAVE_COSTO, 0)) / 1_000_000 >= maxCosto) {
    return json({ error: `Se alcanzó el tope de gasto del modelo (${maxCosto} USD). El agente queda en pausa.` }, 429)
  }
  const sesion = await cargarSesion(env.store, sessionId)
  if (sesion.tokens >= env.config.limites.maxTokensSesion) return json({ error: "Esta sesión alcanzó su tope de tokens. Abre una sesión nueva." }, 429)

  const resultado = await ejecutarTurno(sesion, message, confirm === true, {
    llm: env.llm,
    store: env.store,
    sap: new SapMock(env.store, env.ahora),
    sistema: await promptSistema(env.store),
    limites: env.config.limites,
    directory: env.directory,
    ahora: env.ahora,
  })
  await guardarSesion(env.store, sesion)
  return json({ sessionId, ...resultado })
}

/** System prompt = comportamiento (agent/prompt.md) + conocimiento (src/knowledge/). */
export async function promptSistema(store: Store): Promise<string> {
  const comportamiento = (await store.leerFuente("agent/prompt.md")) ?? ""
  const conocimiento = (await store.leerFuente("src/knowledge/ordenes-compra.md")) ?? ""
  return `${comportamiento}\n\n---\n\n${conocimiento}`
}

async function historial(id: string, env: Entorno): Promise<Response> {
  if (!ID_SESION.test(id)) return json({ error: "sessionId inválido." }, 400)
  const sesion = await cargarSesion(env.store, id)
  return json({ sessionId: id, turnos: sesion.turnos, pendientes: sesion.pendientes, tokens: sesion.tokens })
}

async function archivo(ruta: string, env: Entorno): Promise<Response> {
  const segura = rutaSegura(ruta, "out")
  if (!segura || segura.startsWith("out/sesiones/")) return json({ error: "Ruta no permitida." }, 400)
  const extension = segura.split(".").pop() ?? ""
  const tipo = TIPOS[extension] ?? "application/octet-stream"
  const contenido = extension === "pdf" ? await env.store.leerBytes(segura) : await env.store.leer(segura)
  if (contenido === null) return json({ error: `Todavía no existe ${segura}.` }, 404)
  return new Response(contenido, { headers: { "Content-Type": tipo, "Cache-Control": "no-store" } })
}

async function reiniciar(req: Request, env: Entorno): Promise<Response> {
  if (!env.config.adminKey || req.headers.get("x-admin-key") !== env.config.adminKey || !env.reiniciar) {
    return json({ error: "No autorizado." }, 401)
  }
  await env.reiniciar()
  return json({ ok: true })
}

/** decodeURIComponent lanza con un "%" malformado: eso es un error del cliente (400), no del servidor. */
function decodificar(segmento: string): string | null {
  try {
    return decodeURIComponent(segmento)
  } catch {
    return null
  }
}

function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), { status: estado, headers: { "Content-Type": "application/json; charset=utf-8" } })
}

/** Acepta orígenes exactos y comodines de subdominio ("https://*.vercel.app"). */
export function encabezadosCors(origen: string | null, permitidos: string[]): Record<string, string> {
  const base = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-access-key, x-admin-key", Vary: "Origin" }
  if (!origen) return base
  const coincide = permitidos.some((p) => {
    if (p === "*" || p === origen) return true
    const comodin = p.match(/^(https?:\/\/)\*\.(.+)$/)
    return comodin !== null && origen.startsWith(comodin[1]!) && origen.endsWith(`.${comodin[2]!}`)
  })
  return coincide ? { ...base, "Access-Control-Allow-Origin": origen } : base
}
