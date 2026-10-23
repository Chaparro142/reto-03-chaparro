import type { CentroCosto, Derivado, Hallazgo, Maestros, Paquete, Proveedor, Validacion } from "./tipos.ts"
import { formatoMoneda, normalizarNit, normalizarNombre, soloFecha } from "./texto.ts"

export const TOLERANCIA_COTIZACION = 0.02
export const TOLERANCIA_TOTAL = 1
const MONEDAS = ["COP", "USD"]

type Contexto = { paquete: Paquete; maestros: Maestros; proveedor: Proveedor | null; centro: CentroCosto | null }
type Acumulado = { bloqueos: Hallazgo[]; confirmaciones: Hallazgo[]; derivados: Record<string, Derivado> }

/** Aplica RC1–RC10 (PRD 7.3). Función pura: mismo paquete y maestros → mismo resultado. */
export function validar(caso: string, paquete: Paquete, maestros: Maestros): Validacion {
  const proveedor = buscarProveedor(paquete, maestros.proveedores)
  const centro = maestros.centros.find((c) => c.centro_costo === paquete.solicitud.centro_costo) ?? null
  const ctx: Contexto = { paquete, maestros, proveedor, centro }
  const acc: Acumulado = { bloqueos: [], confirmaciones: [], derivados: {} }

  rc1Proveedor(ctx, acc)
  rc4CentroYSubarea(ctx, acc)
  rc2Aprobacion(ctx, acc)
  rc3Tope(ctx, acc)
  rc10Total(ctx, acc)
  monedaSoportada(ctx, acc)
  rc5Cotizacion(ctx, acc)
  rc6Iva(ctx, acc)
  rc7CondicionesPago(ctx, acc)
  const retroactiva = rc8Retroactiva(ctx, acc)
  rc9FechaAprobacion(ctx, acc)

  return { caso, apta: acc.bloqueos.length === 0, ...acc, retroactiva }
}

export function buscarProveedor(paquete: Paquete, proveedores: Proveedor[]): Proveedor | null {
  const nit = paquete.solicitud.proveedor_nit
  if (nit) return proveedores.find((p) => normalizarNit(p.nit) === normalizarNit(nit)) ?? null
  const nombre = normalizarNombre(paquete.solicitud.proveedor_nombre)
  return proveedores.find((p) => normalizarNombre(p.nombre) === nombre) ?? null
}

function bloqueo(acc: Acumulado, h: Omit<Hallazgo, "tipo">): void {
  acc.bloqueos.push({ ...h, tipo: "bloqueo" })
}
function confirmacion(acc: Acumulado, h: Omit<Hallazgo, "tipo">): void {
  acc.confirmaciones.push({ ...h, tipo: "confirmacion" })
}

function rc1Proveedor({ paquete, proveedor }: Contexto, acc: Acumulado): void {
  const s = paquete.solicitud
  const criterio = s.proveedor_nit ? `NIT ${s.proveedor_nit}` : `nombre "${s.proveedor_nombre}"`
  if (!proveedor) {
    bloqueo(acc, {
      codigo: "RC1",
      detalle: `El proveedor ${s.proveedor_nombre} (${criterio}) no existe en el maestro de proveedores.`,
      accion_sugerida: "Solicitar a Datos Maestros la creación del proveedor en SAP (RUT, certificación bancaria) o verificar el NIT con el solicitante.",
    })
  } else if (!proveedor.activo) {
    bloqueo(acc, {
      codigo: "RC1",
      detalle: `El proveedor ${proveedor.nombre} (código SAP ${proveedor.codigo_sap}) existe pero está inactivo.`,
      accion_sugerida: "Pedir a Datos Maestros que revise y reactive el proveedor, o cotizar con un proveedor activo.",
    })
  }
}

function rc4CentroYSubarea({ paquete, maestros, centro }: Contexto, acc: Acumulado): void {
  const s = paquete.solicitud
  if (!centro) {
    bloqueo(acc, {
      codigo: "RC4",
      detalle: `El centro de costo ${s.centro_costo} no existe en el maestro.`,
      accion_sugerida: `Pedir al solicitante un centro de costo válido (${maestros.centros.map((c) => c.centro_costo).join(", ")}).`,
    })
  } else if (!centro.subareas.includes(s.subarea)) {
    bloqueo(acc, {
      codigo: "RC4",
      detalle: `La subárea "${s.subarea}" no pertenece al centro ${centro.centro_costo} (${centro.nombre}).`,
      accion_sugerida: `Pedir al solicitante una subárea válida: ${centro.subareas.join(", ")}.`,
    })
  }
}

