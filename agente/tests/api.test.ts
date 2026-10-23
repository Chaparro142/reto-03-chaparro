import { describe, expect, test } from "bun:test"
import { manejar } from "../src/server/app.ts"
import type { Entorno } from "../src/server/app.ts"
import { LLMSimulado } from "../src/llm/simulado.ts"
import type { ProveedorLLM } from "../src/llm/adapter.ts"
import { proyectoTemporal } from "./utilidades.ts"

async function entorno(llm: ProveedorLLM | null, accessKey: string | null = null): Promise<Entorno> {
  const store = await proyectoTemporal()
  return {
    store,
    llm,
    directory: store.directory,
    ahora: () => new Date("2026-10-23T12:00:00Z"),
    config: {
      proveedor: "simulado",
      modelo: "guion",
      limites: { maxIteraciones: 25, maxTokensSesion: 300_000, maxTokensDia: 3_000_000, maxCostoUsd: 5 },
      maxCaracteres: 4000,
      allowedOrigins: ["https://*.vercel.app"],
      accessKey,
      adminKey: null,
    },
  }
}

const chat = (env: Entorno, message: string, headers: Record<string, string> = {}) =>
  manejar(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ sessionId: "s1", message }) }), env)

describe("API", () => {
  test("health no expone claves y dice si el modelo está configurado", async () => {
    const r = await manejar(new Request("http://x/api/health"), await entorno(null))
    expect(await r.json()).toEqual({ ok: true, provider: "simulado", model: "guion", llm_configurado: false })
  })

  test("tope de gasto: al superar 5 USD el chat responde 429 sin llamar al modelo", async () => {
    const llm = new LLMSimulado([{ texto: "hola", llamadas: [], tokens: 10, costoUsd: 5.2 }])
    const env = await entorno(llm)
    expect((await chat(env, "hola")).status).toBe(200)
    const segunda = await chat(env, "otra vez")
    expect(segunda.status).toBe(429)
    expect(((await segunda.json()) as { error: string }).error).toContain("5 USD")
    expect(llm.llamadas).toBe(1)
  })

  test("ACCESS_KEY: sin el encabezado x-access-key responde 401", async () => {
    const env = await entorno(new LLMSimulado([{ texto: "ok", llamadas: [], tokens: 1 }]), "clave-de-prueba")
    expect((await chat(env, "hola")).status).toBe(401)
    expect((await chat(env, "hola", { "x-access-key": "clave-de-prueba" })).status).toBe(200)
  })

  test("CORS acepta subdominios de vercel.app y rechaza otros orígenes", async () => {
    const env = await entorno(null)
    const ok = await manejar(new Request("http://x/api/health", { headers: { Origin: "https://reto03-oc-front.vercel.app" } }), env)
    const otro = await manejar(new Request("http://x/api/health", { headers: { Origin: "https://malicioso.com" } }), env)
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://reto03-oc-front.vercel.app")
    expect(otro.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })
})
