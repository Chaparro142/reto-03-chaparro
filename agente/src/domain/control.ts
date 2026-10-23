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

/** HU-5: cada intento (exitoso, bloqueado o pendiente) agrega una fila a out/control.csv. */
export async function registrarControl(store: Store, fila: FilaControl, ahora: Date): Promise<void> {
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

function csv(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}
