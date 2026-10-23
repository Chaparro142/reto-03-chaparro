'use client'

import { useState } from 'react'
import type { ToolCall } from '../../types/contrato'
import { nombreHerramienta } from '../../utils/formato'

export function TarjetaHerramienta({ llamada }: { llamada: ToolCall }) {
  const [abierta, setAbierta] = useState(false)
  const args = JSON.stringify(llamada.args, null, 2)
  return (
    <li
      className={`rounded-md border text-[13px] ${
        llamada.ok ? 'border-borde bg-superficie' : 'border-error-borde bg-error-suave'
      }`}
    >
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left"
      >
        <span
          aria-hidden
          className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${llamada.ok ? 'bg-exito' : 'bg-error'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-texto">{nombreHerramienta(llamada.nombre)}</span>
            <code className="font-mono text-[11.5px] text-texto-3">{llamada.nombre}</code>
          </span>
          <span className={`block ${llamada.ok ? 'text-texto-2' : 'text-error'}`}>
            {llamada.ok ? llamada.resumen : `Falló: ${llamada.resumen}`}
          </span>
        </span>
        <span aria-hidden className={`mt-1 text-texto-3 transition-transform ${abierta ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {abierta && (
        <div className="border-t border-borde px-3 py-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-texto-3">Argumentos</p>
          <pre className="overflow-x-auto font-mono text-[12px] text-texto-2">{args}</pre>
        </div>
      )}
    </li>
  )
}
