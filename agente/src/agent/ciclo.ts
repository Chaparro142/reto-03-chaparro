import { ErrorLLM } from "../llm/adapter.ts"
import type { ProveedorLLM } from "../llm/adapter.ts"
import type { SapAdapter } from "../sap/adapter.ts"
import type { Store } from "../store/store.ts"
import type { ContextoHerramienta } from "../tools/oc.ts"
import { definiciones, ejecutarHerramienta } from "../tools/registro.ts"
import type { Ejecucion } from "../tools/registro.ts"
import { normalizarCaso } from "../domain/paquete.ts"
import { casosAutorizados, pendientesPorPregunta } from "./confirmacion.ts"
import type { Sesion, ToolCallVisible } from "./sesion.ts"

export type Limites = {
  maxIteraciones: number
  maxTokensSesion: number
  maxTokensDia: number
  /** Gasto acumulado máximo en USD (costo real informado por el proveedor). */
  maxCostoUsd?: number
  /** Presupuesto de tiempo del turno: el front en Vercel corta las funciones a ~58 s. */
  maxDuracionMs?: number
}

/** Contador persistente del gasto total en micro-USD (entero, para sumar sin errores de coma flotante). */
export const CLAVE_COSTO = "costo/total-microusd"

export type Dependencias = {
  llm: ProveedorLLM
  store: Store
  sap: SapAdapter
  sistema: string
  limites: Limites
  directory: string
  ahora: () => Date
}

export type ResultadoTurno = {
  reply: string
  toolCalls: ToolCallVisible[]
  needsConfirmation: boolean
  pendientes: string[]
  casos: string[]
  error: string | null
  tokens: { turno: number; sesion: number; costo_usd_turno: number }
}

/** Ejecuta un turno: modelo → herramientas → modelo, hasta que el modelo responde sin herramientas o se alcanza el tope (CA1). */
export async function ejecutarTurno(sesion: Sesion, mensaje: string, boton: boolean, deps: Dependencias): Promise<ResultadoTurno> {
  const autorizados = new Set(casosAutorizados(mensaje, sesion.pendientes, boton))
  const texto = mensaje.trim() || `Confirmo. Crea la OC de ${[...autorizados].join(", ")}.`
  sesion.pendientes = [] // la autorización caduca: solo vale para este mensaje (CA3)
  sesion.mensajes.push({ rol: "usuario", texto })
  sesion.turnos.push({ rol: "usuario", texto, ts: deps.ahora().toISOString() })

  const estado: Estado = { toolCalls: [], casos: new Set(), pendientes: new Set(), porConfirmar: new Set(sesion.porConfirmar ?? []), tokens: 0, costoUsd: 0 }
  const ctx: ContextoHerramienta = {
    directory: deps.directory,
    sessionId: sesion.id,
    store: deps.store,
    sap: deps.sap,
    autorizaConfirmacion: (caso) => autorizados.has(caso),
    ahora: deps.ahora,
  }

  let reply = ""
  let error: string | null = null
  try {
    reply = await bucle(sesion, ctx, deps, estado)
  } catch (e) {
    error = e instanceof ErrorLLM ? e.message : `Error inesperado del agente: ${e instanceof Error ? e.message : String(e)}`
    reply = `⚠️ ${error}`
  }

  if (!error) for (const caso of pendientesPorPregunta(reply, [...estado.porConfirmar])) estado.pendientes.add(caso)
  sesion.pendientes = [...estado.pendientes]
  sesion.porConfirmar = [...estado.porConfirmar]
  sesion.tokens += estado.tokens
  await deps.store.sumar(`uso/${deps.ahora().toISOString().slice(0, 10)}`, estado.tokens)
  await deps.store.sumar(CLAVE_COSTO, Math.round(estado.costoUsd * 1_000_000))
  const needsConfirmation = sesion.pendientes.length > 0
  if (needsConfirmation && !error && !reply.trim().endsWith("?")) {
    reply += `\n\n¿Confirmas la creación de la OC de ${sesion.pendientes.join(", ")}? Responde "confirmo" o "no".`
  }
  sesion.turnos.push({ rol: "agente", texto: reply, toolCalls: estado.toolCalls, needsConfirmation, error, ts: deps.ahora().toISOString() })
  return {
    reply,
    toolCalls: estado.toolCalls,
    needsConfirmation,
    pendientes: sesion.pendientes,
    casos: [...estado.casos],
    error,
    tokens: { turno: estado.tokens, sesion: sesion.tokens, costo_usd_turno: Math.round(estado.costoUsd * 1_000_000) / 1_000_000 },
  }
}

