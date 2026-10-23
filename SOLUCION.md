# SOLUCION · Reto 03 — Agente conversacional "Órdenes de Compra SAP"

Stiven Chaparro Herrera · Proceso de selección Perxia 2.0 · Periferia IT Group

> Versión 2 · 23 de octubre de 2026. Incluye el despliegue final: agente en https://reto03-oc-agente.chaparro.workers.dev y front en https://reto03-oc-front.vercel.app.

---

## 0. Por qué elegí este reto

Recibí tres retos con la misma forma (agente conversacional, herramientas tipadas, adaptador LLM, link público) y procesos distintos. Elegí priorizando con ICE y validando con una matriz ponderada, porque la restricción real era entregar algo **completo y defendible** en una sesión corta, no el reto más vistoso.

**ICE** (impacto × confianza × facilidad, escalas de 1 a 10). Impacto = valor de negocio demostrable; confianza = probabilidad de que todos los casos pasen como pide el PRD; facilidad = qué tanto se construye completo, con pruebas, en una sesión.

| Reto                       | Impacto | Confianza | Facilidad | ICE     |
| -------------------------- | ------- | --------- | --------- | ------- |
| 03 Órdenes de compra SAP   | 8       | 9         | 8         | **576** |
| 01 Registro como proveedor | 7       | 7         | 5         | 245     |
| 02 Registro de contratos   | 8       | 5         | 4         | 160     |

Los tres valen parecido para el negocio; la diferencia la hacen la confianza y la facilidad. La matriz ponderada por las restricciones de la prueba confirma el orden:

| Criterio (peso)                             | 01 Proveedores | 02 Contratos | 03 Órdenes de compra |
| ------------------------------------------- | -------------- | ------------ | -------------------- |
| Facilidad de construir completo hoy (35 %)  | 6              | 4            | 8                    |
| Confianza en pasar todos los casos (25 %)   | 7              | 5            | 9                    |
| Claridad de la demo en la defensa (20 %)    | 7              | 7            | 9                    |
| Encaje con un despliegue serverless (10 %)  | 6              | 4            | 8                    |
| Valor de negocio que se puede contar (10 %) | 6              | 8            | 8                    |
| **Total**                                   | **6,5**        | **5,2**      | **8,5**              |

- **Reto 02 descartado:** su núcleo es extraer datos de contratos en texto libre y calcular confianza por campo. Es el componente más frágil y el más difícil de sostener línea por línea en la defensa.
- **Reto 01 descartado:** mucha superficie de salida (Excel celda por celda, PDF, paquete, checklist de vencimientos, borrador de correo) para el mismo tiempo.
- **Reto 03 elegido:** las 10 reglas son deterministas, cada caso tiene un resultado esperado sin ambigüedad, y el problema tiene una lectura de negocio clara (control del gasto y OC retroactivas).

Antes de construir, ataqué la elección buscando qué la haría fallar. Salieron dos riesgos:

- **Estado entre turnos.** La confirmación y la idempotencia necesitan memoria entre un mensaje y el siguiente. Se resuelve guardando el estado en el servidor, no en el modelo ni en el navegador (detalle técnico en la sección 2).
- **Parseo de la cotización en texto.** Lo resolví con `demo.ts` corriendo los 6 casos antes de conectar el modelo.

---

## 1. Problema en una frase

La analista de Compras digita a mano cada OC en SAP y valida "de memoria" que el proveedor exista y que el aprobador tenga autoridad. Eso le cuesta tiempo a ella, a Contabilidad le genera correcciones en el cierre, y a la Dirección la deja sin saber cuántas OC se crean después de la factura.

---

## 2. Arquitectura

```
 Front: chat + panel de la OC ──HTTP──▶ API del agente (/api/chat, /api/sessions/:id, /api/health, /api/files)
                                          ├─ src/agent/ciclo.ts     ciclo: modelo → herramientas → modelo (tope 25)
                                          │    └─ src/llm/adapter.ts  interfaz propia; proveedor intercambiable
                                          ├─ src/tools/oc.ts        5 herramientas zod (oc_leer_paquete … oc_crear)
                                          │    ├─ src/domain/*      paquete, reglas RC1–RC10, payload, evidencia
                                          │    └─ src/sap/mock.ts   SapAdapter simulado (out/sap/ordenes.jsonl)
                                          └─ Store ─┬─ fixtures/ (solo lectura)
                                                    └─ out/ (escritura: sesiones, OC, control, evidencias)

 demo.ts → las mismas herramientas, sin modelo y sin servidor
```

**Entorno tecnológico y despliegue**

```
 Navegador ──▶ Vercel: front Next.js 16 ──▶ /api/agente/* (función del servidor)
                                                │  agrega x-access-key desde una variable del servidor
                                                ▼
              Cloudflare: Worker del agente ──▶ /api/* (ciclo, herramientas, adaptador LLM)
                                                │
                                                ├─▶ Durable Object "Almacen" (SQLite): sesiones y out/
                                                └─▶ OpenRouter (modelo)
```

| Pieza                 | Dónde corre                          | Detalle                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front                 | Vercel                               | Next.js 16, React 19 y Tailwind. Chat y panel de la OC. No tiene datos propios: todo sale de la API.                                                                                                                                               |
| Puente entre dominios | Vercel, ruta `/api/agente/[...ruta]` | Reenvía cada llamada al Worker desde el servidor. El navegador nunca ve la URL con clave ni la clave de acceso, y no hace falta CORS. Corta a 80 s con un error legible (`maxDuration` 90 s); un turno del agente dura como máximo ~55 s.                                                                           |
| Agente y API          | Cloudflare Workers                   | `agente/src/server/worker.ts`. Los fixtures, el prompt y el conocimiento se embeben al compilar, porque el Worker no tiene sistema de archivos.                                                                                                    |
| Estado entre turnos   | Durable Object único con SQLite      | Implementa la interfaz `Store`: guarda sesiones, archivos de `out/`, líneas de `log.jsonl` y `control.csv`, y el contador de OC. Una sola instancia serializa las escrituras, así la numeración y la idempotencia son consistentes entre sesiones. |
| Modelo                | OpenRouter                           | La clave es un secreto del Worker (`wrangler secret put`). Nunca está en el front, en el repositorio ni en los logs.                                                                                                                               |

