import { mkdtemp, cp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FsStore } from "../src/store/fs.ts"
import { SapMock } from "../src/sap/mock.ts"
import { ejecutarTurno } from "../src/agent/ciclo.ts"
import type { ResultadoTurno } from "../src/agent/ciclo.ts"
import type { Sesion } from "../src/agent/sesion.ts"
import type { ProveedorLLM } from "../src/llm/adapter.ts"

const RAIZ = join(import.meta.dir, "..")

/** Proyecto temporal con una copia de los fixtures: cada test escribe su propio out/. */
export async function proyectoTemporal(): Promise<FsStore> {
  const dir = await mkdtemp(join(tmpdir(), "reto03-"))
  await cp(join(RAIZ, "fixtures"), join(dir, "fixtures"), { recursive: true })
  return new FsStore(dir)
}

export function sesionNueva(id = "test"): Sesion {
  return { id, mensajes: [], turnos: [], pendientes: [], tokens: 0 }
}

export function turno(store: FsStore, sesion: Sesion, llm: ProveedorLLM, mensaje: string, boton = false, maxIteraciones = 25): Promise<ResultadoTurno> {
  return ejecutarTurno(sesion, mensaje, boton, {
    llm,
    store,
    sap: new SapMock(store),
    sistema: "test",
    limites: { maxIteraciones, maxTokensSesion: 300_000, maxTokensDia: 3_000_000 },
    directory: store.directory,
    ahora: () => new Date("2026-10-23T12:00:00Z"),
  })
}
