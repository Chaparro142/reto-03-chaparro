'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

const MAX = 4000

export function Compositor({ deshabilitado, onEnviar }: { deshabilitado: boolean; onEnviar: (t: string) => void }) {
  const [texto, setTexto] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  function enviar(e?: FormEvent) {
    e?.preventDefault()
    if (!texto.trim() || deshabilitado) return
    onEnviar(texto)
    setTexto('')
    ref.current?.focus()
  }

  function tecla(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <form onSubmit={enviar} className="border-t border-borde bg-superficie px-4 py-3">
      <label htmlFor="mensaje" className="sr-only">
        Mensaje para el agente
      </label>
      <div className="flex items-end gap-2 rounded-lg border border-borde-fuerte bg-fondo px-3 py-2 focus-within:border-marca">
        <textarea
          id="mensaje"
          ref={ref}
          rows={2}
          maxLength={MAX}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={tecla}
          placeholder="Ej.: Procesa la solicitud sol-001"
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent text-[14.5px] text-texto outline-none placeholder:text-texto-3"
        />
        <button
          type="submit"
          disabled={deshabilitado || !texto.trim()}
          className="rounded-md bg-marca px-3 py-1.5 text-[14px] font-medium text-sobre-marca transition-colors hover:bg-marca-hover disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
      <p className="mt-1.5 flex justify-between text-[11.5px] text-texto-3">
        <span>Enter envía · Shift+Enter nueva línea</span>
        {texto.length > MAX * 0.8 && (
          <span>
            {texto.length}/{MAX}
          </span>
        )}
      </p>
    </form>
  )
}
