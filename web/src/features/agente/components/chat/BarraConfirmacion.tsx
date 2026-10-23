type Props = {
  pendientes: string[]
  deshabilitada: boolean
  onConfirmar: () => void
  onRechazar: () => void
}

export function BarraConfirmacion({ pendientes, deshabilitada, onConfirmar, onRechazar }: Props) {
  return (
    <div className="animar-entrada border-t border-aviso-borde bg-aviso-suave px-4 py-3">
      <p className="text-[13px] text-texto">
        <span className="font-semibold text-aviso">Confirmación pendiente</span>
        {pendientes.length > 0 && (
          <>
            {' '}
            para <span className="font-mono text-[12.5px]">{pendientes.join(', ')}</span>
          </>
        )}
        . El agente no crea la OC sin tu respuesta.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={deshabilitada}
          className="rounded-md bg-marca px-3.5 py-1.5 text-[14px] font-medium text-sobre-marca transition-colors hover:bg-marca-hover disabled:opacity-50"
        >
          Confirmar y crear
        </button>
        <button
          type="button"
          onClick={onRechazar}
          disabled={deshabilitada}
          className="rounded-md border border-borde-fuerte bg-superficie px-3.5 py-1.5 text-[14px] font-medium text-texto transition-colors hover:bg-superficie-2 disabled:opacity-50"
        >
          No crear
        </button>
      </div>
    </div>
  )
}
