/**
 * Acceso a archivos del agente. Las herramientas nunca tocan el disco directamente:
 * leen fuentes (fixtures/, agent/, src/knowledge/) y escriben en out/ a través de esta interfaz.
 * Así el mismo código corre en demo.ts y tests (FsStore) y en el Worker (DurableStore).
 */
export interface Store {
  /** Lee una fuente de solo lectura (ruta relativa: "fixtures/...", "agent/prompt.md"). null si no existe. */
  leerFuente(ruta: string): Promise<string | null>
  /** Lista las fuentes bajo un prefijo (rutas relativas completas). */
  listarFuentes(prefijo: string): Promise<string[]>
  /** Lee un archivo generado en out/. null si no existe. */
  leer(ruta: string): Promise<string | null>
  leerBytes(ruta: string): Promise<Uint8Array | null>
  escribir(ruta: string, contenido: string | Uint8Array): Promise<void>
  /** Agrega una línea al final; si el archivo no existe y hay encabezado, lo escribe primero. */
  anexar(ruta: string, linea: string, encabezado?: string): Promise<void>
  listar(prefijo: string): Promise<string[]>
  /** Suma n a un contador persistente y devuelve el total (topes de tokens). */
  sumar(clave: string, n: number): Promise<number>
}

/** Rechaza rutas absolutas, con "..", o fuera de la carpeta permitida. */
export function rutaSegura(ruta: string, raizPermitida: string): string | null {
  const limpia = ruta.replace(/\\/g, "/").replace(/^\.\//, "")
  if (limpia.startsWith("/") || /^[a-zA-Z]:/.test(limpia)) return null
  if (limpia.split("/").some((parte) => parte === ".." || parte === "")) return null
  if (!limpia.startsWith(`${raizPermitida}/`)) return null
  return limpia
}
