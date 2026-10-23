'use client'

import { useEffect, useState } from 'react'
import { ErrorAgente, leerPayload, leerTrazabilidad, leerValidacion } from '../services/api'
import type { OrdenCompra, Trazabilidad, Validacion } from '../types/contrato'

export type EstadoOrden = {
  payload: OrdenCompra | null
  validacion: Validacion | null
  trazabilidad: Trazabilidad | null
  cargando: boolean
  error: string | null
}

const VACIO: EstadoOrden = { payload: null, validacion: null, trazabilidad: null, cargando: false, error: null }

/** Carga la OC de un caso desde los archivos que escribe el agente. Recarga cuando cambia `version`. */
export function useOrden(caso: string | null, version: number): EstadoOrden {
  const [estado, setEstado] = useState<EstadoOrden>(VACIO)

  useEffect(() => {
    if (!caso) {
      setEstado(VACIO)
      return
    }
    let vigente = true
    setEstado((e) => ({ ...e, cargando: true, error: null }))
    Promise.all([leerPayload(caso), leerValidacion(caso), leerTrazabilidad(caso)])
      .then(([payload, validacion, trazabilidad]) => {
        if (vigente) setEstado({ payload, validacion, trazabilidad, cargando: false, error: null })
      })
      .catch((e: unknown) => {
        if (!vigente) return
        const mensaje = e instanceof ErrorAgente ? e.message : 'No se pudo cargar la OC.'
        setEstado((s) => ({ ...s, cargando: false, error: mensaje }))
      })
    return () => {
      vigente = false
    }
  }, [caso, version])

  return estado
}
