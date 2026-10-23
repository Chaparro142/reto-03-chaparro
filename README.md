# Reto 03 · Agente "Órdenes de Compra SAP"

Stiven Chaparro Herrera · Proceso de selección Perxia 2.0 · Periferia IT Group

Agente conversacional que lee el paquete de una solicitud de compra, lo valida contra los maestros (RC1–RC10), arma la orden de compra como quedaría en SAP, genera la evidencia de aprobación y la crea en un SAP simulado. Las excepciones no se resuelven a la fuerza: se bloquean o se piden confirmar.

- **Link de prueba:** _pendiente del despliegue_ (front en Vercel)
- **API del agente:** _pendiente del despliegue_ (Worker en Cloudflare)
- **Planteamiento de la solución:** [SOLUCION.md](SOLUCION.md)

## Estructura

| Carpeta       | Qué contiene                                                                                                                                                             | Dónde corre                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `agente/`     | Ciclo del agente, herramientas `zod`, adaptador LLM, SAP simulado, `demo.ts`, tests y `modulo/`. Contrato de la API en [agente/CONTRATO-API.md](agente/CONTRATO-API.md). | Cloudflare Workers + Durable Objects |
| `src/` (raíz) | Front en Next.js: chat y panel de la OC al estilo SAP Fiori.                                                                                                             | Vercel                               |

El navegador nunca habla directo con el Worker. El front expone `/api/agente/*` en su propio servidor y reenvía a `${AGENTE_URL}/api/*`, agregando la clave de acceso desde una variable del servidor. Así la clave no llega al navegador y no hace falta CORS.

## Levantar en local

Requisitos: [Bun](https://bun.sh) 1.x y Node 20 o superior.

```bash
bun install
cd agente && bun install && cd ..
```

1. **Agente** (puerto 8787). Copia `agente/.env.example` a `agente/.dev.vars` y pon tu `OPENROUTER_API_KEY`.

```bash
cd agente && bun run dev
```

2. **Front** (puerto 3000). Copia `.env.local.example` a `.env.local` y pon `AGENTE_URL=http://localhost:8787`.

```bash
bun run dev
```

Abre http://localhost:3000.

> Sin Worker ni clave puedes ver la interfaz con `DEMO_MOCK=1` en `.env.local`: el front simula el flujo de `sol-004`. Este modo se ignora en Vercel.

## Variables de entorno del front

| Variable            | Obligatoria                     | Uso                                                                               |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| `AGENTE_URL`        | Sí                              | URL base del Worker, sin barra final.                                             |
| `AGENTE_ACCESS_KEY` | Si el Worker tiene `ACCESS_KEY` | Se envía como `x-access-key` desde el servidor de Next. Nunca llega al navegador. |
| `DEMO_MOCK`         | No                              | `1` activa el simulador local. Se ignora en Vercel.                               |

Las variables del agente están en [agente/.env.example](agente/.env.example).

## Verificación sin modelo

```bash
cd agente && bun run demo.ts
```

Procesa los 6 casos llamando directo a las herramientas, sin clave de ningún proveedor.

## Prueba en el chat

Prompt de ejemplo del PRD, en una sesión nueva:

```
Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué
validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.
```

El chat muestra cada llamada a herramienta, resalta en ámbar la pregunta de confirmación y el panel de la izquierda muestra la OC con la diferencia de RC5 (solicitud contra cotización). Al pulsar **Confirmar y crear**, la OC recibe su número.

## Scripts del front

| Comando             | Qué hace                                  |
| ------------------- | ----------------------------------------- |
| `bun run dev`       | Servidor de desarrollo en el puerto 3000. |
| `bun run build`     | Compilación de producción.                |
| `bun run typecheck` | Revisión de tipos.                        |
