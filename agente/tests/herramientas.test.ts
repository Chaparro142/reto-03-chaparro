import { describe, expect, test } from "bun:test"
import { SapMock } from "../src/sap/mock.ts"
import * as oc from "../src/tools/oc.ts"
import type { ContextoHerramienta } from "../src/tools/oc.ts"
import type { FsStore } from "../src/store/fs.ts"
import { proyectoTemporal } from "./utilidades.ts"

type Respuesta = { ok: boolean; data?: Record<string, unknown>; error?: string; requiere_confirmacion?: boolean }

function contexto(store: FsStore, autorizados: string[] = []): ContextoHerramienta {
  return { directory: store.directory, sessionId: "test", store, sap: new SapMock(store), autorizaConfirmacion: (c) => autorizados.includes(c), ahora: () => new Date("2026-10-23T12:00:00Z") }
}
const parse = async (r: Promise<string>): Promise<Respuesta> => JSON.parse(await r) as Respuesta
const codigos = (lista: unknown) => (lista as Array<{ codigo: string }>).map((h) => h.codigo)

describe("herramientas sobre los 6 casos", () => {
  test("resultados esperados por el PRD (O1–O4)", async () => {
    const ctx = contexto(await proyectoTemporal())
    const esperado: Record<string, { apta: boolean; bloqueos: string[]; confirmaciones: string[]; retroactiva: boolean }> = {
      "sol-001": { apta: true, bloqueos: [], confirmaciones: [], retroactiva: false },
      "sol-002": { apta: false, bloqueos: ["RC1"], confirmaciones: [], retroactiva: false },
      "sol-003": { apta: false, bloqueos: ["RC2", "RC3"], confirmaciones: [], retroactiva: false },
      "sol-004": { apta: true, bloqueos: [], confirmaciones: ["RC5"], retroactiva: false },
      "sol-005": { apta: true, bloqueos: [], confirmaciones: ["RC8"], retroactiva: true },
      "sol-006": { apta: true, bloqueos: [], confirmaciones: ["RC6"], retroactiva: false },
    }
    for (const [caso, e] of Object.entries(esperado)) {
      const v = await parse(oc.validar.execute({ caso }, ctx))
      expect({ caso, apta: v.data?.apta, bloqueos: codigos(v.data?.bloqueos), confirmaciones: codigos(v.data?.confirmaciones), retroactiva: v.data?.retroactiva }).toEqual({ caso, ...e })
    }
  })

  test("sol-006 deriva IVA C1 y condiciones Z030 del proveedor (RC6, RC7)", async () => {
    const ctx = contexto(await proyectoTemporal())
    const r = await parse(oc.construir_payload.execute({ caso: "sol-006" }, ctx))
    const orden = r.data?.orden as { condiciones_pago: string; posiciones: Array<{ indicador_iva: string; descripcion: string }> }
    expect(orden.condiciones_pago).toBe("Z030")
    expect(orden.posiciones[0]?.indicador_iva).toBe("C1")
    expect(orden.posiciones[0]?.descripcion.length).toBeLessThanOrEqual(40)
  })

  test("sol-004: la OC va por el valor de la solicitud y unidad H", async () => {
    const ctx = contexto(await proyectoTemporal())
    const r = await parse(oc.construir_payload.execute({ caso: "sol-004" }, ctx))
    const orden = r.data?.orden as { posiciones: Array<{ precio_unitario: number; cantidad: number; unidad: string }> }
    expect(orden.posiciones[0]).toMatchObject({ precio_unitario: 250000, cantidad: 100, unidad: "H" })
  })

  test("idempotencia: crear dos veces sol-001 devuelve el mismo número", async () => {
    const ctx = contexto(await proyectoTemporal())
    const a = await parse(oc.crear.execute({ caso: "sol-001" }, ctx))
    const b = await parse(oc.crear.execute({ caso: "sol-001" }, ctx))
    expect(a.data?.numero_oc).toBe("4500000001")
    expect(b.data).toMatchObject({ numero_oc: "4500000001", idempotente: true })
    expect((await parse(oc.validar.execute({ caso: "sol-001" }, ctx))).data?.oc_existente).toBe("4500000001")
  })

  test("reconstruir el payload de una OC ya creada conserva quién confirmó la excepción", async () => {
    const store = await proyectoTemporal()
    await parse(oc.crear.execute({ caso: "sol-004", confirmado: true }, contexto(store, ["sol-004"])))
    const r = await parse(oc.construir_payload.execute({ caso: "sol-004" }, contexto(store)))
    const orden = r.data?.orden as { excepciones: Array<{ codigo: string; confirmado_por: string | null }> }
    expect(r.data?.numero_oc).toBe("4500000001")
    expect(r.data?.confirmaciones_pendientes).toEqual([])
    expect(orden.excepciones[0]).toMatchObject({ codigo: "RC5", confirmado_por: "analista vía chat (sesión test)" })
    const guardado = JSON.parse((await store.leer("out/sol-004/payload.json"))!) as { excepciones: Array<{ confirmado_por: string | null }> }
    expect(guardado.excepciones[0]?.confirmado_por).toBe("analista vía chat (sesión test)")
  })

  test("montos alterados en el payload se rechazan", async () => {
    const ctx = contexto(await proyectoTemporal())
    const construido = await parse(oc.construir_payload.execute({ caso: "sol-001" }, ctx))
    const orden = structuredClone(construido.data?.orden) as { posiciones: Array<{ precio_unitario: number }> }
    orden.posiciones[0]!.precio_unitario = 1
    const r = await parse(oc.crear.execute({ caso: "sol-001", payload: orden }, ctx))
    expect(r.ok).toBe(false)
    expect(r.error).toContain("precio_unitario")
  })

  test("sol-005 confirmada queda retroactiva = true en out/control.csv", async () => {
    const store = await proyectoTemporal()
    const r = await parse(oc.crear.execute({ caso: "sol-005", confirmado: true }, contexto(store, ["sol-005"])))
    expect(r.data).toMatchObject({ numero_oc: "4500000001", retroactiva: true })
    const control = (await store.leer("out/control.csv"))!.trim().split("\n")
    expect(control[0]).toBe("solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts")
    expect(control[1]).toStartWith("SOL-2026-005,creada,4500000001,true,,RC8,")
  })

  test("evidencia: txt y pdf con el mismo sha256 que el payload", async () => {
    const store = await proyectoTemporal()
    const ctx = contexto(store)
    const ev = await parse(oc.generar_evidencia.execute({ caso: "sol-001" }, ctx))
    const p = await parse(oc.construir_payload.execute({ caso: "sol-001" }, ctx))
    const sha = ev.data?.sha256 as string
    expect((p.data?.orden as { aprobador: { evidencia_sha256: string } }).aprobador.evidencia_sha256).toBe(sha)
    expect(await store.leer("out/sol-001/aprobacion.txt")).toContain(sha)
    const pdf = await store.leerBytes("out/sol-001/aprobacion.pdf")
    expect(new TextDecoder().decode(pdf!.slice(0, 5))).toBe("%PDF-")
  })

  test("HU-6: caso inexistente, ruta maliciosa y JSON malformado devuelven error legible sin lanzar", async () => {
    const store = await proyectoTemporal()
    const ctx = contexto(store)
    expect((await parse(oc.leer_paquete.execute({ caso: "sol-999" }, ctx))).error).toContain("No existe el caso sol-999")
    expect((await parse(oc.leer_paquete.execute({ caso: "../../etc/passwd" }, ctx))).ok).toBe(false)
    await Bun.write(`${store.directory}/fixtures/reto-03/solicitudes/sol-001/solicitud.json`, "{ roto")
    expect((await parse(oc.validar.execute({ caso: "sol-001" }, ctx))).error).toContain("no es un JSON válido")
  })

  test("HU-6: monto no numérico se reporta", async () => {
    const store = await proyectoTemporal()
    const ruta = `${store.directory}/fixtures/reto-03/solicitudes/sol-001/solicitud.json`
    const solicitud = JSON.parse(await Bun.file(ruta).text()) as Record<string, unknown>
    await Bun.write(ruta, JSON.stringify({ ...solicitud, valor_total: "once millones" }))
    const r = await parse(oc.validar.execute({ caso: "sol-001" }, contexto(store)))
    expect(r.error).toContain("valor_total")
  })
})
