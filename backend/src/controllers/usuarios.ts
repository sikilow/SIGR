import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { idDeRuta, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { correo, errorTelefonoLada, lada as ladaValida, LADA_MEXICO, nombrePersona, refinarTelefonoConLada, REGEX_USUARIO } from "../utils/campos";
import { enmascararCorreo } from "../services/correo";
import { enviarEnlaceRestablecer, MAXIMO_ENLACES_POR_HORA, origenApp } from "../services/restablecerContrasena";

// Todo este módulo es solo del gerente (se valida aquí, en el servidor, no en el front).

const ROLES = ["gerente", "mesero", "cocinero", "cajero", "hostess"] as const;
// `rol` llega como el nombre del catálogo ("Mesero") o en minúsculas ("mesero").
const Rol = z
  .string()
  .transform((r) => r.trim().toLowerCase())
  .pipe(z.enum(ROLES));

const Correo = correo;
const NombreUsuario = z
  .string()
  .trim()
  .min(3, "mínimo 3 caracteres")
  .max(60, "máximo 60 caracteres")
  .regex(REGEX_USUARIO, "solo letras, números, punto, guion y guion bajo");
// bcrypt solo usa los primeros 72 bytes: se limita para que no haya contraseñas "recortadas" sin avisar.
const Contrasena = z.string().min(6, "mínimo 6 caracteres").max(72, "máximo 72 caracteres");

/** Claves = columnas: usuario.*, credenciales.nombre_usuario/ultimo_acceso, perfil_usuario.telefono. `rol` es calculado (rol.nombre). */
export interface UsuarioAdminDto {
  id_usuario: number;
  es_primer_gerente: boolean;
  id_rol: number;
  nombre: string;
  correo: string;
  nombre_usuario: string;
  /** Calculado: rol.nombre (JOIN), p. ej. "Mesero". */
  rol: string;
  activo: boolean;
  telefono: string | null;
  /** perfil_usuario.lada: código de país del teléfono («52»). */
  lada: string;
  creado_en: string;
  ultimo_acceso: string | null;
  /** NULL = vigente; con fecha = eliminado (migración 027, solo se ve en «Eliminados»). */
  eliminado_en: string | null;
}

const SELECT_USUARIO = `
  SELECT u.id_usuario, u.id_rol, u.nombre, u.correo, c.nombre_usuario, r.nombre AS rol, u.activo,
         (u.id_usuario = (SELECT id_primer_gerente FROM configuracion_seguridad WHERE id = 1)) AS es_primer_gerente,
         p.telefono, p.lada, u.creado_en, c.ultimo_acceso,
         DATE_FORMAT(u.eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en
    FROM usuario u
    JOIN rol r ON r.id_rol = u.id_rol
    LEFT JOIN credenciales c ON c.id_usuario = u.id_usuario
    LEFT JOIN perfil_usuario p ON p.id_usuario = u.id_usuario`;

function aDto(r: Record<string, unknown>): UsuarioAdminDto {
  return {
    id_usuario: r.id_usuario as number,
    es_primer_gerente: Boolean(r.es_primer_gerente),
    id_rol: r.id_rol as number,
    nombre: r.nombre as string,
    correo: r.correo as string,
    nombre_usuario: (r.nombre_usuario as string | null) ?? "",
    rol: r.rol as string,
    activo: Boolean(r.activo),
    telefono: (r.telefono as string | null) ?? null,
    lada: (r.lada as string | null) ?? LADA_MEXICO,
    // DATETIME tal cual ("2026-10-15 16:34:00"); el pool usa dateStrings.
    creado_en: r.creado_en as string,
    ultimo_acceso: (r.ultimo_acceso as string | null) ?? null,
    eliminado_en: (r.eliminado_en as string | null) ?? null,
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
    const campo = texto.includes("telefono") ? "teléfono" : texto.includes("correo") ? "correo" : "nombre de usuario";
    throw new ErrorApi(409, "estado_invalido", `Ya existe otro usuario con ese ${campo}.`);
  }
  throw error;
}

/** GET /api/usuarios[?eliminados=1]  →  los usuarios vigentes (activos e inactivos), por nombre; o solo los eliminados. */
export const listarUsuarios = async (req: Request, res: Response) => {
  const eliminados = req.query.eliminados === "1" || req.query.eliminados === "true";
  const rows = await filas(
    pool,
    `${SELECT_USUARIO} WHERE u.eliminado_en IS ${eliminados ? "NOT NULL" : "NULL"} ORDER BY u.activo DESC, u.nombre`,
  );
  res.json(rows.map(aDto));
};

/**
 * Los datos únicos (correo, usuario, teléfono) siguen ocupados aunque el usuario esté eliminado. Si lo que se quiere
 * guardar choca con uno eliminado, se avisa que hay que restaurarlo en lugar de crear otro.
 */
async function exigirSinEliminadoIgual(
  ex: Ejecutor,
  datos: { correo?: string | undefined; nombre_usuario?: string | undefined; telefono?: string | null | undefined },
  idPropio = 0,
): Promise<void> {
  const [f] = await filas(
    ex,
    `SELECT u.id_usuario
       FROM usuario u
       LEFT JOIN credenciales c ON c.id_usuario = u.id_usuario
       LEFT JOIN perfil_usuario p ON p.id_usuario = u.id_usuario
      WHERE u.eliminado_en IS NOT NULL AND u.id_usuario <> ?
        AND (u.correo = ? OR c.nombre_usuario = ? OR (? <> '' AND p.telefono = ?))
      LIMIT 1`,
    [idPropio, datos.correo ?? "", datos.nombre_usuario ?? "", datos.telefono ?? "", datos.telefono ?? ""],
  );
  if (f) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      "Hay un usuario eliminado con ese correo, usuario o teléfono. Restáuralo desde «Eliminados» en lugar de crear otro.",
    );
  }
}

