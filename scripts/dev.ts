// Un solo comando para desarrollo local (PRD §8): `bun run dev` en la raíz levanta
// el Worker del agente (wrangler dev, puerto 8787) y el front de Next (puerto 3000).
// Si uno de los dos termina, se cierra el otro. Ctrl+C cierra ambos.
import { existsSync } from "node:fs";
import { join } from "node:path";

const raiz = join(import.meta.dir, "..");
const carpetaAgente = join(raiz, "agente");

if (!existsSync(join(carpetaAgente, "package.json"))) {
  console.error(
    "No encuentro agente/package.json. Ejecuta este comando desde la raíz del repositorio.",
  );
  process.exit(1);
}
if (!existsSync(join(carpetaAgente, ".dev.vars"))) {
  console.warn(
    "Aviso: falta agente/.dev.vars. El agente arranca, pero sin OPENROUTER_API_KEY no podrá conversar.",
  );
}

const procesos = [
  Bun.spawn(["bun", "run", "dev"], {
    cwd: carpetaAgente,
    stdio: ["inherit", "inherit", "inherit"],
  }),
  Bun.spawn(["bun", "run", "dev:front"], {
    cwd: raiz,
    stdio: ["inherit", "inherit", "inherit"],
  }),
];

/**
 * Cierra el proceso y todos sus hijos. En Windows, matar `bun run` deja vivos a los nietos
 * (workerd de wrangler, node de Next), así que se usa taskkill sobre el árbol completo.
 */
function cerrarArbol(p: (typeof procesos)[number]): void {
  if (p.exitCode !== null) return;
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/PID", String(p.pid), "/T", "/F"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } else {
    p.kill();
  }
}

let cerrando = false;
function cerrarTodo(codigo: number): void {
  if (cerrando) return;
  cerrando = true;
  for (const p of procesos) cerrarArbol(p);
  process.exit(codigo);
}

process.on("SIGINT", () => cerrarTodo(0));
process.on("SIGTERM", () => cerrarTodo(0));

const primero = await Promise.race(procesos.map((p) => p.exited));
cerrarTodo(primero);
