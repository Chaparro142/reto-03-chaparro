import { DurableObject } from "cloudflare:workers"
import { rutaSegura } from "./store.ts"
import type { Store } from "./store.ts"

/**
 * Durable Object único ("global") que hace de disco de out/ en Cloudflare: SQLite con archivos,
 * líneas anexadas (jsonl/csv) y contadores. Una sola instancia serializa las escrituras,
 * así la numeración de OC y el control son consistentes entre sesiones.
 */
export class Almacen extends DurableObject<unknown> {
  private readonly sql: SqlStorage

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS archivos (ruta TEXT PRIMARY KEY, texto TEXT, bytes BLOB);
      CREATE TABLE IF NOT EXISTS lineas (id INTEGER PRIMARY KEY AUTOINCREMENT, ruta TEXT NOT NULL, linea TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS lineas_ruta ON lineas (ruta, id);
      CREATE TABLE IF NOT EXISTS contadores (clave TEXT PRIMARY KEY, valor INTEGER NOT NULL);
    `)
  }

  leer(ruta: string): string | null {
    const fila = this.sql.exec<{ texto: string | null }>("SELECT texto FROM archivos WHERE ruta = ?", ruta).toArray()[0]
    if (fila) return fila.texto
    const lineas = this.sql.exec<{ linea: string }>("SELECT linea FROM lineas WHERE ruta = ? ORDER BY id", ruta).toArray()
    return lineas.length ? lineas.map((l) => `${l.linea}\n`).join("") : null
  }

  leerBytes(ruta: string): ArrayBuffer | null {
    const fila = this.sql.exec<{ bytes: ArrayBuffer | null }>("SELECT bytes FROM archivos WHERE ruta = ?", ruta).toArray()[0]
    return fila?.bytes ?? null
  }

  escribirTexto(ruta: string, texto: string): void {
    this.sql.exec("INSERT OR REPLACE INTO archivos (ruta, texto, bytes) VALUES (?, ?, NULL)", ruta, texto)
  }

  escribirBytes(ruta: string, bytes: ArrayBuffer): void {
    this.sql.exec("INSERT OR REPLACE INTO archivos (ruta, texto, bytes) VALUES (?, NULL, ?)", ruta, bytes)
  }

  anexar(ruta: string, linea: string, encabezado?: string): void {
    const existe = this.sql.exec("SELECT 1 FROM lineas WHERE ruta = ? LIMIT 1", ruta).toArray().length > 0
    if (!existe && encabezado) this.sql.exec("INSERT INTO lineas (ruta, linea) VALUES (?, ?)", ruta, encabezado)
    this.sql.exec("INSERT INTO lineas (ruta, linea) VALUES (?, ?)", ruta, linea)
  }

  listar(prefijo: string): string[] {
    const filas = this.sql
      .exec<{ ruta: string }>("SELECT ruta FROM archivos WHERE ruta LIKE ? UNION SELECT DISTINCT ruta FROM lineas WHERE ruta LIKE ? ORDER BY ruta", `${prefijo}%`, `${prefijo}%`)
      .toArray()
    return filas.map((f) => f.ruta)
  }

  sumar(clave: string, n: number): number {
    this.sql.exec("INSERT INTO contadores (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = valor + excluded.valor", clave, n)
    return this.sql.exec<{ valor: number }>("SELECT valor FROM contadores WHERE clave = ?", clave).one().valor
  }

  /** POST /api/reset: deja out/ vacío (los contadores de uso se conservan). */
  borrarSalida(): void {
    this.sql.exec("DELETE FROM archivos; DELETE FROM lineas;")
  }
}

/** Store del Worker: fuentes embebidas en el bundle + out/ en el Durable Object. */
export class DurableStore implements Store {
  constructor(
    private readonly almacen: DurableObjectStub<Almacen>,
    private readonly embebidos: Record<string, string>,
  ) {}

  async leerFuente(ruta: string): Promise<string | null> {
    return this.embebidos[ruta.replace(/\\/g, "/")] ?? null
  }

  async listarFuentes(prefijo: string): Promise<string[]> {
    return Object.keys(this.embebidos).filter((r) => r.startsWith(prefijo)).sort()
  }

  async leer(ruta: string): Promise<string | null> {
    return rutaSegura(ruta, "out") ? this.almacen.leer(ruta) : null
  }

  async leerBytes(ruta: string): Promise<Uint8Array | null> {
    if (!rutaSegura(ruta, "out")) return null
    const bytes = await this.almacen.leerBytes(ruta)
    return bytes ? new Uint8Array(bytes) : null
  }

  async escribir(ruta: string, contenido: string | Uint8Array): Promise<void> {
    const segura = exigirSalida(ruta)
    if (typeof contenido === "string") await this.almacen.escribirTexto(segura, contenido)
    else await this.almacen.escribirBytes(segura, contenido.slice().buffer)
  }

  async anexar(ruta: string, linea: string, encabezado?: string): Promise<void> {
    await this.almacen.anexar(exigirSalida(ruta), linea, encabezado)
  }

  async listar(prefijo: string): Promise<string[]> {
    return this.almacen.listar(prefijo)
  }

  async sumar(clave: string, n: number): Promise<number> {
    return this.almacen.sumar(clave, n)
  }
}

function exigirSalida(ruta: string): string {
  const segura = rutaSegura(ruta, "out")
  if (!segura) throw new Error(`Ruta fuera de out/: ${ruta}`)
  return segura
}
