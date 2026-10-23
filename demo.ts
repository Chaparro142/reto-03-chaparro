/**
 * Verificación sin modelo (PRD 6.6): procesa los 6 casos llamando directamente a las herramientas.
 * Uso: bun install && bun run demo.ts
 */
import { FsStore } from "./src/store/fs.ts"
import { SapMock } from "./src/sap/mock.ts"
import { listarCasos } from "./src/domain/paquete.ts"
import * as oc from "./src/tools/oc.ts"
import type { ContextoHerramienta } from "./src/tools/oc.ts"

type Respuesta = { ok: boolean; data?: Record<string, unknown>; error?: string }

const store = new FsStore(import.meta.dir)
await store.limpiarSalida()
const sap = new SapMock(store)
const autorizados = new Set<string>()
const ctx: ContextoHerramienta = {
  directory: import.meta.dir,
  sessionId: "demo",
  store,
  sap,
  autorizaConfirmacion: (caso) => autorizados.has(caso),
  ahora: () => new Date(),
}

const llamar = async (texto: Promise<string>): Promise<Respuesta> => JSON.parse(await texto) as Respuesta
const codigos = (lista: unknown): string => {
  const items = (lista as Array<{ codigo: string; detalle: string }>) ?? []
  return items.length ? items.map((h) => `${h.codigo} (${h.detalle})`).join("\n      ") : "—"
}

async function procesar(caso: string, confirmar = false): Promise<void> {
  console.log(`\n■ ${caso}${confirmar ? "  [con confirmación explícita del usuario]" : ""}`)
  const paquete = await llamar(oc.leer_paquete.execute({ caso }, ctx))
  if (!paquete.ok) return void console.log(`   error de lectura: ${paquete.error}`)
  const v = await llamar(oc.validar.execute({ caso }, ctx))
  if (!v.ok || !v.data) return void console.log(`   error: ${v.error}`)
  console.log(`   apta: ${String(v.data.apta)} · retroactiva: ${String(v.data.retroactiva)}`)
  console.log(`   bloqueos: ${codigos(v.data.bloqueos)}`)
  console.log(`   confirmaciones: ${codigos(v.data.confirmaciones)}`)
  const derivados = Object.entries((v.data.derivados as Record<string, { valor: string }>) ?? {})
  if (derivados.length) console.log(`   derivados: ${derivados.map(([k, d]) => `${k}=${d.valor}`).join(", ")}`)
  if (v.data.apta) {
    await llamar(oc.construir_payload.execute({ caso }, ctx))
    const evidencia = await llamar(oc.generar_evidencia.execute({ caso }, ctx))
    console.log(`   evidencia: sha256 ${String(evidencia.data?.sha256).slice(0, 16)}…`)
  }
  if (confirmar) autorizados.add(caso)
  const creada = await llamar(oc.crear.execute({ caso, confirmado: confirmar || undefined }, ctx))
  autorizados.delete(caso)
  console.log(creada.ok
    ? `   → OC ${String(creada.data?.numero_oc)}${creada.data?.idempotente ? " (idempotente: ya existía, no se creó otra)" : " creada"}`
    : `   → no creada: ${creada.error}`)
}

console.log("Demo Reto 03 · herramientas sin modelo")
for (const caso of await listarCasos(store)) await procesar(caso)

console.log("\n── Idempotencia: sol-001 por segunda vez")
await procesar("sol-001")

console.log("\n── Confirmaciones explícitas (la analista responde \"confirmo\")")
for (const caso of ["sol-004", "sol-005", "sol-006"]) await procesar(caso, true)

console.log("\n── out/control.csv")
console.log((await store.leer("out/control.csv"))?.trim())