**En local** se levantan los dos procesos: `bun run dev` dentro de `agente/` (Worker en el puerto 8787 con `wrangler dev`, que simula el Durable Object) y `bun run dev` en la raíz (front en el puerto 3000 con `AGENTE_URL=http://localhost:8787`). `demo.ts` y los tests usan el `Store` de archivos y no necesitan ninguno de los dos.

| Pieza              | Dónde vive                        | Qué contiene                                                                                            |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Comportamiento** | `agente/agent/prompt.md`          | Reglas del agente: no afirmar valores fuera de herramientas, no crear sin confirmación, cómo responder. |
| **Conocimiento**   | `agente/src/knowledge/ordenes-compra.md` | Matriz de controles, criterios de negocio, datos fijos de la OC, archivos que produce.                  |
| **Ejecución**      | `agente/src/tools/oc.ts` + `agente/src/domain/` | Lectura, validación, construcción, evidencia y creación. Única fuente de valores.                       |

El system prompt es `prompt.md` + el conocimiento. Cambiar una regla de negocio (por ejemplo, la tolerancia de RC5) toca `src/domain/validacion.ts` y el conocimiento, nunca el servidor.

**Por qué un `Store`:** las herramientas no tocan el disco directamente; leen `fixtures/` y escriben `out/` a través de una interfaz. Así las mismas herramientas corren en `demo.ts`, en local y en producción, aunque el entorno de producción no tenga sistema de archivos.

---

## 3. Ciclo del agente

`agente/src/agent/ciclo.ts` (~130 líneas):

1. Agrega el mensaje del usuario al historial de la sesión.
2. Llama al modelo con el system prompt, el historial y el JSON Schema de las herramientas (generado desde zod con `z.toJSONSchema`, una sola fuente de verdad).
3. Si el modelo pide herramientas, cada llamada pasa por `ejecutarHerramienta`:
   - valida los argumentos con zod; si no cumplen, devuelve el error al modelo, sin lanzar;
   - ejecuta la herramienta;
   - escribe `{ ts, sesion, herramienta, caso, ok, resumen }` en `out/log.jsonl`;
   - devuelve el resultado al modelo y un resumen al chat.
4. Repite hasta que el modelo responde sin pedir herramientas.

**Topes de costo y tiempo**, todos configurables por entorno:

| Variable                 | Valor por defecto | Si se alcanza                                                           |
| ------------------------ | ----------------- | ----------------------------------------------------------------------- |
| `MAX_ITERACIONES`        | 25 por turno      | El agente responde con lo que hizo y pide continuar (CA1).              |
| `MAX_TOKENS_SESION`      | 300.000           | La sesión se cierra con un mensaje claro.                               |
| `MAX_TOKENS_DIA`         | 3.000.000         | Tope global: abrir sesiones nuevas no permite gastar la key sin límite. |
| `LLM_TIMEOUT_MS`         | 25 s por llamada  | Error legible en el chat.                                               |
| `MAX_DURACION_TURNO_MS`  | 30 s por turno    | No se inicia otra llamada al modelo; responde con lo hecho y pide continuar. Peor caso ~55 s, dentro del corte del proxy de Vercel. |
| `MAX_CARACTERES_MENSAJE` | 4.000             | El mensaje se rechaza.                                                  |
| `MAX_COSTO_USD`          | 5 USD acumulados  | El chat responde 429 y el agente queda en pausa. Se suma el costo real que informa OpenRouter en cada llamada. |

`ACCESS_KEY` es opcional y protege el link para que nadie gaste la key sin límite.

**Confirmación humana con defensa en dos capas (CA3):**

1. **El prompt** le pide al modelo preguntar y esperar.
2. **El servidor lo garantiza**, sin depender del modelo:
   - Al cerrar un turno, el ciclo calcula qué casos quedaron pendientes (validados con confirmaciones u `oc_crear` que pidió confirmación).
   - En el turno siguiente, `src/agent/confirmacion.ts` decide de forma determinista si el mensaje confirma. Por ejemplo, "confirmo" o "sí, créala" confirman; "no", "todavía no" o "no confirmo" no. El botón "Confirmar" del chat también confirma.
   - Si el usuario nombra casos ("confirmo sol-004"), solo esos quedan autorizados.
   - Esa autorización llega a `oc_crear` como `ctx.autorizaConfirmacion(caso)`. Si el modelo envía `confirmado: true` sin autorización del usuario, la herramienta lo rechaza.
   - La autorización caduca: solo vale en el mensaje inmediatamente posterior a la pregunta.
   - Si la analista dice "no" y más adelante el agente vuelve a preguntar por ese caso (aunque lo haga de memoria, sin llamar herramientas), el servidor lo reconoce como pregunta de confirmación y el siguiente "confirmo" vuelve a valer. Una pregunta cualquiera no reabre la autorización.
   - Si el modelo olvida cerrar con pregunta, el servidor la agrega.

El front resalta ese estado: etiqueta ámbar en la respuesta y barra con "Confirmar y crear" / "No crear". Los errores del proveedor (timeout, 401, 429, 5xx) se convierten en mensajes claros en el chat y la sesión sigue viva (CA5).

---

## 4. Elección del modelo

Los modelos se consumen por **OpenRouter**: una sola key da acceso a varios proveedores y cambiar de modelo es una variable de entorno, sin tocar `ciclo.ts`.

Criterio de elección: en un flujo de control financiero el error que importa es crear o describir mal una OC, no gastar unos centavos más. Como los valores salen de las herramientas y no del modelo, se puede elegir un modelo económico sin riesgo de montos inventados.

**Modelo elegido: `anthropic/claude-haiku-5.5`** por OpenRouter, con `temperature: 0`. Cuesta 0,10 USD por millón de tokens de entrada y 0,50 USD por millón de salida (precio de la API de modelos de OpenRouter el 23 de octubre de 2026 [13]).