/**
 * Teléfono: opcional. Si se captura son solo dígitos y su cantidad depende de la lada (México: 10); no puede repetirse
 * entre usuarios (índice único uq_perfil_usuario_telefono). La cantidad se comprueba junto con la lada.
 */
const Telefono = z.string().trim().refine((t) => t === "" || /^\d+$/.test(t), "solo dígitos");

const Crear = z.object({
  nombre: nombrePersona(100),
  correo: Correo,
  nombre_usuario: NombreUsuario,
  contrasena: Contrasena,
  rol: Rol,
  telefono: Telefono.optional(),
  lada: ladaValida.optional(),
}).superRefine(refinarTelefonoConLada);

/** POST /api/usuarios  →  201 con el usuario creado. La contraseña se guarda con bcrypt. */
export const crearUsuario = async (req: Request, res: Response) => {
  const d = validar(Crear, req.body);
  const hash = await bcrypt.hash(d.contrasena, 10);

  const id = await transaccion(async (cx) => {
    await exigirSinEliminadoIgual(cx, d);
    const [existe] = await filas(cx, "SELECT 1 AS x FROM credenciales WHERE nombre_usuario = ?", [d.nombre_usuario]);
    if (existe) throw new ErrorApi(409, "estado_invalido", "Ya existe otro usuario con ese nombre de usuario.");
    try {
      const u = await ejecutar(cx, "INSERT INTO usuario (id_rol, nombre, correo) VALUES (?, ?, ?)", [
        await idRol(cx, d.rol),
        d.nombre,
        d.correo,
      ]);
      await ejecutar(cx, "INSERT INTO credenciales (id_usuario, nombre_usuario, password_hash) VALUES (?, ?, ?)", [
        u.insertId,
        d.nombre_usuario,
        hash,
      ]);
      await ejecutar(cx, "INSERT INTO perfil_usuario (id_usuario, telefono, lada) VALUES (?, ?, ?)", [
        u.insertId,
        d.telefono || null,
        d.lada ?? LADA_MEXICO,
      ]);
      return u.insertId;
    } catch (e) {
      return traducirDuplicado(e);
    }
  });

  res.status(201).json(await cargarUsuario(pool, id));
};

const Editar = z
  .object({
    nombre: nombrePersona(100),
    correo: Correo,
    nombre_usuario: NombreUsuario,
    rol: Rol,
    activo: z.boolean(),
    telefono: Telefono.nullable(),
    lada: ladaValida,
  })
  .partial();

/**
 * PATCH /api/usuarios/:id  (cualquier subconjunto de campos)
 * Desactivar = `activo: false`. Los usuarios no se borran: tienen pedidos, ventas y cortes ligados (FK RESTRICT).
 * Reglas: el gerente no puede desactivarse ni quitarse el rol a sí mismo, y siempre debe quedar al menos un gerente activo.
 */
