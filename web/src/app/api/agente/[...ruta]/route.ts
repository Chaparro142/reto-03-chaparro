import { respuestaMock } from "@/features/agente/mock/respuestas";

// Un turno del agente dura como máximo ~55 s (presupuesto del Worker); se deja margen para la red.
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 80_000;
const RUTA_VALIDA = /^[A-Za-z0-9._\-/]+$/;

type Contexto = { params: Promise<{ ruta: string[] }> };

function json(estado: number, cuerpo: unknown): Response {
  return Response.json(cuerpo, { status: estado });
}

function mockActivo(): boolean {
  return process.env.DEMO_MOCK === "1" && !process.env.VERCEL_ENV;
}

async function reenviar(req: Request, { params }: Contexto): Promise<Response> {
  const { ruta } = await params;
  const subruta = ruta.join("/");
  if (!RUTA_VALIDA.test(subruta) || subruta.includes("..")) {
    return json(400, { error: "Ruta no válida." });
  }

  const cuerpo = req.method === "POST" ? await req.text() : undefined;

  if (mockActivo()) {
    return respuestaMock(req.method, subruta, cuerpo);
  }

  // En local, sin AGENTE_URL se usa el Worker de `wrangler dev`. En Vercel la variable es obligatoria.
  const porDefecto = process.env.VERCEL_ENV
    ? undefined
    : "http://localhost:8787";
  const base = (process.env.AGENTE_URL || porDefecto)?.replace(/\/+$/, "");
  if (!base) {
    return json(503, {
      error: "El front no tiene configurada la URL del agente (AGENTE_URL).",
    });
  }

  const headers: Record<string, string> = {
    accept: req.headers.get("accept") ?? "*/*",
  };
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  const clave = process.env.AGENTE_ACCESS_KEY;
  if (clave) headers["x-access-key"] = clave;

  const url = `${base}/api/${subruta}${new URL(req.url).search}`;
  const pedir = () =>
    fetch(url, {
      method: req.method,
      headers,
      body: cuerpo,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  try {
    let res: Response;
    try {
      res = await pedir();
    } catch (e) {
      // Las lecturas son idempotentes: se reintentan una vez ante un corte de red.
      // POST /chat no se reintenta para no ejecutar dos veces un turno del agente.
      const vencido =
        e instanceof Error &&
        (e.name === "TimeoutError" || e.name === "AbortError");
      if (req.method !== "GET" || vencido) throw e;
      await new Promise((r) => setTimeout(r, 400));
      res = await pedir();
    }
    const salida = new Headers();
    const tipo = res.headers.get("content-type");
    if (tipo) salida.set("content-type", tipo);
    const disposicion = res.headers.get("content-disposition");
    if (disposicion) salida.set("content-disposition", disposicion);
    salida.set("cache-control", "no-store");
    return new Response(res.body, { status: res.status, headers: salida });
  } catch (e) {
    const vencido =
      e instanceof Error &&
      (e.name === "TimeoutError" || e.name === "AbortError");
    return json(vencido ? 504 : 502, {
      error: vencido
        ? "El agente tardó demasiado en responder. Intenta de nuevo; la sesión sigue activa."
        : "No se pudo conectar con el agente. Revisa que el servicio esté en línea.",
    });
  }
}

export const GET = reenviar;
export const POST = reenviar;
