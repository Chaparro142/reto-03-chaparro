# Agente de órdenes de compra SAP · Reto 03

Agente conversacional que lee el paquete de una solicitud de compra (correo, solicitud, cotización, aprobación y factura), lo valida contra los maestros con las reglas RC1–RC10, arma la OC como quedaría en SAP, genera la evidencia de aprobación en PDF y crea la OC en un SAP simulado. Solo la crea si la analista confirma las excepciones.

- **Link de prueba (API del agente):** https://reto03-oc-agente.chaparro.workers.dev · estado en [`/api/health`](https://reto03-oc-agente.chaparro.workers.dev/api/health)
- **Front de chat:** https://reto03-oc-front.vercel.app. El código está en la raíz de este repositorio (Next.js en Vercel) y consume la API descrita en [`CONTRATO-API.md`](CONTRATO-API.md).
- **Planteamiento de la solución:** [`SOLUCION.md`](SOLUCION.md)

## Requisitos

- [Bun](https://bun.sh) 1.4 o superior (`npm install -g bun`)
- Una clave de [OpenRouter](https://openrouter.ai) solo para conversar con el agente. `demo.ts` y los tests no la necesitan.

## Verificación sin modelo

```bash
bun install
bun run demo.ts
```

Procesa los 6 casos de `fixtures/reto-03/solicitudes/` llamando directamente a las herramientas. Imprime `apta`, bloqueos, confirmaciones, `retroactiva` y número de OC o motivo. Muestra la idempotencia (sol-001 dos veces) y las confirmaciones explícitas de sol-004, sol-005 y sol-006. Limpia `out/` al inicio.

```bash
bun test          # 24 tests: ciclo con modelo simulado, confirmación, topes, errores, API, 6 casos
bun run typecheck # TypeScript estricto
```

## Levantar en local (un comando)

```bash
cp .env.example .dev.vars   # y escribe tu OPENROUTER_API_KEY en .dev.vars
bun run dev                  # API en http://localhost:8787
```

`bun run dev` corre `wrangler dev`: el mismo Worker y el mismo Durable Object que en producción, con estado local en `.wrangler/`. El front (raíz del repo) apunta a `http://localhost:8787` con `NEXT_PUBLIC_AGENTE_URL`.

Prueba rápida sin front:

```bash
curl -X POST http://localhost:8787/api/chat -H "content-type: application/json" -d '{"sessionId":"prueba","message":"Procesa la solicitud sol-004. Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme."}'
curl -X POST http://localhost:8787/api/chat -H "content-type: application/json" -d '{"sessionId":"prueba","message":"confirmo"}'
```

## Variables de entorno

| Variable                                                                                                                      | Dónde            | Obligatoria      | Uso                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- | ----------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                                                                                                          | secreto          | Sí, para el chat | Clave del modelo. Solo vive en el backend.                              |
| `ACCESS_KEY`                                                                                                                  | secreto          | No               | Si existe, el front debe enviar `x-access-key`.                         |
| `ADMIN_KEY`                                                                                                                   | secreto          | No               | Habilita `POST /api/reset` (borra `out/` antes de una demo).            |
| `LLM_MODEL`                                                                                                                   | `wrangler.jsonc` | No               | Modelo de OpenRouter. Por defecto `anthropic/claude-haiku-5.5`.         |
| `MAX_ITERACIONES`, `MAX_TOKENS_SESION`, `MAX_TOKENS_DIA`, `LLM_TIMEOUT_MS`, `MAX_DURACION_TURNO_MS`, `MAX_CARACTERES_MENSAJE` | `wrangler.jsonc` | No               | Topes de costo y tiempo.                                                |
| `ALLOWED_ORIGINS`                                                                                                             | `wrangler.jsonc` | No               | Orígenes del front permitidos por CORS (acepta `https://*.vercel.app`). |

Valores de ejemplo, sin secretos, en [`.env.example`](.env.example).

## Desplegar

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENROUTER_API_KEY
```

`wrangler deploy` ejecuta primero `scripts/embeber.ts`: el Worker no tiene sistema de archivos, así que los fixtures, el prompt y el conocimiento viajan dentro del bundle. Las salidas (`out/`) y las sesiones viven en un Durable Object con SQLite.

## API

| Método | Ruta                                | Para qué                                                                                                               |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/chat`                         | `{ sessionId, message, confirm? }` → `{ reply, toolCalls[], needsConfirmation, pendientes[], casos[], error, tokens }` |
| `GET`  | `/api/sessions/:id`                 | Historial de la sesión                                                                                                 |
| `GET`  | `/api/casos`                        | Casos disponibles                                                                                                      |
| `GET`  | `/api/files` y `/api/files/out/...` | Archivos generados (OC, validación, evidencia, control)                                                                |
| `GET`  | `/api/health`                       | `{ ok, provider, model, llm_configurado }`, sin claves                                                                 |

Detalle completo en [`CONTRATO-API.md`](CONTRATO-API.md).

## Estructura

```
agente/
├── agent/prompt.md               comportamiento (system prompt)
├── src/knowledge/                conocimiento del proceso
├── src/tools/oc.ts               las 5 herramientas (zod) → oc_leer_paquete … oc_crear
├── src/domain/                   paquete, reglas RC1–RC10, payload, evidencia, control
├── src/agent/                    ciclo del agente, confirmación, sesiones
├── src/llm/                      interfaz del proveedor + OpenRouter + simulado (tests)
├── src/sap/                      SapAdapter + mock sobre out/sap/
├── src/store/                    Store: disco (local) o Durable Object (Cloudflare)
├── src/server/                   API HTTP (app.ts) y Worker (worker.ts)
├── fixtures/                     entregados por Periferia (sin modificar)
├── modulo/                       bonus: agente empaquetado (generado con bun run empaquetar)
├── tests/                        bun test
└── demo.ts
```