export const editarUsuario = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const d = validar(Editar, req.body);
  if (Object.keys(d).length === 0) throw new ErrorApi(422, "estado_invalido", "No hay nada que cambiar.");

  await transaccion(async (cx) => {
    // FOR UPDATE: dos gerentes editando a la vez no pueden dejar el sistema sin gerente activo.
    const [actual] = await filas(
      cx,
      `SELECT u.activo, u.eliminado_en, LOWER(r.nombre) AS rol,
              (u.id_usuario = (SELECT id_primer_gerente FROM configuracion_seguridad WHERE id = 1)) AS es_primer_gerente
         FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ? FOR UPDATE`,
      [id],
    );
    if (!actual) throw new ErrorApi(404, "no_encontrado", "El usuario no existe.");
    if (actual.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El usuario está eliminado. Restáuralo para poder editarlo.");
    await exigirSinEliminadoIgual(cx, { correo: d.correo, nombre_usuario: d.nombre_usuario, telefono: d.telefono }, id);

    // El teléfono y la lada se validan juntos; si solo llega uno, se toma el otro de lo guardado.
    if (d.telefono !== undefined || d.lada !== undefined) {
      const [perfil] = await filas(cx, "SELECT telefono, lada FROM perfil_usuario WHERE id_usuario = ?", [id]);
      const telefonoFinal = d.telefono !== undefined ? d.telefono : ((perfil?.telefono as string | null) ?? "");
      const ladaFinal = d.lada ?? ((perfil?.lada as string | null) ?? LADA_MEXICO);
      const mensaje = telefonoFinal ? errorTelefonoLada(ladaFinal, telefonoFinal) : null;
      if (mensaje) throw new ErrorApi(422, "estado_invalido", `Datos inválidos (telefono: ${mensaje}).`);
    }

    if (
      Boolean(actual.es_primer_gerente) &&
      ((d.activo !== undefined && !d.activo) || (d.rol !== undefined && d.rol !== "gerente"))
    ) {
      throw new ErrorApi(409, "estado_invalido", "El primer gerente no se puede desactivar ni cambiar de rol.");
    }

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

      if (d.nombre_usuario !== undefined) {
        await ejecutar(cx, "UPDATE credenciales SET nombre_usuario = ? WHERE id_usuario = ?", [d.nombre_usuario, id]);
      }
      if (d.telefono !== undefined) {
        await ejecutar(
          cx,
          "INSERT INTO perfil_usuario (id_usuario, telefono) VALUES (?, ?) ON DUPLICATE KEY UPDATE telefono = VALUES(telefono)",
          [id, d.telefono || null],
        );
      }
      if (d.lada !== undefined) {
        await ejecutar(
          cx,
          "INSERT INTO perfil_usuario (id_usuario, lada) VALUES (?, ?) ON DUPLICATE KEY UPDATE lada = VALUES(lada)",
          [id, d.lada],
        );
      }
    } catch (e) {
      traducirDuplicado(e);
    }
  });

  res.json(await cargarUsuario(pool, id));
};

const CambiarContrasena = z.object({
  contrasena: Contrasena,
  contrasena_actual: z.string().min(1),
});

/** POST /api/usuarios/:id/contrasena: Gerencia inicia el cambio y el usuario afectado verifica su contraseña actual. */
export const cambiarContrasena = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { contrasena, contrasena_actual } = validar(CambiarContrasena, req.body);
  const hash = await bcrypt.hash(contrasena, 10);
  await transaccion(async (cx) => {
    const [fila] = await filas(cx, "SELECT password_hash FROM credenciales WHERE id_usuario = ? FOR UPDATE", [id]);
    if (!fila) throw new ErrorApi(404, "no_encontrado", "El usuario no existe.");
    if (!(await bcrypt.compare(contrasena_actual, fila.password_hash as string))) {
      throw new ErrorApi(401, "credenciales_invalidas", "La contraseña anterior del usuario es incorrecta.");
    }
    await ejecutar(cx, "UPDATE credenciales SET password_hash = ? WHERE id_usuario = ?", [hash, id]);
  });
  res.json({ ok: true });
};

/**
 * POST /api/usuarios/:id/restablecer  →  { ok: true, correo: "c***@dominio" }
 * El gerente manda al empleado un enlace de un solo uso para que él mismo cree su contraseña nueva.
 * El gerente nunca ve ni escribe la contraseña.
 */
