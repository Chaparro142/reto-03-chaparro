/** Utilidades de normalización compartidas por lectura y validación. */

/** "900.555.111-2" → "900555111" (sin puntos, espacios ni dígito de verificación). */
export function normalizarNit(nit: string): string {
  return nit.split("-")[0]!.replace(/[^\d]/g, "")
}

/** Minúsculas, sin tildes, sin puntuación ni sufijos societarios ("S.A.S.", "Ltda.", "S.A."). */
export function normalizarNombre(nombre: string): string {
  return sinTildes(nombre)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(s\s*a\s*s|s\s*a|ltda|limitada|sas)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/** "11.400.000" o "1.234,50" (formato colombiano) → número. null si no es un monto. */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.trim().replace(/\./g, "").replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null
  return Number(limpio)
}

/** Fecha local "YYYY-MM-DD" de un texto ISO, sin conversión de zona horaria. */
export function soloFecha(fecha: string): string {
  return fecha.slice(0, 10)
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Recorta a máx caracteres sin partir palabras (texto breve de SAP). */
export function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corte = texto.slice(0, max + 1)
  const espacio = corte.lastIndexOf(" ")
  const base = espacio > max / 2 ? corte.slice(0, espacio) : texto.slice(0, max)
  return base.replace(/[\s,;:.-]+$/, "")
}

export function formatoMoneda(valor: number, moneda: string): string {
  return `${moneda} ${valor.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`
}
