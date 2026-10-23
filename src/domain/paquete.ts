import type { z } from "zod"
import type { Store } from "../store/store.ts"
import { AprobacionSchema, CorreoSchema, SolicitudSchema } from "./tipos.ts"
import type { ItemCotizacion, Maestros, Paquete, Resultado } from "./tipos.ts"
import { normalizarNit, parsearMonto, soloFecha, sumarDias } from "./texto.ts"

export const RAIZ_FIXTURES = "fixtures/reto-03"
export const RAIZ_SOLICITUDES = `${RAIZ_FIXTURES}/solicitudes`

/** "sol-004", "SOL-2026-004", "4" → "sol-004". null si no tiene forma de caso. */
export function normalizarCaso(caso: string): string | null {
  const texto = caso.trim().toLowerCase()
  const conAnio = texto.match(/^sol-\d{4}-(\d{1,3})$/)
  const corto = texto.match(/^(?:sol-?)?(\d{1,3})$/)
  const numero = conAnio?.[1] ?? corto?.[1]
  return numero ? `sol-${numero.padStart(3, "0")}` : null
}

export async function listarCasos(store: Store): Promise<string[]> {
  const rutas = await store.listarFuentes(`${RAIZ_SOLICITUDES}/`)
  const casos = new Set(rutas.map((r) => r.slice(RAIZ_SOLICITUDES.length + 1).split("/")[0]!))
  return [...casos].sort()
}

type Lectura<T> = { valor: T | null; error: string | null }

async function leerJson<S extends z.ZodType>(store: Store, ruta: string, esquema: S): Promise<Lectura<z.infer<S>>> {
  const texto = await store.leerFuente(ruta)
  if (texto === null) return { valor: null, error: null }
  let crudo: unknown
  try {
    crudo = JSON.parse(texto)
  } catch {
    return { valor: null, error: `${nombreArchivo(ruta)} no es un JSON válido` }
  }
  const parseo = esquema.safeParse(crudo)
  if (!parseo.success) {
    const detalle = parseo.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")
    return { valor: null, error: `${nombreArchivo(ruta)} tiene campos inválidos (${detalle})` }
  }
  return { valor: parseo.data, error: null }
}

function nombreArchivo(ruta: string): string {
  return ruta.split("/").pop() ?? ruta
}

/** Lee y normaliza el paquete de un caso (HU-1). Adjuntos ausentes → null y nombre en faltantes. */
export async function leerPaquete(store: Store, casoEntrada: string): Promise<Resultado<Paquete>> {
  const caso = normalizarCaso(casoEntrada)
  if (!caso) return { ok: false, error: `"${casoEntrada}" no es un identificador de caso válido. Usa la forma sol-001.` }
  const base = `${RAIZ_SOLICITUDES}/${caso}`
  const existentes = await store.listarFuentes(`${base}/`)
  if (existentes.length === 0) {
    const casos = await listarCasos(store)
    return { ok: false, error: `No existe el caso ${caso}. Casos disponibles: ${casos.join(", ")}.` }
  }

  const solicitud = await leerJson(store, `${base}/solicitud.json`, SolicitudSchema)
  if (solicitud.error) return { ok: false, error: `${solicitud.error}. Pide al solicitante que corrija el Excel de solicitud.` }
  if (!solicitud.valor) return { ok: false, error: `El caso ${caso} no trae la solicitud (solicitud.xlsx). Pídela al solicitante.` }
  const correo = await leerJson(store, `${base}/correo.json`, CorreoSchema)
  if (correo.error) return { ok: false, error: correo.error }
  const aprobacion = await leerJson(store, `${base}/aprobacion.json`, AprobacionSchema)
  if (aprobacion.error) return { ok: false, error: `${aprobacion.error}. Pide de nuevo el correo de aprobación.` }

  const textoCotizacion = await store.leerFuente(`${base}/cotizacion.txt`)
  const textoFactura = await store.leerFuente(`${base}/factura.txt`)
  const cotizacion = textoCotizacion === null ? null : parsearCotizacion(textoCotizacion)
  if (textoCotizacion !== null && !cotizacion) {
    return { ok: false, error: "No pude leer el total de la cotización (cotizacion.txt). Pide al proveedor una cotización legible." }
  }
  const factura = textoFactura === null ? null : parsearFactura(textoFactura)

  const faltantes: string[] = []
  if (!correo.valor) faltantes.push("correo")
  if (!cotizacion) faltantes.push("cotizacion")
  if (!aprobacion.valor) faltantes.push("aprobacion")

  return {
    ok: true,
    data: {
      correo: correo.valor
        ? { id: correo.valor.id, de: correo.valor.de, asunto: correo.valor.asunto, fecha: correo.valor.fecha }
        : { id: `${caso}-sin-correo`, de: "", asunto: "", fecha: "" },
      solicitud: solicitud.valor,
      cotizacion,
      aprobacion: aprobacion.valor
        ? {
            de: aprobacion.valor.de,
            para: aprobacion.valor.para ?? null,
            asunto: aprobacion.valor.asunto,
            fecha: aprobacion.valor.fecha,
            aprobado: esAprobado(aprobacion.valor.cuerpo),
            texto: aprobacion.valor.cuerpo,
          }
        : null,
      factura,
      faltantes,
    },
  }
}

