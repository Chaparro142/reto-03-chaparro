import { ErrorLLM } from "./adapter.ts"
import type { DefinicionHerramienta, Mensaje, ProveedorLLM, RespuestaLLM } from "./adapter.ts"

/** Paso del guion: respuesta fija, función sobre el historial, o error del proveedor. */
export type Paso = RespuestaLLM | ((mensajes: Mensaje[]) => RespuestaLLM) | { error: string; estado?: number }

/** Proveedor determinista para tests: reproduce un guion de respuestas sin red ni clave. */
export class LLMSimulado implements ProveedorLLM {
  readonly proveedor = "simulado"
  readonly modelo = "guion"
  llamadas = 0

  constructor(private readonly guion: Paso[]) {}

  async enviar(_sistema: string, mensajes: Mensaje[], _herramientas: DefinicionHerramienta[]): Promise<RespuestaLLM> {
    const paso = this.guion[Math.min(this.llamadas, this.guion.length - 1)]
    this.llamadas++
    if (!paso) return { texto: "", llamadas: [], tokens: 0 }
    if (typeof paso === "function") return paso(mensajes)
    if ("error" in paso) throw new ErrorLLM(paso.error, paso.estado)
    return paso
  }
}

let contador = 0
/** Atajo para una respuesta que pide herramientas. */
export function pide(...llamadas: Array<[nombre: string, args: Record<string, unknown>]>): RespuestaLLM {
  return { texto: "", tokens: 100, llamadas: llamadas.map(([nombre, args]) => ({ id: `t${++contador}`, nombre, argumentos: JSON.stringify(args) })) }
}

export function responde(texto: string): RespuestaLLM {
  return { texto, llamadas: [], tokens: 50 }
}
