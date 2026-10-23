import { describe, expect, test } from "bun:test"
import { LLMSimulado, pide, responde } from "../src/llm/simulado.ts"
import { casosAutorizados } from "../src/agent/confirmacion.ts"
import { proyectoTemporal, sesionNueva, turno } from "./utilidades.ts"

const crearConfirmado = pide(["oc_crear", { caso: "sol-004", confirmado: true }])

describe("ciclo del agente", () => {
  test("CA3: pide confirmación y crea solo cuando el usuario confirma en el turno siguiente", async () => {
    const store = await proyectoTemporal()
    const sesion = sesionNueva()
    const llm = new LLMSimulado([pide(["oc_validar", { caso: "sol-004" }]), responde("Requiere tu confirmación. ¿Confirmas?"), crearConfirmado, responde("OC creada.")])
    const t1 = await turno(store, sesion, llm, "Procesa sol-004 y no la crees hasta que confirme")
    expect(t1.needsConfirmation).toBe(true)
    expect(t1.pendientes).toEqual(["sol-004"])
    const t2 = await turno(store, sesion, llm, "confirmo")
    const creada = t2.toolCalls.find((t) => t.nombre === "oc_crear")
    expect(creada?.ok).toBe(true)
    expect(creada?.resumen).toContain("4500000001")
    expect(t2.needsConfirmation).toBe(false)
  })

  test("CA3: si el modelo usa confirmado=true sin que el usuario confirme, la herramienta lo rechaza", async () => {
    const store = await proyectoTemporal()
    const llm = new LLMSimulado([crearConfirmado, responde("Listo.")])
    const t = await turno(store, sesionNueva(), llm, "procesa sol-004")
    expect(t.toolCalls[0]?.ok).toBe(false)
    expect(t.needsConfirmation).toBe(true)
    expect(await store.leer("out/sap/ordenes.jsonl")).toBeNull()
  })

  test("CA3: una negativa no autoriza la creación", async () => {
    const store = await proyectoTemporal()
    const sesion = sesionNueva()
    const llm = new LLMSimulado([pide(["oc_validar", { caso: "sol-004" }]), responde("¿Confirmas?"), crearConfirmado, responde("ok")])
    await turno(store, sesion, llm, "procesa sol-004")
    const t2 = await turno(store, sesion, llm, "no, todavía no")
    expect(t2.toolCalls[0]?.ok).toBe(false)
    expect(await store.leer("out/sap/ordenes.jsonl")).toBeNull()
  })

  test("CA3: la confirmación caduca si no es el mensaje inmediatamente posterior", async () => {
    const store = await proyectoTemporal()
    const sesion = sesionNueva()
    const llm = new LLMSimulado([pide(["oc_validar", { caso: "sol-004" }]), responde("¿Confirmas?"), responde("Es Cloud Andina."), crearConfirmado, responde("ok")])
    await turno(store, sesion, llm, "procesa sol-004")
    await turno(store, sesion, llm, "¿quién es el proveedor?")
    const t3 = await turno(store, sesion, llm, "confirmo")
    expect(t3.toolCalls[0]?.ok).toBe(false)
  })

  test("detector de confirmación: botón, frases, negativas y casos nombrados", () => {
    expect(casosAutorizados("", ["sol-004"], true)).toEqual(["sol-004"])
    expect(casosAutorizados("Sí, créala", ["sol-004"], false)).toEqual(["sol-004"])
    expect(casosAutorizados("no confirmo", ["sol-004"], false)).toEqual([])
    expect(casosAutorizados("confirmo sol-006", ["sol-004", "sol-006"], false)).toEqual(["sol-006"])
    expect(casosAutorizados("muéstrame la OC", ["sol-004"], false)).toEqual([])
  })

  test("argumentos inválidos se devuelven al modelo sin romper el turno", async () => {
    const store = await proyectoTemporal()
    const llm = new LLMSimulado([pide(["oc_validar", { caso: 4 }]), responde("Corrijo.")])
    const t = await turno(store, sesionNueva(), llm, "valida")
    expect(t.toolCalls[0]?.ok).toBe(false)
    expect(t.toolCalls[0]?.resumen).toContain("Argumentos inválidos")
    expect(t.reply).toBe("Corrijo.")
  })

  test("CA1: el tope de iteraciones corta el turno y explica lo hecho", async () => {
    const store = await proyectoTemporal()
    const llm = new LLMSimulado([pide(["oc_leer_paquete", { caso: "sol-001" }])])
    const t = await turno(store, sesionNueva(), llm, "procesa sol-001", false, 3)
    expect(llm.llamadas).toBe(3)
    expect(t.reply).toContain("tope de 3 pasos")
  })

  test("CA5: un error del proveedor se muestra claro y la sesión sigue viva", async () => {
    const store = await proyectoTemporal()
    const sesion = sesionNueva()
    const llm = new LLMSimulado([{ error: "El proveedor del modelo está limitando las peticiones.", estado: 429 }, responde("Hola de nuevo.")])
    const t1 = await turno(store, sesion, llm, "hola")
    expect(t1.error).toContain("limitando")
    const t2 = await turno(store, sesion, llm, "¿sigues ahí?")
    expect(t2.reply).toBe("Hola de nuevo.")
  })

  test("CA4: cada llamada a herramienta queda en out/log.jsonl", async () => {
    const store = await proyectoTemporal()
    const llm = new LLMSimulado([pide(["oc_leer_paquete", { caso: "sol-001" }], ["oc_validar", { caso: "sol-001" }]), responde("ok")])
    await turno(store, sesionNueva(), llm, "procesa sol-001")
    const lineas = (await store.leer("out/log.jsonl"))!.trim().split("\n").map((l) => JSON.parse(l) as { herramienta: string; caso: string })
    expect(lineas.map((l) => l.herramienta)).toEqual(["oc_leer_paquete", "oc_validar"])
    expect(lineas[0]?.caso).toBe("sol-001")
  })
})
