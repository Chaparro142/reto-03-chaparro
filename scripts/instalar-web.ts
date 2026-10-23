// postinstall de la raíz: instala también las dependencias del front (web/), así
// `bun install` deja todo listo. En Vercel el proyecto apunta a web/ y este script no corre.
import { existsSync } from "node:fs";
import { join } from "node:path";

const carpetaWeb = join(import.meta.dir, "..", "web");

if (!existsSync(join(carpetaWeb, "package.json"))) {
  console.log("postinstall: no hay web/; se omite la instalación del front.");
  process.exit(0);
}

const proceso = Bun.spawn(["bun", "install"], {
  cwd: carpetaWeb,
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await proceso.exited);
