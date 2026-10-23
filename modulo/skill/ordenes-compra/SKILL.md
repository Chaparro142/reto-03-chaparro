---
name: ordenes-compra
description: Proceso de órdenes de compra SAP de Periferia IT Group — matriz de controles RC1–RC10, criterios de negocio, datos fijos de la OC y archivos que produce. Úsalo al procesar solicitudes de compra con las herramientas oc_*.
---
<!-- Generado por scripts/empaquetar.ts desde src/knowledge/ordenes-compra.md. No editar a mano. -->

# Conocimiento del proceso: órdenes de compra en SAP (Periferia IT Group)

## El proceso

Cada compra llega a Compras por correo con tres piezas: la solicitud (Excel), la cotización del proveedor y el correo de aprobación del líder. La analista crea la orden de compra (OC) en SAP con proveedor, descripción, centro de costo y subárea, valor, indicador de IVA, aprobador y condiciones de pago, y adjunta la aprobación como PDF. Contabilidad y Auditoría consumen el registro de control.

## Herramientas y orden de uso

1. `oc_leer_paquete` — lee y normaliza el paquete del caso.
2. `oc_validar` — aplica la matriz de controles. Devuelve `apta`, `bloqueos`, `confirmaciones`, `derivados` y `retroactiva`.
3. `oc_construir_payload` — arma la OC como quedaría en SAP (solo si no hay bloqueos).
4. `oc_generar_evidencia` — genera `aprobacion.txt` y `aprobacion.pdf` con el sha256.
5. `oc_crear` — crea la OC en SAP simulado y devuelve el número. Es idempotente por `solicitud_id`.

Los casos se identifican por carpeta: `sol-001` … `sol-006`. "SOL-2026-004", "la 4" o "sol 4" se refieren a `sol-004`.

## Matriz de controles

| Regla | Qué verifica | Tipo |
|---|---|---|
| RC1 | El proveedor existe en el maestro (por NIT; sin NIT, por nombre normalizado) y está activo. | Bloqueo |
| RC2 | Hay aprobación, dice "Aprobado" y viene de un aprobador del centro de costo de la solicitud. | Bloqueo |
| RC3 | El valor total no supera el tope del aprobador en ese centro. | Bloqueo |
| RC4 | El centro de costo existe y la subárea le pertenece. | Bloqueo |
| RC5 | La cotización no difiere más de 2 % de la solicitud. Sin cotización, también pide confirmación. | Confirmación |
| RC6 | Si falta el indicador de IVA, se propone el del proveedor y se confirma. | Confirmación + derivado |
| RC7 | Si faltan las condiciones de pago, se toman del proveedor y se informan. | Derivado |
| RC8 | Si hay factura anterior a la solicitud, la OC es retroactiva: se confirma y queda marcada en el control. | Confirmación |
| RC9 | La aprobación no puede ser anterior a la solicitud. | Confirmación |
| RC10 | cantidad × valor unitario = valor total (± 1). | Bloqueo |

Validaciones adicionales: moneda distinta de COP/USD, indicador de IVA o condición de pago inexistentes en el maestro (bloqueo).

## Criterios de negocio

- **Bloqueo** = no se crea la OC. Se explica el motivo y la acción sugerida (a quién pedir qué). Nunca se "arregla" un dato para que pase: no se reimputa el centro de costo, no se cambia el aprobador, no se ajusta el monto.
- **Confirmación** = la OC se puede crear solo si la analista lo confirma explícitamente en el chat. La excepción queda registrada en la OC con quién la confirmó.
- **Derivado** = valor que el agente completó desde un maestro; siempre se informa.
- **Valor de la OC:** se crea por el valor de la solicitud (lo que aprobó el líder), no por el de la cotización. La diferencia queda como excepción confirmada.
- **OC retroactiva:** la factura llegó antes de la solicitud; la compra se hizo sin control previo. Se permite con confirmación, pero se mide: queda `retroactiva = true` en `out/control.csv`. La Dirección quiere saber cuántas hay.
- **Precio con IVA:** las cotizaciones traen precios con IVA incluido; la solicitud usa ese mismo valor unitario. Es un supuesto a validar con Contabilidad antes de producción.

## Datos fijos de la OC

- Sociedad `1000`, organización de compras `1000`.
- Una posición por solicitud, número `10`. Texto breve de máximo 40 caracteres.
- Unidad: `H` si el ítem es por horas, `MES` si es mensual, `UN` en otro caso.
- Numeración del SAP simulado desde `4500000001`.

## Maestros (resumen para orientar, la fuente de verdad son las herramientas)

- Centros de costo: CC-1010 Tecnología, CC-2020 Administración, CC-3030 Comercial.
- Indicadores de IVA: C0 excluido, C1 19 %, C2 5 %.
- Condiciones de pago: Z000 inmediato, Z015, Z030, Z060 días fecha factura.

## Archivos que produce el agente

| Archivo | Contenido |
|---|---|
| `out/<caso>/validacion.json` | Resultado de la matriz de controles. |
| `out/<caso>/payload.json` | La OC (borrador o creada, con su número). |
| `out/<caso>/trazabilidad.json` | De dónde salió cada valor de la OC. |
| `out/<caso>/aprobacion.txt` y `.pdf` | Evidencia de aprobación con sha256. |
| `out/sap/ordenes.jsonl` | OC creadas en el SAP simulado. |
| `out/control.csv` | Un registro por intento: creada, bloqueada, pendiente, existente. |
| `out/log.jsonl` | Cada llamada a herramienta. |