Por qué este y no otro:
- **El trabajo difícil no lo hace el modelo.** Las reglas son deterministas y viven en las herramientas. El modelo decide qué herramienta llamar, en qué orden, y redacta. Para eso basta un modelo pequeño que llame herramientas de forma confiable y escriba bien en español.
- **Probado, no supuesto.** Los 6 casos corren en producción con este modelo y dan el resultado esperado del PRD, incluida la confirmación en dos turnos de `sol-004`, `sol-005` y `sol-006`.
- **Descartados:** `claude-sonnet-5.5` (2 / 10 USD por millón) cuesta 20 veces más sin mejorar nada que se evalúe, porque los valores no salen del modelo. `gpt-5-mini` (0,25 / 2) y `gemini-3.1-flash-lite` (0,25 / 1,50) cuestan más que Haiku. `deepseek-v4-flash` (0,09 / 0,18) es algo más barato, pero no lo probé con estos casos y no quería arriesgar el comportamiento del ciclo para ahorrar centavos. Cambiar de modelo es la variable `LLM_MODEL`.

**Costo medido por caso en producción** (`tokens.costo_usd_turno`, costo real que devuelve OpenRouter):

| Caso | Turnos | Tokens | Costo |
|---|---|---|---|
| `sol-001` creada sin excepciones | 1 | 29.083 | 0,0033 USD |
| `sol-002` bloqueada (RC1) | 1 | 15.890 | 0,0017 USD |
| `sol-003` bloqueada (RC2, RC3) | 1 | 16.234 | 0,0018 USD |
| `sol-004` prompt del PRD + "confirmo" | 2 | 44.214 | ≈ 0,0049 USD |
| `sol-005` retroactiva + "confirmo" | 2 | 36.981 | 0,0041 USD |
| `sol-006` IVA derivado + "confirmo" | 2 | 44.104 | 0,0049 USD |
| Los 6 casos validados en un solo turno | 1 | 56.160 | 0,0069 USD |

El chat muestra el costo de cada turno debajo de la respuesta (por ejemplo, "10.841 tokens · US$ 0.0013" en `sol-002`), así que en la demo se puede verificar en vivo.

**Entre 0,002 y 0,005 USD por caso** (unos 0,0035 USD en promedio). Con 1.000 OC al mes serían unos 3,5 a 5 USD. Casi todo son tokens de entrada: en cada iteración se reenvían el system prompt, los esquemas de las herramientas y el historial. Si el volumen crece, el siguiente ahorro es el *prompt caching* del proveedor, sin tocar el ciclo.

**Tope de gasto en dos capas:** `MAX_COSTO_USD = 5` en el agente, más un límite de crédito de 5 USD en la propia clave de OpenRouter. La segunda capa no depende de mi código.

---

## 5. Matriz de controles

Implementada como función pura en `src/domain/validacion.ts`: mismo paquete y mismos maestros dan el mismo resultado. Cada hallazgo trae `codigo`, `detalle`, `accion_sugerida` y, cuando aplica, los `valores` en conflicto.

| Regla | Implementación                                                                                                                                      | Caso que la prueba                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| RC1   | Busca por NIT normalizado (sin puntos ni DV). Sin NIT, por nombre normalizado (sin tildes, puntuación ni "S.A.S./Ltda."). Además verifica `activo`. | sol-002 → bloqueo                       |
| RC2   | Aprobación presente, con "Aprobado" (y sin "no aprobado"/"rechazado"), y `de` en los aprobadores del centro.                                        | sol-003 → bloqueo                       |
| RC3   | `valor_total ≤ tope` del aprobador en ese centro.                                                                                                   | —                                       |
| RC4   | El centro existe y la subárea le pertenece.                                                                                                         | —                                       |
| RC5   | `                                                                                                                                                   | cotización − solicitud                  | / solicitud ≤ 2 %` (y misma moneda). Sin cotización también es confirmación. Muestra ambos valores. | sol-004 → 6,0 % |
| RC6   | IVA ausente → propone `indicador_iva_default` del proveedor y pide confirmación. IVA inexistente en el maestro → bloqueo.                           | sol-006 → C1                            |
| RC7   | Condiciones de pago ausentes → derivadas del proveedor e informadas.                                                                                | sol-006 → Z030                          |
| RC8   | Factura con fecha anterior a la solicitud → `retroactiva = true`, confirmación y marca en `out/control.csv`.                                        | sol-005                                 |
| RC9   | Fecha de aprobación anterior a la solicitud → confirmación.                                                                                         | —                                       |
| RC10  | `                                                                                                                                                   | cantidad × valor_unitario − valor_total | ≤ 1`, si no, bloqueo.                                                                               | —               |

**La más difícil fue RC2/RC3**, no por el código sino por el criterio.

En `sol-003`, Felipe Vargas aprueba 74 millones con autoridad suficiente, pero en CC-3030 (Comercial), y la solicitud está imputada a CC-2020 (Administración). Además, ningún aprobador de CC-2020 tiene tope para ese monto. El correo de aprobación dice que la compra es "para el equipo de preventa", lo que sugiere que la solicitud está mal imputada.

**Decidí que el agente no reimpute.** Bloquea, explica las dos causas y sugiere: escalar a Dirección, o que el solicitante corrija el centro de costo si el gasto realmente es de Comercial. Reimputar automáticamente "para que pase" es justo el tipo de atajo que este control existe para evitar.

---

## 6. Diseño del adaptador SAP real

La interfaz `SapAdapter` (`consultarProveedor`, `crearOrden`, `buscarOrdenPorReferencia`) ya aísla al agente. Cambiar el mock por SAP real es implementar esa interfaz, sin tocar herramientas ni ciclo.

**Opción elegida, según lo que tenga Periferia** (la viabilidad no está confirmada, así que la primera tarea es confirmar versión y licencias con el equipo SAP):

