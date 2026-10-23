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

export function casosMencionados(texto: string): string[] {
  const encontrados = [...texto.matchAll(/\bsol[\s-]?(?:\d{4}-)?(\d{1,3})\b/gi)].map((m) => normalizarCaso(m[1]!))
  return [...new Set(encontrados.filter((c): c is string => c !== null))]
}
