"use client";

import { useCallback, useEffect, useState } from "react";
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
  /** Mensaje si la última recarga falló; el panel puede estar mostrando datos anteriores. */
  error: string | null;
  recargar: () => void;
};

type Datos = Omit<EstadoOrden, "recargar"> & { caso: string | null };

const VACIO: Datos = {
  caso: null,
  payload: null,
  validacion: null,
  trazabilidad: null,
  cargando: false,
  error: null,
};

const ESPERAS_MS = [600, 1500];

/** Lee un archivo y reintenta ante errores de red o del servidor. Un 404 ya llega como null. */
async function conReintentos<T>(leer: () => Promise<T>): Promise<T> {
  for (const espera of ESPERAS_MS) {
    try {
      return await leer();
    } catch (e) {
      const definitivo =
        e instanceof ErrorAgente && e.estado >= 400 && e.estado < 500;
      if (definitivo) throw e;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  return leer();
}

function mensajeDe(r: PromiseSettledResult<unknown>): string | null {
  if (r.status === "fulfilled") return null;
  return r.reason instanceof ErrorAgente
    ? r.reason.message
    : "No se pudo cargar la OC.";
}

/** Carga la OC de un caso desde los archivos que escribe el agente. Recarga cuando cambia `version`. */
export function useOrden(caso: string | null, version: number): EstadoOrden {
  const [estado, setEstado] = useState<Datos>(VACIO);
  const [intento, setIntento] = useState(0);
  const recargar = useCallback(() => setIntento((n) => n + 1), []);

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

    // Cada archivo se carga por separado y con reintentos. Si aun así falla, el panel conserva
    // lo que tenía de ese caso y muestra el error con un botón para reintentar, en vez de quedar
    // desactualizado en silencio. La trazabilidad es opcional (solo alimenta los tooltips).
    Promise.allSettled([
      conReintentos(() => leerPayload(caso)),
      conReintentos(() => leerValidacion(caso)),
      conReintentos(() => leerTrazabilidad(caso)),
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
  }, [caso, version, intento]);

  return { ...estado, recargar };
}
