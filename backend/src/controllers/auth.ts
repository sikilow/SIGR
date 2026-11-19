import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { JWT_SECRET } from "../utils/config";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { type Rol } from "../utils/auth";
import { conActorAuditoria } from "../services/contextoAuditoria";
import { enviarEnlaceRestablecer, huellaToken, origenApp } from "../services/restablecerContrasena";

// El front manda { nombre_usuario, contrasena } (credenciales.nombre_usuario). La contraseña se compara con
// credenciales.password_hash; también se acepta `password` para probar con Invoke-RestMethod.
const Login = z
  .object({
    nombre_usuario: z.string().optional(),
    contrasena: z.string().optional(),
    password: z.string().optional(),
  })
  .transform((d) => ({
    usuario: d.nombre_usuario ?? "",
    contrasena: d.contrasena ?? d.password ?? "",
  }));

/** Perfil que viaja al cliente: columnas de `usuario` + `rol` (calculado: rol.nombre, p. ej. "Mesero"). */
const SELECT_PERFIL = "u.id_usuario, u.id_rol, u.nombre, u.correo, u.activo, r.nombre AS rol";

function aPerfil(f: Record<string, unknown>) {
  return {
    id_usuario: f.id_usuario as number,
    id_rol: f.id_rol as number,
    nombre: f.nombre as string,
    correo: f.correo as string,
    activo: Boolean(f.activo),
    rol: f.rol as string,
  };
}

/** POST /api/auth/login  →  { token, usuario: { id_usuario, id_rol, nombre, correo, activo, rol } } */
export const iniciarSesion = async (req: Request, res: Response) => {
  const { usuario, contrasena } = validar(Login, req.body ?? {});

  const [fila] = await filas(
    pool,
    `SELECT ${SELECT_PERFIL}, c.password_hash
       FROM credenciales c
       JOIN usuario u ON u.id_usuario = c.id_usuario
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE c.nombre_usuario = ? AND u.activo = TRUE`,
    [usuario],
  );

  if (!fila || !(await bcrypt.compare(contrasena, fila.password_hash as string))) {
    throw new ErrorApi(401, "credenciales_invalidas", "Usuario o contraseña incorrectos.");
  }

  await conActorAuditoria(fila.id_usuario as number, () =>
    ejecutar(pool, "UPDATE credenciales SET ultimo_acceso = NOW() WHERE id_usuario = ?", [fila.id_usuario]),
  );

  // En la BD el rol es "Mesero"; dentro del token (uso interno de la API) se guarda en minúsculas.
  const rol = (fila.rol as string).toLowerCase() as Rol;
  const token = jwt.sign({ id: fila.id_usuario as number, rol }, JWT_SECRET, { expiresIn: "8h" });

  res.json({ token, usuario: aPerfil(fila) });
};

/** GET /api/auth/me  →  { usuario }. El front lo usa para recuperar la sesión al recargar. */
export const obtenerPerfil = async (req: Request, res: Response) => {
  const [fila] = await filas(
    pool,
    `SELECT ${SELECT_PERFIL}
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ? AND u.activo = TRUE`,
    [req.usuario?.id],
  );
  if (!fila) throw new ErrorApi(401, "no_autenticado", "El usuario ya no está activo.");
  res.json({ usuario: aPerfil(fila) });
};

// ---------- Recuperación de contraseña (enlace de un solo uso por correo) ----------

const Contrasena = z.string().min(6, "mínimo 6 caracteres").max(72, "máximo 72 caracteres");
const Recuperar = z.object({ usuario_o_correo: z.string().trim().min(1, "escribe tu usuario o tu correo").max(120) });
const Token = z.string().trim().min(20, "enlace inválido").max(100, "enlace inválido");
const Restablecer = z.object({ token: Token, contrasena: Contrasena });

const MENSAJE_GENERICO =
  "Si el usuario o correo pertenece a un empleado activo, le enviamos un enlace para crear una contraseña nueva. Revisa tu correo (también en spam).";

/**
 * POST /api/auth/recuperar { usuario_o_correo }  →  { mensaje }
 * Pública. Responde SIEMPRE lo mismo, exista o no la cuenta, para no revelar qué usuarios hay.
 */
export const solicitarRecuperacion = async (req: Request, res: Response) => {
  const { usuario_o_correo } = validar(Recuperar, req.body ?? {});
  const [destino] = await filas(
    pool,
    `SELECT u.id_usuario, u.nombre, u.correo, c.nombre_usuario
       FROM usuario u JOIN credenciales c ON c.id_usuario = u.id_usuario
      WHERE u.activo = TRUE AND (c.nombre_usuario = ? OR u.correo = ?)
      LIMIT 1`,
    [usuario_o_correo, usuario_o_correo],
  );
  if (destino) {
    // Si el envío falla o se llegó al límite por hora, también se responde lo mismo (queda en el log del servidor).
    await enviarEnlaceRestablecer(
      {
        id_usuario: destino.id_usuario as number,
        nombre: destino.nombre as string,
        correo: destino.correo as string,
        nombre_usuario: destino.nombre_usuario as string,
      },
      origenApp(req),
      null,
    );
  }
  res.json({ mensaje: MENSAJE_GENERICO });
};

async function buscarEnlace(token: string) {
  const [fila] = await filas(
    pool,
    `SELECT r.id_restablecimiento, r.id_usuario, c.nombre_usuario, u.nombre
       FROM restablecimiento_contrasena r
       JOIN usuario u ON u.id_usuario = r.id_usuario
       JOIN credenciales c ON c.id_usuario = r.id_usuario
      WHERE r.token_hash = ? AND r.usado_en IS NULL AND r.expira_en > NOW() AND u.activo = TRUE`,
    [huellaToken(token)],
  );
  return fila;
}

const enlaceInvalido = () =>
  new ErrorApi(410, "enlace_invalido", "El enlace ya se usó o caducó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».");

/** GET /api/auth/restablecer/:token  →  { nombre_usuario, nombre }  (410 si ya no sirve) */
export const validarEnlace = async (req: Request, res: Response) => {
  const token = validar(Token, req.params.token);
  const fila = await buscarEnlace(token);
  if (!fila) throw enlaceInvalido();
  res.json({ nombre_usuario: fila.nombre_usuario, nombre: fila.nombre });
};

/** POST /api/auth/restablecer { token, contrasena }  →  { ok: true }. Marca el enlace como usado. */
export const restablecerContrasena = async (req: Request, res: Response) => {
  const { token, contrasena } = validar(Restablecer, req.body ?? {});
  const hash = await bcrypt.hash(contrasena, 10);
  const fila = await buscarEnlace(token);
  if (!fila) throw enlaceInvalido();
  const idUsuario = fila.id_usuario as number;
  await conActorAuditoria(idUsuario, () =>
    transaccion(async (cx) => {
      // Se marca como usado primero y solo si seguía libre: dos envíos simultáneos no pueden usarlo dos veces.
      const marcado = await ejecutar(
        cx,
        "UPDATE restablecimiento_contrasena SET usado_en = NOW() WHERE id_restablecimiento = ? AND usado_en IS NULL AND expira_en > NOW()",
        [fila.id_restablecimiento],
      );
      if (marcado.affectedRows !== 1) throw enlaceInvalido();
      await ejecutar(cx, "UPDATE credenciales SET password_hash = ? WHERE id_usuario = ?", [hash, idUsuario]);
      await ejecutar(cx, "UPDATE restablecimiento_contrasena SET usado_en = NOW() WHERE id_usuario = ? AND usado_en IS NULL", [idUsuario]);
    }),
  );
  res.json({ ok: true });
};
