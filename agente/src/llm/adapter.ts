/**
 * Interfaz propia del proveedor de lenguaje. El ciclo del agente solo conoce estos tipos:
 * cambiar de proveedor es escribir otra implementación de ProveedorLLM, sin tocar el ciclo.
 */

export type LlamadaHerramienta = {
  id: string;
  nombre: string;
  argumentos: string;
};

export type Mensaje =
  | { rol: "usuario"; texto: string }
  | { rol: "asistente"; texto: string; llamadas: LlamadaHerramienta[] }
  | {
      rol: "herramienta";
      llamadaId: string;
      nombre: string;
      contenido: string;
    };

export type DefinicionHerramienta = {
  nombre: string;
  descripcion: string;
  parametros: Record<string, unknown>;
};

export type RespuestaLLM = {
  texto: string;
  llamadas: LlamadaHerramienta[];
  tokens: number;
  /** Costo real de la llamada en USD, si el proveedor lo informa (0 si no). */
  costoUsd?: number;
};

export interface ProveedorLLM {
  readonly proveedor: string;
  readonly modelo: string;
  enviar(
    sistema: string,
    mensajes: Mensaje[],
    herramientas: DefinicionHerramienta[],
  ): Promise<RespuestaLLM>;
}

/** Error del proveedor con un mensaje apto para mostrar en el chat. */
export class ErrorLLM extends Error {
  constructor(
    mensajeClaro: string,
    readonly estado?: number,
  ) {
    super(mensajeClaro);
    this.name = "ErrorLLM";
  }
}
