"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cargarSesion, enviarMensaje, ErrorAgente } from "../services/api";
import type { ChatRespuesta, Turno, TurnoAgente } from "../types/contrato";

const CLAVE_SESION = "reto03.sessionId";

function nuevoId(): string {
  return crypto.randomUUID();
}

function leerIdGuardado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_SESION);
  } catch {
    return null;
  }
}

function guardarId(id: string): void {
  try {
    window.localStorage.setItem(CLAVE_SESION, id);
  } catch {
    // almacenamiento bloqueado: la sesión vive solo en esta pestaña
  }
}

function ahora(): string {
  return new Date().toISOString();
}

function turnoDeRespuesta(r: ChatRespuesta): TurnoAgente {
  return {
    rol: "agente",
    texto: r.reply,
    toolCalls: r.toolCalls,
    needsConfirmation: r.needsConfirmation,
    error: r.error,
    ts: ahora(),
  };
}

function turnoDeError(mensaje: string): TurnoAgente {
  return {
    rol: "agente",
    texto: "",
    toolCalls: [],
    needsConfirmation: false,
    error: mensaje,
    ts: ahora(),
  };
}

/** Al recargar, recupera los casos que tocó el agente leyendo el argumento `caso` de sus herramientas. */
function casosDelHistorial(turnos: Turno[], pendientes: string[]): string[] {
  const vistos: string[] = [];
  for (const t of turnos) {
    if (t.rol !== "agente") continue;
    for (const llamada of t.toolCalls) {
      const caso = llamada.args.caso;
      if (typeof caso === "string" && !vistos.includes(caso)) vistos.push(caso);
    }
  }
  for (const p of pendientes) if (!vistos.includes(p)) vistos.push(p);
  return vistos;
}

export type EstadoChat = {
  sessionId: string | null;
  turnos: Turno[];
  pensando: boolean;
  cargando: boolean;
  pendientes: string[];
  /** Casos tocados en el último turno; el panel de la OC los recarga. */
  casos: string[];
  /** Cambia en cada respuesta para que el panel sepa cuándo recargar. */
  version: number;
  tokens: number;
};

export function useChat() {
  const [estado, setEstado] = useState<EstadoChat>({
    sessionId: null,
    turnos: [],
    pensando: false,
    cargando: true,
    pendientes: [],
    casos: [],
    version: 0,
    tokens: 0,
  });
  const enVuelo = useRef(false);

  useEffect(() => {
    const id = leerIdGuardado() ?? nuevoId();
    guardarId(id);
    setEstado((e) => ({ ...e, sessionId: id }));
    cargarSesion(id)
      .then((s) =>
        setEstado((e) => ({
          ...e,
          turnos: s.turnos,
          pendientes: s.pendientes,
          tokens: s.tokens,
          casos: casosDelHistorial(s.turnos, s.pendientes),
          version: e.version + 1,
          cargando: false,
        })),
      )
      .catch(() => setEstado((e) => ({ ...e, cargando: false })));
  }, []);

  const enviar = useCallback(
    async (texto: string, confirm = false) => {
      const id = estado.sessionId;
      const limpio = texto.trim();
      if (!id || enVuelo.current || (!limpio && !confirm)) return;
      enVuelo.current = true;
      const mostrado = limpio || "Confirmo";
      setEstado((e) => ({
        ...e,
        pensando: true,
        turnos: [...e.turnos, { rol: "usuario", texto: mostrado, ts: ahora() }],
      }));
      try {
        const r = await enviarMensaje(id, limpio || "confirmo", confirm);
        setEstado((e) => ({
          ...e,
          pensando: false,
          turnos: [...e.turnos, turnoDeRespuesta(r)],
          pendientes: r.pendientes,
          casos: r.casos.length > 0 ? r.casos : e.casos,
          version: e.version + 1,
          tokens: r.tokens.sesion,
        }));
      } catch (err) {
        const mensaje =
          err instanceof ErrorAgente
            ? err.message
            : "Ocurrió un error inesperado.";
        setEstado((e) => ({
          ...e,
          pensando: false,
          turnos: [...e.turnos, turnoDeError(mensaje)],
        }));
      } finally {
        enVuelo.current = false;
      }
    },
    [estado.sessionId],
  );

  const confirmar = useCallback(() => enviar("", true), [enviar]);
  const rechazar = useCallback(
    () => enviar("No confirmo, no la crees."),
    [enviar],
  );

  const nuevaSesion = useCallback(() => {
    const id = nuevoId();
    guardarId(id);
    setEstado({
      sessionId: id,
      turnos: [],
      pensando: false,
      cargando: false,
      pendientes: [],
      casos: [],
      version: 0,
      tokens: 0,
    });
  }, []);

  return { ...estado, enviar, confirmar, rechazar, nuevaSesion };
}