1. **S/4HANA:** la API OData estándar de órdenes de compra. SAP la ofrece en dos versiones, `API_PURCHASEORDER_PROCESS_SRV` (OData V2) y `API_PURCHASEORDER_2` (OData V4) [1]; se elige según la versión del cliente. El acceso se habilita con un _communication arrangement_ que une el sistema externo, un usuario técnico y el escenario de integración de OC, **SAP_COM_0053** [2]. La creación es un _deep insert_ (cabecera + posiciones + imputación en una sola llamada).
2. **ECC on-premise:** `BAPI_PO_CREATE1` + `BAPI_TRANSACTION_COMMIT`, expuestas como un servicio propio a través de SAP Integration Suite o Cloud Connector. El agente nunca habla RFC directamente.
3. **Si no hay conexión viable:** el Plan B de abajo.

**Tres hallazgos que cambian el diseño:**

- **Una OC por petición.** SAP documenta que si se envían varias OC en un mismo _changeset_, solo se crea la primera y el resto se ignora [1]. `crearOrden` envía siempre una OC por llamada; nunca un lote.
- **En ECC, BAPI y commit en el mismo contexto.** La BAPI devuelve número de OC pero no la guarda hasta el commit; si las dos llamadas van en conexiones sin estado, el commit no tiene nada que confirmar y la OC nunca aparece [4]. Por eso va un servicio propio que llama a ambas en el mismo contexto y revisa la tabla `RETURN` antes de confirmar.
- **Imputación obligatoria.** Con imputación a centro de costo (`K`), SAP exige los datos de imputación por posición (`POACCOUNT` en la BAPI); sin ellos rechaza la OC [3].

Descarto empezar por RPA sobre SAP GUI: es frágil ante cambios de pantalla y difícil de auditar.

**Mapeo del payload (7.4) a OData:**

| Payload                            | OData / SAP                                                        | Nota                                                                  |
| ---------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `sociedad`                         | `CompanyCode`                                                      | 1000                                                                  |
| `organizacion_compras`             | `PurchasingOrganization`                                           | 1000                                                                  |
| —                                  | `PurchaseOrderType` = `NB`, `PurchasingGroup`                      | Configuración, no viene en la solicitud.                              |
| `proveedor.codigo_sap`             | `Supplier`                                                         |                                                                       |
| `moneda`                           | `DocumentCurrency`                                                 |                                                                       |
| `condiciones_pago`                 | `PaymentTerms`                                                     |                                                                       |
| `referencia.solicitud_id`          | Campo de referencia de cabecera (p. ej. `YourReference` o campo Z) | Clave de idempotencia.                                                |
| `posiciones[].numero`              | `PurchaseOrderItem`                                                | 10, 20…                                                               |
| `posiciones[].descripcion`         | `PurchaseOrderItemText`                                            | 40 caracteres.                                                        |
| `posiciones[].cantidad` / `unidad` | `OrderQuantity` / `PurchaseOrderQuantityUnit`                      | UN→EA, H→H, MES→MON (tabla de conversión).                            |
| `posiciones[].precio_unitario`     | `NetPriceAmount`                                                   | **Ojo:** SAP espera precio **neto sin IVA**; ver supuestos.           |
| `posiciones[].indicador_iva`       | `TaxCode`                                                          |                                                                       |
| `posiciones[].centro_costo`        | `AccountAssignmentCategory` = `K` + `CostCenter`                   |                                                                       |
| `posiciones[].subarea`             | Orden interna, elemento PEP o campo adicional                      | Definir con Contabilidad.                                             |
| —                                  | `Plant`, `MaterialGroup`, `GLAccount`                              | Faltan en el payload; se derivan por centro de costo o tipo de gasto. |
| `aprobador` + evidencia            | Adjunto al documento (servicio de adjuntos / GOS)                  | PDF + sha256 en el texto de cabecera.                                 |

**Credenciales:**

- Certificado de cliente u OAuth 2.0 _client credentials_ sobre un usuario de comunicación con rol mínimo: crear OC solo en la sociedad 1000. Las integraciones productivas de OC suelen usar certificado de cliente y guardar en el diseño solo alias de credenciales [5].
- Viven en el gestor de secretos del entorno donde corre el adaptador. Nunca en el repositorio, el prompt, los logs ni el front.
- El modelo nunca ve una credencial: solo llama `oc_crear`, y el adaptador la usa por dentro.

**Idempotencia y errores parciales:**

- **Antes de crear:** `buscarOrdenPorReferencia` hace `GET` con `$filter` por la referencia. Si existe, se devuelve ese número (igual que en el mock).
- **Timeout o respuesta perdida:** no se reintenta a ciegas. Se consulta por referencia y solo se reintenta si no existe.
- **Error parcial:** una OC por petición evita los lotes a medias. Con BAPI, si `RETURN` trae errores o el commit falla se hace `BAPI_TRANSACTION_ROLLBACK`. En ambos casos el error de SAP (mensajes de la tabla `RETURN` u OData `error.message`) se traduce a lenguaje claro y queda en el control como `error`.

**Plan B si la conexión no es viable:** el agente ya hace el 90 % del trabajo de valor (leer, validar contra maestros y matriz de aprobación, construir la OC y generar la evidencia). Sin integración:

1. Genera la **OC lista para digitar**: una ficha con los campos en el orden de la pantalla de creación de pedidos, para copiar y pegar en segundos.
2. Genera un **archivo de carga masiva** (CSV en el formato que defina SAP: Migration Cockpit, LSMW o carga propia) para cargar las OC del día en lote.
3. La analista pega el número de OC en el chat y el agente cierra el registro de control. La medición de OC retroactivas funciona igual.

---

## 7. Lectura del proceso: OC retroactivas

**Cómo es hoy el trabajo de la analista:**

