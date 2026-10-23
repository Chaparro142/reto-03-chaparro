import { ErrorLLM } from "./adapter.ts";
import type {
  DefinicionHerramienta,
  LlamadaHerramienta,
  Mensaje,
  ProveedorLLM,
  RespuestaLLM,
} from "./adapter.ts";

const URL_API = "https://openrouter.ai/api/v1/chat/completions";

type Config = {
  apiKey: string;
  modelo: string;
  timeoutMs: number;
  fetch?: typeof fetch;
};

type MensajeApi =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

type RespuestaApi = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { total_tokens?: number; cost?: number };
  error?: { message?: string };
};

/** Implementación de ProveedorLLM sobre OpenRouter (API compatible con OpenAI) con fetch, sin SDK. */
export class OpenRouterLLM implements ProveedorLLM {
  readonly proveedor = "openrouter";
  readonly modelo: string;

  constructor(private readonly config: Config) {
    this.modelo = config.modelo;
  }

  async enviar(
    sistema: string,
    mensajes: Mensaje[],
    herramientas: DefinicionHerramienta[],
  ): Promise<RespuestaLLM> {
    const cuerpo = {
      model: this.modelo,
      messages: [
        { role: "system", content: sistema } as MensajeApi,
        ...mensajes.map(aApi),
      ],
      tools: herramientas.map((h) => ({
        type: "function",
        function: {
          name: h.nombre,
          description: h.descripcion,
          parameters: h.parametros,
        },
      })),
      tool_choice: "auto",
      temperature: 0,
      usage: { include: true },
    };
    const respuesta = await this.llamar(cuerpo);
    const mensaje = respuesta.choices?.[0]?.message;
    if (!mensaje)
      throw new ErrorLLM(
        "El modelo devolvió una respuesta vacía. Intenta de nuevo.",
      );
    const llamadas: LlamadaHerramienta[] = (mensaje.tool_calls ?? []).map(
      (t) => ({
        id: t.id,
        nombre: t.function.name,
        argumentos: t.function.arguments || "{}",
      }),
    );
    return {
      texto: mensaje.content ?? "",
      llamadas,
      tokens: respuesta.usage?.total_tokens ?? 0,
      costoUsd: respuesta.usage?.cost ?? 0,
    };
  }

  private async llamar(cuerpo: unknown): Promise<RespuestaApi> {
    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      this.config.timeoutMs,
    );
    let http: Response;
    try {
      http = await (this.config.fetch ?? fetch)(URL_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Reto03 OC SAP",
        },
        body: JSON.stringify(cuerpo),
        signal: controlador.signal,
      });
    } catch (e) {
      const abortado = e instanceof Error && e.name === "AbortError";
      throw new ErrorLLM(
        abortado
          ? `El modelo no respondió en ${this.config.timeoutMs / 1000} s. Intenta de nuevo.`
          : "No pude conectarme con el proveedor del modelo. Revisa la conexión e intenta de nuevo.",
      );
    } finally {
      clearTimeout(temporizador);
    }
    if (!http.ok) throw new ErrorLLM(mensajeHttp(http.status), http.status);
    const datos = (await http.json()) as RespuestaApi;
    if (datos.error)
      throw new ErrorLLM(
        `El proveedor del modelo devolvió un error: ${datos.error.message ?? "sin detalle"}.`,
      );
    return datos;
  }
}

function mensajeHttp(estado: number): string {
  if (estado === 401 || estado === 403)
    return "La clave del proveedor del modelo no es válida o no está configurada.";
  if (estado === 402)
    return "La cuenta del proveedor del modelo no tiene saldo o alcanzó su límite de gasto.";
  if (estado === 429)
    return "El proveedor del modelo está limitando las peticiones. Espera unos segundos e intenta de nuevo.";
  if (estado >= 500)
    return `El proveedor del modelo tuvo un error temporal (${estado}). Intenta de nuevo.`;
  return `El proveedor del modelo rechazó la petición (HTTP ${estado}).`;
}

function aApi(m: Mensaje): MensajeApi {
  if (m.rol === "usuario") return { role: "user", content: m.texto };
  if (m.rol === "herramienta")
    return { role: "tool", tool_call_id: m.llamadaId, content: m.contenido };
  const tool_calls = m.llamadas.map((l) => ({
    id: l.id,
    type: "function" as const,
    function: { name: l.nombre, arguments: l.argumentos },
  }));
  return {
    role: "assistant",
    content: m.texto || null,
    ...(tool_calls.length ? { tool_calls } : {}),
  };
}
