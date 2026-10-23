import { z } from "zod"

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "fecha con formato YYYY-MM-DD")
const monto = z.number({ error: "debe ser un número" }).finite()

export const SolicitudSchema = z.object({
  solicitud_id: z.string().min(1),
  solicitante: z.string(),
  proveedor_nombre: z.string().min(1),
  proveedor_nit: z.string().optional(),
  descripcion: z.string().min(1),
  centro_costo: z.string().min(1),
  subarea: z.string().min(1),
  cantidad: monto,
  valor_unitario: monto,
  valor_total: monto,
  moneda: z.string().min(1),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: fechaIso,
})
export type Solicitud = z.infer<typeof SolicitudSchema>

export const CorreoSchema = z.object({
  id: z.string(),
  de: z.string(),
  asunto: z.string(),
  fecha: z.string(),
  cuerpo: z.string().optional(),
  adjuntos: z.array(z.string()).optional(),
})

export const AprobacionSchema = z.object({
  de: z.string(),
  para: z.string().optional(),
  fecha: fechaIso,
  asunto: z.string(),
  cuerpo: z.string(),
})
export type AprobacionFuente = z.infer<typeof AprobacionSchema>

export type ItemCotizacion = { descripcion: string; cantidad: number; precio_unitario: number }

export type Paquete = {
  correo: { id: string; de: string; asunto: string; fecha: string }
  solicitud: Solicitud
  cotizacion: {
    referencia: string | null
    proveedor: string
    nit: string | null
    fecha: string | null
    total: number
    moneda: string
    validez_hasta: string | null
    items: ItemCotizacion[]
    texto: string
  } | null
  aprobacion: { de: string; para: string | null; asunto: string; fecha: string; aprobado: boolean; texto: string } | null
  factura: { numero: string; fecha: string; total: number } | null
  faltantes: string[]
}

export type Proveedor = {
  codigo_sap: string
  nit: string
  nombre: string
  condiciones_pago_default: string
  indicador_iva_default: string
  activo: boolean
}
export type CentroCosto = {
  centro_costo: string
  nombre: string
  subareas: string[]
  aprobadores: Array<{ email: string; nombre: string; tope: number }>
}
export type IndicadorIva = { codigo: string; descripcion: string; tasa: number }
export type CondicionPago = { codigo: string; descripcion: string; dias: number }
export type Maestros = {
  proveedores: Proveedor[]
  centros: CentroCosto[]
  iva: IndicadorIva[]
  pagos: CondicionPago[]
}

export type Hallazgo = {
  codigo: string
  tipo: "bloqueo" | "confirmacion"
  detalle: string
  accion_sugerida: string
  valores?: Record<string, string | number>
}
export type Derivado = { valor: string; fuente: string; detalle: string }

export type Validacion = {
  caso: string
  apta: boolean
  bloqueos: Hallazgo[]
  confirmaciones: Hallazgo[]
  derivados: Record<string, Derivado>
  retroactiva: boolean
}

/** Esquema de la OC (PRD 7.4). */
export const OrdenCompraSchema = z.object({
  referencia: z.object({
    solicitud_id: z.string(),
    correo_id: z.string(),
    cotizacion_ref: z.string().nullable(),
  }),
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: z.object({ codigo_sap: z.string(), nit: z.string(), nombre: z.string() }),
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string(),
  aprobador: z.object({
    email: z.string(),
    fecha_aprobacion: z.string(),
    evidencia_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  posiciones: z
    .array(
      z.object({
        numero: z.number().int().positive(),
        descripcion: z.string().max(40),
        cantidad: z.number().positive(),
        unidad: z.enum(["UN", "H", "MES"]),
        precio_unitario: z.number().nonnegative(),
        centro_costo: z.string(),
        subarea: z.string(),
        indicador_iva: z.string(),
      }),
    )
    .min(1),
  excepciones: z.array(
    z.object({ codigo: z.string(), detalle: z.string(), confirmado_por: z.string().nullable() }),
  ),
})
export type OrdenCompra = z.infer<typeof OrdenCompraSchema>

/** Resultado que toda herramienta serializa como string. */
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }
