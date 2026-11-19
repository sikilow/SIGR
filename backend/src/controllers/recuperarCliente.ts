// Recuperar la contraseña de un cliente del portal (migración 033): enlace de un solo uso por correo, igual que el del personal.
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { validar } from "../models/dominio";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { huellaToken, origenApp } from "../services/restablecerContrasena";
import { enviarEnlaceRestablecerCliente } from "../services/restablecerContrasenaCliente";
import { ipDe, registrarAcceso } from "../services/seguridadAcceso";
import { correo as correoValido } from "../utils/campos";
import { Contrasena } from "../utils/contrasenas";
import { ErrorApi } from "../utils/errores";

const Recuperar = z.object({ correo: correoValido }).strict();
const Token = z.string().trim().min(20, "enlace inválido").max(100, "enlace inválido");
const Restablecer = z.object({ token: Token, contrasena: Contrasena }).strict();

const MENSAJE_GENERICO =
  "Si ese correo tiene una cuenta, le enviamos un enlace para crear una contraseña nueva. Revisa tu correo (también en spam).";

/**
 * POST /api/auth-clientes/recuperar { correo }  →  { mensaje }
 * Pública. Responde SIEMPRE lo mismo, exista o no la cuenta, para no revelar qué correos están registrados.
 */
export const solicitarRecuperacionCliente = async (req: Request, res: Response) => {
  const { correo } = validar(Recuperar, req.body ?? {});
  const [destino] = await filas(
    pool,
    `SELECT c.id_cliente, c.nombre, c.correo
       FROM cliente c JOIN cliente_credencial cc ON cc.id_cliente = c.id_cliente
      WHERE c.correo = ? AND c.eliminado_en IS NULL
      LIMIT 1`,
    [correo.toLowerCase()],
  );
  if (destino) {
    // Si el envío falla o se llegó al límite por hora, también se responde lo mismo (queda en el log del servidor).
    await enviarEnlaceRestablecerCliente(
      { id_cliente: destino.id_cliente as number, nombre: destino.nombre as string, correo: destino.correo as string },
      origenApp(req),
    );
  }
  res.json({ mensaje: MENSAJE_GENERICO });
};

async function buscarEnlace(token: string) {
  const [fila] = await filas(
    pool,
    `SELECT r.id_restablecimiento, r.id_cliente, c.nombre, c.correo
       FROM restablecimiento_contrasena_cliente r
       JOIN cliente c ON c.id_cliente = r.id_cliente
      WHERE r.token_hash = ? AND r.usado_en IS NULL AND r.expira_en > NOW() AND c.eliminado_en IS NULL`,
    [huellaToken(token)],
  );
  return fila;
}

const enlaceInvalido = () =>
  new ErrorApi(410, "enlace_invalido", "El enlace ya se usó o caducó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».");

/** GET /api/auth-clientes/restablecer/:token  →  { nombre, correo }  (410 si ya no sirve) */
export const validarEnlaceCliente = async (req: Request, res: Response) => {
  const token = validar(Token, req.params.token);
  const fila = await buscarEnlace(token);
  if (!fila) throw enlaceInvalido();
  res.json({ nombre: fila.nombre, correo: fila.correo });
};

/** POST /api/auth-clientes/restablecer { token, contrasena }  →  { ok: true }. Marca el enlace como usado. */
export const restablecerContrasenaCliente = async (req: Request, res: Response) => {
  const { token, contrasena } = validar(Restablecer, req.body ?? {});
  const fila = await buscarEnlace(token);
  if (!fila) throw enlaceInvalido();
  const idCliente = fila.id_cliente as number;
  const hash = await bcrypt.hash(contrasena, 12);
  await transaccion(async (cx) => {
    // Se marca como usado primero y solo si seguía libre: dos envíos simultáneos no pueden usarlo dos veces.
    const marcado = await ejecutar(
      cx,
      "UPDATE restablecimiento_contrasena_cliente SET usado_en = NOW() WHERE id_restablecimiento = ? AND usado_en IS NULL AND expira_en > NOW()",
      [fila.id_restablecimiento],
    );
    if (marcado.affectedRows !== 1) throw enlaceInvalido();
    await ejecutar(cx, "UPDATE cliente_credencial SET password_hash = ? WHERE id_cliente = ?", [hash, idCliente]);
    await ejecutar(cx, "UPDATE restablecimiento_contrasena_cliente SET usado_en = NOW() WHERE id_cliente = ? AND usado_en IS NULL", [idCliente]);
  });
  await registrarAcceso({ ambito: "cliente", identificador: String(fila.correo), resultado: "ok", detalle: "contraseña restablecida", ip: ipDe(req) });
  res.json({ ok: true });
};
