import "dotenv/config";

export const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) {
  throw new Error("Falta JWT_SECRET en backend/.env");
}

export const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() ?? "";
export const CORREO_REMITENTE = process.env.CORREO_REMITENTE?.trim() ?? "";

export type CorreoProveedor = "resend" | "smtp";

export const SMTP_HOST = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
const puertoSmtp = process.env.SMTP_PORT?.trim();
export const SMTP_PORT = puertoSmtp ? Number(puertoSmtp) : 465;
export const SMTP_USER = process.env.SMTP_USER?.trim() ?? "";
export const SMTP_PASS = (process.env.SMTP_PASS ?? "").replace(/\s/g, "");

const proveedorConfigurado = process.env.CORREO_PROVEEDOR?.trim().toLowerCase();
export const CORREO_PROVEEDOR: CorreoProveedor | null =
  proveedorConfigurado === "resend" || proveedorConfigurado === "smtp"
    ? proveedorConfigurado
    : proveedorConfigurado
      ? null
      : RESEND_API_KEY
        ? "resend"
        : SMTP_USER && SMTP_PASS
          ? "smtp"
          : null;

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
