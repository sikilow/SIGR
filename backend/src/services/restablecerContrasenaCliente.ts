import { randomBytes } from "node:crypto";
import { ejecutar, filas, pool } from "./db";
import { enviarCorreo } from "./correo";
import { plantillaRestablecerContrasenaCliente } from "./plantillasCorreo";
import { huellaToken, MAXIMO_ENLACES_POR_HORA, MINUTOS_ENLACE, type ResultadoEnvio } from "./restablecerContrasena";

export interface DestinoRestablecerCliente {
  id_cliente: number;
  nombre: string;
  correo: string;
}

/**
 * Crea un enlace nuevo para que un cliente del portal cree su contraseña (invalida los anteriores sin usar) y lo manda a
 * su correo. Igual que el del personal: un solo uso, caduca a la hora, máximo 3 por hora por cliente (migración 033).
 */
export async function enviarEnlaceRestablecerCliente(destino: DestinoRestablecerCliente, origen: string): Promise<ResultadoEnvio> {
  const [reciente] = await filas(
    pool,
    "SELECT COUNT(*) AS n FROM restablecimiento_contrasena_cliente WHERE id_cliente = ? AND creado_en > NOW() - INTERVAL 1 HOUR",
    [destino.id_cliente],
  );
  if (Number(reciente?.n ?? 0) >= MAXIMO_ENLACES_POR_HORA) return "limite";

  const token = randomBytes(32).toString("base64url");
  await ejecutar(pool, "UPDATE restablecimiento_contrasena_cliente SET usado_en = NOW() WHERE id_cliente = ? AND usado_en IS NULL", [destino.id_cliente]);
  const { insertId } = await ejecutar(
    pool,
    "INSERT INTO restablecimiento_contrasena_cliente (id_cliente, token_hash, expira_en) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)",
    [destino.id_cliente, huellaToken(token), MINUTOS_ENLACE],
  );

  const correo = plantillaRestablecerContrasenaCliente({
    nombre: destino.nombre,
    enlace: `${origen}/cliente/restablecer?token=${encodeURIComponent(token)}`,
    minutos: MINUTOS_ENLACE,
  });
  const enviado = await enviarCorreo({ para: destino.correo, ...correo, idempotencyKey: `restablecer-cliente-${insertId}` });
  if (!enviado) {
    // Un enlace que nunca llegó no debe quedar vivo.
    await ejecutar(pool, "UPDATE restablecimiento_contrasena_cliente SET usado_en = NOW() WHERE id_restablecimiento = ?", [insertId]);
    return "fallo";
  }
  return "enviado";
}
