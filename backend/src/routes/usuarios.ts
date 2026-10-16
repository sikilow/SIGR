import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../db";
import { idDeRuta, validar } from "../dominio";
import { ErrorApi } from "../errores";
import { requiereAuth } from "../middlewares/auth";

export const usuariosRouter = Router();

// Todo este módulo es solo del gerente (se valida aquí, en el servidor, no en el front).
usuariosRouter.use(requiereAuth("gerente"));

const ROLES = ["gerente", "mesero", "cocinero", "cajero", "hostess"] as const;

const Texto = (max: number) => z.string().trim().min(1, "es obligatorio").max(max, `máximo ${max} caracteres`);
const Correo = z
  .string()
  .trim()
  .max(120, "máximo 120 caracteres")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "no es un correo válido");
const NombreUsuario = z
  .string()
  .trim()
  .min(3, "mínimo 3 caracteres")
  .max(60, "máximo 60 caracteres")
  .regex(/^[A-Za-z0-9._-]+$/, "solo letras, números, punto, guion y guion bajo");
// bcrypt solo usa los primeros 72 bytes: se limita para que no haya contraseñas "recortadas" sin avisar.
const Contrasena = z.string().min(6, "mínimo 6 caracteres").max(72, "máximo 72 caracteres");

export interface UsuarioAdminDto {
  id: number;
  nombre: string;
  correo: string;
  usuario: string;
  rol: (typeof ROLES)[number];
  activo: boolean;
  telefono: string | null;
  creado_en: string;
  ultimo_acceso: string | null;
}

const SELECT_USUARIO = `
  SELECT u.id_usuario AS id, u.nombre, u.correo, c.nombre_usuario AS usuario, r.nombre AS rol, u.activo,
         p.telefono, u.creado_en, c.ultimo_acceso
    FROM usuario u
    JOIN rol r ON r.id_rol = u.id_rol
    LEFT JOIN credenciales c ON c.id_usuario = u.id_usuario
    LEFT JOIN perfil_usuario p ON p.id_usuario = u.id_usuario`;

function aDto(r: Record<string, unknown>): UsuarioAdminDto {
  return {
    id: r.id as number,
    nombre: r.nombre as string,
    correo: r.correo as string,
    usuario: (r.usuario as string | null) ?? "",
    rol: (r.rol as string).toLowerCase() as UsuarioAdminDto["rol"],
    activo: Boolean(r.activo),
    telefono: (r.telefono as string | null) ?? null,
    creado_en: (r.creado_en as Date).toISOString(),
    ultimo_acceso: r.ultimo_acceso ? (r.ultimo_acceso as Date).toISOString() : null,
  };
}

async function cargarUsuario(ex: Ejecutor, id: number): Promise<UsuarioAdminDto | null> {
  const [fila] = await filas(ex, `${SELECT_USUARIO} WHERE u.id_usuario = ?`, [id]);
  return fila ? aDto(fila) : null;
}

async function idRol(ex: Ejecutor, rol: string): Promise<number> {
  const [fila] = await filas(ex, "SELECT id_rol FROM rol WHERE LOWER(nombre) = ?", [rol]);
  if (!fila) throw new ErrorApi(500, "desconocido", `Falta el rol '${rol}' en la tabla rol.`);
  return fila.id_rol as number;
}

/** MySQL avisa de un valor repetido (correo o usuario) con ER_DUP_ENTRY: se traduce a un 409 legible. */
function traducirDuplicado(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
    const texto = String((error as { sqlMessage?: string }).sqlMessage ?? "");
    const campo = texto.includes("correo") ? "correo" : "nombre de usuario";
    throw new ErrorApi(409, "estado_invalido", `Ya existe otro usuario con ese ${campo}.`);
  }
  throw error;
}

/** GET /api/usuarios  →  todos los usuarios (activos e inactivos), por nombre. */
usuariosRouter.get("/", async (_req, res) => {
  const rows = await filas(pool, `${SELECT_USUARIO} ORDER BY u.activo DESC, u.nombre`);
  res.json(rows.map(aDto));
});

const Crear = z.object({
  nombre: Texto(100),
  correo: Correo,
  usuario: NombreUsuario,
  contrasena: Contrasena,
  rol: z.enum(ROLES),
  telefono: z.string().trim().max(20).optional(),
});

