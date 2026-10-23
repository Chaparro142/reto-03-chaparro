"use client";

import { useEffect, useState } from "react";
import {
  ErrorAgente,
  leerPayload,
  leerTrazabilidad,
  leerValidacion,
} from "../services/api";
import type { OrdenCompra, Trazabilidad, Validacion } from "../types/contrato";

export type EstadoOrden = {
  payload: OrdenCompra | null;
  validacion: Validacion | null;
  trazabilidad: Trazabilidad | null;
  cargando: boolean;
  error: string | null;
};

type Interno = EstadoOrden & { caso: string | null };

const VACIO: Interno = {
  caso: null,
  payload: null,
  validacion: null,
  trazabilidad: null,
  cargando: false,
  error: null,
};

function mensajeDe(r: PromiseSettledResult<unknown>): string | null {
  if (r.status === "fulfilled") return null;
  return r.reason instanceof ErrorAgente
    ? r.reason.message
    : "No se pudo cargar la OC.";
}

/** Carga la OC de un caso desde los archivos que escribe el agente. Recarga cuando cambia `version`. */
export function useOrden(caso: string | null, version: number): EstadoOrden {
  const [estado, setEstado] = useState<Interno>(VACIO);

  useEffect(() => {
    if (!caso) {
      setEstado(VACIO);
      return;
    }
    let vigente = true;
    // Al cambiar de caso se limpia el panel; al recargar el mismo caso se conserva mientras carga.
    setEstado((e) =>
      e.caso === caso
        ? { ...e, cargando: true, error: null }
        : { ...VACIO, caso, cargando: true },
    );

    // Cada archivo se carga por separado: si uno falla por un corte de red, el panel conserva
    // lo que ya tenía de ese mismo caso. La trazabilidad es opcional (solo alimenta los tooltips).
    Promise.allSettled([
      leerPayload(caso),
      leerValidacion(caso),
      leerTrazabilidad(caso),
    ]).then(([payload, validacion, trazabilidad]) => {
      if (!vigente) return;
      setEstado((s) => {
        const previo = s.caso === caso ? s : VACIO;
        return {
          caso,
          payload:
            payload.status === "fulfilled" ? payload.value : previo.payload,
          validacion:
            validacion.status === "fulfilled"
              ? validacion.value
              : previo.validacion,
          trazabilidad:
            trazabilidad.status === "fulfilled"
              ? trazabilidad.value
              : previo.trazabilidad,
          cargando: false,
          error: mensajeDe(payload) ?? mensajeDe(validacion),
        };
      });
    });
    return () => {
      vigente = false;
    };
  }, [caso, version]);

  return estado;
}