export const enviarRestablecimiento = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const [destino] = await filas(
    pool,
    `SELECT u.id_usuario, u.nombre, u.correo, u.activo, u.eliminado_en, c.nombre_usuario
       FROM usuario u JOIN credenciales c ON c.id_usuario = u.id_usuario
      WHERE u.id_usuario = ?`,
    [id],
  );
  if (!destino) throw new ErrorApi(404, "no_encontrado", "El usuario no existe.");
  if (destino.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El usuario está eliminado. Restáuralo antes de restablecer su contraseña.");
  if (!destino.activo) {
    throw new ErrorApi(409, "estado_invalido", "El usuario está inactivo. Actívalo antes de restablecer su contraseña.");
  }
  const resultado = await enviarEnlaceRestablecer(
    {
      id_usuario: destino.id_usuario as number,
      nombre: destino.nombre as string,
      correo: destino.correo as string,
      nombre_usuario: destino.nombre_usuario as string,
    },
    origenApp(req),
    req.usuario?.id ?? null,
  );
  if (resultado === "limite") {
    throw new ErrorApi(
      429,
      "estado_invalido",
      `Ya se enviaron ${MAXIMO_ENLACES_POR_HORA} enlaces a este usuario en la última hora. Pídele que revise su correo (también spam).`,
    );
  }
  if (resultado === "fallo") {
    throw new ErrorApi(502, "correo_no_enviado", "No se pudo enviar el correo. Revisa que el correo del usuario sea correcto y la configuración de correo del servidor.");
  }
  res.json({ ok: true, correo: enmascararCorreo(destino.correo as string) });
};

/**
 * DELETE /api/usuarios/:id  →  el usuario, ya eliminado.
 * «Eliminar» es lógico (migración 027): el usuario deja de mostrarse y de poder entrar (su sesión se rechaza de
 * inmediato), pero se conserva para el historial (pedidos, ventas y cortes siguen mostrando su nombre). Queda además
 * desactivado. No puedes eliminarte a ti mismo, ni al primer gerente, ni al último gerente activo.
 * Se restaura con POST /usuarios/:id/restaurar (vuelve inactivo: hay que activarlo).
 */
export const eliminarUsuario = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [u] = await filas(
      cx,
      `SELECT u.activo, u.eliminado_en, LOWER(r.nombre) AS rol,
              (u.id_usuario = (SELECT id_primer_gerente FROM configuracion_seguridad WHERE id = 1)) AS es_primer_gerente
         FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ? FOR UPDATE`,
      [id],
    );
    if (!u) throw new ErrorApi(404, "no_encontrado", "El usuario no existe.");
    if (u.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El usuario ya está eliminado.");
    if (req.usuario?.id === id) throw new ErrorApi(409, "estado_invalido", "No puedes eliminar tu propio usuario.");
    if (Boolean(u.es_primer_gerente)) throw new ErrorApi(409, "estado_invalido", "El primer gerente no se puede eliminar.");

    if (u.rol === "gerente" && Boolean(u.activo)) {
      const [otros] = await filas(
        cx,
        `SELECT COUNT(*) AS n FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
          WHERE LOWER(r.nombre) = 'gerente' AND u.activo = TRUE AND u.eliminado_en IS NULL AND u.id_usuario <> ?`,
        [id],
      );
      if (Number(otros?.n ?? 0) === 0) throw new ErrorApi(409, "estado_invalido", "Debe quedar al menos un gerente activo.");
    }

    await ejecutar(
      cx,
      "UPDATE usuario SET activo = FALSE, eliminado_en = NOW(), eliminado_por = ? WHERE id_usuario = ? AND eliminado_en IS NULL",
      [req.usuario?.id ?? null, id],
    );
  });
  res.json(await cargarUsuario(pool, id));
};

/** POST /api/usuarios/:id/restaurar  →  el usuario vigente otra vez, pero inactivo (el gerente lo activa cuando quiera). */
export const restaurarUsuario = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const u = await cargarUsuario(pool, id);
  if (!u) throw new ErrorApi(404, "no_encontrado", "El usuario no existe.");
  if (!u.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El usuario no está eliminado.");
  await ejecutar(pool, "UPDATE usuario SET eliminado_en = NULL, eliminado_por = NULL WHERE id_usuario = ?", [id]);
  res.json(await cargarUsuario(pool, id));
};
