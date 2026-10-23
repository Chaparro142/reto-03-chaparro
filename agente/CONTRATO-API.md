# Contrato de la API del agente · Reto 03

Fuente de verdad entre el agente (Cloudflare Worker, carpeta `agente/`) y el front (Next.js en Vercel, raíz del repo). Cualquier cambio se acuerda entre los dos frentes.

- **URL base local:** `http://localhost:8787`
- **URL base en producción:** se publica al desplegar (`https://reto03-oc-agente.<cuenta>.workers.dev`). El front no la llama desde el navegador: su proxy `/api/agente/*` (servidor de Next) la lee de `AGENTE_URL` y agrega `x-access-key` desde `AGENTE_ACCESS_KEY`.
- **CORS:** el Worker acepta los orígenes de `ALLOWED_ORIGINS` (por defecto `http://localhost:3000` y `https://reto03-oc-front.vercel.app`). El front real no lo necesita: llama al Worker desde su servidor.
- **Clave de acceso (opcional):** si el Worker tiene `ACCESS_KEY`, toda ruta `/api/*` excepto `/api/health` exige el encabezado `x-access-key: <clave>`. Sin la clave responde `401 { error }`.
- Todas las respuestas son JSON salvo los archivos de `/api/files/out/...`.

## `POST /api/chat`

Envía un mensaje y ejecuta un turno completo del agente (modelo → herramientas → modelo). No hay streaming: la respuesta llega cuando el turno termina, así que el front debe mostrar "pensando" mientras espera. **Duración máxima de un turno: ~55 s** (presupuesto de 30 s más una última llamada al modelo de 25 s como máximo). Si se pasa, el agente responde con lo que alcanzó a hacer y pide "continúa". Cabe en el corte de 58 s de Vercel.

**Cuerpo**

```json
{
  "sessionId": "uuid-generado-por-el-front",
  "message": "Procesa la solicitud sol-004",
  "confirm": false
}
```

| Campo       | Tipo                            | Nota                                                                                  |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| `sessionId` | string (1–100, `[A-Za-z0-9_-]`) | Lo genera el front (`crypto.randomUUID()`) y lo guarda en `localStorage`.             |
| `message`   | string (≤ 4.000)                | Puede ir vacío solo si `confirm` es `true`.                                           |
| `confirm`   | boolean, opcional               | `true` cuando el usuario pulsa **Confirmar y crear**. Equivale a escribir "confirmo". |

**Respuesta 200**

```json
{
  "sessionId": "…",
  "reply": "Texto en Markdown del agente (tablas incluidas)",
  "toolCalls": [
    {
      "nombre": "oc_validar",
      "args": { "caso": "sol-004" },
      "ok": true,
      "resumen": "apta · 0 bloqueos · 1 confirmación (RC5)"
    }
  ],
  "needsConfirmation": true,
  "pendientes": ["sol-004"],
  "casos": ["sol-004"],
  "error": null,
  "tokens": { "turno": 5321, "sesion": 5321, "costo_usd_turno": 0.0031 }
}
```

| Campo               | Uso en el front                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `reply`             | Burbuja del agente. Viene en Markdown.                                                                                  |
| `toolCalls[]`       | Una tarjeta por llamada: nombre, argumentos y resumen; `ok: false` en rojo.                                             |
| `needsConfirmation` | `true` → resaltar la respuesta (ámbar) y mostrar la barra **Confirmar y crear / No crear**.                             |
| `pendientes[]`      | Casos que esperan confirmación.                                                                                         |
| `casos[]`           | Casos tocados en este turno: el panel de la OC debe recargar `payload.json` y `validacion.json` de estos casos.         |
| `error`             | Mensaje legible si falló el modelo o se alcanzó un tope. La sesión sigue viva; mostrarlo como aviso, no romper el chat. |
| `tokens`            | Opcional de mostrar.                                                                                                    |

**Errores HTTP:** `400 { error }` (cuerpo inválido), `401 { error }` (falta clave), `429 { error }` (tope de tokens de la sesión o del día, o tope de gasto acumulado de 5 USD). Con 4xx no hay `reply`.

## `GET /api/sessions/:id`

Reconstruye el chat al recargar la página.

```json
{
  "sessionId": "…",
  "turnos": [
    { "rol": "usuario", "texto": "Procesa sol-004", "ts": "2026-10-23T20:00:00.000Z" },
    { "rol": "agente", "texto": "…", "toolCalls": [ … ], "needsConfirmation": true, "error": null, "ts": "…" }
  ],
  "pendientes": ["sol-004"],
  "tokens": 5321
}
```

Sesión inexistente → `200` con `turnos: []`.

## `GET /api/casos`

Lista de casos disponibles en los fixtures, para sugerencias del front: `{ "casos": ["sol-001", …, "sol-006"] }`.

## `GET /api/files`

`{ "archivos": ["out/control.csv", "out/log.jsonl", "out/sap/ordenes.jsonl", "out/sol-004/payload.json", …] }`

## `GET /api/files/out/<ruta>`

Descarga un archivo generado. `404 { error }` si no existe todavía.

| Ruta                                           | Contenido                                                                         | Para el panel tipo SAP                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `out/<caso>/validacion.json`                   | `{ caso, apta, bloqueos[], confirmaciones[], derivados, retroactiva }`            | Bloqueos = message strip de **error**; confirmaciones = **advertencia**; derivados = **información**; `retroactiva` = etiqueta de estado. |
| `out/<caso>/payload.json`                      | La OC con el esquema 7.4 del PRD + `numero_oc` y `estado` (`borrador` / `creada`) | Cabecera, facetas y tabla de posiciones.                                                                                                  |
| `out/<caso>/trazabilidad.json`                 | `{ "<campo>": "solicitud" \| "cotizacion" \| "maestro.<nombre>" \| "derivado" }`  | Tooltip de origen de cada valor.                                                                                                          |
| `out/<caso>/aprobacion.txt` / `aprobacion.pdf` | Evidencia de aprobación con `sha256`                                              | Enlace "Ver evidencia".                                                                                                                   |
| `out/control.csv`                              | `solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts`         | Opcional.                                                                                                                                 |

**Forma de cada hallazgo** (en `bloqueos[]` y `confirmaciones[]`):

```json
{
  "codigo": "RC5",
  "tipo": "confirmacion",
  "detalle": "La cotización difiere 6,00 % de la solicitud (máximo 2 %).",
  "accion_sugerida": "Confirmar que la OC se crea por el valor aprobado…",
  "valores": {
    "solicitud": 25000000,
    "cotizacion": 26500000,
    "diferencia_pct": 6
  }
}
```

**Forma de `derivados`:** `{ "condiciones_pago": { "valor": "Z030", "fuente": "maestro.proveedores", "detalle": "…" }, … }`

## `GET /api/health`

`{ "ok": true, "provider": "openrouter", "model": "anthropic/claude-haiku-5.5", "llm_configurado": true }`. Nunca expone claves.