/** Contiene "aprobado/a" y no "no aprobado" ni "rechazado". */
export function esAprobado(cuerpo: string): boolean {
  const texto = cuerpo.toLowerCase()
  if (/\bno\s+(est[aá]\s+)?aprobad[oa]\b/.test(texto) || /rechaz/.test(texto)) return false
  return /\baprobad[oa]\b/.test(texto)
}

const linea = (texto: string, patron: RegExp): string | null => texto.match(patron)?.[1]?.trim() ?? null

export function parsearCotizacion(texto: string): NonNullable<Paquete["cotizacion"]> | null {
  const total = texto.match(/^TOTAL[^:\n]*:\s*([A-Z]{3})\s*([\d.,]+)/m)
  const montoTotal = total ? parsearMonto(total[2]!) : null
  if (!total || montoTotal === null) return null
  const fecha = linea(texto, /^Fecha:\s*(\d{4}-\d{2}-\d{2})/m)
  const dias = linea(texto, /^Validez de la oferta:\s*(\d+)\s*d[ií]as/m)
  const nit = linea(texto, /^NIT:\s*([\d.\-\s]+)/m)
  return {
    referencia: linea(texto, /^COTIZACI[ÓO]N\s+(\S+)/m),
    proveedor: linea(texto, /^Proveedor:\s*(.+)$/m) ?? "",
    nit: nit ? normalizarNit(nit) : null,
    fecha,
    total: montoTotal,
    moneda: total[1]!,
    validez_hasta: fecha && dias ? sumarDias(fecha, Number(dias)) : null,
    items: parsearItems(texto),
    texto,
  }
}

function parsearItems(texto: string): ItemCotizacion[] {
  const patron = /^\d+\.\s*(.+?)\s*\|\s*Cantidad:\s*([\d.,]+)\s*\|\s*Precio unitario[^:]*:\s*[A-Z]{3}\s*([\d.,]+)/gm
  return [...texto.matchAll(patron)].map((m) => ({
    descripcion: m[1]!,
    cantidad: parsearMonto(m[2]!) ?? 0,
    precio_unitario: parsearMonto(m[3]!) ?? 0,
  }))
}

export function parsearFactura(texto: string): Paquete["factura"] {
  const numero = linea(texto, /No\.\s*(\S+)/)
  const fecha = linea(texto, /Fecha de emisi[óo]n:\s*(\d{4}-\d{2}-\d{2})/)
  const total = linea(texto, /^TOTAL:\s*[A-Z]{3}\s*([\d.,]+)/m)
  const monto = total ? parsearMonto(total) : null
  if (!fecha || monto === null) return null
  return { numero: numero ?? "sin número", fecha: soloFecha(fecha), total: monto }
}

const MAESTROS = `${RAIZ_FIXTURES}/maestros`

export async function cargarMaestros(store: Store): Promise<Resultado<Maestros>> {
  const archivos = {
    proveedores: "proveedores.json",
    centros: "centros-costo.json",
    iva: "indicadores-iva.json",
    pagos: "condiciones-pago.json",
  } as const
  const salida: Record<string, unknown> = {}
  for (const [clave, archivo] of Object.entries(archivos)) {
    const texto = await store.leerFuente(`${MAESTROS}/${archivo}`)
    if (texto === null) return { ok: false, error: `Falta el maestro ${archivo}.` }
    try {
      salida[clave] = JSON.parse(texto)
    } catch {
      return { ok: false, error: `El maestro ${archivo} no es un JSON válido.` }
    }
  }
  return { ok: true, data: salida as Maestros }
}
