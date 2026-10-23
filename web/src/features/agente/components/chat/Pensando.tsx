'use client'

import { useEffect, useState } from 'react'

const PASOS = [
  'Leyendo el paquete de la solicitud',
  'Validando contra maestros y matriz de aprobación',
  'Construyendo la orden de compra',
  'Preparando la respuesta',
]

export function Pensando() {
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 3500)
    return () => clearInterval(t)
  }, [])
  return (
    <div role="status" aria-live="polite" className="animar-entrada flex items-center gap-3 text-[13.5px] text-texto-2">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-marca"
            style={{ animation: `pulso 1.2s ${i * 0.18}s infinite` }}
          />
        ))}
      </span>
      <span>
        Pensando · <span className="text-texto-3">{PASOS[paso]}…</span>
      </span>
    </div>
  )
}
