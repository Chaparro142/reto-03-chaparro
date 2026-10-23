import { normalizarCaso } from "../domain/paquete.ts"
import { sinTildes } from "../domain/texto.ts"

const NEGATIVAS = [
  /^no\b/,
  /\bno (lo |la )?confirm/,
  /\btodavia no\b/,
  /\baun no\b/,
  /\bno (la |lo )?(crees|crear|cree|hagas|proceda)/,
  /\bcancel/,
  /\bespera\b/,
  /\bdetente\b/,
]
const POSITIVAS = [/\bconfirm(o|ado|ada|amos)\b/, /^(si|ok|dale|listo|claro)\b/, /\bsi,? (crea|creala|procede|confirmo|adelante)/, /\b(adelante|procede|autorizo|hazlo)\b/, /\bcreala\b/, /\bde acuerdo\b/]

/**
 * Decide de forma determinista (sin el modelo) qué casos pendientes autoriza el mensaje del usuario.
 * Botón "Confirmar" → todos los pendientes. Negativa → ninguno. Si nombra casos, solo esos.
 */
export function casosAutorizados(mensaje: string, pendientes: string[], boton: boolean): string[] {
  if (pendientes.length === 0) return []
  if (boton) return [...pendientes]
  const texto = sinTildes(mensaje).toLowerCase().trim()
  if (NEGATIVAS.some((p) => p.test(texto))) return []
  if (!POSITIVAS.some((p) => p.test(texto))) return []
  const mencionados = casosMencionados(texto)
  return mencionados.length ? pendientes.filter((c) => mencionados.includes(c)) : [...pendientes]
}

/** El turno cierra con una pregunta de confirmación explícita (CA3). */
export function esPreguntaDeConfirmacion(respuesta: string): boolean {
  const final = sinTildes(respuesta.trim()).slice(-400).toLowerCase()
  return final.endsWith("?") && /confirm|autoriz|\bcre(o|amos|e) la oc\b/.test(final)
}

/**
 * Casos que vuelven a quedar pendientes cuando el agente pregunta de nuevo sin llamar herramientas
 * (por ejemplo, tras un "no, todavía no" y un "muéstramela otra vez"): los que nombra la pregunta,
 * o el único caso por confirmar si no nombra ninguno.
 */
export function pendientesPorPregunta(respuesta: string, porConfirmar: string[]): string[] {
  if (porConfirmar.length === 0 || !esPreguntaDeConfirmacion(respuesta)) return []
  const nombrados = casosMencionados(respuesta)
  const coinciden = porConfirmar.filter((c) => nombrados.includes(c))
  return coinciden.length ? coinciden : porConfirmar.length === 1 ? [...porConfirmar] : []
}

export function casosMencionados(texto: string): string[] {
  const encontrados = [...texto.matchAll(/\bsol[\s-]?(?:\d{4}-)?(\d{1,3})\b/gi)].map((m) => normalizarCaso(m[1]!))
  return [...new Set(encontrados.filter((c): c is string => c !== null))]
}
