import type { Store } from "../store/store.ts"

export const RUTA_CONTROL = "out/control.csv"
const ENCABEZADO = "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts"

export type ResultadoControl = "creada" | "existente" | "bloqueada" | "pendiente_confirmacion" | "rechazada" | "error"

export type FilaControl = {
  solicitud_id: string
  resultado: ResultadoControl
  numero_oc: string | null
  retroactiva: boolean
  bloqueos: string[]
  confirmaciones: string[]
}

/**
 * HU-5: cada intento (exitoso, bloqueado o pendiente) agrega una fila a out/control.csv.
 * Un bloqueo repetido sin cambios (validar y luego intentar crear el mismo caso) no se duplica.
 */
export async function registrarControl(store: Store, fila: FilaControl, ahora: Date): Promise<void> {
  if (fila.resultado === "bloqueada" && (await ultimaFila(store, fila.solicitud_id))?.startsWith(`${fila.solicitud_id},bloqueada,,${fila.retroactiva},${fila.bloqueos.join("|")},`)) return
  const celdas = [
    fila.solicitud_id,
    fila.resultado,
    fila.numero_oc ?? "",
    String(fila.retroactiva),
    fila.bloqueos.join("|"),
    fila.confirmaciones.join("|"),
    ahora.toISOString(),
  ]
  await store.anexar(RUTA_CONTROL, celdas.map(csv).join(","), ENCABEZADO)
}

async function ultimaFila(store: Store, solicitudId: string): Promise<string | undefined> {
  const texto = await store.leer(RUTA_CONTROL)
  return texto?.trim().split("\n").reverse().find((l) => l.startsWith(`${solicitudId},`))
}

function csv(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}
