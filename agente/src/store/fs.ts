import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { rutaSegura } from "./store.ts"
import type { Store } from "./store.ts"

const RAICES_FUENTE = ["fixtures", "agent", "src"]

/** Store sobre el disco local (demo.ts, tests y servidor local). directory = raíz del proyecto. */
export class FsStore implements Store {
  private contadores = new Map<string, number>()

  constructor(readonly directory: string) {}

  private fuente(ruta: string): string | null {
    const raiz = RAICES_FUENTE.find((r) => ruta.replace(/\\/g, "/").startsWith(`${r}/`))
    const segura = raiz ? rutaSegura(ruta, raiz) : null
    return segura ? join(this.directory, segura) : null
  }

  private salida(ruta: string): string {
    const segura = rutaSegura(ruta, "out")
    if (!segura) throw new Error(`Ruta fuera de out/: ${ruta}`)
    return join(this.directory, segura)
  }

  async leerFuente(ruta: string): Promise<string | null> {
    const absoluta = this.fuente(ruta)
    return absoluta ? leerSiExiste(absoluta) : null
  }

  async listarFuentes(prefijo: string): Promise<string[]> {
    return (await listarRecursivo(this.directory, join(this.directory, prefijo.replace(/\/$/, ""))))
  }

  async leer(ruta: string): Promise<string | null> {
    return rutaSegura(ruta, "out") ? leerSiExiste(this.salida(ruta)) : null
  }

  async leerBytes(ruta: string): Promise<Uint8Array | null> {
    if (!rutaSegura(ruta, "out")) return null
    try {
      return new Uint8Array(await readFile(this.salida(ruta)))
    } catch {
      return null
    }
  }

  async escribir(ruta: string, contenido: string | Uint8Array): Promise<void> {
    const destino = this.salida(ruta)
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(destino, contenido)
  }

  async anexar(ruta: string, linea: string, encabezado?: string): Promise<void> {
    const destino = this.salida(ruta)
    await mkdir(dirname(destino), { recursive: true })
    const previo = await leerSiExiste(destino)
    const cabeza = previo === null && encabezado ? `${encabezado}\n` : ""
    await appendFile(destino, `${cabeza}${linea}\n`)
  }

  async listar(prefijo: string): Promise<string[]> {
    return listarRecursivo(this.directory, join(this.directory, "out")).then((r) => r.filter((x) => x.startsWith(prefijo)))
  }

  async sumar(clave: string, n: number): Promise<number> {
    const total = (this.contadores.get(clave) ?? 0) + n
    this.contadores.set(clave, total)
    return total
  }

  /** Borra out/ (demo.ts lo limpia al inicio para ser determinista). */
  async limpiarSalida(): Promise<void> {
    await rm(join(this.directory, "out"), { recursive: true, force: true })
  }
}

async function leerSiExiste(ruta: string): Promise<string | null> {
  try {
    return await readFile(ruta, "utf8")
  } catch {
    return null
  }
}

async function listarRecursivo(base: string, carpeta: string): Promise<string[]> {
  let entradas
  try {
    entradas = await readdir(carpeta, { withFileTypes: true })
  } catch {
    return []
  }
  const rutas = await Promise.all(
    entradas.map((e) => {
      const completa = join(carpeta, e.name)
      return e.isDirectory() ? listarRecursivo(base, completa) : Promise.resolve([relative(base, completa).replace(/\\/g, "/")])
    }),
  )
  return rutas.flat().sort()
}
