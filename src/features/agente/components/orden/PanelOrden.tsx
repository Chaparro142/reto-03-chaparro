"use client";

import { useEffect, useRef, useState } from "react";
import { urlEvidencia } from "../../services/api";
import type {
  OrdenCompra,
  Trazabilidad,
  Validacion,
} from "../../types/contrato";
import { dinero, fechaCorta } from "../../utils/formato";
import { MensajeDerivado, MensajeHallazgo, type EstadoConfirmacion } from "./Mensajes";
import { TablaPosiciones } from "./TablaPosiciones";

type Estado = { texto: string; clase: string };

function estadoDe(
  payload: OrdenCompra | null,
  validacion: Validacion | null,
): Estado {
  if (payload?.numero_oc || payload?.estado === "creada") {
    return {
      texto: "Creada",
      clase: "border-exito-borde bg-exito-suave text-exito",
    };
  }
  if (validacion && !validacion.apta) {
    return {
      texto: "Bloqueada",
      clase: "border-error-borde bg-error-suave text-error",
    };
  }
  if (validacion && validacion.confirmaciones.length > 0) {
    return {
      texto: "Requiere confirmación",
      clase: "border-aviso-borde bg-aviso-suave text-aviso",
    };
  }
  return {
    texto: "Borrador",
    clase: "border-borde-fuerte bg-superficie-2 text-texto-2",
  };
}

function Faceta({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-texto-2">{titulo}</dt>
      <dd className="mt-0.5 truncate text-[14.5px] font-medium text-texto">
        {children}
      </dd>
    </div>
  );
}

