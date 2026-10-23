import type { Turno } from '../../types/contrato'
import { cifra, hora } from '../../utils/formato'
import { Markdown } from './Markdown'
import { TarjetaHerramienta } from './TarjetaHerramienta'

export function Burbuja({ turno, esUltimo }: { turno: Turno; esUltimo: boolean }) {
  if (turno.rol === 'usuario') {
    return (
      <div className="animar-entrada flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-sm bg-marca px-3.5 py-2 text-sobre-marca">
          <p className="whitespace-pre-wrap">{turno.texto}</p>
          <p className="mt-0.5 text-right text-[11px] opacity-80">{hora(turno.ts)}</p>
        </div>
      </div>
    )
  }

  const pideConfirmacion = turno.needsConfirmation
  return (
    <div className="animar-entrada space-y-2">
      {turno.toolCalls.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-texto-3">
            Herramientas · {turno.toolCalls.length}
          </p>
          <ol className="space-y-1.5">
            {turno.toolCalls.map((t, i) => (
              <TarjetaHerramienta key={`${t.nombre}-${i}`} llamada={t} />
            ))}
          </ol>
        </div>
      )}

      {turno.texto && (
        <div
          className={`rounded-lg border px-3.5 py-3 ${
            pideConfirmacion ? 'border-aviso-borde bg-aviso-suave' : 'border-borde bg-superficie'
          }`}
        >
          {pideConfirmacion && (
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-aviso">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-aviso" />
              {esUltimo ? 'Esperando tu confirmación' : 'Pidió confirmación'}
            </p>
          )}
          <Markdown texto={turno.texto} />
        </div>
      )}

      {turno.error && (
        <div role="alert" className="rounded-lg border border-error-borde bg-error-suave px-3.5 py-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-error">No se completó</p>
          <p className="mt-0.5 text-texto">{turno.error}</p>
          <p className="mt-1 text-[13px] text-texto-2">
            La sesión sigue activa. Puedes reintentar o escribir otra instrucción.
          </p>
        </div>
      )}

      <p className="text-[11px] text-texto-3">
        {hora(turno.ts)}
        {turno.consumo && turno.consumo.tokens > 0 && (
          <span title="Consumo del modelo en este turno">
            {' · '}
            {cifra(turno.consumo.tokens)} tokens
            {turno.consumo.costoUsd !== undefined && ` · US$ ${turno.consumo.costoUsd.toFixed(4)}`}
          </span>
        )}
      </p>
    </div>
  )
}
