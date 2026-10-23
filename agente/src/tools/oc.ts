import { z } from "zod"
import type { Store } from "../store/store.ts"
import type { SapAdapter } from "../sap/adapter.ts"
import type { Maestros, OrdenCompra, Paquete, Resultado, Validacion } from "../domain/tipos.ts"
import { cargarMaestros, leerPaquete, normalizarCaso } from "../domain/paquete.ts"
import { validar as aplicarReglas } from "../domain/validacion.ts"
import { construirOrden, diferenciasCriticas } from "../domain/payload.ts"
import type { Construccion } from "../domain/payload.ts"
import { generarEvidencia } from "../domain/evidencia.ts"
import { registrarControl } from "../domain/control.ts"
import type { ResultadoControl } from "../domain/control.ts"

/** Contexto que el ciclo (o demo.ts) entrega a cada herramienta. */
export type ContextoHerramienta = {
  directory: string
  sessionId: string
  store: Store
  sap: SapAdapter
  /** true solo si el usuario confirmó ese caso en el mensaje inmediatamente anterior. */
  autorizaConfirmacion(caso: string): boolean
  ahora(): Date
}

const caso = z.string().describe('Carpeta del caso en fixtures/reto-03/solicitudes/, por ejemplo "sol-004"')
const ignorado = (que: string) => z.unknown().optional().describe(`Opcional y no necesario: ${que} se recalcula desde la fuente. No lo envíes.`)

type Preparado = { caso: string; paquete: Paquete; maestros: Maestros; validacion: Validacion }

const json = (r: Resultado<unknown>): string => JSON.stringify(r)
const falla = (error: string): string => json({ ok: false, error })