/** POST /api/usuarios  →  201 con el usuario creado. La contraseña se guarda con bcrypt. */
usuariosRouter.post("/", async (req, res) => {
  const d = validar(Crear, req.body);
  const hash = await bcrypt.hash(d.contrasena, 10);

  const id = await transaccion(async (cx) => {
    const [existe] = await filas(cx, "SELECT 1 AS x FROM credenciales WHERE nombre_usuario = ?", [d.usuario]);
    if (existe) throw new ErrorApi(409, "estado_invalido", "Ya existe otro usuario con ese nombre de usuario.");
    try {
      const u = await ejecutar(cx, "INSERT INTO usuario (id_rol, nombre, correo) VALUES (?, ?, ?)", [
        await idRol(cx, d.rol),
        d.nombre,
        d.correo,
      ]);
      await ejecutar(cx, "INSERT INTO credenciales (id_usuario, nombre_usuario, password_hash) VALUES (?, ?, ?)", [
        u.insertId,
        d.usuario,
        hash,
      ]);
      await ejecutar(cx, "INSERT INTO perfil_usuario (id_usuario, telefono) VALUES (?, ?)", [
        u.insertId,
        d.telefono || null,
      ]);
      return u.insertId;
    } catch (e) {
      return traducirDuplicado(e);
    }
  });

  res.status(201).json(await cargarUsuario(pool, id));
});

const Editar = z
  .object({
    nombre: Texto(100),
    correo: Correo,
    usuario: NombreUsuario,
    rol: z.enum(ROLES),
    activo: z.boolean(),
    telefono: z.string().trim().max(20).nullable(),
  })
  .partial();

/**
 * PATCH /api/usuarios/:id  (cualquier subconjunto de campos)
 * Desactivar = `activo: false`. Los usuarios no se borran: tienen pedidos, ventas y cortes ligados (FK RESTRICT).
 * Reglas: el gerente no puede desactivarse ni quitarse el rol a sí mismo, y siempre debe quedar al menos un gerente activo.
 */
usuariosRouter.patch("/:id", async (req, res) => {
  const id = idDeRuta(req.params.id);
  const d = validar(Editar, req.body);
  if (Object.keys(d).length === 0) throw new ErrorApi(422, "estado_invalido", "No hay nada que cambiar.");

  await transaccion(async (cx) => {
    // FOR UPDATE: dos gerentes editando a la vez no pueden dejar el sistema sin gerente activo.
    const [actual] = await filas(
      cx,
      `SELECT u.activo, LOWER(r.nombre) AS rol FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ? FOR UPDATE`,
      [id],
    );
    if (!actual) throw new ErrorApi(404, "no_encontrado", "El usuario no existe.");

    const dejaDeSerGerenteActivo =
      Boolean(actual.activo) &&
      actual.rol === "gerente" &&
      ((d.activo !== undefined && !d.activo) || (d.rol !== undefined && d.rol !== "gerente"));

    if (dejaDeSerGerenteActivo) {
      if (id === req.usuario?.id) {
        throw new ErrorApi(409, "estado_invalido", "No puedes desactivarte ni cambiarte el rol a ti mismo.");
      }
      const [otros] = await filas(
        cx,
        `SELECT COUNT(*) AS n FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
          WHERE LOWER(r.nombre) = 'gerente' AND u.activo = TRUE AND u.id_usuario <> ?`,
        [id],
      );
      if (Number(otros?.n ?? 0) === 0) {
        throw new ErrorApi(409, "estado_invalido", "Debe quedar al menos un gerente activo.");
      }
    }

    try {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (d.nombre !== undefined) (sets.push("nombre = ?"), params.push(d.nombre));
      if (d.correo !== undefined) (sets.push("correo = ?"), params.push(d.correo));
      if (d.activo !== undefined) (sets.push("activo = ?"), params.push(d.activo));
      if (d.rol !== undefined) (sets.push("id_rol = ?"), params.push(await idRol(cx, d.rol)));
      if (sets.length > 0) await ejecutar(cx, `UPDATE usuario SET ${sets.join(", ")} WHERE id_usuario = ?`, [...params, id]);

      if (d.usuario !== undefined) {
        await ejecutar(cx, "UPDATE credenciales SET nombre_usuario = ? WHERE id_usuario = ?", [d.usuario, id]);
      }
      if (d.telefono !== undefined) {
        await ejecutar(
          cx,
          "INSERT INTO perfil_usuario (id_usuario, telefono) VALUES (?, ?) ON DUPLICATE KEY UPDATE telefono = VALUES(telefono)",
          [id, d.telefono || null],
        );
      }
    } catch (e) {
      traducirDuplicado(e);
    }
  });

  res.json(await cargarUsuario(pool, id));
});

const CambiarContrasena = z.object({ contrasena: Contrasena });

/** POST /api/usuarios/:id/contrasena  { contrasena }  →  { ok: true }. El gerente restablece la contraseña de cualquiera. */
usuariosRouter.post("/:id/contrasena", async (req, res) => {
  const id = idDeRuta(req.params.id);
  const { contrasena } = validar(CambiarContrasena, req.body);
  const hash = await bcrypt.hash(contrasena, 10);
  const r = await ejecutar(pool, "UPDATE credenciales SET password_hash = ? WHERE id_usuario = ?", [hash, id]);
  if (r.affectedRows === 0) throw new ErrorApi(404, "no_encontrado", "El usuario no existe.");
  res.json({ ok: true });
});
