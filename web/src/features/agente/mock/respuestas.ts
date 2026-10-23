// SOLO DESARROLLO LOCAL. Simula el Worker del agente siguiendo CONTRATO-API.md
// para construir la interfaz mientras el agente real no está desplegado.
// El proxy lo rechaza en Vercel (VERCEL_ENV), así que la demo nunca muestra estos datos.
// Valores tomados de fixtures/reto-03/solicitudes/sol-004 y de los maestros.

import type {
  ChatRespuesta,
  OrdenCompra,
  SesionRespuesta,
  ToolCall,
  Turno,
  Validacion,
} from '../types/contrato'

type SesionMock = { turnos: Turno[]; pendientes: string[]; tokens: number; creada: boolean }

const sesiones = new Map<string, SesionMock>()
const archivos = new Map<string, unknown>()
let creadaGlobal = false

const SHA = 'a3f1c9e07b5d24e8c61f0a9b2d7e4c13f58a6b9c0d1e2f3a4b5c6d7e8f9a0b1c'

const validacion: Validacion = {
  caso: 'sol-004',
  apta: true,
  bloqueos: [],
  confirmaciones: [
    {
      codigo: 'RC5',
      tipo: 'confirmacion',
      detalle: 'La cotización difiere 6,00 % de la solicitud (máximo 2 %).',
      accion_sugerida:
        'Confirmar que la OC se crea por el valor aprobado (25 millones) y no por el de la cotización.',
      valores: { solicitud: 25000000, cotizacion: 26500000, diferencia_pct: 6 },
    },
  ],
  derivados: {
    unidad: { valor: 'H', fuente: 'derivado', detalle: 'El ítem cotizado se factura por hora.' },
  },
  retroactiva: false,
}

function payload(creada: boolean): OrdenCompra {
  return {
    referencia: { solicitud_id: 'SOL-2026-004', correo_id: 'sol-004-correo', cotizacion_ref: 'CA-2026-0310' },
    sociedad: '1000',
    organizacion_compras: '1000',
    proveedor: { codigo_sap: '100310', nit: '901222333', nombre: 'Cloud Andina S.A.S.' },
    moneda: 'COP',
    condiciones_pago: 'Z000',
    aprobador: {
      email: 'dgarcia@periferia-ficticia.com',
      fecha_aprobacion: '2026-08-26T18:45:00-05:00',
      evidencia_sha256: SHA,
    },
    posiciones: [
      {
        numero: 10,
        descripcion: 'Bolsa de 100 horas de arquitectura de',
        cantidad: 100,
        unidad: 'H',
        precio_unitario: 250000,
        centro_costo: 'CC-1010',
        subarea: 'Desarrollo',
        indicador_iva: 'C1',
      },
    ],
    excepciones: [
      {
        codigo: 'RC5',
        detalle: 'Cotización 26.500.000 vs. solicitud 25.000.000 (6,00 %).',
        confirmado_por: creada ? 'analista vía chat (sesión mock)' : null,
      },
    ],
    numero_oc: creada ? '4500000001' : null,
    estado: creada ? 'creada' : 'borrador',
  }
}

const trazabilidad = {
  'referencia.solicitud_id': 'solicitud',
  'proveedor.codigo_sap': 'maestro.proveedores',
  condiciones_pago: 'solicitud',
  'posiciones[0].descripcion': 'solicitud',
  'posiciones[0].cantidad': 'solicitud',
  'posiciones[0].unidad': 'derivado',
  'posiciones[0].precio_unitario': 'solicitud',
  'posiciones[0].centro_costo': 'solicitud',
  'posiciones[0].indicador_iva': 'solicitud',
}

const RESPUESTA_1 = `Procesé **sol-004** (SOL-2026-004). Así quedaría la OC en SAP:

| Campo | Valor |
|---|---|
| Proveedor | Cloud Andina S.A.S. (100310) |
| Posición 10 | 100 H × $ 250.000 |
| Valor total | $ 25.000.000 COP |
| Centro de costo | CC-1010 / Desarrollo |
| IVA · Pago | C1 · Z000 |
| Aprobador | dgarcia@periferia-ficticia.com |

**Validaciones:** pasó RC1, RC2, RC3, RC4, RC6, RC7, RC8, RC9 y RC10.

**Requiere tu confirmación (RC5):** la cotización es de **$ 26.500.000** y la solicitud de **$ 25.000.000**, una diferencia de **6,00 %** (máximo 2 %). La OC se crearía por el valor aprobado, 25 millones.

¿Confirmas que cree la OC de sol-004 por $ 25.000.000?`

const RESPUESTA_2 = `Listo. Creé la OC **4500000001** para sol-004 por **$ 25.000.000 COP**.

- Excepción RC5 registrada como confirmada por ti.
- Evidencia de aprobación: \`out/sol-004/aprobacion.pdf\`.
- Quedó una fila en \`out/control.csv\` con \`retroactiva = false\`.`

const tc = (nombre: string, args: Record<string, unknown>, resumen: string, ok = true): ToolCall => ({
  nombre,
  args,
  ok,
  resumen,
})

function json(cuerpo: unknown, status = 200): Response {
  return Response.json(cuerpo, { status })
}

function esConfirmacion(texto: string, confirm: boolean): boolean {
  if (confirm) return true
  const t = texto.toLowerCase()
  return /\b(confirmo|s[ií],? cr[eé]ala|adelante)\b/.test(t) && !/\bno\b/.test(t)
}

