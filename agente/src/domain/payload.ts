import type { Derivado, Hallazgo, Maestros, OrdenCompra, Paquete, Validacion } from "./tipos.ts"
import { OrdenCompraSchema } from "./tipos.ts"
import { buscarProveedor } from "./validacion.ts"
import { contenidoAprobacion, sha256 } from "./evidencia.ts"
import { recortar, soloFecha } from "./texto.ts"

export type Unidad = "UN" | "H" | "MES"
/** Fuentes que admite el PRD (HU-3). El correo y la aprobación son parte del paquete de la solicitud; las constantes de SAP, derivados. */
export type Fuente = "solicitud" | "cotizacion" | "derivado" | `maestro.${string}`
export type Construccion = { orden: OrdenCompra; trazabilidad: Record<string, Fuente> }

/** Infiere la unidad desde el ítem cotizado: "Hora…" → H, mensual → MES, resto UN. */
export function inferirUnidad(paquete: Paquete): Derivado & { valor: Unidad } {
  const item = paquete.cotizacion?.items[0]?.descripcion ?? paquete.solicitud.descripcion
  const texto = item.toLowerCase()
  const valor: Unidad = /^horas?\b|\bhoras? de\b/.test(texto) ? "H" : /\bmes(es)?\b|mensual/.test(texto) ? "MES" : "UN"
  return { valor, fuente: "derivado", detalle: `Unidad inferida del ítem "${item}".` }
}

/**
 * HU-3: construye la OC (PRD 7.4) recalculando todo desde el paquete y los maestros.
 * Exige una validación sin bloqueos; las confirmaciones quedan como excepciones sin confirmar.
 */
export async function construirOrden(paquete: Paquete, maestros: Maestros, validacion: Validacion): Promise<Construccion | null> {
  const proveedor = buscarProveedor(paquete, maestros.proveedores)
  if (!validacion.apta || !proveedor || !paquete.aprobacion) return null
  const s = paquete.solicitud
  const iva = s.indicador_iva ?? validacion.derivados.indicador_iva?.valor
  const pago = s.condiciones_pago ?? validacion.derivados.condiciones_pago?.valor
  if (!iva || !pago) return null
  const unidad = inferirUnidad(paquete)

  const orden: OrdenCompra = {
    referencia: { solicitud_id: s.solicitud_id, correo_id: paquete.correo.id, cotizacion_ref: paquete.cotizacion?.referencia ?? null },
    sociedad: "1000",
    organizacion_compras: "1000",
    proveedor: { codigo_sap: proveedor.codigo_sap, nit: proveedor.nit, nombre: proveedor.nombre },
    moneda: s.moneda as OrdenCompra["moneda"],
    condiciones_pago: pago,
    aprobador: {
      email: paquete.aprobacion.de,
      fecha_aprobacion: soloFecha(paquete.aprobacion.fecha),
      evidencia_sha256: await sha256(contenidoAprobacion(paquete.aprobacion)),
    },
    posiciones: [
      {
        numero: 10,
        descripcion: recortar(s.descripcion, 40),
        cantidad: s.cantidad,
        unidad: unidad.valor,
        precio_unitario: s.valor_unitario,
        centro_costo: s.centro_costo,
        subarea: s.subarea,
        indicador_iva: iva,
      },
    ],
    excepciones: validacion.confirmaciones.map(aExcepcion),
  }
  return { orden: OrdenCompraSchema.parse(orden), trazabilidad: trazar(paquete, validacion) }
}

function aExcepcion(h: Hallazgo): OrdenCompra["excepciones"][number] {
  return { codigo: h.codigo, detalle: h.detalle, confirmado_por: null }
}

function trazar(paquete: Paquete, validacion: Validacion): Record<string, Fuente> {
  const s = paquete.solicitud
  return {
    "referencia.solicitud_id": "solicitud",
    "referencia.correo_id": "solicitud",
    "referencia.cotizacion_ref": "cotizacion",
    sociedad: "derivado",
    organizacion_compras: "derivado",
    "proveedor.codigo_sap": "maestro.proveedores",
    "proveedor.nit": "maestro.proveedores",
    "proveedor.nombre": "maestro.proveedores",
    moneda: "solicitud",
    condiciones_pago: s.condiciones_pago ? "solicitud" : "maestro.proveedores",
    "aprobador.email": "solicitud",
    "aprobador.fecha_aprobacion": "solicitud",
    "aprobador.evidencia_sha256": "derivado",
    "posiciones[0].numero": "derivado",
    "posiciones[0].descripcion": "solicitud",
    "posiciones[0].cantidad": "solicitud",
    "posiciones[0].unidad": "derivado",
    "posiciones[0].precio_unitario": "solicitud",
    "posiciones[0].centro_costo": "solicitud",
    "posiciones[0].subarea": "solicitud",
    "posiciones[0].indicador_iva": s.indicador_iva ? "solicitud" : "maestro.proveedores",
    excepciones: "derivado",
  }
}

/**
 * Compara los campos que no se pueden alterar (montos, proveedor, imputación) entre la OC que
 * envía el modelo y la calculada. Devuelve la lista de diferencias; vacía si coinciden.
 */
export function diferenciasCriticas(enviada: unknown, calculada: OrdenCompra): string[] {
  const parseo = OrdenCompraSchema.safeParse(enviada)
  if (!parseo.success) return ["el payload enviado no cumple el esquema de la OC"]
  const e = parseo.data
  const diferencias: string[] = []
  const comparar = (campo: string, a: unknown, b: unknown): void => {
    if (a !== b) diferencias.push(`${campo}: enviado ${String(a)}, calculado ${String(b)}`)
  }
  comparar("proveedor.codigo_sap", e.proveedor.codigo_sap, calculada.proveedor.codigo_sap)
  comparar("moneda", e.moneda, calculada.moneda)
  comparar("condiciones_pago", e.condiciones_pago, calculada.condiciones_pago)
  comparar("posiciones", e.posiciones.length, calculada.posiciones.length)
  calculada.posiciones.forEach((p, i) => {
    const q = e.posiciones[i]
    if (!q) return
    comparar(`posiciones[${i}].cantidad`, q.cantidad, p.cantidad)
    comparar(`posiciones[${i}].precio_unitario`, q.precio_unitario, p.precio_unitario)
    comparar(`posiciones[${i}].centro_costo`, q.centro_costo, p.centro_costo)
    comparar(`posiciones[${i}].indicador_iva`, q.indicador_iva, p.indicador_iva)
  })
  return diferencias
}
