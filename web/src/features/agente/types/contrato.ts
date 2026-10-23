// Tipos del contrato entre el front y el agente. Fuente: CONTRATO-API.md.

export type ToolCall = {
  nombre: string
  args: Record<string, unknown>
  ok: boolean
  resumen: string
}

export type ChatRespuesta = {
  sessionId: string
  reply: string
  toolCalls: ToolCall[]
  needsConfirmation: boolean
  pendientes: string[]
  casos: string[]
  error: string | null
  tokens: { turno: number; sesion: number; costo_usd_turno?: number }
}

export type TurnoUsuario = { rol: 'usuario'; texto: string; ts: string }

export type TurnoAgente = {
  rol: 'agente'
  texto: string
  toolCalls: ToolCall[]
  needsConfirmation: boolean
  error: string | null
  ts: string
  /** Solo en turnos recibidos en esta pestaña; el historial del servidor no lo trae. */
  consumo?: { tokens: number; costoUsd?: number }
}

export type Turno = TurnoUsuario | TurnoAgente

export type SesionRespuesta = {
  sessionId: string
  turnos: Turno[]
  pendientes: string[]
  tokens: number
}

export type Hallazgo = {
  codigo: string
  tipo: 'bloqueo' | 'confirmacion'
  detalle: string
  accion_sugerida?: string
  valores?: Record<string, string | number | boolean | null>
}

export type Derivado = { valor: string | number; fuente: string; detalle?: string }

export type Validacion = {
  caso: string
  apta: boolean
  bloqueos: Hallazgo[]
  confirmaciones: Hallazgo[]
  derivados: Record<string, Derivado>
  retroactiva: boolean
}

export type Posicion = {
  numero: number
  descripcion: string
  cantidad: number
  unidad: 'UN' | 'H' | 'MES'
  precio_unitario: number
  centro_costo: string
  subarea: string
  indicador_iva: string
}

export type OrdenCompra = {
  referencia: { solicitud_id: string; correo_id: string; cotizacion_ref: string | null }
  sociedad: string
  organizacion_compras: string
  proveedor: { codigo_sap: string; nit: string; nombre: string }
  moneda: 'COP' | 'USD'
  condiciones_pago: string
  aprobador: { email: string; fecha_aprobacion: string; evidencia_sha256: string }
  posiciones: Posicion[]
  excepciones: Array<{ codigo: string; detalle: string; confirmado_por: string | null }>
  numero_oc?: string | null
  estado?: 'borrador' | 'creada'
}

export type Trazabilidad = Record<string, string>

export type Salud = {
  ok: boolean
  provider: string
  model: string
  llm_configurado: boolean
}