/** Ejecuta el cuerpo y convierte cualquier excepción en { ok: false, error }: las herramientas nunca lanzan. */
async function seguro(cuerpo: () => Promise<string>): Promise<string> {
  try {
    return await cuerpo()
  } catch (e) {
    return falla(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function preparar(entrada: string, ctx: ContextoHerramienta): Promise<Resultado<Preparado>> {
  const id = normalizarCaso(entrada)
  if (!id) return { ok: false, error: `"${entrada}" no es un caso válido. Usa la forma sol-001.` }
  const paquete = await leerPaquete(ctx.store, id)
  if (!paquete.ok) return paquete
  const maestros = await cargarMaestros(ctx.store)
  if (!maestros.ok) return maestros
  const validacion = aplicarReglas(id, paquete.data, maestros.data)
  await ctx.store.escribir(`out/${id}/validacion.json`, JSON.stringify(validacion, null, 2))
  return { ok: true, data: { caso: id, paquete: paquete.data, maestros: maestros.data, validacion } }
}

async function guardarOrden(ctx: ContextoHerramienta, p: Preparado, c: Construccion, numero: string | null): Promise<void> {
  const estado = numero ? "creada" : "borrador"
  await ctx.store.escribir(`out/${p.caso}/payload.json`, JSON.stringify({ ...c.orden, numero_oc: numero, estado }, null, 2))
  await ctx.store.escribir(`out/${p.caso}/trazabilidad.json`, JSON.stringify(c.trazabilidad, null, 2))
}

async function leerOrdenGuardada(ctx: ContextoHerramienta, caso: string, numero: string): Promise<OrdenCompra | null> {
  const texto = await ctx.store.leer(`out/${caso}/payload.json`)
  if (!texto) return null
  const guardada = JSON.parse(texto) as OrdenCompra & { numero_oc?: string | null }
  return guardada.numero_oc === numero ? guardada : null
}

export const leer_paquete = {
  description: "Lee el correo, la solicitud, la cotización, la aprobación y la factura (si existe) de un caso y los devuelve normalizados.",
  args: { caso },
  async execute(args: { caso: string }, ctx: ContextoHerramienta): Promise<string> {
    return seguro(async () => {
      const id = normalizarCaso(args.caso)
      if (!id) return falla(`"${args.caso}" no es un caso válido. Usa la forma sol-001.`)
      const paquete = await leerPaquete(ctx.store, id)
      if (!paquete.ok) return json(paquete)
      return json({ ok: true, data: { caso: id, ...paquete.data } })
    })
  },
}

export const validar = {
  description: "Valida un caso contra los maestros y las reglas RC1–RC10; devuelve si es apto, bloqueos, confirmaciones, valores derivados, si es retroactivo y si ya existe su OC en SAP.",
  args: { caso, paquete: ignorado("el paquete") },
  async execute(args: { caso: string; paquete?: unknown }, ctx: ContextoHerramienta): Promise<string> {
    return seguro(async () => {
      const p = await preparar(args.caso, ctx)
      if (!p.ok) return json(p)
      const existente = await ctx.sap.buscarOrdenPorReferencia(p.data.paquete.solicitud.solicitud_id)
      const data = { ...p.data.validacion, oc_existente: existente?.numero_oc ?? null, ruta: `out/${p.data.caso}/validacion.json` }
      return json({ ok: true, data })
    })
  },
}

export const construir_payload = {
  description: "Construye la orden de compra tal como quedaría en SAP (cabecera, posiciones, excepciones) y guarda su trazabilidad; solo funciona si el caso no tiene bloqueos.",
  args: { caso, paquete: ignorado("el paquete"), derivados: ignorado("los derivados") },
  async execute(args: { caso: string; paquete?: unknown; derivados?: unknown }, ctx: ContextoHerramienta): Promise<string> {
    return seguro(async () => {
      const p = await preparar(args.caso, ctx)
      if (!p.ok) return json(p)
      const { validacion } = p.data
      if (!validacion.apta) {
        return falla(`No se construye la OC de ${p.data.caso}: tiene bloqueos (${validacion.bloqueos.map((b) => b.codigo).join(", ")}). ${validacion.bloqueos.map((b) => b.detalle).join(" ")}`)
      }
      const c = await construirOrden(p.data.paquete, p.data.maestros, validacion)
      if (!c) return falla(`No se pudo construir la OC de ${p.data.caso}: faltan datos derivables (IVA o condiciones de pago).`)
      const existente = await ctx.sap.buscarOrdenPorReferencia(c.orden.referencia.solicitud_id)
      // Si la OC ya existe, se devuelve la guardada (con quién confirmó cada excepción) y no se sobrescribe.
      const guardada = existente ? await leerOrdenGuardada(ctx, p.data.caso, existente.numero_oc) : null
      if (!guardada) await guardarOrden(ctx, p.data, c, existente?.numero_oc ?? null)
      return json({
        ok: true,
        data: {
          orden: guardada ?? c.orden,
          numero_oc: existente?.numero_oc ?? null,
          confirmaciones_pendientes: existente ? [] : validacion.confirmaciones.map((h) => h.codigo),
          derivados: validacion.derivados,
          ruta_payload: `out/${p.data.caso}/payload.json`,
          ruta_trazabilidad: `out/${p.data.caso}/trazabilidad.json`,
        },
      })
    })
  },
}

export const generar_evidencia = {
  description: "Genera la evidencia de aprobación del caso (aprobacion.txt y aprobacion.pdf) con el sha256 del contenido del correo.",
  args: { caso },
  async execute(args: { caso: string }, ctx: ContextoHerramienta): Promise<string> {
    return seguro(async () => {
      const id = normalizarCaso(args.caso)
      if (!id) return falla(`"${args.caso}" no es un caso válido. Usa la forma sol-001.`)
      const paquete = await leerPaquete(ctx.store, id)
      if (!paquete.ok) return json(paquete)
      const evidencia = await generarEvidencia(ctx.store, id, paquete.data)
      if (!evidencia) return falla(`El caso ${id} no trae correo de aprobación; no hay evidencia que generar. Pide la aprobación al solicitante.`)
      return json({ ok: true, data: evidencia })
    })
  },
}

export const crear = {
  description: "Crea la orden de compra del caso en SAP (simulado) y devuelve su número; si el caso tiene confirmaciones, exige confirmado=true y que el usuario lo haya confirmado en su último mensaje.",
  args: {
    caso,
    payload: ignorado("la OC; si la envías, se compara con la calculada y se rechaza si los montos difieren"),
    confirmado: z.boolean().optional().describe("true solo si el usuario confirmó explícitamente las excepciones en su último mensaje"),
  },
  async execute(args: { caso: string; payload?: unknown; confirmado?: boolean }, ctx: ContextoHerramienta): Promise<string> {
    return seguro(async () => {
      const p = await preparar(args.caso, ctx)
      if (!p.ok) return json(p)
      return crearOrden(p.data, args, ctx)
    })
  },
}

async function crearOrden(p: Preparado, args: { payload?: unknown; confirmado?: boolean }, ctx: ContextoHerramienta): Promise<string> {
  const v = p.validacion
  const solicitudId = p.paquete.solicitud.solicitud_id
  const registrar = (resultado: ResultadoControl, numero: string | null = null) =>
    registrarControl(ctx.store, {
      solicitud_id: solicitudId,
      resultado,
      numero_oc: numero,
      retroactiva: v.retroactiva,
      bloqueos: v.bloqueos.map((b) => b.codigo),
      confirmaciones: v.confirmaciones.map((c) => c.codigo),
    }, ctx.ahora())

  const existente = await ctx.sap.buscarOrdenPorReferencia(solicitudId)
  if (existente) {
    await registrar("existente", existente.numero_oc)
    return json({ ok: true, data: { numero_oc: existente.numero_oc, fecha: null, idempotente: true, retroactiva: v.retroactiva } })
  }
  if (!v.apta) {
    await registrar("bloqueada")
    return falla(`No se crea la OC de ${p.caso}: ${v.bloqueos.map((b) => `${b.codigo} ${b.detalle} Acción: ${b.accion_sugerida}`).join(" | ")}`)
  }
  const c = await construirOrden(p.paquete, p.maestros, v)
  if (!c) {
    await registrar("error")
    return falla(`No se pudo construir la OC de ${p.caso}.`)
  }
  if (args.payload !== undefined) {
    const diferencias = diferenciasCriticas(args.payload, c.orden)
    if (diferencias.length) {
      await registrar("rechazada")
      return falla(`El payload enviado no coincide con el calculado desde la fuente; no se crea. Diferencias: ${diferencias.join("; ")}.`)
    }
  }
  if (v.confirmaciones.length && !(args.confirmado === true && ctx.autorizaConfirmacion(p.caso))) {
    await registrar("pendiente_confirmacion")
    const motivo = args.confirmado ? "el usuario no lo ha confirmado en su último mensaje" : "requiere confirmado=true"
    return JSON.stringify({
      ok: false,
      error: `La OC de ${p.caso} necesita confirmación humana (${motivo}). Pregunta al usuario y espera su respuesta.`,
      requiere_confirmacion: true,
      confirmaciones: v.confirmaciones,
    })
  }
  return emitirOrden(p, c, ctx, registrar)
}

async function emitirOrden(
  p: Preparado,
  c: Construccion,
  ctx: ContextoHerramienta,
  registrar: (r: ResultadoControl, numero?: string | null) => Promise<void>,
): Promise<string> {
  const evidencia = await generarEvidencia(ctx.store, p.caso, p.paquete)
  const confirmadoPor = `analista vía chat (sesión ${ctx.sessionId})`
  const orden = { ...c.orden, excepciones: c.orden.excepciones.map((e) => ({ ...e, confirmado_por: confirmadoPor })) }
  const { numero_oc, fecha } = await ctx.sap.crearOrden(orden)
  await guardarOrden(ctx, p, { ...c, orden }, numero_oc)
  await registrar("creada", numero_oc)
  return json({
    ok: true,
    data: {
      numero_oc,
      fecha,
      idempotente: false,
      retroactiva: p.validacion.retroactiva,
      excepciones_confirmadas: orden.excepciones.map((e) => e.codigo),
      evidencia: evidencia ? [evidencia.ruta, evidencia.ruta_pdf] : [],
      ruta_payload: `out/${p.caso}/payload.json`,
    },
  })
}
