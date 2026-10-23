// postinstall de la raíz: instala también las dependencias del agente, así `bun install`
// deja todo listo. En Vercel la carpeta agente/ no se sube (.vercelignore), y ahí se omite.
import { existsSync } from "node:fs";
import { join } from "node:path";

const carpetaAgente = join(import.meta.dir, "..", "agente");

if (!existsSync(join(carpetaAgente, "package.json"))) {
  console.log(
    "postinstall: no hay agente/ (despliegue del front); se omite su instalación.",
  );
  process.exit(0);
}

const proceso = Bun.spawn(["bun", "install"], {
  cwd: carpetaAgente,
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await proceso.exited);
