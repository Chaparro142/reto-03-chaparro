import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { PDFFont, PDFPage } from "pdf-lib"
import type { Store } from "../store/store.ts"
import type { Paquete } from "./tipos.ts"

export type Evidencia = { ruta: string; ruta_pdf: string; sha256: string }

/** Contenido canónico del correo de aprobación: encabezados + cuerpo. Es lo que se firma con sha256. */
export function contenidoAprobacion(aprobacion: NonNullable<Paquete["aprobacion"]>): string {
  return [
    `De: ${aprobacion.de}`,
    `Para: ${aprobacion.para ?? ""}`,
    `Fecha: ${aprobacion.fecha}`,
    `Asunto: ${aprobacion.asunto}`,
    "",
    aprobacion.texto,
  ].join("\n")
}

export async function sha256(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** HU-4: out/<caso>/aprobacion.txt (P0) y aprobacion.pdf (P1), ambos con el sha256 del contenido. */
export async function generarEvidencia(store: Store, caso: string, paquete: Paquete): Promise<Evidencia | null> {
  if (!paquete.aprobacion) return null
  const contenido = contenidoAprobacion(paquete.aprobacion)
  const hash = await sha256(contenido)
  const encabezado = [
    "EVIDENCIA DE APROBACIÓN DE ORDEN DE COMPRA",
    `Solicitud: ${paquete.solicitud.solicitud_id} (caso ${caso})`,
    `SHA-256 del contenido: ${hash}`,
    "-".repeat(72),
  ].join("\n")
  const ruta = `out/${caso}/aprobacion.txt`
  const rutaPdf = `out/${caso}/aprobacion.pdf`
  await store.escribir(ruta, `${encabezado}\n${contenido}\n`)
  await store.escribir(rutaPdf, await crearPdf(encabezado, contenido))
  return { ruta, ruta_pdf: rutaPdf, sha256: hash }
}

const MARGEN = 56
const TAMANO = 10
const INTERLINEA = 14

async function crearPdf(encabezado: string, contenido: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle("Evidencia de aprobación")
  const fuente = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  let pagina = doc.addPage()
  let y = pagina.getHeight() - MARGEN
  const escribirLinea = (texto: string, f: PDFFont): void => {
    if (y < MARGEN) {
      pagina = doc.addPage()
      y = pagina.getHeight() - MARGEN
    }
    pagina.drawText(texto, { x: MARGEN, y, size: TAMANO, font: f, color: rgb(0.1, 0.1, 0.1) })
    y -= INTERLINEA
  }
  const ancho = pagina.getWidth() - 2 * MARGEN
  for (const l of envolver(encabezado, fuente, ancho)) escribirLinea(l, negrita)
  y -= INTERLINEA / 2
  for (const l of envolver(contenido, fuente, ancho)) escribirLinea(l, fuente)
  dibujarPie(pagina, fuente)
  return doc.save()
}

function dibujarPie(pagina: PDFPage, fuente: PDFFont): void {
  pagina.drawText("Generado por el agente de órdenes de compra · Reto 03", { x: MARGEN, y: MARGEN / 2, size: 8, font: fuente, color: rgb(0.5, 0.5, 0.5) })
}

/** Parte el texto en líneas que caben en el ancho; reemplaza caracteres que Helvetica (WinAnsi) no codifica. */
function envolver(texto: string, fuente: PDFFont, ancho: number): string[] {
  const salida: string[] = []
  for (const parrafo of aWinAnsi(texto).split("\n")) {
    let actual = ""
    for (const palabra of parrafo.split(" ")) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (fuente.widthOfTextAtSize(prueba, TAMANO) > ancho && actual) {
        salida.push(actual)
        actual = palabra
      } else {
        actual = prueba
      }
    }
    salida.push(actual)
  }
  return salida
}

function aWinAnsi(texto: string): string {
  return texto.replace(/[^\x20-\x7E\n -ÿ]/g, "?")
}