function rc2Aprobacion({ paquete, maestros, centro }: Contexto, acc: Acumulado): void {
  const a = paquete.aprobacion
  if (!a) {
    bloqueo(acc, { codigo: "RC2", detalle: "El paquete no trae correo de aprobación.", accion_sugerida: "Pedir al solicitante que reenvíe la aprobación de su líder." })
    return
  }
  if (!a.aprobado) {
    bloqueo(acc, { codigo: "RC2", detalle: `El correo de ${a.de} no contiene una aprobación explícita ("Aprobado").`, accion_sugerida: "Pedir al líder una respuesta explícita con la palabra \"Aprobado\"." })
  }
  if (!centro || centro.aprobadores.some((ap) => ap.email === a.de)) return
  const otros = maestros.centros.filter((c) => c.aprobadores.some((ap) => ap.email === a.de)).map((c) => `${c.centro_costo} (${c.nombre})`)
  bloqueo(acc, {
    codigo: "RC2",
    detalle: `${a.de} no es aprobador de ${centro.centro_costo} (${centro.nombre}).${otros.length ? ` Es aprobador de ${otros.join(", ")}.` : ""}`,
    accion_sugerida: `Obtener la aprobación de un aprobador de ${centro.centro_costo} (${centro.aprobadores.map((x) => x.email).join(", ")}), o que el solicitante corrija el centro de costo si el gasto pertenece a otra área. No reimputar sin su confirmación.`,
  })
}

function rc3Tope({ paquete, centro }: Contexto, acc: Acumulado): void {
  const a = paquete.aprobacion
  if (!centro || !a) return
  const s = paquete.solicitud
  const aprobador = centro.aprobadores.find((ap) => ap.email === a.de)
  const valores = { valor_total: s.valor_total }
  if (aprobador && s.valor_total > aprobador.tope) {
    bloqueo(acc, {
      codigo: "RC3",
      detalle: `${a.de} tiene tope de ${formatoMoneda(aprobador.tope, s.moneda)} en ${centro.centro_costo}; la solicitud es por ${formatoMoneda(s.valor_total, s.moneda)}.`,
      accion_sugerida: `Escalar la aprobación a un aprobador con tope suficiente en ${centro.centro_costo}.`,
      valores: { ...valores, tope: aprobador.tope },
    })
  } else if (!aprobador) {
    const maximo = Math.max(...centro.aprobadores.map((ap) => ap.tope))
    if (s.valor_total <= maximo) return
    bloqueo(acc, {
      codigo: "RC3",
      detalle: `Ningún aprobador de ${centro.centro_costo} tiene tope para ${formatoMoneda(s.valor_total, s.moneda)} (máximo ${formatoMoneda(maximo, s.moneda)}).`,
      accion_sugerida: "Escalar a la Dirección, o corregir el centro de costo si el gasto realmente pertenece a otra área.",
      valores: { ...valores, tope_maximo_centro: maximo },
    })
  }
}

function rc10Total({ paquete }: Contexto, acc: Acumulado): void {
  const s = paquete.solicitud
  const calculado = s.cantidad * s.valor_unitario
  if (Math.abs(calculado - s.valor_total) <= TOLERANCIA_TOTAL) return
  bloqueo(acc, {
    codigo: "RC10",
    detalle: `cantidad × valor unitario = ${formatoMoneda(calculado, s.moneda)}, pero el valor total dice ${formatoMoneda(s.valor_total, s.moneda)}.`,
    accion_sugerida: "Pedir al solicitante que corrija cantidad, valor unitario o total en el Excel de solicitud.",
    valores: { calculado, valor_total: s.valor_total },
  })
}

function monedaSoportada({ paquete }: Contexto, acc: Acumulado): void {
  const moneda = paquete.solicitud.moneda
  if (MONEDAS.includes(moneda)) return
  bloqueo(acc, { codigo: "MONEDA", detalle: `La moneda ${moneda} no está soportada (solo ${MONEDAS.join(", ")}).`, accion_sugerida: "Pedir la solicitud en COP o USD." })
}

