import { z } from "zod"
import * as oc from "./oc.ts"
import type { ContextoHerramienta } from "./oc.ts"
import type { DefinicionHerramienta } from "../llm/adapter.ts"

type Herramienta = {
  description: string
  args: Record<string, z.ZodType>
  execute(args: never, ctx: ContextoHerramienta): Promise<string>
}

/** Nombre que ve el modelo: <archivo>_<export> (PRD 6.2). */
const MODULOS: Record<string, Record<string, Herramienta>> = { oc }

export const HERRAMIENTAS: Record<string, Herramienta> = Object.fromEntries(
  Object.entries(MODULOS).flatMap(([archivo, exports]) =>
    Object.entries(exports)
      .filter(([, h]) => typeof h === "object" && h !== null && "execute" in h)
      .map(([nombre, h]) => [`${archivo}_${nombre}`, h]),
  ),
)

/** JSON Schema de cada herramienta, generado desde zod (una sola fuente de verdad). */
export function definiciones(): DefinicionHerramienta[] {
  return Object.entries(HERRAMIENTAS).map(([nombre, h]) => {
    const { $schema: _, ...parametros } = z.toJSONSchema(z.object(h.args)) as Record<string, unknown>
    return { nombre, descripcion: h.description, parametros }
  })
}

export type Ejecucion = { nombre: string; args: unknown; ok: boolean; resultado: string; resumen: string }

/** Valida los argumentos con zod antes de ejecutar; si no cumplen, devuelve el error al modelo sin lanzar. */
export async function ejecutarHerramienta(nombre: string, argumentos: string, ctx: ContextoHerramienta): Promise<Ejecucion> {
  const herramienta = HERRAMIENTAS[nombre]
  let args: unknown = {}
  const falla = (error: string): Ejecucion => ({ nombre, args, ok: false, resultado: JSON.stringify({ ok: false, error }), resumen: error })
  if (!herramienta) return falla(`La herramienta ${nombre} no existe. Disponibles: ${Object.keys(HERRAMIENTAS).join(", ")}.`)
  try {
    args = argumentos.trim() ? JSON.parse(argumentos) : {}
  } catch {
    return falla("Los argumentos no son un JSON válido.")
  }
  const parseo = z.object(herramienta.args).safeParse(args)
  if (!parseo.success) {
    return falla(`Argumentos inválidos: ${parseo.error.issues.map((i) => `${i.path.join(".") || "(raíz)"} ${i.message}`).join("; ")}`)
  }
  const resultado = await herramienta.execute(parseo.data as never, ctx)
  const datos = JSON.parse(resultado) as { ok: boolean; data?: Record<string, unknown>; error?: string }
  return { nombre, args: resumirArgs(parseo.data), ok: datos.ok, resultado, resumen: resumir(nombre, datos) }
}

/** Para el chat y el log: sin objetos grandes que el modelo haya enviado de más. */
function resumirArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === "object" && v !== null ? "(objeto omitido)" : v]))
}

type Hallazgo = { codigo: string }

function resumir(nombre: string, r: { ok: boolean; data?: Record<string, unknown>; error?: string }): string {
  if (!r.ok) return r.error ?? "error"
  const d = r.data ?? {}
  const codigos = (x: unknown): string => ((x as Hallazgo[] | undefined) ?? []).map((h) => h.codigo).join(", ")
  switch (nombre) {
    case "oc_leer_paquete": {
      const faltantes = (d.faltantes as string[] | undefined) ?? []
      return `paquete leído${faltantes.length ? ` · faltan: ${faltantes.join(", ")}` : " · completo"}${d.factura ? " · trae factura" : ""}`
    }
    case "oc_validar": {
      const b = (d.bloqueos as Hallazgo[]).length
      const c = (d.confirmaciones as Hallazgo[]).length
      return `${d.oc_existente ? `OC ${String(d.oc_existente)} ya existe · ` : ""}${d.apta ? "apta" : "no apta"} · ${b} bloqueo(s)${b ? ` (${codigos(d.bloqueos)})` : ""} · ${c} confirmación(es)${c ? ` (${codigos(d.confirmaciones)})` : ""}${d.retroactiva ? " · retroactiva" : ""}`
    }
    case "oc_construir_payload":
      return `OC construida · ${String(d.ruta_payload)}`
    case "oc_generar_evidencia":
      return `evidencia generada · sha256 ${String(d.sha256).slice(0, 12)}…`
    case "oc_crear":
      return d.idempotente ? `ya existía la OC ${String(d.numero_oc)} (idempotente)` : `OC ${String(d.numero_oc)} creada${d.retroactiva ? " · retroactiva" : ""}`
    default:
      return "ok"
  }
}
