/**
 * Bonus 9.4: genera modulo/ desde las mismas fuentes que usa la aplicación (no copias divergentes).
 * - modulo/agent.md                        ← agent/prompt.md
 * - modulo/skill/ordenes-compra/SKILL.md   ← src/knowledge/ordenes-compra.md
 * - modulo/tools/oc.ts                     → reexporta src/tools/oc.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const raiz = join(import.meta.dir, "..")
const leer = (ruta: string) => readFile(join(raiz, ruta), "utf8")
const escribir = async (ruta: string, contenido: string) => {
  await mkdir(join(raiz, ruta, ".."), { recursive: true })
  await writeFile(join(raiz, ruta), contenido)
}
const AVISO = "<!-- Generado por scripts/empaquetar.ts desde agent/prompt.md. No editar a mano. -->"

const prompt = await leer("agent/prompt.md")
await escribir(
  "modulo/agent.md",
  `---\ndescription: Prepara, valida y crea órdenes de compra SAP a partir del paquete de correo (solicitud, cotización, aprobación).\nmode: primary\npermission:\n  edit: deny\n  bash: deny\n---\n${AVISO}\n\n${prompt}`,
)

const conocimiento = await leer("src/knowledge/ordenes-compra.md")
await escribir(
  "modulo/skill/ordenes-compra/SKILL.md",
  `---\nname: ordenes-compra\ndescription: Proceso de órdenes de compra SAP de Periferia IT Group — matriz de controles RC1–RC10, criterios de negocio, datos fijos de la OC y archivos que produce. Úsalo al procesar solicitudes de compra con las herramientas oc_*.\n---\n${AVISO.replace("agent/prompt.md", "src/knowledge/ordenes-compra.md")}\n\n${conocimiento}`,
)

await escribir(
  "modulo/tools/oc.ts",
  `// Generado por scripts/empaquetar.ts: las mismas herramientas que usa la aplicación.\nexport * from "../../src/tools/oc.ts"\n`,
)
console.log("modulo/ generado: agent.md, skill/ordenes-compra/SKILL.md, tools/oc.ts")