function rc5Cotizacion({ paquete }: Contexto, acc: Acumulado): void {
  const s = paquete.solicitud
  const c = paquete.cotizacion
  if (!c) {
    confirmacion(acc, { codigo: "RC5", detalle: "El paquete no trae cotización; no se puede contrastar el valor.", accion_sugerida: "Confirmar que se crea sin cotización, o pedirla al solicitante." })
    return
  }
  if (c.moneda !== s.moneda) {
    confirmacion(acc, { codigo: "RC5", detalle: `La cotización está en ${c.moneda} y la solicitud en ${s.moneda}.`, accion_sugerida: "Confirmar la moneda con el solicitante antes de crear.", valores: { solicitud: s.valor_total, cotizacion: c.total } })
    return
  }
  const diferencia = Math.abs(c.total - s.valor_total) / s.valor_total
  if (diferencia <= TOLERANCIA_COTIZACION) return
  const pct = Math.round(diferencia * 10000) / 100
  confirmacion(acc, {
    codigo: "RC5",
    detalle: `La cotización (${formatoMoneda(c.total, c.moneda)}) difiere ${pct.toLocaleString("es-CO")} % de la solicitud (${formatoMoneda(s.valor_total, s.moneda)}); el máximo es ${TOLERANCIA_COTIZACION * 100} %.`,
    accion_sugerida: "Confirmar que la OC se crea por el valor de la solicitud (lo aprobado); la diferencia queda registrada como excepción.",
    valores: { solicitud: s.valor_total, cotizacion: c.total, diferencia: c.total - s.valor_total, diferencia_pct: pct },
  })
}

function rc6Iva({ paquete, maestros, proveedor }: Contexto, acc: Acumulado): void {
  const informado = paquete.solicitud.indicador_iva
  if (informado) {
    if (!maestros.iva.some((i) => i.codigo === informado)) {
      bloqueo(acc, { codigo: "RC6", detalle: `El indicador de IVA ${informado} no existe en el maestro.`, accion_sugerida: `Usar un indicador válido: ${maestros.iva.map((i) => i.codigo).join(", ")}.` })
    }
    return
  }
  if (!proveedor) return
  const iva = maestros.iva.find((i) => i.codigo === proveedor.indicador_iva_default)
  const descripcion = iva ? ` (${iva.descripcion})` : ""
  acc.derivados.indicador_iva = { valor: proveedor.indicador_iva_default, fuente: "maestro.proveedores", detalle: `La solicitud no informa IVA; se propone el del proveedor${descripcion}.` }
  confirmacion(acc, {
    codigo: "RC6",
    detalle: `La solicitud no trae indicador de IVA. Se propone ${proveedor.indicador_iva_default}${descripcion}, el predeterminado de ${proveedor.nombre.replace(/\.$/, "")}.`,
    accion_sugerida: `Confirmar ${proveedor.indicador_iva_default} o indicar otro indicador.`,
    valores: { indicador_propuesto: proveedor.indicador_iva_default },
  })
}

function rc7CondicionesPago({ paquete, maestros, proveedor }: Contexto, acc: Acumulado): void {
  const informadas = paquete.solicitud.condiciones_pago
  if (informadas) {
    if (!maestros.pagos.some((p) => p.codigo === informadas)) {
      bloqueo(acc, { codigo: "RC7", detalle: `La condición de pago ${informadas} no existe en el maestro.`, accion_sugerida: `Usar una condición válida: ${maestros.pagos.map((p) => p.codigo).join(", ")}.` })
    }
    return
  }
  if (!proveedor) return
  const pago = maestros.pagos.find((p) => p.codigo === proveedor.condiciones_pago_default)
  acc.derivados.condiciones_pago = {
    valor: proveedor.condiciones_pago_default,
    fuente: "maestro.proveedores",
    detalle: `La solicitud no informa condiciones de pago; se toman las del proveedor${pago ? ` (${pago.descripcion})` : ""}.`,
  }
}

function rc8Retroactiva({ paquete }: Contexto, acc: Acumulado): boolean {
  const f = paquete.factura
  const fechaSolicitud = paquete.solicitud.fecha_solicitud
  if (!f || f.fecha >= soloFecha(fechaSolicitud)) return false
  confirmacion(acc, {
    codigo: "RC8",
    detalle: `OC retroactiva: la factura ${f.numero} es del ${f.fecha}, anterior a la solicitud (${soloFecha(fechaSolicitud)}).`,
    accion_sugerida: "Confirmar la creación sabiendo que queda marcada como retroactiva en el control; reportar el desvío al líder del área.",
    valores: { fecha_factura: f.fecha, fecha_solicitud: soloFecha(fechaSolicitud) },
  })
  return true
}

function rc9FechaAprobacion({ paquete }: Contexto, acc: Acumulado): void {
  const a = paquete.aprobacion
  const fechaSolicitud = soloFecha(paquete.solicitud.fecha_solicitud)
  if (!a || soloFecha(a.fecha) >= fechaSolicitud) return
  confirmacion(acc, {
    codigo: "RC9",
    detalle: `La aprobación (${soloFecha(a.fecha)}) es anterior a la solicitud (${fechaSolicitud}).`,
    accion_sugerida: "Confirmar con el líder que la aprobación corresponde a esta solicitud.",
    valores: { fecha_aprobacion: soloFecha(a.fecha), fecha_solicitud: fechaSolicitud },
  })
}