| Etapa            | Qué hace                           | Dolor                                 | Qué cambia con el agente                 |
| ---------------- | ---------------------------------- | ------------------------------------- | ---------------------------------------- |
| Recibe el correo | Abre tres adjuntos                 | Información dispersa                  | Paquete normalizado en una llamada       |
| Verifica         | Proveedor y aprobador "de memoria" | Errores silenciosos, sin trazabilidad | RC1–RC10 explícitas, con motivo y acción |
| Digita           | Ocho campos en SAP GUI             | Repetitivo, costo de error alto       | OC construida y trazada a su fuente      |
| Evidencia        | Imprime el correo a PDF            | Manual                                | PDF + sha256 automáticos                 |
| Cierra           | Responde al solicitante            | Nadie mide nada                       | `control.csv` por cada intento           |

**Qué le diría a la Dirección (media página):**

Una OC retroactiva no es un problema de digitación: es un **compromiso de gasto que se hizo antes de que existiera el control**. Cuando la OC llega después, ya no gobierna precio, alcance ni autorización, y la pista de auditoría se debilita [6]. El proveedor entregó y facturó sin OC, y la aprobación llegó después para "regularizar". En `sol-005` la propia aprobación lo dice: _ya llegó la factura, por favor crear la OC para poder radicarla_. Mientras eso pase, la matriz de aprobación controla papeles, no decisiones de gasto.

El agente no lo puede arreglar solo, pero sí lo hace **visible y medible**: cada OC queda con `retroactiva = true/false` en `out/control.csv`. En los fixtures es 1 de 6 casos, que no es una muestra válida. El primer paso es medir uno o dos meses reales para tener una línea base.

**Mi propuesta de cambio, en tres pasos:**

1. **Medir (mes 1–2):** la **cobertura de OC**, el indicador estándar de compras: gasto respaldado por una OC aprobada _antes_ de la compra ÷ gasto direccionable, en valor y en número de facturas [7]. Se desglosa por centro de costo, proveedor y solicitante, desde el control. Sin cambiar reglas todavía.
2. **Atacar la causa principal:** las causas típicas son que el proceso de OC es más lento que comprar directo y los proveedores recurrentes sin OC permanente [7]. Para lo recurrente (papelería, licencias, servicios), **pedidos marco** anuales a precio pactado: se aprueban una vez y cada entrega consume saldo [8]. Así desaparece la retroactividad sin agregar burocracia.
3. **Política "sin OC no hay pago"** para el resto: el proveedor cita el número de OC en cada factura; la factura sin OC queda retenida y se le avisa; y hay una lista explícita de excepciones (servicios públicos, impuestos, nómina, urgencias documentadas) [9].

**Meta en dos pasos:** primero alcanzar la referencia de mercado, una cobertura de OC de alrededor de 77 % (promedio entre industrias en 2025 según el reporte de benchmarks de Procurify [7]); luego una meta interna de al menos 95 % de facturas con OC previa, el umbral que usa, por ejemplo, la política de NHS Wales [9]. Perseguir el 100 % es un error: siempre habrá gasto legítimo fuera de OC [7].

| Oportunidad (por qué hoy pasa)                         | Opción de solución                                                      | Experimento barato                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| El solicitante no sabe que la OC va antes de la compra | Mensaje automático del agente al solicitante cuando detecta retroactiva | Medir si baja la reincidencia por solicitante en 2 meses |
| Los gastos recurrentes exigen una OC cada vez          | Pedidos marco por proveedor recurrente                                  | Piloto con Papelería Central durante un trimestre        |
| El proveedor entrega sin OC                            | Exigir número de OC en la factura                                       | Comunicado a los 5 proveedores con más retroactivas      |

---

## 8. Decisiones y trade-offs

| #   | Decisión                                                                                                                                                                                                                                                                                                                             | Alternativa descartada                                                                 | Por qué                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Las herramientas reciben solo `caso` y recalculan todo desde la fuente.** `paquete`, `derivados` y `payload` se aceptan como opcionales: los dos primeros se ignoran y el `payload` solo se compara.                                                                                                                               | Pasar el paquete y el payload a través del modelo, como sugiere la tabla del contrato. | El riesgo del PRD es que el modelo "arregle" un monto. Si los valores nunca pasan por el modelo, no los puede alterar. Si envía un payload con montos distintos, `oc_crear` lo rechaza. Además se ahorran tokens. Costo: me desvío del contrato literal en esos argumentos. |
| 2   | **Confirmación garantizada por el servidor**, no solo por el prompt.                                                                                                                                                                                                                                                                 | Confiar en que el modelo respete el "no crees sin confirmar".                          | Un control financiero no puede depender de que el modelo obedezca. Costo: un detector de confirmación por palabras clave, que puede no reconocer frases raras; por eso existe también el botón "Confirmar".                                                                 |
| 3   | **Panel de la OC al estilo SAP Fiori al lado del chat.** El panel sigue el _object page_ de Fiori (cabecera, posiciones, barra de acciones) y su modelo de mensajes: los bloqueos se muestran como errores que impiden crear, las confirmaciones como advertencias que piden aprobar, y la OC creada como mensaje de éxito [10][11]. | Solo el chat; o una réplica completa de SAP.                                           | El prompt de ejemplo del PRD pide "muéstrame la OC como quedaría en SAP": el panel responde eso con patrones que la analista ya reconoce. Una réplica completa abriría alcance sin sumar a lo que se evalúa. Costo: más superficie de front que mantener.                   |
| 4   | **Ciclo y adaptadores propios con `fetch`.**                                                                                                                                                                                                                                                                                         | Un SDK de agentes con su propio ciclo de chat.                                         | El PRD evalúa el ciclo y el adaptador. Con un SDK, la parte evaluada sería código ajeno, y yo no podría explicar cada línea. Costo: sin streaming.                                                                                                                          |
| 5   | **La OC va por el valor de la solicitud, no de la cotización.**                                                                                                                                                                                                                                                                      | Usar el total de la cotización.                                                        | La solicitud es lo que el líder aprobó (en `sol-004`: "Aprobado por 25 millones"). Crearla por 26,5 superaría lo aprobado. La diferencia queda como excepción confirmada dentro de la OC.                                                                                   |
| 6   | **El módulo se genera desde las mismas fuentes.**                                                                                                                                                                                                                                                                                    | Copiar prompt, conocimiento y herramientas a `modulo/`.                                | `scripts/empaquetar.ts` escribe `modulo/agent.md` y el `SKILL.md` desde `agent/prompt.md` y `src/knowledge/`. `modulo/tools/oc.ts` reexporta `src/tools/oc.ts`. No pueden divergir.                                                                                         |

