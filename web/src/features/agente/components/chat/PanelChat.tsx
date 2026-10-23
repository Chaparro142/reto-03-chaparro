'use client'

import { useEffect, useRef } from 'react'
import type { Turno } from '../../types/contrato'
import { BarraConfirmacion } from './BarraConfirmacion'
import { Burbuja } from './Burbuja'
import { Compositor } from './Compositor'
import { Pensando } from './Pensando'

export const PROMPT_EJEMPLO =
  'Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.'

type Props = {
  turnos: Turno[]
  pensando: boolean
  cargando: boolean
  pendientes: string[]
  casosDisponibles: string[]
  onEnviar: (texto: string) => void
  onConfirmar: () => void
  onRechazar: () => void
}

function EstadoVacio({ casos, onEnviar }: { casos: string[]; onEnviar: (t: string) => void }) {
  return (
    <div className="animar-entrada py-2">
      <h2 className="text-[17px] font-semibold text-texto">¿Qué solicitud procesamos?</h2>
      <p className="mt-1 max-w-[42ch] text-[14px] text-texto-2">
        El agente lee el paquete, lo valida contra los maestros y te muestra la OC. No crea nada sin tu confirmación
        cuando hay excepciones.
      </p>

      <button
        type="button"
        onClick={() => onEnviar(PROMPT_EJEMPLO)}
        className="mt-4 block w-full rounded-lg border border-marca/40 bg-marca-suave px-3.5 py-3 text-left transition-colors hover:border-marca"
      >
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-marca">Prompt de ejemplo del PRD</span>
        <span className="mt-1 block text-[14px] text-texto">{PROMPT_EJEMPLO}</span>
      </button>

      {casos.length > 0 && (
        <div className="mt-5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-texto-3">O procesa un caso</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {casos.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onEnviar(`Procesa la solicitud ${c}`)}
                className="rounded-md border border-borde-fuerte bg-superficie px-2.5 py-1 font-mono text-[12.5px] text-texto-2 transition-colors hover:border-marca hover:text-marca"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PanelChat(props: Props) {
  const { turnos, pensando, cargando, pendientes, casosDisponibles, onEnviar, onConfirmar, onRechazar } = props
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turnos.length, pensando])

  const ultimo = turnos.at(-1)
  const esperaConfirmacion = !pensando && ultimo?.rol === 'agente' && ultimo.needsConfirmation

  return (
    <section aria-label="Conversación con el agente" className="flex h-full min-h-0 flex-col bg-fondo">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {cargando ? (
          <p className="text-[14px] text-texto-3">Recuperando la conversación…</p>
        ) : turnos.length === 0 ? (
          <EstadoVacio casos={casosDisponibles} onEnviar={onEnviar} />
        ) : (
          <div className="space-y-5">
            {turnos.map((t, i) => (
              <Burbuja key={`${t.ts}-${i}`} turno={t} esUltimo={i === turnos.length - 1} />
            ))}
          </div>
        )}
        {pensando && (
          <div className="mt-5">
            <Pensando />
          </div>
        )}
        <div ref={finRef} />
      </div>

      {esperaConfirmacion && (
        <BarraConfirmacion
          pendientes={pendientes}
          deshabilitada={pensando}
          onConfirmar={onConfirmar}
          onRechazar={onRechazar}
        />
      )}
      <Compositor deshabilitado={pensando || cargando} onEnviar={onEnviar} />
    </section>
  )
}
