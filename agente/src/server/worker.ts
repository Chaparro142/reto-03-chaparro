import { manejar } from "./app.ts"
import type { Config } from "./app.ts"
import { Almacen, DurableStore } from "../store/durable.ts"
import { EMBEBIDOS } from "../store/embebidos.generated.ts"
import { OpenRouterLLM } from "../llm/openrouter.ts"

export { Almacen }

type Env = {
  ALMACEN: DurableObjectNamespace<Almacen>
  OPENROUTER_API_KEY?: string
  ACCESS_KEY?: string
  ADMIN_KEY?: string
  LLM_PROVIDER?: string
  LLM_MODEL?: string
  LLM_TIMEOUT_MS?: string
  MAX_ITERACIONES?: string
  MAX_TOKENS_SESION?: string
  MAX_TOKENS_DIA?: string
  MAX_DURACION_TURNO_MS?: string
  MAX_COSTO_USD?: string
  MAX_CARACTERES_MENSAJE?: string
  ALLOWED_ORIGINS?: string
}

const numero = (valor: string | undefined, porDefecto: number): number => {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : porDefecto
}

function configurar(env: Env): Config {
  return {
    proveedor: env.LLM_PROVIDER ?? "openrouter",
    modelo: env.LLM_MODEL ?? "anthropic/claude-haiku-5.5",
    limites: {
      maxIteraciones: numero(env.MAX_ITERACIONES, 25),
      maxTokensSesion: numero(env.MAX_TOKENS_SESION, 300_000),
      maxTokensDia: numero(env.MAX_TOKENS_DIA, 3_000_000),
      maxDuracionMs: numero(env.MAX_DURACION_TURNO_MS, 30_000),
      maxCostoUsd: numero(env.MAX_COSTO_USD, 5),
    },
    maxCaracteres: numero(env.MAX_CARACTERES_MENSAJE, 4000),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
    accessKey: env.ACCESS_KEY || null,
    adminKey: env.ADMIN_KEY || null,
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const config = configurar(env)
    const almacen = env.ALMACEN.get(env.ALMACEN.idFromName("global"))
    const llm = env.OPENROUTER_API_KEY
      ? new OpenRouterLLM({ apiKey: env.OPENROUTER_API_KEY, modelo: config.modelo, timeoutMs: numero(env.LLM_TIMEOUT_MS, 25_000) })
      : null
    return manejar(req, {
      store: new DurableStore(almacen, EMBEBIDOS),
      config,
      llm,
      directory: ".",
      ahora: () => new Date(),
      reiniciar: () => almacen.borrarSalida(),
    })
  },
} satisfies ExportedHandler<Env>
