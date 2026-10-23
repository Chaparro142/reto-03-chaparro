import type { Posicion, Trazabilidad } from '../../types/contrato'
import { cifra, dinero } from '../../utils/formato'

const UNIDADES: Record<Posicion['unidad'], string> = { UN: 'Unidad', H: 'Hora', MES: 'Mes' }

/** Busca el origen de un campo de posición en trazabilidad.json, con o sin índice. */
function origen(traza: Trazabilidad | null, indice: number, campo: string): string | undefined {
  if (!traza) return undefined
  return (
    traza[`posiciones[${indice}].${campo}`] ??
    traza[`posiciones.${indice}.${campo}`] ??
    traza[`posiciones.${campo}`] ??
    traza[campo]
  )
}

function Celda({ children, fuente, derecha }: { children: React.ReactNode; fuente?: string; derecha?: boolean }) {
  return (
    <td
      title={fuente ? `Origen: ${fuente}` : undefined}
      className={`whitespace-nowrap px-3 py-2.5 ${derecha ? 'text-right tabular-nums' : ''} ${
        fuente ? 'cursor-help decoration-borde-fuerte decoration-dotted underline-offset-4 hover:underline' : ''
      }`}
    >
      {children}
    </td>
  )
}

export function TablaPosiciones({
  posiciones,
  moneda,
  trazabilidad,
}: {
  posiciones: Posicion[]
  moneda: string
  trazabilidad: Trazabilidad | null
}) {
  const total = posiciones.reduce((s, p) => s + p.cantidad * p.precio_unitario, 0)
  return (
    <div className="overflow-x-auto rounded-md border border-borde bg-superficie">
      <table className="w-full border-collapse text-[13.5px]">
        <caption className="sr-only">Posiciones de la orden de compra</caption>
        <thead>
          <tr className="border-b border-borde bg-superficie-2 text-left text-[12px] font-medium text-texto-2">
            <th className="px-3 py-2 font-medium">Pos.</th>
            <th className="px-3 py-2 font-medium">Texto breve</th>
            <th className="px-3 py-2 text-right font-medium">Cantidad</th>
            <th className="px-3 py-2 font-medium">UM</th>
            <th className="px-3 py-2 text-right font-medium">Precio unitario</th>
            <th className="px-3 py-2 text-right font-medium">Valor</th>
            <th className="px-3 py-2 font-medium">IVA</th>
            <th className="px-3 py-2 font-medium">Imputación</th>
          </tr>
        </thead>
        <tbody>
          {posiciones.map((p, i) => (
            <tr key={p.numero} className="border-b border-borde last:border-b-0">
              <Celda>
                <span className="font-mono text-texto-2">{String(p.numero).padStart(5, '0')}</span>
              </Celda>
              <Celda fuente={origen(trazabilidad, i, 'descripcion')}>
                <span className="block max-w-[34ch] truncate" title={p.descripcion}>
                  {p.descripcion}
                </span>
              </Celda>
              <Celda derecha fuente={origen(trazabilidad, i, 'cantidad')}>
                {cifra(p.cantidad)}
              </Celda>
              <Celda fuente={origen(trazabilidad, i, 'unidad')}>
                <span title={UNIDADES[p.unidad]}>{p.unidad}</span>
              </Celda>
              <Celda derecha fuente={origen(trazabilidad, i, 'precio_unitario')}>
                {dinero(p.precio_unitario, moneda)}
              </Celda>
              <Celda derecha>{dinero(p.cantidad * p.precio_unitario, moneda)}</Celda>
              <Celda fuente={origen(trazabilidad, i, 'indicador_iva')}>
                <span className="font-mono">{p.indicador_iva}</span>
              </Celda>
              <Celda fuente={origen(trazabilidad, i, 'centro_costo')}>
                <span className="font-mono">K</span> · {p.centro_costo}
                <span className="text-texto-2"> / {p.subarea}</span>
              </Celda>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-borde-fuerte bg-superficie-2">
            <td colSpan={5} className="px-3 py-2 text-right text-[12.5px] font-medium text-texto-2">
              Valor total de la OC (IVA incluido, según la solicitud)
            </td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{dinero(total, moneda)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
