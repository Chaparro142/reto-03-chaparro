const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const dolares = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export function dinero(valor: number, moneda: string = "COP"): string {
  return moneda === "USD" ? dolares.format(valor) : pesos.format(valor);
}

export function cifra(valor: number): string {
  return numero.format(valor);
}

export function fechaCorta(iso: string): string {
  // "2026-08-26" sin hora: JavaScript lo toma como medianoche UTC y en Colombia (UTC-5)
  // mostraría el día anterior. Se arma la fecha local con año, mes y día tal cual.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = soloFecha
    ? new Date(
        Number(soloFecha[1]),
        Number(soloFecha[2]) - 1,
        Number(soloFecha[3]),
      )
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function hora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

/** "oc_validar" → "Validar"; "oc_construir_payload" → "Construir payload" */
export function nombreHerramienta(nombre: string): string {
  const sin = nombre.replace(/^oc_/, "").replace(/_/g, " ");
  return sin.charAt(0).toUpperCase() + sin.slice(1);
}

/** Etiquetas legibles para campos derivados y valores en conflicto. */
const ETIQUETAS: Record<string, string> = {
  condiciones_pago: "Condición de pago",
  indicador_iva: "Indicador de IVA",
  solicitud: "Solicitud",
  cotizacion: "Cotización",
  tope_maximo_centro: "Tope máximo del centro",
  tope_aprobador: "Tope del aprobador",
  valor_total: "Valor total",
  valor_calculado: "Valor calculado",
  fecha_aprobacion: "Fecha de aprobación",
  fecha_factura: "Fecha de la factura",
  fecha_solicitud: "Fecha de la solicitud",
  indicador_propuesto: "Indicador propuesto",
  diferencia: "Diferencia en valor",
  diferencia_pct: "Diferencia en %",
  unidad: "Unidad",
};

export function etiqueta(clave: string): string {
  return (
    ETIQUETAS[clave] ??
    clave.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function valorLegible(
  clave: string,
  valor: string | number | boolean | null,
  moneda = "COP",
): string {
  if (valor === null) return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") {
    if (clave.endsWith("_pct")) return `${cifra(valor)} %`;
    if (Math.abs(valor) >= 1000) return dinero(valor, moneda);
    return cifra(valor);
  }
  return valor;
}