type Estado = { toolCalls: ToolCallVisible[]; casos: Set<string>; pendientes: Set<string>; porConfirmar: Set<string>; tokens: number; costoUsd: number }

async function bucle(sesion: Sesion, ctx: ContextoHerramienta, deps: Dependencias, estado: Estado): Promise<string> {
  const herramientas = definiciones()
  const inicio = Date.now()
  const hechas = () => estado.toolCalls.map((t) => `${t.nombre}: ${t.resumen}`).join("; ") || "nada todavía"
  for (let i = 0; i < deps.limites.maxIteraciones; i++) {
    if (sesion.tokens + estado.tokens >= deps.limites.maxTokensSesion) {
      return "Alcancé el tope de tokens de esta sesión. Abre una sesión nueva para continuar."
    }
    if (deps.limites.maxDuracionMs && Date.now() - inicio > deps.limites.maxDuracionMs) {
      return `Este turno tomó más de ${Math.round(deps.limites.maxDuracionMs / 1000)} s y lo corté para no perder la respuesta. Lo que hice: ${hechas()}. Escribe "continúa" para seguir.`
    }
    const r = await deps.llm.enviar(deps.sistema, sesion.mensajes, herramientas)
    estado.tokens += r.tokens
    estado.costoUsd += r.costoUsd ?? 0
    sesion.mensajes.push({ rol: "asistente", texto: r.texto, llamadas: r.llamadas })
    if (r.llamadas.length === 0) return r.texto
    for (const llamada of r.llamadas) {
      const ejecucion = await ejecutarHerramienta(llamada.nombre, llamada.argumentos, ctx)
      sesion.mensajes.push({ rol: "herramienta", llamadaId: llamada.id, nombre: llamada.nombre, contenido: ejecucion.resultado })
      await registrar(ejecucion, sesion.id, deps, estado)
    }
  }
  return `Alcancé el tope de ${deps.limites.maxIteraciones} pasos en este turno. Lo que hice: ${hechas()}. Escribe "continúa" para seguir.`
}

/** CA4: cada llamada queda en el historial visible y en out/log.jsonl. Actualiza casos pendientes de confirmación. */
async function registrar(e: Ejecucion, sesionId: string, deps: Dependencias, estado: Estado): Promise<void> {
  const caso = normalizarCaso(String((e.args as { caso?: unknown }).caso ?? "")) ?? null
  estado.toolCalls.push({ nombre: e.nombre, args: e.args, ok: e.ok, resumen: e.resumen })
  await deps.store.anexar("out/log.jsonl", JSON.stringify({ ts: deps.ahora().toISOString(), sesion: sesionId, herramienta: e.nombre, caso, ok: e.ok, resumen: e.resumen }))
  if (!caso) return
  estado.casos.add(caso)
  const datos = JSON.parse(e.resultado) as { ok: boolean; data?: Record<string, unknown>; requiere_confirmacion?: boolean }
  if (e.nombre === "oc_crear") {
    if (datos.ok) {
      estado.pendientes.delete(caso)
      estado.porConfirmar.delete(caso)
    } else if (datos.requiere_confirmacion) {
      estado.pendientes.add(caso)
      estado.porConfirmar.add(caso)
    }
    return
  }
  const d = datos.data
  const conConfirmaciones =
    (e.nombre === "oc_validar" && d?.apta === true && d.oc_existente === null && (d.confirmaciones as unknown[]).length > 0) ||
    (e.nombre === "oc_construir_payload" && ((d?.confirmaciones_pendientes as unknown[] | undefined)?.length ?? 0) > 0 && d?.numero_oc === null)
  if (datos.ok && conConfirmaciones) {
    estado.pendientes.add(caso)
    estado.porConfirmar.add(caso)
  }
}
