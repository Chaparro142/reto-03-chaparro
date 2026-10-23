# Reto 03 · Agente "Órdenes de Compra SAP"

Stiven Chaparro Herrera · Proceso de selección Perxia 2.0 · Periferia IT Group

Agente conversacional que lee el paquete de una solicitud de compra, lo valida contra los maestros (RC1–RC10), arma la orden de compra como quedaría en SAP, genera la evidencia de aprobación y la crea en un SAP simulado. Las excepciones no se resuelven a la fuerza: se bloquean o se piden confirmar.

- **Link de prueba:** https://reto03-oc-front.vercel.app (front en Vercel)
- **API del agente:** https://reto03-oc-agente.chaparro.workers.dev (Worker en Cloudflare · estado en [`/api/health`](https://reto03-oc-agente.chaparro.workers.dev/api/health))
- **Clave de acceso:** el chat del link de prueba no pide clave. La API directa del Worker sí exige el encabezado `x-access-key` (excepto `/api/health`); la clave se entrega aparte si se quiere probar la API sin el front.
- **Planteamiento de la solución:** [SOLUCION.md](SOLUCION.md)

## Estructura

Sigue la estructura sugerida en el PRD (§6.5): el agente en la raíz y el front de chat en `web/`.

```
agent/prompt.md                 comportamiento (system prompt)
src/
├── server/                     API HTTP (app.ts) y Worker de Cloudflare (worker.ts)
├── agent/                      ciclo del agente, confirmación, sesiones
├── llm/                        interfaz del proveedor (adapter.ts) + OpenRouter + simulado (tests)
├── tools/oc.ts                 las 5 herramientas (zod) → oc_leer_paquete … oc_crear
├── sap/                        SapAdapter (adapter.ts) + mock sobre out/sap/
├── knowledge/                  conocimiento del proceso (ordenes-compra.md)
├── domain/                     paquete, reglas RC1–RC10, payload, evidencia, control
└── store/                      Store: disco (local) o Durable Object (Cloudflare)
web/                            front de chat (Next.js): chat y panel de la OC al estilo SAP Fiori
fixtures/                       entregados por Periferia (sin modificar)
out/                            generado en ejecución (no se versiona)
modulo/                         bonus: agente empaquetado (generado con bun run empaquetar)
tests/                          bun test
scripts/                        dev, embeber, empaquetar, reiniciar
demo.ts                         herramientas sin modelo
.env.example                    variables del agente, sin valores
```

Separación: **comportamiento** en `agent/prompt.md`, **conocimiento** en `src/knowledge/`, **ejecución** en `src/tools/`. El navegador nunca habla directo con el Worker: el front expone `/api/agente/*` en su propio servidor y reenvía a `${AGENTE_URL}/api/*`, agregando la clave de acceso desde una variable del servidor. Así la clave no llega al navegador.

## Levantar en local