async function chat(cuerpo: string | undefined): Promise<Response> {
  let datos: { sessionId?: string; message?: string; confirm?: boolean }
  try {
    datos = JSON.parse(cuerpo ?? '{}')
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400)
  }
  const id = datos.sessionId ?? ''
  const mensaje = (datos.message ?? '').trim()
  const confirm = datos.confirm === true
  if (!id) return json({ error: 'Falta sessionId.' }, 400)

  const s = sesiones.get(id) ?? { turnos: [], pendientes: [], tokens: 0, creada: false }
  sesiones.set(id, s)
  s.turnos.push({ rol: 'usuario', texto: mensaje || 'confirmo', ts: new Date().toISOString() })

  // Simula la latencia del modelo para ver el indicador "pensando".
  await new Promise((r) => setTimeout(r, 1800))

  let r: ChatRespuesta
  if (s.pendientes.includes('sol-004') && esConfirmacion(mensaje, confirm)) {
    s.creada = true
    creadaGlobal = true
    s.pendientes = []
    archivos.set('sol-004/payload.json', payload(true))
    r = base(id, RESPUESTA_2, [
      tc('oc_crear', { caso: 'sol-004', confirmado: true }, 'OC 4500000001 creada · idempotente: no'),
    ])
  } else if (/sol-?0*4\b/i.test(mensaje)) {
    archivos.set('sol-004/validacion.json', validacion)
    archivos.set('sol-004/payload.json', payload(creadaGlobal))
    archivos.set('sol-004/trazabilidad.json', trazabilidad)
    s.pendientes = creadaGlobal ? [] : ['sol-004']
    r = base(
      id,
      RESPUESTA_1,
      [
        tc('oc_leer_paquete', { caso: 'sol-004' }, 'Paquete completo: correo, solicitud, cotización y aprobación'),
        tc('oc_validar', { caso: 'sol-004' }, 'apta · 0 bloqueos · 1 confirmación (RC5)'),
        tc('oc_construir_payload', { caso: 'sol-004' }, '1 posición · $ 25.000.000 COP · trazabilidad guardada'),
        tc('oc_generar_evidencia', { caso: 'sol-004' }, `out/sol-004/aprobacion.pdf · sha256 ${SHA.slice(0, 12)}…`),
        tc('oc_crear', { caso: 'sol-004' }, 'No creada: pide confirmación de la analista (RC5)'),
      ],
      !creadaGlobal,
    )
  } else {
    r = base(id, 'Este es el **simulador local** del front. Solo reproduce el flujo de `sol-004`. Para los demás casos conecta el Worker del agente con `AGENTE_URL`.', [])
  }
  s.tokens += r.tokens.turno
  r.tokens.sesion = s.tokens
  s.turnos.push({
    rol: 'agente',
    texto: r.reply,
    toolCalls: r.toolCalls,
    needsConfirmation: r.needsConfirmation,
    error: null,
    ts: new Date().toISOString(),
  })
  return json(r)
}

function base(id: string, reply: string, toolCalls: ToolCall[], needsConfirmation = false): ChatRespuesta {
  const casos = toolCalls.length > 0 ? ['sol-004'] : []
  return {
    sessionId: id,
    reply,
    toolCalls,
    needsConfirmation,
    pendientes: needsConfirmation ? ['sol-004'] : [],
    casos,
    error: null,
    tokens: { turno: 4200, sesion: 0 },
  }
}

const TEXTO_EVIDENCIA = `De: dgarcia@periferia-ficticia.com
Para: natalia.ríos@periferia-ficticia.com
Fecha: 2026-08-26T18:45:00-05:00
Asunto: RE: Solicitud de orden de compra SOL-004

Aprobado por 25 millones según la solicitud.

Diego García
Director de Tecnología

sha256: ${SHA}
(simulador local)`

export async function respuestaMock(metodo: string, ruta: string, cuerpo: string | undefined): Promise<Response> {
  if (metodo === 'POST' && ruta === 'chat') return chat(cuerpo)
  if (ruta === 'health') return json({ ok: true, provider: 'mock', model: 'simulador-local', llm_configurado: false })
  if (ruta === 'casos') return json({ casos: ['sol-001', 'sol-002', 'sol-003', 'sol-004', 'sol-005', 'sol-006'] })
  if (ruta.startsWith('sessions/')) {
    const id = decodeURIComponent(ruta.slice('sessions/'.length))
    const s = sesiones.get(id)
    const r: SesionRespuesta = { sessionId: id, turnos: s?.turnos ?? [], pendientes: s?.pendientes ?? [], tokens: s?.tokens ?? 0 }
    return json(r)
  }
  if (ruta === 'files') return json({ archivos: [...archivos.keys()].map((k) => `out/${k}`) })
  if (ruta.startsWith('files/out/')) {
    const clave = ruta.slice('files/out/'.length)
    if (clave === 'sol-004/aprobacion.txt' || clave === 'sol-004/aprobacion.pdf') {
      if (!archivos.has('sol-004/payload.json')) return json({ error: 'No existe todavía.' }, 404)
      return new Response(TEXTO_EVIDENCIA, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
    const v = archivos.get(clave)
    return v === undefined ? json({ error: 'No existe todavía.' }, 404) : json(v)
  }
  return json({ error: 'Ruta no encontrada en el simulador.' }, 404)
}
