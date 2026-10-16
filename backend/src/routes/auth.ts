import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { JWT_SECRET } from "../config";
import { ejecutar, filas, pool } from "../db";
import { validar } from "../dominio";
import { ErrorApi } from "../errores";
import { requiereAuth, type Rol } from "../middlewares/auth";

export const authRouter = Router();

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
authRouter.post("/login", async (req, res) => {
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

  await ejecutar(pool, "UPDATE credenciales SET ultimo_acceso = NOW() WHERE id_usuario = ?", [fila.id_usuario]);

  // En la BD el rol es "Mesero"; dentro del token (uso interno de la API) se guarda en minúsculas.
  const rol = (fila.rol as string).toLowerCase() as Rol;
  const token = jwt.sign({ id: fila.id_usuario as number, rol }, JWT_SECRET, { expiresIn: "8h" });

  res.json({ token, usuario: aPerfil(fila) });
});

/** GET /api/auth/me  →  { usuario }. El front lo usa para recuperar la sesión al recargar. */
authRouter.get("/me", requiereAuth(), async (req, res) => {
  const [fila] = await filas(
    pool,
    `SELECT ${SELECT_PERFIL}
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ? AND u.activo = TRUE`,
    [req.usuario?.id],
  );
  if (!fila) throw new ErrorApi(401, "no_autenticado", "El usuario ya no está activo.");
  res.json({ usuario: aPerfil(fila) });
});
