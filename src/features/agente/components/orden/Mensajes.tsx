import type { Derivado, Hallazgo } from "../../types/contrato";
import { etiqueta, valorLegible } from "../../utils/formato";

type Nivel = "error" | "aviso" | "info";

const ESTILO: Record<Nivel, { caja: string; marca: string; titulo: string }> = {
  error: {
    caja: "border-error-borde bg-error-suave",
    marca: "bg-error",
    titulo: "text-error",
  },
  aviso: {
    caja: "border-aviso-borde bg-aviso-suave",
    marca: "bg-aviso",
    titulo: "text-aviso",
  },
  info: {
    caja: "border-info-borde bg-info-suave",
    marca: "bg-info",
    titulo: "text-info",
  },
};

function Tira({
  nivel,
  titulo,
  children,
}: {
  nivel: Nivel;
  titulo: string;
  children: React.ReactNode;
}) {
  const e = ESTILO[nivel];
  return (
    <div
      role={nivel === "error" ? "alert" : undefined}
      className={`flex gap-3 rounded-md border px-3.5 py-2.5 ${e.caja}`}
    >
      <span
        aria-hidden
        className={`mt-[7px] h-2 w-2 shrink-0 rotate-45 ${e.marca}`}
      />
      <div className="min-w-0 flex-1 text-[14px]">
        <p className={`font-semibold ${e.titulo}`}>{titulo}</p>
        <div className="mt-0.5 text-texto">{children}</div>
      </div>
    </div>
  );
}

function Valores({
  valores,
  moneda,
}: {
  valores: NonNullable<Hallazgo["valores"]>;
  moneda: string;
}) {
  const entradas = Object.entries(valores);
  if (entradas.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[13px]">
      {entradas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-texto-2">{etiqueta(k)}</dt>
          <dd className="font-medium tabular-nums">
            {valorLegible(k, v, moneda)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type PropsHallazgo = {
  hallazgo: Hallazgo;
  moneda: string;
  confirmada?: boolean;
};

export function MensajeHallazgo({
  hallazgo,
  moneda,
  confirmada = false,
}: PropsHallazgo) {
  const bloqueo = hallazgo.tipo === "bloqueo";
  const nivel: Nivel = bloqueo ? "error" : confirmada ? "info" : "aviso";
  const estado = bloqueo
    ? "Bloqueo"
    : confirmada
      ? "Confirmada por la analista"
      : "Requiere confirmación";
  return (
    <Tira nivel={nivel} titulo={`${hallazgo.codigo} · ${estado}`}>
      <p>{hallazgo.detalle}</p>
      {hallazgo.valores && (
        <Valores valores={hallazgo.valores} moneda={moneda} />
      )}
      {hallazgo.accion_sugerida && (
        <p className="mt-1.5 text-[13px] text-texto-2">
          <span className="font-medium text-texto">Acción sugerida:</span>{" "}
          {hallazgo.accion_sugerida}
        </p>
      )}
    </Tira>
  );
}

export function MensajeDerivado({
  campo,
  derivado,
}: {
  campo: string;
  derivado: Derivado;
}) {
  return (
    <Tira
      nivel="info"
      titulo={`${etiqueta(campo)} · completado por el agente (fuente: ${derivado.fuente})`}
    >
      <p>
        Valor:{" "}
        <span className="font-mono text-[13px] font-medium">
          {String(derivado.valor)}
        </span>
        {derivado.detalle ? ` · ${derivado.detalle}` : ""}
      </p>
    </Tira>
  );
}
