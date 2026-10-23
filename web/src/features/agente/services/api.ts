import type {
  ChatRespuesta,
  OrdenCompra,
  Salud,
  SesionRespuesta,
  Trazabilidad,
  Validacion,
} from '../types/contrato'

// Todo pasa por el proxy de Next: el navegador nunca habla directo con el Worker.
const BASE = '/api/agente'

export class ErrorAgente extends Error {
  constructor(
    message: string,
    readonly estado: number,
  ) {
    super(message)
  }
}

const MENSAJES_HTTP: Record<number, string> = {
  400: 'El agente no aceptó el mensaje. Revisa que no esté vacío ni sea demasiado largo.',
  401: 'El agente rechazó la clave de acceso del front.',
  429: 'Se alcanzó el tope de uso del agente. Abre una sesión nueva o intenta más tarde.',
}

async function leerError(res: Response): Promise<ErrorAgente> {
  let detalle = ''
  try {
    const cuerpo: unknown = await res.json()
    if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && typeof cuerpo.error === 'string') {
      detalle = cuerpo.error
    }
  } catch {
    // respuesta sin JSON: se usa el mensaje genérico
  }
  const base = MENSAJES_HTTP[res.status] ?? `El agente respondió con un error (${res.status}).`
  return new ErrorAgente(detalle || base, res.status)
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${ruta}`, { cache: 'no-store', ...init })
  } catch {
    throw new ErrorAgente('Sin conexión con el servidor. Revisa tu red e intenta de nuevo.', 0)
  }
  if (!res.ok) throw await leerError(res)
  return (await res.json()) as T
}

export function enviarMensaje(sessionId: string, message: string, confirm = false): Promise<ChatRespuesta> {
  return pedir<ChatRespuesta>('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message, confirm }),
  })
}

export function cargarSesion(sessionId: string): Promise<SesionRespuesta> {
  return pedir<SesionRespuesta>(`/sessions/${encodeURIComponent(sessionId)}`)
}

export async function listarCasos(): Promise<string[]> {
  const r = await pedir<{ casos: string[] }>('/casos')
  return r.casos
}

export function salud(): Promise<Salud> {
  return pedir<Salud>('/health')
}

/** Lee un archivo generado del caso. Devuelve null si todavía no existe (404). */
async function leerArchivo<T>(caso: string, nombre: string): Promise<T | null> {
  try {
    return await pedir<T>(`/files/out/${encodeURIComponent(caso)}/${nombre}`)
  } catch (e) {
    if (e instanceof ErrorAgente && e.estado === 404) return null
    throw e
  }
}

export const leerPayload = (caso: string) => leerArchivo<OrdenCompra>(caso, 'payload.json')
export const leerValidacion = (caso: string) => leerArchivo<Validacion>(caso, 'validacion.json')
export const leerTrazabilidad = (caso: string) => leerArchivo<Trazabilidad>(caso, 'trazabilidad.json')

export function urlEvidencia(caso: string, formato: 'pdf' | 'txt'): string {
  return `${BASE}/files/out/${encodeURIComponent(caso)}/aprobacion.${formato}`
}
