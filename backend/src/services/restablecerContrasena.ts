import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { ejecutar, filas, pool } from "./db";
import { enviarCorreo } from "./correo";
import { plantillaRestablecerContrasena } from "./plantillasCorreo";
import { ORIGENES_PERMITIDOS } from "../utils/config";

/** Cuánto dura un enlace para crear contraseña. */
export const MINUTOS_ENLACE = 60;
/** Máximo de enlaces que se mandan a un mismo usuario por hora (evita llenarle el buzón). */
export const MAXIMO_ENLACES_POR_HORA = 3;

export const huellaToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Dirección del front para armar el enlace: el origen de quien pidió el correo si es uno permitido por CORS
 * (así funciona en localhost:5173, 5174...), si no URL_APP del .env, y por último el front de desarrollo.
 */
export function origenApp(req: Request): string {
  const origen = req.get("origin")?.trim();
  if (origen && ORIGENES_PERMITIDOS.some((o) => (typeof o === "string" ? o === origen : o.test(origen)))) {
    return origen.replace(/\/+$/, "");
  }
  return (process.env.URL_APP?.trim() || "http://localhost:5173").replace(/\/+$/, "");
}

export interface DestinoRestablecer {
  id_usuario: number;
  nombre: string;
  correo: string;
  nombre_usuario: string;
}

export type ResultadoEnvio = "enviado" | "limite" | "fallo";

/**
 * Crea un enlace nuevo (invalida los anteriores sin usar) y lo manda al correo del usuario.
 * `solicitadoPor` = id del gerente que lo pidió; null = lo pidió el propio empleado.
 */
export async function enviarEnlaceRestablecer(
  destino: DestinoRestablecer,
  origen: string,
  solicitadoPor: number | null,
): Promise<ResultadoEnvio> {
  const [reciente] = await filas(
    pool,
    "SELECT COUNT(*) AS n FROM restablecimiento_contrasena WHERE id_usuario = ? AND creado_en > NOW() - INTERVAL 1 HOUR",
    [destino.id_usuario],
  );
  if (Number(reciente?.n ?? 0) >= MAXIMO_ENLACES_POR_HORA) return "limite";

  const token = randomBytes(32).toString("base64url");
  await ejecutar(
    pool,
    "UPDATE restablecimiento_contrasena SET usado_en = NOW() WHERE id_usuario = ? AND usado_en IS NULL",
    [destino.id_usuario],
  );
  const { insertId } = await ejecutar(
    pool,
    `INSERT INTO restablecimiento_contrasena (id_usuario, token_hash, solicitado_por, expira_en)
     VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE)`,
    [destino.id_usuario, huellaToken(token), solicitadoPor, MINUTOS_ENLACE],
  );

  const correo = plantillaRestablecerContrasena({
    nombre: destino.nombre,
    usuario: destino.nombre_usuario,
    enlace: `${origen}/restablecer?token=${encodeURIComponent(token)}`,
    minutos: MINUTOS_ENLACE,
    porGerente: solicitadoPor !== null,
  });
  const enviado = await enviarCorreo({ para: destino.correo, ...correo, idempotencyKey: `restablecer-${insertId}` });
  if (!enviado) {
    // Un enlace que nunca llegó no debe quedar vivo.
    await ejecutar(pool, "UPDATE restablecimiento_contrasena SET usado_en = NOW() WHERE id_restablecimiento = ?", [insertId]);
    return "fallo";
  }
  return "enviado";
}
