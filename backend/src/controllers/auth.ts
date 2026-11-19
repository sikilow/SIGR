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
import {
  cerrarSesionEmpleado,
  crearSesionEmpleado,
  exigirAccesoNoBloqueado,
  ipDe,
  minutosInactividad,
  registrarAcceso,
  registrarIntentoFallido,
} from "../services/seguridadAcceso";
import { Contrasena } from "../utils/contrasenas";

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

/** Hash de relleno: si el usuario no existe se compara contra él, para que tardar lo mismo no delate qué usuarios hay. */
const HASH_RELLENO = bcrypt.hashSync("relleno-sin-usuario", 10);

/**
 * POST /api/auth/login  →  { token, usuario: {...}, sesion: { inactividad_minutos } }
 * Tras 5 intentos fallidos seguidos el acceso se bloquea unos minutos (`429 cuenta_bloqueada`), exista o no el usuario.
 * Cada intento queda en `registro_acceso`. El token lleva el id de su sesión en el servidor (`sid`).
 */
export const iniciarSesion = async (req: Request, res: Response) => {
  const { usuario, contrasena } = validar(Login, req.body ?? {});
  const ip = ipDe(req);
  await exigirAccesoNoBloqueado("empleado", usuario, ip);

  const [fila] = await filas(
    pool,
    `SELECT ${SELECT_PERFIL}, c.password_hash
       FROM credenciales c
       JOIN usuario u ON u.id_usuario = c.id_usuario
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE c.nombre_usuario = ? AND u.activo = TRUE AND u.eliminado_en IS NULL`,
    [usuario],
  );

  const correcta = await bcrypt.compare(contrasena, fila ? (fila.password_hash as string) : HASH_RELLENO);
  if (!fila || !correcta) {
    await registrarIntentoFallido("empleado", usuario, ip, fila ? "contraseña incorrecta" : "usuario desconocido");
    throw new ErrorApi(401, "credenciales_invalidas", "Usuario o contraseña incorrectos.");
  }
  await registrarAcceso({ ambito: "empleado", identificador: usuario, resultado: "ok", ip });

  await conActorAuditoria(fila.id_usuario as number, () =>
    ejecutar(pool, "UPDATE credenciales SET ultimo_acceso = NOW() WHERE id_usuario = ?", [fila.id_usuario]),
  );

  // En la BD el rol es "Mesero"; dentro del token (uso interno de la API) se guarda en minúsculas.
  const rol = (fila.rol as string).toLowerCase() as Rol;
  const sid = await crearSesionEmpleado(fila.id_usuario as number, ip);
  const token = jwt.sign({ id: fila.id_usuario as number, rol, sid }, JWT_SECRET, { expiresIn: "8h" });

  res.json({ token, usuario: aPerfil(fila), sesion: { inactividad_minutos: minutosInactividad(rol) } });
};

/** POST /api/auth/logout  →  { ok: true }. Cierra la sesión en el servidor: el token deja de servir. */
export const cerrarSesion = async (req: Request, res: Response) => {
  if (req.sesionId) await cerrarSesionEmpleado(req.sesionId, "salio");
  await registrarAcceso({ ambito: "empleado", identificador: `id:${req.usuario?.id ?? 0}`, resultado: "salida", ip: ipDe(req) });
  res.json({ ok: true });
};

/**
 * POST /api/auth/actividad  →  { ok: true, inactividad_minutos }. La pantalla lo manda mientras la persona la toca; al ser
 * una petición que no es de solo lectura, `requiereAuth` ya renovó la actividad de la sesión.
 */
export const registrarActividad = async (req: Request, res: Response) => {
  res.json({ ok: true, inactividad_minutos: minutosInactividad(req.usuario!.rol) });
};

/** GET /api/auth/me  →  { usuario }. El front lo usa para recuperar la sesión al recargar. */
export const obtenerPerfil = async (req: Request, res: Response) => {
  const [fila] = await filas(
    pool,
    `SELECT ${SELECT_PERFIL}
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ? AND u.activo = TRUE AND u.eliminado_en IS NULL`,
    [req.usuario?.id],
  );
  if (!fila) throw new ErrorApi(401, "no_autenticado", "El usuario ya no está activo.");
  res.json({ usuario: aPerfil(fila), sesion: { inactividad_minutos: minutosInactividad(String(fila.rol).toLowerCase() as Rol) } });
};

// ---------- Recuperación de contraseña (enlace de un solo uso por correo) ----------

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
      WHERE u.activo = TRUE AND u.eliminado_en IS NULL AND (c.nombre_usuario = ? OR u.correo = ?)
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
      WHERE r.token_hash = ? AND r.usado_en IS NULL AND r.expira_en > NOW() AND u.activo = TRUE AND u.eliminado_en IS NULL`,
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
