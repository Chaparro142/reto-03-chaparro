import type { Mensaje } from "../llm/adapter.ts"
import type { Store } from "../store/store.ts"

export type ToolCallVisible = { nombre: string; args: unknown; ok: boolean; resumen: string }

export type Turno =
  | { rol: "usuario"; texto: string; ts: string }
  | { rol: "agente"; texto: string; toolCalls: ToolCallVisible[]; needsConfirmation: boolean; error: string | null; ts: string }

export type Sesion = {
  id: string
  /** Historial completo para el modelo (incluye resultados de herramientas). */
  mensajes: Mensaje[]
  /** Historial visible para el front. */
  turnos: Turno[]
  /** Casos que esperan confirmación de la analista; solo valen para el mensaje siguiente. */
  pendientes: string[]
  /** Casos validados con excepciones y aún sin OC; vuelven a ser pendientes si el agente pregunta otra vez por ellos. */
  porConfirmar?: string[]
  tokens: number
}

export const ID_SESION = /^[A-Za-z0-9_-]{1,100}$/

const ruta = (id: string) => `out/sesiones/${id}.json`

export async function cargarSesion(store: Store, id: string): Promise<Sesion> {
  const texto = await store.leer(ruta(id))
  return texto ? (JSON.parse(texto) as Sesion) : { id, mensajes: [], turnos: [], pendientes: [], tokens: 0 }
}

export async function guardarSesion(store: Store, sesion: Sesion): Promise<void> {
  await store.escribir(ruta(sesion.id), JSON.stringify(sesion))
}
