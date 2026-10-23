/**
 * El Worker no tiene sistema de archivos: este script embebe las fuentes de solo lectura
 * (fixtures/, agent/prompt.md, src/knowledge/) en src/store/embebidos.generated.ts.
 * Se ejecuta solo antes de `wrangler dev` y `wrangler deploy` (build.command en wrangler.jsonc).
 */
import { readFile, readdir, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"

const raiz = join(import.meta.dir, "..")
const CARPETAS = ["fixtures", "agent", "src/knowledge"]

async function listar(carpeta: string): Promise<string[]> {
  const entradas = await readdir(carpeta, { withFileTypes: true })
  const anidadas = await Promise.all(entradas.map((e) => (e.isDirectory() ? listar(join(carpeta, e.name)) : [join(carpeta, e.name)])))
  return anidadas.flat()
}

const archivos: Record<string, string> = {}
for (const carpeta of CARPETAS) {
  for (const ruta of await listar(join(raiz, carpeta))) {
    archivos[relative(raiz, ruta).replace(/\\/g, "/")] = await readFile(ruta, "utf8")
  }
}

const salida = `// Generado por scripts/embeber.ts. No editar a mano.\nexport const EMBEBIDOS: Record<string, string> = ${JSON.stringify(archivos, Object.keys(archivos).sort(), 2)}\n`
await writeFile(join(raiz, "src/store/embebidos.generated.ts"), salida)
console.log(`embebidos: ${Object.keys(archivos).length} archivos`)
