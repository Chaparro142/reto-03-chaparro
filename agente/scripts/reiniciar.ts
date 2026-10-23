/**
 * Deja out/ vacío en producción (POST /api/reset) antes de una demo.
 * Pide la ADMIN_KEY por teclado: nunca queda en el código ni en el historial de comandos.
 * Uso: bun run reiniciar  (dentro de agente/)
 */
const URL_AGENTE =
  process.env.AGENTE_URL ?? "https://reto03-oc-agente.chaparro.workers.dev";

const clave = (prompt("Escribe tu ADMIN_KEY y presiona Enter:") ?? "").trim();
if (!clave) {
  console.error("No escribiste ninguna clave. No se borró nada.");
  process.exit(1);
}

const respuesta = await fetch(`${URL_AGENTE}/api/reset`, {
  method: "POST",
  headers: { "x-admin-key": clave },
});
const cuerpo = await respuesta.text();
if (respuesta.ok) {
  console.log(
    `Listo: producción reiniciada (${URL_AGENTE}). La próxima OC será la 4500000001.`,
  );
} else {
  console.error(`No se reinició (HTTP ${respuesta.status}): ${cuerpo}`);
  process.exit(1);
}

export {}
