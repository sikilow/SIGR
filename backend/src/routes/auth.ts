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

// El front manda { usuario, contrasena }. También se acepta { nombre_usuario, password }
// (el formato original) para poder seguir probando con Invoke-RestMethod.
const Login = z
  .object({
    usuario: z.string().optional(),
    contrasena: z.string().optional(),
    nombre_usuario: z.string().optional(),
    password: z.string().optional(),
  })
  .transform((d) => ({
    usuario: d.usuario ?? d.nombre_usuario ?? "",
    contrasena: d.contrasena ?? d.password ?? "",
  }));

/** POST /api/auth/login  →  { token, usuario: { id, nombre, rol } } */
authRouter.post("/login", async (req, res) => {
  const { usuario, contrasena } = validar(Login, req.body ?? {});

  const [fila] = await filas(
    pool,
    `SELECT u.id_usuario, u.nombre, r.nombre AS rol, c.password_hash
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

  // En la BD el rol es "Mesero"; el front usa "mesero".
  const rol = (fila.rol as string).toLowerCase() as Rol;
  const token = jwt.sign({ id: fila.id_usuario as number, rol }, JWT_SECRET, { expiresIn: "8h" });

  res.json({ token, usuario: { id: fila.id_usuario as number, nombre: fila.nombre as string, rol } });
});

/** GET /api/auth/me  →  { usuario }. El front lo usa para recuperar la sesión al recargar. */
authRouter.get("/me", requiereAuth(), async (req, res) => {
  const [fila] = await filas(
    pool,
    `SELECT u.id_usuario, u.nombre, r.nombre AS rol
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ? AND u.activo = TRUE`,
    [req.usuario?.id],
  );
  if (!fila) throw new ErrorApi(401, "no_autenticado", "El usuario ya no está activo.");
  res.json({
    usuario: {
      id: fila.id_usuario as number,
      nombre: fila.nombre as string,
      rol: (fila.rol as string).toLowerCase() as Rol,
    },
  });
});
