import type { OrdenCompra, Proveedor } from "../domain/tipos.ts"
import { RAIZ_FIXTURES } from "../domain/paquete.ts"
import { normalizarNit } from "../domain/texto.ts"
import type { Store } from "../store/store.ts"
import type { SapAdapter } from "./adapter.ts"

export const RUTA_ORDENES = "out/sap/ordenes.jsonl"
export const PRIMER_NUMERO = 4500000001

type Registro = { numero_oc: string; fecha: string; solicitud_id: string; orden: OrdenCompra }

/** SAP simulado sobre archivos: numeración secuencial desde 4500000001 en out/sap/ordenes.jsonl. */
export class SapMock implements SapAdapter {
  constructor(
    private readonly store: Store,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null> {
    const texto = await this.store.leerFuente(`${RAIZ_FIXTURES}/maestros/proveedores.json`)
    const proveedores = texto ? (JSON.parse(texto) as Proveedor[]) : []
    const p = proveedores.find((x) => normalizarNit(x.nit) === normalizarNit(nit))
    return p ? { codigo_sap: p.codigo_sap, activo: p.activo } : null
  }

  async crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }> {
    const existente = await this.buscarOrdenPorReferencia(orden.referencia.solicitud_id)
    if (existente) throw new Error(`Ya existe la OC ${existente.numero_oc} para ${orden.referencia.solicitud_id}`)
    const registros = await this.leerRegistros()
    const numero_oc = String(PRIMER_NUMERO + registros.length)
    const fecha = this.ahora().toISOString()
    const registro: Registro = { numero_oc, fecha, solicitud_id: orden.referencia.solicitud_id, orden }
    await this.store.anexar(RUTA_ORDENES, JSON.stringify(registro))
    return { numero_oc, fecha }
  }

  async buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null> {
    const registro = (await this.leerRegistros()).find((r) => r.solicitud_id === solicitud_id)
    return registro ? { numero_oc: registro.numero_oc } : null
  }

  async fechaDe(numero_oc: string): Promise<string | null> {
    return (await this.leerRegistros()).find((r) => r.numero_oc === numero_oc)?.fecha ?? null
  }

  private async leerRegistros(): Promise<Registro[]> {
    const texto = await this.store.leer(RUTA_ORDENES)
    if (!texto) return []
    return texto
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Registro)
  }
}
