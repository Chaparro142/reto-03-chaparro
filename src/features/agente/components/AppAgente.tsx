'use client'

import { useEffect, useState } from 'react'
import { useChat } from '../hooks/useChat'
import { useOrden } from '../hooks/useOrden'
import { listarCasos, salud } from '../services/api'
import type { Salud } from '../types/contrato'
import { PanelChat } from './chat/PanelChat'
import { PanelOrden } from './orden/PanelOrden'

type Vista = 'chat' | 'orden'

function Estado({ info, fallo }: { info: Salud | null; fallo: boolean }) {
  if (fallo) {
    return (
      <span className="flex items-center gap-1.5 text-[12.5px] text-error">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-error" />
        Agente sin conexión
      </span>
    )
  }
  if (!info) return <span className="text-[12.5px] text-texto-3">Conectando…</span>
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] text-texto-2" title={`Proveedor: ${info.provider}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${info.llm_configurado ? 'bg-exito' : 'bg-aviso'}`} />
      <span className="hidden sm:inline">Modelo</span>
      <span className="hidden max-w-[22ch] truncate font-mono sm:inline">{info.model}</span>
    </span>
  )
}

export function AppAgente() {
  const chat = useChat()
  const [casos, setCasos] = useState<string[]>([])
  const [info, setInfo] = useState<Salud | null>(null)
  const [fallo, setFallo] = useState(false)
  const [casoElegido, setCasoElegido] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('chat')

  useEffect(() => {
    listarCasos().then(setCasos).catch(() => setCasos([]))
    salud()
      .then(setInfo)
      .catch(() => setFallo(true))
  }, [])

  // El caso activo sigue al último que tocó el agente, salvo que la usuaria elija otro.
  const ultimoCaso = chat.casos.at(-1) ?? null
  useEffect(() => {
    if (ultimoCaso) setCasoElegido(ultimoCaso)
  }, [ultimoCaso, chat.version])

  const orden = useOrden(casoElegido, chat.version)
  const casosPanel = chat.casos.length > 1 ? chat.casos : casoElegido ? [casoElegido] : []
  const hayOrden = Boolean(orden.payload || orden.validacion)
  const ultimoTurno = chat.turnos.at(-1)
  const confirmacionPendiente =
    !chat.pensando &&
    ultimoTurno?.rol === 'agente' &&
    ultimoTurno.needsConfirmation &&
    (casoElegido === null || chat.pendientes.length === 0 || chat.pendientes.includes(casoElegido))

  function nuevaSesion() {
    chat.nuevaSesion()
    setCasoElegido(null)
    setVista('chat')
  }

  return (
    <div className="grid h-[100dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr] overflow-hidden lg:grid-rows-[auto_1fr]">
      <header className="flex items-center gap-4 border-b border-borde bg-superficie px-4 py-2.5 lg:px-6">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-texto">Órdenes de compra</p>
          <p className="truncate text-[12px] text-texto-2">Asistente de creación en SAP · ambiente simulado</p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <Estado info={info} fallo={fallo} />
          <button
            type="button"
            onClick={nuevaSesion}
            disabled={chat.pensando}
            className="whitespace-nowrap rounded-md border border-borde-fuerte px-2.5 py-1 text-[13px] font-medium text-texto transition-colors hover:bg-superficie-2 disabled:opacity-50"
          >
            Nueva sesión
          </button>
        </div>
      </header>

      <nav aria-label="Vistas" className="grid grid-cols-2 border-b border-borde bg-superficie lg:hidden">
        {(['chat', 'orden'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            aria-pressed={vista === v}
            className={`border-b-2 py-2 text-[14px] font-medium ${
              vista === v ? 'border-marca text-marca' : 'border-transparent text-texto-2'
            }`}
          >
            {v === 'chat' ? 'Chat' : 'Orden de compra'}
            {v === 'orden' && hayOrden && <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-marca align-middle" />}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,34%)]">
        <div className={`min-h-0 ${vista === 'orden' ? 'block' : 'hidden'} lg:block`}>
          <PanelOrden
            caso={casoElegido}
            casos={casosPanel.length > 0 ? casosPanel : casos}
            onCaso={setCasoElegido}
            payload={orden.payload}
            validacion={orden.validacion}
            trazabilidad={orden.trazabilidad}
            cargando={orden.cargando}
            error={orden.error}
            confirmacionPendiente={confirmacionPendiente}
            ocupado={chat.pensando}
            onConfirmar={chat.confirmar}
            onRechazar={chat.rechazar}
          />
        </div>
        <div className={`min-h-0 border-borde lg:border-l ${vista === 'chat' ? 'block' : 'hidden'} lg:block`}>
          <PanelChat
            turnos={chat.turnos}
            pensando={chat.pensando}
            cargando={chat.cargando}
            pendientes={chat.pendientes}
            casosDisponibles={casos}
            onEnviar={(t) => chat.enviar(t)}
            onConfirmar={chat.confirmar}
            onRechazar={chat.rechazar}
          />
        </div>
      </main>
    </div>
  )
}