**Decisiones de plataforma**

| #   | Decisión                                                               | Alternativa descartada                                                                 | Por qué                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | **Agente en Cloudflare Workers con un Durable Object para el estado.** | Un servidor Node sin estado (Vercel Functions, Render) guardando la sesión en memoria. | La confirmación y la idempotencia necesitan memoria entre turnos. En una función sin estado, el segundo turno puede caer en otra instancia y perder la pregunta pendiente. El Durable Object es una sola instancia con almacenamiento propio, sin montar una base de datos (que el PRD declara fuera de alcance). |
| 8   | **Front en Vercel con un proxy en su servidor.**                       | Llamar al Worker directo desde el navegador con CORS.                                  | Si el Worker se protege con `ACCESS_KEY`, la clave tendría que viajar en el navegador. Con el proxy queda en una variable del servidor de Vercel. Costo: un salto de red más por mensaje.                                                                                                                         |
| 9   | **Front en Next.js con la plantilla del proyecto.**                    | HTML y JS sin compilación en `web/`.                                                   | El despliegue en Vercel y el proxy en el servidor salen de la misma app, y los tipos del contrato se comparten con TypeScript estricto. Costo: un paso de compilación.                                                                                                                                            |
| 10  | **Fixtures, prompt y conocimiento embebidos en el bundle del Worker** (`scripts/embeber.ts` antes de cada `dev` y `deploy`). | Subirlos a R2 o KV y leerlos en cada turno. | Son de solo lectura y pesan poco (360 KB comprimido el Worker completo). Embebidos no cuestan una llamada de red por lectura y la versión desplegada siempre coincide con el repositorio. Costo: cambiar un fixture exige volver a desplegar. |
| 11  | **Turno acotado por tiempo (30 s + 25 s de timeout del modelo)** en vez de streaming. | Streaming de eventos al front. | El proxy de Vercel corta a los 80 s. Con el presupuesto, un turno nunca pasa de ~55 s y, si se acerca, el agente responde con lo que alcanzó a hacer y pide continuar. Un turno real de `sol-004` tarda 12 s. Costo: la respuesta llega completa al final, no por partes. |

**Dependencias del agente**

| Dependencia | Para qué | Por qué no otra cosa |
| --- | --- | --- |
| `zod` | Argumentos de las herramientas, esquema de la OC, cuerpo de la API y JSON Schema para el modelo (`z.toJSONSchema`) | Obligatoria por el PRD; con la versión 4, el esquema del modelo sale del mismo código que valida. |
| `pdf-lib` | `aprobacion.pdf` (HU-4, P1) | JavaScript puro: corre igual en Bun y en Workers, sin binarios ni navegador. |
| `wrangler`, `@cloudflare/workers-types` | Desarrollo local, despliegue y tipos del Worker y del Durable Object | Herramienta oficial de Cloudflare. |
| `typescript`, `@types/bun` (desarrollo) | `tsc --noEmit` estricto, sin `any`; `bun test` | Bun ejecuta `demo.ts` y los tests en TypeScript sin compilar. |

Sin SDK de OpenRouter ni de agentes: el adaptador es `fetch` (decisión 4).

**Dependencias del front**

