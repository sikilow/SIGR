import "dotenv/config";

export const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) {
  throw new Error("Falta JWT_SECRET en backend/.env");
}

export const PUERTO = Number(process.env.PORT ?? 3000);

/**
 * Orígenes permitidos por CORS. Por defecto: el front en desarrollo desde localhost o 127.0.0.1
 * en CUALQUIER puerto (Vite salta al 5174, 5175... si el 5173 está ocupado).
 * En producción define CORS_ORIGIN en .env (URLs separadas por coma).
 */
const DESDE_ENV = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const ORIGENES_PERMITIDOS: (string | RegExp)[] =
  DESDE_ENV.length > 0 ? DESDE_ENV : [/^http:\/\/(localhost|127\.0\.0\.1):\d+$/];
