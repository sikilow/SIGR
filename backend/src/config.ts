import "dotenv/config";

export const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) {
  throw new Error("Falta JWT_SECRET en backend/.env");
}

export const PUERTO = Number(process.env.PORT ?? 3000);

/** Orígenes permitidos por CORS (separados por coma). Por defecto, el servidor de Vite. */
export const ORIGENES_PERMITIDOS = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