function Seccion({
  titulo,
  children,
  extra,
}: {
  titulo: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b border-borde pb-1.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-texto-2">
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Vacio({
  casos,
  activo,
  onCaso,
}: {
  casos: string[];
  activo: string | null;
  onCaso: (c: string) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center px-[clamp(1.25rem,4vw,3rem)] py-10">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-texto-3">
        Orden de compra
      </p>
      <h2 className="mt-1 text-[clamp(1.4rem,2.4vw,1.9rem)] font-semibold leading-tight text-texto">
        Aquí aparece la OC como quedaría en SAP
      </h2>
      <p className="mt-2 max-w-[56ch] text-[14.5px] text-texto-2">
        Cuando el agente procese una solicitud verás la cabecera, las posiciones
        y cada validación: los bloqueos en rojo, lo que pide confirmación en
        ámbar y lo que el agente completó desde los maestros en azul.
      </p>
      {activo && (
        <p className="mt-4 text-[13.5px] text-texto-3">
          El agente todavía no ha generado archivos para {activo}.
        </p>
      )}
      {casos.length > 0 && !activo && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {casos.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCaso(c)}
              className="rounded-md border border-borde bg-superficie px-2.5 py-1 font-mono text-[12.5px] text-texto-2 hover:border-marca hover:text-marca"
            >
              Ver {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  caso: string | null;
  casos: string[];
  onCaso: (c: string) => void;
  payload: OrdenCompra | null;
  validacion: Validacion | null;
  trazabilidad: Trazabilidad | null;
  cargando: boolean;
  error: string | null;
  /** El agente espera confirmación para este caso. */
  confirmacionPendiente: boolean;
  ocupado: boolean;
  onConfirmar: () => void;
  onRechazar: () => void;
  onRecargar: () => void;
};

/** Barra de acciones al pie, como en el object page de Fiori. */
function PieAcciones({
  bloqueada,
  pendiente,
  ocupado,
  onConfirmar,
  onRechazar,
}: {
  bloqueada: boolean;
  pendiente: boolean;
  ocupado: boolean;
  onConfirmar: () => void;
  onRechazar: () => void;
}) {
  const motivo = bloqueada
    ? "No se puede crear: la solicitud tiene bloqueos."
    : pendiente
      ? "El agente espera tu confirmación para crear la OC."
      : "Pídele al agente que cree la OC desde el chat.";
  return (
    <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-borde bg-superficie px-[clamp(1.25rem,3vw,2.5rem)] py-3">
      <p
        className={`mr-auto text-[13px] ${bloqueada ? "text-error" : pendiente ? "text-aviso" : "text-texto-2"}`}
      >
        {motivo}
      </p>
      {pendiente && !bloqueada && (
        <button
          type="button"
          onClick={onRechazar}
          disabled={ocupado}
          className="rounded-md border border-borde-fuerte bg-superficie px-3.5 py-1.5 text-[14px] font-medium text-texto transition-colors hover:bg-superficie-2 disabled:opacity-50"
        >
          No crear
        </button>
      )}
      <button
        type="button"
        onClick={onConfirmar}
        disabled={bloqueada || !pendiente || ocupado}
        className="rounded-md bg-marca px-3.5 py-1.5 text-[14px] font-medium text-sobre-marca transition-colors hover:bg-marca-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pendiente && !bloqueada ? "Confirmar y crear" : "Crear OC"}
      </button>
    </footer>
  );
}

export function PanelOrden({
  caso,
  casos,
  onCaso,
  payload,
  validacion,
  trazabilidad,
  cargando,
  error,
  confirmacionPendiente,
  ocupado,
  onConfirmar,
  onRechazar,
  onRecargar,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const numeroPrevio = useRef<string | null | undefined>(undefined);

  // Toast de éxito cuando la OC pasa de borrador a creada (patrón de mensaje de éxito de Fiori).
  useEffect(() => {
    const numero = payload?.numero_oc ?? null;
    if (numeroPrevio.current === null && numero) {
      setToast(`Orden de compra ${numero} creada`);
      const t = setTimeout(() => setToast(null), 5000);
      numeroPrevio.current = numero;
      return () => clearTimeout(t);
    }
    numeroPrevio.current = numero;
  }, [payload?.numero_oc]);

  useEffect(() => {
    numeroPrevio.current = undefined;
  }, [caso]);

  if (!payload && !validacion) {
    return (
      <div className="relative h-full overflow-y-auto">
        {error ? (
          <p
            role="alert"
            className="m-6 rounded-md border border-error-borde bg-error-suave px-3.5 py-2.5 text-[14px]"
          >
            {error}
          </p>
        ) : (
          <Vacio
            casos={casos}
            activo={cargando ? null : caso}
            onCaso={onCaso}
          />
        )}
      </div>
    );
  }

  const moneda = payload?.moneda ?? "COP";
  const estado = estadoDe(payload, validacion);
  const total =
    payload?.posiciones.reduce(
      (s, p) => s + p.cantidad * p.precio_unitario,
      0,
    ) ?? null;
  const bloqueos = validacion?.bloqueos ?? [];
  const confirmaciones = validacion?.confirmaciones ?? [];
  const derivados = Object.entries(validacion?.derivados ?? {});
  const creada = Boolean(payload?.numero_oc || payload?.estado === "creada");
  // La confirmación se lee del registro de excepciones de la OC, no se deduce de que exista.
  const estadoConfirmacion = (codigo: string): EstadoConfirmacion => {
    if (!creada) return "pendiente";
    const excepcion = payload?.excepciones.find((x) => x.codigo === codigo);
    return excepcion?.confirmado_por ? "confirmada" : "sin_registro";
  };
  const titulo = payload?.numero_oc
    ? `OC ${payload.numero_oc}`
    : "Nueva orden de compra";
  const centro = payload?.posiciones[0];

  return (
    <div className="relative h-full overflow-y-auto">
      <header className="border-b border-borde bg-superficie px-[clamp(1.25rem,3vw,2.5rem)] pb-5 pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-texto-2">
          <span>Pedido estándar NB</span>
          <span aria-hidden>·</span>
          <span className="font-mono">
            {payload?.referencia.solicitud_id ?? validacion?.caso}
          </span>
          {casos.length > 1 && (
            <label className="ml-auto flex items-center gap-1.5">
              <span>Caso</span>
              <select
                value={caso ?? ""}
                onChange={(e) => onCaso(e.target.value)}
                className="rounded border border-borde-fuerte bg-fondo px-1.5 py-0.5 font-mono text-[12.5px] text-texto"
              >
                {casos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h2 className="text-[clamp(1.35rem,2.2vw,1.75rem)] font-semibold leading-tight text-texto">
            {titulo}
          </h2>
          <span
            className={`rounded border px-2 py-0.5 text-[12.5px] font-medium ${estado.clase}`}
          >
            {estado.texto}
          </span>
          {validacion?.retroactiva && (
            <span
              className="rounded border border-aviso-borde bg-aviso-suave px-2 py-0.5 text-[12.5px] font-medium text-aviso"
              title="La factura es anterior a la solicitud. Queda marcada en el control para medirla."
            >
              Retroactiva
            </span>
          )}
          {cargando && (
            <span className="text-[12.5px] text-texto-3">Actualizando…</span>
          )}
        </div>

        {payload && (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
            <Faceta titulo="Proveedor">
              <span title={`NIT ${payload.proveedor.nit}`}>
                {payload.proveedor.nombre}
              </span>
              <span className="block font-mono text-[12.5px] font-normal text-texto-2">
                {payload.proveedor.codigo_sap}
              </span>
            </Faceta>
            <Faceta titulo="Valor total">
              <span className="tabular-nums">
                {total !== null ? dinero(total, moneda) : "—"}
              </span>
              <span className="block text-[12.5px] font-normal text-texto-2">
                {moneda}
              </span>
            </Faceta>
            <Faceta titulo="Centro de costo">
              {centro?.centro_costo ?? "—"}
              <span className="block text-[12.5px] font-normal text-texto-2">
                {centro?.subarea}
              </span>
            </Faceta>
            <Faceta titulo="Aprobador">
              <span title={payload.aprobador.email}>
                {payload.aprobador.email.split("@")[0]}
              </span>
              <span className="block text-[12.5px] font-normal text-texto-2">
                {fechaCorta(payload.aprobador.fecha_aprobacion)}
              </span>
            </Faceta>
            <Faceta titulo="Condición de pago">
              <span className="font-mono">{payload.condiciones_pago}</span>
              <span className="block text-[12.5px] font-normal text-texto-2">
                Soc. {payload.sociedad} · Org. {payload.organizacion_compras}
              </span>
            </Faceta>
          </dl>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-error-borde bg-error-suave px-[clamp(1.25rem,3vw,2.5rem)] py-2.5 text-[13.5px]"
        >
          <span className="font-semibold text-error">No se pudo actualizar la OC.</span>
          <span className="min-w-0 flex-1 text-texto-2">
            Lo que ves puede estar desactualizado. {error}
          </span>
          <button
            type="button"
            onClick={onRecargar}
            disabled={cargando}
            className="rounded-md border border-error-borde bg-superficie px-2.5 py-1 text-[13px] font-medium text-texto hover:bg-superficie-2 disabled:opacity-50"
          >
            {cargando ? "Reintentando…" : "Reintentar"}
          </button>
        </div>
      )}

      <div className="px-[clamp(1.25rem,3vw,2.5rem)] pb-10">
        {(bloqueos.length > 0 ||
          confirmaciones.length > 0 ||
          derivados.length > 0) && (
          <Seccion
            titulo="Validaciones"
            extra={
              <span className="text-[12.5px] text-texto-3">
                {bloqueos.length} bloqueos · {confirmaciones.length}{" "}
                confirmaciones · {derivados.length} derivados
              </span>
            }
          >
            <div className="space-y-2">
              {bloqueos.map((h, i) => (
                <MensajeHallazgo
                  key={`b-${h.codigo}-${i}`}
                  hallazgo={h}
                  moneda={moneda}
                />
              ))}
              {confirmaciones.map((h, i) => (
                <MensajeHallazgo
                  key={`c-${h.codigo}-${i}`}
                  hallazgo={h}
                  moneda={moneda}
                  confirmacion={estadoConfirmacion(h.codigo)}
                />
              ))}
              {derivados.map(([campo, d]) => (
                <MensajeDerivado key={campo} campo={campo} derivado={d} />
              ))}
            </div>
          </Seccion>
        )}

        {validacion &&
          validacion.apta &&
          bloqueos.length === 0 &&
          confirmaciones.length === 0 && (
            <p className="mt-6 rounded-md border border-exito-borde bg-exito-suave px-3.5 py-2.5 text-[14px] text-texto">
              <span className="font-semibold text-exito">
                Pasó todas las reglas RC1–RC10.
              </span>{" "}
              La OC puede crearse sin confirmación.
            </p>
          )}

        {payload ? (
          <Seccion
            titulo="Posiciones"
            extra={
              <span className="text-[12.5px] text-texto-3">
                Pasa el cursor para ver el origen de cada valor
              </span>
            }
          >
            <TablaPosiciones
              posiciones={payload.posiciones}
              moneda={moneda}
              trazabilidad={trazabilidad}
            />
          </Seccion>
        ) : (
          <p className="mt-6 text-[14px] text-texto-2">
            El agente no construyó el payload porque la solicitud tiene
            bloqueos. Resuélvelos con el solicitante y vuelve a procesarla.
          </p>
        )}

        {payload && payload.excepciones.length > 0 && (
          <Seccion titulo="Excepciones registradas en la OC">
            <ul className="divide-y divide-borde rounded-md border border-borde bg-superficie text-[13.5px]">
              {payload.excepciones.map((x, i) => (
                <li
                  key={`${x.codigo}-${i}`}
                  className="flex flex-wrap gap-x-3 px-3 py-2"
                >
                  <span className="font-mono font-medium">{x.codigo}</span>
                  <span className="min-w-0 flex-1 text-texto-2">
                    {x.detalle}
                  </span>
                  <span
                    className={x.confirmado_por ? "text-exito" : "text-aviso"}
                  >
                    {x.confirmado_por
                      ? `Confirmado por ${x.confirmado_por}`
                      : "Sin confirmar"}
                  </span>
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        {payload && caso && (
          <Seccion titulo="Evidencia de aprobación">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
              <a
                href={urlEvidencia(caso, "pdf")}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-marca underline-offset-2 hover:underline"
              >
                Ver PDF
              </a>
              <a
                href={urlEvidencia(caso, "txt")}
                target="_blank"
                rel="noreferrer"
                className="text-marca underline-offset-2 hover:underline"
              >
                Ver texto
              </a>
              {payload.aprobador.evidencia_sha256 && (
                <span
                  className="min-w-0 truncate font-mono text-[12px] text-texto-3"
                  title={payload.aprobador.evidencia_sha256}
                >
                  sha256 {payload.aprobador.evidencia_sha256.slice(0, 16)}…
                </span>
              )}
            </div>
          </Seccion>
        )}
      </div>

      {!creada && (
        <PieAcciones
          bloqueada={bloqueos.length > 0 || validacion?.apta === false}
          pendiente={confirmacionPendiente}
          ocupado={ocupado}
          onConfirmar={onConfirmar}
          onRechazar={onRechazar}
        />
      )}

      {toast && (
        <div
          role="status"
          className="animar-entrada fixed bottom-24 left-4 z-20 rounded-md lg:left-8 bg-texto px-4 py-2.5 text-[14px] font-medium text-fondo shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