Requisitos: [Bun](https://bun.sh) 1.x y Node 20 o superior.

1. Instala todo. El `postinstall` de la raíz instala también `web/`.

```bash
bun install
```

2. Copia `.env.example` a `.dev.vars` y pon tu `OPENROUTER_API_KEY`. El archivo `web/.env.local` es opcional en local: sin `AGENTE_URL`, el front usa `http://localhost:8787`.

3. Levanta agente y front con un solo comando:

```bash
bun run dev
```

Arranca el Worker en el puerto 8787 y el front en el 3000. Si uno de los dos se cae, se cierra el otro, y Ctrl+C cierra ambos. Abre http://localhost:3000.

> Sin Worker ni clave puedes ver la interfaz con `DEMO_MOCK=1` en `web/.env.local`: el front simula el flujo de `sol-004`. Este modo se ignora en Vercel.

## Verificación sin modelo

```bash
bun install && bun run demo.ts
```

Procesa los 6 casos de `fixtures/reto-03/solicitudes/` llamando directamente a las herramientas, sin clave de ningún proveedor. Imprime `apta`, bloqueos, confirmaciones, `retroactiva` y número de OC o motivo. Muestra la idempotencia (sol-001 dos veces) y las confirmaciones explícitas de sol-004, sol-005 y sol-006. Limpia `out/` al inicio.

```bash
bun test          # 30 tests: ciclo con modelo simulado, confirmación, topes, errores, API, 6 casos
bun run typecheck # TypeScript estricto
```

## Prueba en el chat

Prompt de ejemplo del PRD, en una sesión nueva:

```
Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué
validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.
```

El chat muestra cada llamada a herramienta, resalta en ámbar la pregunta de confirmación y el panel de la izquierda muestra la OC con la diferencia de RC5 (solicitud contra cotización). Al pulsar **Confirmar y crear**, la OC recibe su número.

Prueba rápida de la API local sin front:

```bash
curl -X POST http://localhost:8787/api/chat -H "content-type: application/json" -d '{"sessionId":"prueba","message":"Procesa la solicitud sol-004. Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme."}'
curl -X POST http://localhost:8787/api/chat -H "content-type: application/json" -d '{"sessionId":"prueba","message":"confirmo"}'
```

## Variables de entorno

**Agente** (`.dev.vars` en local; secretos de Cloudflare en producción). Valores de ejemplo, sin secretos, en [`.env.example`](.env.example).

| Variable                                                                                                                                       | Dónde            | Obligatoria      | Uso                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- | ----------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                                                                                                                           | secreto          | Sí, para el chat | Clave del modelo. Solo vive en el backend.                              |
| `ACCESS_KEY`                                                                                                                                   | secreto          | No               | Si existe, toda ruta `/api/*` salvo `/api/health` exige `x-access-key`. |
| `ADMIN_KEY`                                                                                                                                    | secreto          | No               | Habilita `POST /api/reset` (borra `out/` antes de una demo).            |
| `LLM_MODEL`                                                                                                                                    | `wrangler.jsonc` | No               | Modelo de OpenRouter. Por defecto `anthropic/claude-haiku-5.5`.         |
| `MAX_ITERACIONES`, `MAX_TOKENS_SESION`, `MAX_TOKENS_DIA`, `MAX_COSTO_USD`, `LLM_TIMEOUT_MS`, `MAX_DURACION_TURNO_MS`, `MAX_CARACTERES_MENSAJE` | `wrangler.jsonc` | No               | Topes de costo y tiempo.                                                |
| `ALLOWED_ORIGINS`                                                                                                                              | `wrangler.jsonc` | No               | Orígenes exactos permitidos por CORS (en producción, la URL del front). |

**Front** (`web/.env.local` en local; variables del proyecto en Vercel). Ejemplo en [`web/.env.local.example`](web/.env.local.example).

| Variable            | Obligatoria                     | Uso                                                                               |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| `AGENTE_URL`        | En Vercel                       | URL base del Worker, sin barra final.                                             |
| `AGENTE_ACCESS_KEY` | Si el Worker tiene `ACCESS_KEY` | Se envía como `x-access-key` desde el servidor de Next. Nunca llega al navegador. |
| `DEMO_MOCK`         | No                              | `1` activa el simulador local. Se ignora en Vercel.                               |

## API

| Método | Ruta                                | Para qué                                                                                                               |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/chat`                         | `{ sessionId, message, confirm? }` → `{ reply, toolCalls[], needsConfirmation, pendientes[], casos[], error, tokens }` |
| `GET`  | `/api/sessions/:id`                 | Historial de la sesión                                                                                                 |
| `GET`  | `/api/casos`                        | Casos disponibles                                                                                                      |
| `GET`  | `/api/files` y `/api/files/out/...` | Archivos generados (OC, validación, evidencia, control)                                                                |
| `GET`  | `/api/health`                       | `{ ok, provider, model, llm_configurado }`, sin claves                                                                 |

Detalle completo en [`CONTRATO-API.md`](CONTRATO-API.md).

## Desplegar

**Agente (Cloudflare Workers),** desde la raíz:

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENROUTER_API_KEY
```

`wrangler deploy` ejecuta primero `scripts/embeber.ts`: el Worker no tiene sistema de archivos, así que los fixtures, el prompt y el conocimiento viajan dentro del bundle. Las salidas (`out/`) y las sesiones viven en un Durable Object con SQLite.

**Front (Vercel):** el proyecto de Vercel usa `web/` como _Root Directory_, con las variables `AGENTE_URL` y `AGENTE_ACCESS_KEY`.

Antes de una demo, para dejar `out/` vacío en producción (requiere el secreto `ADMIN_KEY` y, si el Worker la tiene, la `ACCESS_KEY`; el script pide ambas por teclado):

```bash
bun run reiniciar
```

## Scripts

| Comando              | Qué hace                                                           |
| -------------------- | ------------------------------------------------------------------ |
| `bun run dev`        | Agente (8787) y front (3000) a la vez.                             |
| `bun run dev:agente` | Solo el Worker (`wrangler dev`).                                   |
| `bun run dev:web`    | Solo el front en el puerto 3000.                                   |
| `bun run demo`       | `demo.ts`: los 6 casos sin modelo.                                 |
| `bun test`           | Tests del agente.                                                  |
| `bun run typecheck`  | Tipos del agente (el front tiene su propio `typecheck` en `web/`). |
| `bun run build:web`  | Compilación de producción del front.                               |
| `bun run empaquetar` | Regenera `modulo/` desde las mismas fuentes.                       |
| `bun run reiniciar`  | Vacía `out/` en producción antes de una demo.                      |