| Dependencia                     | Para qué                                                           | Por qué no otra cosa                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`, `react`, `react-dom`    | App, proxy y despliegue en Vercel                                  | Es la plataforma de despliegue elegida.                                                                                                                     |
| `react-markdown` + `remark-gfm` | Mostrar las respuestas del agente, que traen tablas en Markdown    | Convierte Markdown a elementos de React sin `dangerouslySetInnerHTML`, así una respuesta del modelo no puede inyectar HTML. `remark-gfm` agrega las tablas. |
| `tailwindcss`                   | Estilos con tokens propios (colores en OKLCH, modo claro y oscuro) | Ya venía en la plantilla; no se agregó una librería de componentes.                                                                                         |

---

## 9. Supuestos

- Los casos se identifican por su carpeta (`sol-004`). El agente traduce "SOL-2026-004" o "la 4".
- "Aprobado" se detecta por palabra, excluyendo "no aprobado" y "rechazado". En producción se pediría una respuesta estructurada o un flujo de aprobación con botón.
- **Precio con IVA:** las cotizaciones dan precios "IVA incluido" y la solicitud usa ese mismo valor unitario. Lo llevé tal cual al payload porque el PRD lo define así. En SAP real `NetPriceAmount` es **neto**: habría que dividir por (1 + tasa del indicador) y confirmarlo con Contabilidad. Con la tarifa general de 19 % (artículo 468 del Estatuto Tributario [12]), llevarlo tal cual infla la base en 19 %: en `sol-001`, 11.400.000 con IVA son 9.579.832 de base, como dice la propia cotización. Es el supuesto más importante a validar.
- **Trazabilidad con las cuatro fuentes del PRD** (`solicitud`, `cotizacion`, `maestro.<nombre>`, `derivado`): el correo y la aprobación son parte del paquete de la solicitud, así que se trazan como `solicitud`. Las constantes de SAP (sociedad, organización de compras, número de posición), el sha256 de la evidencia y la unidad inferida se trazan como `derivado`.
- La unidad se infiere del ítem cotizado: "Hora…" → `H`, mensual → `MES`, resto `UN`. Queda trazada como derivado.
- La descripción se recorta a 40 caracteres cortando en palabra. La completa queda en la solicitud.
- RC1 por NIT ignora el dígito de verificación. Sin NIT, el match por nombre es exacto tras normalizar; no hay coincidencia difusa para evitar falsos positivos.
- Se agregaron validaciones no listadas pero obvias: centro de costo inexistente, moneda no soportada, códigos de IVA o de pago inexistentes.
- Fechas comparadas como fecha local (`YYYY-MM-DD`) del texto, sin conversión de zona horaria.
- `confirmado_por` registra "analista vía chat (sesión …)" porque no hay autenticación (no-objetivo del PRD). Solo se guardan los primeros 8 caracteres del id de sesión, en la OC y en `log.jsonl`: el id completo permite leer el historial por `/api/sessions/:id` y esos archivos se pueden descargar.

---

## 10. Cobertura

| Historia                       | Estado          | Evidencia                                                                                                    | Qué falta para producción                                       |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| HU-1 Leer el paquete           | Hecho           | `oc_leer_paquete`; adjuntos ausentes en `faltantes`                                                          | Leer `.xlsx`, PDF y `.eml` reales (P1 `oc_leer_excel` no hecho) |
| HU-2 Validar                   | Hecho           | RC1–RC10 + extras; 6 casos correctos en `demo.ts`                                                            | Maestros en vivo desde SAP en lugar de JSON                     |
| HU-3 Construir payload         | Hecho           | Esquema zod de 7.4 + `trazabilidad.json`                                                                     | Campos SAP faltantes (planta, grupo de compras, cuenta)         |
| HU-4 Evidencia                 | Hecho (P0 y P1) | `aprobacion.txt` y `aprobacion.pdf` con sha256                                                               | Adjuntarla al documento en SAP                                  |
| HU-5 Crear en SAP simulado     | Hecho           | Secuencia desde 4500000001, idempotencia, `control.csv`                                                      | Adaptador real (sección 6)                                      |
| HU-6 Errores                   | Hecho           | `{ ok:false, error }` legible; nada lanza; caso inexistente, JSON malformado y argumentos inválidos probados | —                                                               |
| Front de chat                  | Hecho           | Herramientas visibles, "pensando", confirmación resaltada, archivos descargables                             | Streaming de eventos                                            |
| Panel de la OC al estilo Fiori | Hecho | Cabecera con estado y etiqueta "Retroactiva", bloqueos como error, confirmaciones como advertencia con los dos valores, derivados como información, posiciones con el origen de cada valor (`trazabilidad.json`), evidencia y barra de acciones al pie. Probado en escritorio, celular y modo oscuro. | Que la analista edite un campo y el agente revalide |
| Ciclo CA1–CA5                  | Hecho           | 30 tests automáticos con modelo simulado; los 6 casos probados en producción con `claude-haiku-5.5`, incluido el prompt del PRD sobre `sol-004` con confirmación en dos turnos | Streaming de eventos |
| Bonus módulo                   | Hecho           | `modulo/` generado desde las mismas fuentes                                                                  | —                                                               |

**Verificación:**

- `bun run demo.ts`: los 6 casos, idempotencia y confirmación, sin key.
- `bun run test` (30 tests): pregunta de confirmación sin duplicar, id de sesión recortado en archivos públicos, confirmación tras un "no", fila bloqueada única en el control, paquete según 7.2, trazabilidad con las fuentes del PRD, confirmación, negativas, caducidad de la confirmación, argumentos inválidos, tope de iteraciones, error del proveedor, log, montos alterados, idempotencia, OC ya existente, ruta maliciosa, JSON malformado, monto no numérico, retroactiva en el control, evidencia con sha256, tope de gasto de 5 USD, `ACCESS_KEY`, CORS y rutas con `%` malformado (400).
- En producción: prueba de aceptación automatizada con el modelo real, criterio por criterio (prompt de la sección 11, O1–O4, HU-1 a HU-6, CA1–CA5): 29 de 30 en la última corrida completa; el criterio restante (fila bloqueada de `sol-002` en el control) se corrigió y se verificó por separado en producción. Los casos bloqueados quedan en `control.csv` desde `oc_validar`, sin depender de que el modelo intente crear.

---

## 11. Uso de IA

Usé **Claude** (Anthropic) como asistente de construcción durante toda la sesión. No usé otros asistentes.

| Tarea          | Qué hizo la IA                                                                       | Qué hice yo                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Elegir el reto | Resumió y comparó los tres PRDs y sus fixtures                                       | Definí los criterios y pesos de la matriz y tomé la decisión                                                 |
| Arquitectura   | Propuso opciones de despliegue y de estado                                           | Elegí que el estado viva en el servidor y la interfaz `Store`                                                |
| Investigación  | Buscó y resumió documentación de SAP, guías de Fiori y prácticas de compras          | Decidí qué cambiaba el diseño y qué no                                                                       |
| Código         | Generó la primera versión de herramientas, reglas, ciclo, adaptadores, front y tests | Revisé cada archivo, ajusté criterios de negocio (RC2/RC3, valor de la OC) y verifiqué con `demo.ts` y tests |
| Documentación  | Borrador de este documento y del README                                              | Revisé y ajusté el contenido y la propuesta de proceso                                                       |

**Qué descarté de lo que me propuso, y por qué:**

- **Desplegar el agente en un servicio sin estado:** la confirmación entre turnos se podía perder entre instancias.
- **Un SDK de agentes o de chat con su propio ciclo:** el PRD evalúa que el ciclo y el adaptador sean propios y explicables.
- **Una plantilla full-stack con base de datos y autenticación:** el PRD los declara fuera de alcance; habría sido configuración sin valor.
- **Pasar el paquete y el payload completos por el modelo:** abría la puerta a montos alterados (decisión 1).
- **Reimputar automáticamente el centro de costo en `sol-003`:** saltarse un control para que el caso pase no es aceptable.

---

## 12. Riesgos de llevarlo a producción

**Riesgos reales y su mitigación:**

| Riesgo                                                                 | Cuándo atacarlo | Mitigación                                                                                                |
| ---------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| La conexión a SAP no es viable o tarda meses                           | Antes de salir  | Plan B (sección 6) desde el día 1; el valor de validación no depende de la integración                    |
| Las solicitudes reales llegan como Excel/PDF variables, no JSON limpio | Antes de salir  | Parser de `.xlsx` con plantilla fija obligatoria; PDF a texto con revisión humana si la confianza es baja |
| Precio con o sin IVA mal interpretado en SAP                           | Antes de salir  | Validarlo con Contabilidad en 3 OC piloto antes de activar la creación                                    |
| Maestros desactualizados (aprobadores que cambiaron de rol)            | 30 días después | Consultar maestros en vivo en SAP y RR. HH.; dueño del dato definido                                      |
| Suplantación del correo de aprobación                                  | 30 días después | Validar remitente con encabezados del servidor de correo, o mover la aprobación a un flujo con botón      |

**Preocupaciones que no considero reales:**

- _"El modelo va a inventar montos":_ por diseño los montos no pasan por el modelo (decisión 1) y hay un test que lo prueba.
- _"El costo por token se dispara":_ hay topes por turno, por sesión y por día, un tope de gasto acumulado de 5 USD en el agente y otro en la clave de OpenRouter. Un caso cuesta menos de medio centavo de dólar.

**Riesgos de plataforma** (límites del plan gratuito de Cloudflare según su documentación [14][15]):

| Riesgo | Mitigación |
| --- | --- |
| Workers Free da **10 ms de CPU** por petición | El turno pasa casi todo el tiempo esperando al modelo, y esa espera no cuenta como CPU. Los 6 casos, con PDF incluido, corrieron en producción sin pasar el límite. Si crece, Workers Paid da 30 s de CPU. |
| Workers Free permite **50 subpeticiones** por invocación (cada llamada al modelo y al Durable Object cuenta) | Un turno con los 6 casos (20 herramientas) corrió sin error. Para lotes más grandes: agrupar las escrituras en una sola llamada al Durable Object, o pasar a Paid (10.000). |
| Un solo Durable Object serializa todas las escrituras | Para el volumen de una analista sobra, y es justo lo que mantiene la numeración y la idempotencia. Si escala, un objeto por sociedad. |
| Límites diarios del plan gratuito: 100.000 peticiones al Worker y al Durable Object, 100.000 filas escritas | Muy por encima del uso real. Al pasarlos, la operación falla hasta las 00:00 UTC. |
| El proxy de Vercel corta a los 80 s | Turno acotado a ~55 s (decisión 11). |
| Vercel Hobby es para uso personal, no comercial | En producción, el front pasa a un plan comercial de Vercel o al mismo Cloudflare. |
| Dependencia de un solo proveedor de modelo | La interfaz `ProveedorLLM` aísla el ciclo. Cambiar de modelo es `LLM_MODEL`; de proveedor, otra implementación de la interfaz. |

**Costo mensual:**

| Pieza | Plan | Costo en la demo | Con 1.000 OC al mes |
| --- | --- | --- | --- |
| Front (Vercel, proyecto `reto03-oc-front`) | Hobby | 0 | Plan comercial de Vercel |
| Agente y estado (Cloudflare Worker + Durable Object con SQLite) | Workers Free | 0 | 0 en Free, o 5 USD/mes en Workers Paid si se necesita más CPU o subpeticiones |
| Modelo (OpenRouter, `claude-haiku-5.5`) | Pago por uso, tope de 5 USD | Centavos | ≈ 3,5 a 5 USD |

**Preguntas abiertas que hay que validar:**

- ¿Quién decide la política sobre OC retroactivas: tolerarlas con marca o bloquearlas? El agente las mide; la decisión es de la Dirección.
- ¿La analista confía en el agente lo suficiente para no revisar cada OC? Propongo un piloto con doble digitación de dos semanas y medir discrepancias antes de soltar el control manual.

---

## Fuentes

[1] SAP KBA 3686215, creación de OC con `API_PURCHASEORDER_PROCESS_SRV` y `API_PURCHASEORDER_2`: https://userapps.support.sap.com/sap/support/knowledge/en/3686215
[2] SAP Learning, Setting up Communication Management (escenario SAP_COM_0053): https://learning.sap.com/courses/implementing-sap-s-4hana-cloud-public-edition-sourcing-and-procurement/setting-up-communication-management_a913171c-c96d-47a9-81ec-dc9ee8754320
[3] SAP Community, BAPI_PO_CREATE1 e imputación (POACCOUNT): https://community.sap.com/t5/application-development-and-automation-discussions/bapi-po-create1/m-p/3331551
[4] SAP Community, BAPI_TRANSACTION_COMMIT tras BAPI_PO_CREATE1: https://answers.sap.com/questions/9227330/bapitransactioncommit-problem.html
[5] Ejemplo de integración de creación de OC en S/4HANA (VU Amsterdam): https://cds.it.vu.nl/iflows/vu-s-4hana-procurement-integrations-wms-createpurchaseorder-d8c312.html
[6] Simfoni, After-the-Fact Purchase Order: https://simfoni.com/glossary/after-the-fact-purchase-order/
[7] ProcureDesk, PO Coverage Rate: https://www.procuredesk.com/po-coverage-rate/
[8] Procurify, Blanket Purchase Orders: https://www.procurify.com/blog/blanket-purchase-orders/
[9] NHS Wales, No Purchase Order No Payment Policy 2024: https://nwssp.nhs.wales/ourservices/accounts-payable/accounts-payable-documents/nhs-wales-no-purchase-order-no-payment-policy-2024/
[10] SAP Fiori Design, Object Page: https://www.sap.com/design-system/fiori-design-web/v1-84/page-types/floorplans/object-page/usage
[11] SAP Fiori Design, Message Handling: https://www.sap.com/design-system/fiori-design-web/v1-151/foundations/best-practices/global-patterns/messaging/messaging
[12] Gerencie, Tarifa general del IVA (artículo 468 del Estatuto Tributario): https://www.gerencie.com/tarifa-general-en-el-impuesto-a-las-ventas.html

[13] OpenRouter, API de modelos y precios: https://openrouter.ai/api/v1/models
[14] Cloudflare, Workers limits: https://developers.cloudflare.com/workers/platform/limits/
[15] Cloudflare, Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/

Consultadas el 23 de octubre de 2026.
