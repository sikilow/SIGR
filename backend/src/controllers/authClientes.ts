
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { JWT_SECRET } from "../utils/config";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { googleHabilitado, verificarTokenGoogle } from "../services/google";
import { GOOGLE_CLIENT_ID } from "../utils/config";
import { validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { exigirAccesoNoBloqueado, ipDe, registrarAcceso, registrarIntentoFallido } from "../services/seguridadAcceso";
import { Contrasena } from "../utils/contrasenas";
import { correo as correoValido, lada as ladaValida, LADA_MEXICO, limpiarNombrePersona, nombrePersona, refinarTelefonoConLada, telefono as telefonoValido } from "../utils/campos";

const MENSAJE_CUENTA_ELIMINADA = "Esta cuenta ya no está activa. Si crees que es un error, consulta con el restaurante.";

/** Hash de relleno: si el correo no existe se compara contra él, para que tardar lo mismo no delate qué correos hay. */
const HASH_RELLENO = bcrypt.hashSync("relleno-sin-cuenta", 10);

// Validaciones para registrar clientes
// (mismo formato de telefono que exige la hostess)
const RegistroCliente = z.object({
  nombre: nombrePersona(100).min(2, "mínimo 2 letras"),
  correo: correoValido,
  telefono: telefonoValido,
  lada: ladaValida.optional(),
  contrasena: Contrasena,
}).superRefine(refinarTelefonoConLada);

// Validaciones de inicio de sesion
const LoginCliente = z.object({
  correo: z.string().trim().email(),
  contrasena: z.string().min(1),
});

// REGISTRAR CLIENTE
export const registrarCuentaCliente = async (
  req: Request,
  res: Response
) => {
  const datos = validar(RegistroCliente, req.body);

  const correo = datos.correo.toLowerCase();

  const [existente] = await filas(
    pool,
    `SELECT c.id_cliente, c.telefono, c.eliminado_en, cc.id_credencial
     FROM cliente c
     LEFT JOIN cliente_credencial cc
       ON cc.id_cliente = c.id_cliente
     WHERE c.correo = ?`,
    [correo]
  );

  if (existente?.eliminado_en) {
    throw new ErrorApi(409, "estado_invalido", MENSAJE_CUENTA_ELIMINADA);
  }

  if (existente?.id_credencial) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      "Este correo ya tiene una cuenta. Inicia sesión."
    );
  }

  // Si la hostess ya registro a este cliente, la cuenta solo se crea
  // cuando el telefono coincide con el que dio en el restaurante.
  if (existente?.telefono && existente.telefono !== datos.telefono) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      "Ya tienes un registro en el restaurante con este correo. Usa el teléfono que diste ahí."
    );
  }

  const [otroConTelefono] = await filas(
    pool,
    "SELECT id_cliente, eliminado_en FROM cliente WHERE telefono = ? AND lada = ? AND id_cliente <> ? LIMIT 1",
    [datos.telefono, datos.lada ?? LADA_MEXICO, existente?.id_cliente ?? 0]
  );

  if (otroConTelefono) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      otroConTelefono.eliminado_en ? MENSAJE_CUENTA_ELIMINADA : "Este teléfono ya está registrado con otro correo."
    );
  }

  const passwordHash = await bcrypt.hash(
    datos.contrasena,
    12
  );

  // Ambas inserciones se realizan en una transaccion.
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    let idCliente: number;

    if (existente) {
      // Reutiliza el cliente que capturo la hostess y conserva su historial.
      idCliente = existente.id_cliente as number;

      await conexion.execute(
        "UPDATE cliente SET telefono = ?, lada = ? WHERE id_cliente = ?",
        [datos.telefono, datos.lada ?? LADA_MEXICO, idCliente]
      );
    } else {
      const [resultado] = await conexion.execute(
        `INSERT INTO cliente
         (nombre, correo, telefono, lada)
         VALUES (?, ?, ?, ?)`,
        [datos.nombre, correo, datos.telefono, datos.lada ?? LADA_MEXICO]
      );

      idCliente = (resultado as { insertId: number })
        .insertId;
    }

    await conexion.execute(
      `INSERT INTO cliente_credencial
       (id_cliente, password_hash)
       VALUES (?, ?)`,
      [idCliente, passwordHash]
    );

    await conexion.commit();

    res.status(201).json({
      mensaje: "Cuenta creada correctamente.",
      cliente: {
        id_cliente: idCliente,
        nombre: datos.nombre,
        correo,
      },
    });
  } catch (error) {
    await conexion.rollback();

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    ) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        "Este correo ya está registrado."
      );
    }

    throw error;
  } finally {
    conexion.release();
  }
};

// INICIAR SESION DEL CLIENTE
export const iniciarSesionCliente = async (
  req: Request,
  res: Response
) => {
  const datos = validar(LoginCliente, req.body);
  const ip = ipDe(req);
  await exigirAccesoNoBloqueado("cliente", datos.correo, ip);

  const [cliente] = await filas(
    pool,
    `SELECT
        c.id_cliente,
        c.nombre,
        c.correo,
        c.eliminado_en,
        cc.password_hash
     FROM cliente c
     JOIN cliente_credencial cc
       ON cc.id_cliente = c.id_cliente
     WHERE c.correo = ?`,
    [datos.correo.toLowerCase()]
  );

  // Una cuenta creada con Google no tiene contraseña: se le indica el camino correcto.
  if (cliente && !cliente.password_hash) {
    await registrarIntentoFallido("cliente", datos.correo, ip, "cuenta de Google sin contraseña");
    throw new ErrorApi(
      401,
      "credenciales_invalidas",
      "Esta cuenta se creó con Google. Usa el botón «Iniciar sesión con Google»."
    );
  }

  const correcta = await bcrypt.compare(datos.contrasena, cliente ? (cliente.password_hash as string) : HASH_RELLENO);
  if (!cliente || !correcta) {
    await registrarIntentoFallido("cliente", datos.correo, ip, cliente ? "contraseña incorrecta" : "correo desconocido");
    throw new ErrorApi(
      401,
      "credenciales_invalidas",
      "Correo o contraseña incorrectos."
    );
  }

  // La contraseña ya es correcta: ahora sí se avisa que la cuenta fue dada de baja (así no se revela qué correos existen).
  if (cliente.eliminado_en) throw new ErrorApi(401, "no_autenticado", MENSAJE_CUENTA_ELIMINADA);

  await registrarAcceso({ ambito: "cliente", identificador: datos.correo, resultado: "ok", ip });
  res.json(sesionCliente(cliente));
};

/** Sesión del portal: el mismo token de 8 horas para contraseña y para Google. */
function sesionCliente(cliente: Record<string, unknown>) {
  const token = jwt.sign({ id: cliente.id_cliente, tipo: "cliente" }, JWT_SECRET, { expiresIn: "8h" });
  return {
    token,
    cliente: {
      id_cliente: cliente.id_cliente,
      nombre: cliente.nombre,
      correo: cliente.correo,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// ACCESO CON GOOGLE
// ---------------------------------------------------------------------------------------------------------------

/** GET /api/auth-clientes/google/config: el ID de cliente (público) para dibujar el botón; null = desactivado. */
export const configuracionGoogle = (_req: Request, res: Response) => {
  res.json({ habilitado: googleHabilitado(), client_id: googleHabilitado() ? GOOGLE_CLIENT_ID : null });
};

const CredencialGoogle = z.object({ credential: z.string().min(20).max(4000) }).strict();

/**
 * POST /api/auth-clientes/google  { credential }
 * La persona eligió su cuenta de Google. El servidor verifica el token con Google y:
 *  - si esa cuenta de Google ya está ligada a un cliente → inicia sesión;
 *  - si ya hay un cliente con ese correo y contraseña propia → liga la cuenta de Google (el correo está verificado por
 *    Google, así que es la misma persona) e inicia sesión;
 *  - si es nueva (o la registró la hostess sin cuenta) → pide el teléfono: responde `requiere_telefono` con un
 *    `token_registro` de 15 minutos para el siguiente paso.
 */
export const iniciarSesionConGoogle = async (req: Request, res: Response) => {
  const { credential } = validar(CredencialGoogle, req.body ?? {});
  const identidad = await verificarTokenGoogle(credential);
  if (!identidad.correoVerificado) {
    throw new ErrorApi(401, "credenciales_invalidas", "Tu cuenta de Google no tiene el correo verificado.");
  }

  // 1) Cuenta de Google ya ligada.
  const [ligada] = await filas(
    pool,
    `SELECT c.id_cliente, c.nombre, c.correo, c.eliminado_en
       FROM cliente_credencial cc JOIN cliente c ON c.id_cliente = cc.id_cliente
      WHERE cc.google_sub = ?`,
    [identidad.sub]
  );
  if (ligada) {
    if (ligada.eliminado_en) throw new ErrorApi(401, "no_autenticado", MENSAJE_CUENTA_ELIMINADA);
    res.json(sesionCliente(ligada));
    return;
  }

  // 2) Mismo correo con cuenta de contraseña: se liga Google a esa cuenta.
  const [conCuenta] = await filas(
    pool,
    `SELECT c.id_cliente, c.nombre, c.correo, c.eliminado_en, cc.id_credencial, cc.google_sub
       FROM cliente c JOIN cliente_credencial cc ON cc.id_cliente = c.id_cliente
      WHERE c.correo = ?`,
    [identidad.correo]
  );
  if (conCuenta) {
    if (conCuenta.eliminado_en) throw new ErrorApi(401, "no_autenticado", MENSAJE_CUENTA_ELIMINADA);
    if (conCuenta.google_sub) {
      throw new ErrorApi(409, "estado_invalido", "Este correo ya está ligado a otra cuenta de Google.");
    }
    await ejecutar(pool, "UPDATE cliente_credencial SET google_sub = ? WHERE id_credencial = ?", [
      identidad.sub,
      conCuenta.id_credencial,
    ]);
    res.json(sesionCliente(conCuenta));
    return;
  }

  // 3) Cuenta nueva (o cliente que solo tiene registro de la hostess): falta el teléfono.
  const tokenRegistro = jwt.sign(
    { tipo: "registro_google", sub: identidad.sub, correo: identidad.correo, nombre: identidad.nombre },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
  res.json({
    requiere_telefono: true,
    token_registro: tokenRegistro,
    nombre: limpiarNombrePersona(identidad.nombre, identidad.correo),
    correo: identidad.correo,
  });
};

const CompletarGoogle = z
  .object({
    token_registro: z.string().min(20).max(4000),
    telefono: telefonoValido,
    lada: ladaValida.optional(),
    nombre: nombrePersona(100).min(2, "mínimo 2 letras").optional(),
  })
  .strict()
  .superRefine(refinarTelefonoConLada);

/**
 * POST /api/auth-clientes/google/completar  { token_registro, telefono, nombre? }
 * Segundo paso de una cuenta nueva con Google: guarda el teléfono y crea la cuenta (sin contraseña). Si la hostess ya
 * había registrado a la persona con ese correo, solo se liga si el teléfono coincide con el que dio en el restaurante.
 */
export const completarRegistroGoogle = async (req: Request, res: Response) => {
  const datos = validar(CompletarGoogle, req.body ?? {});

  let registro: { sub: string; correo: string; nombre: string };
  try {
    const payload = jwt.verify(datos.token_registro, JWT_SECRET);
    if (
      typeof payload === "string" ||
      payload.tipo !== "registro_google" ||
      typeof payload.sub !== "string" ||
      typeof payload.correo !== "string"
    ) {
      throw new Error("token de otro tipo");
    }
    registro = { sub: payload.sub, correo: payload.correo, nombre: limpiarNombrePersona(String(payload.nombre ?? ""), payload.correo) };
  } catch {
    throw new ErrorApi(401, "no_autenticado", "El registro con Google venció. Vuelve a elegir tu cuenta.");
  }

  const nombre = datos.nombre ?? registro.nombre;

  const cliente = await transaccion(async (cx) => {
    const [existente] = await filas(
      cx,
      `SELECT c.id_cliente, c.nombre, c.telefono, c.eliminado_en, cc.id_credencial
         FROM cliente c LEFT JOIN cliente_credencial cc ON cc.id_cliente = c.id_cliente
        WHERE c.correo = ? FOR UPDATE`,
      [registro.correo]
    );
    if (existente?.eliminado_en) throw new ErrorApi(409, "estado_invalido", MENSAJE_CUENTA_ELIMINADA);
    if (existente?.id_credencial) {
      throw new ErrorApi(409, "estado_invalido", "Este correo ya tiene una cuenta. Inicia sesión.");
    }
    if (existente?.telefono && existente.telefono !== datos.telefono) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        "Ya tienes un registro en el restaurante con este correo. Usa el teléfono que diste ahí."
      );
    }
    const [otroConTelefono] = await filas(
      cx,
      "SELECT id_cliente, eliminado_en FROM cliente WHERE telefono = ? AND lada = ? AND id_cliente <> ? LIMIT 1",
      [datos.telefono, datos.lada ?? LADA_MEXICO, existente?.id_cliente ?? 0]
    );
    if (otroConTelefono) {
      throw new ErrorApi(409, "estado_invalido", otroConTelefono.eliminado_en ? MENSAJE_CUENTA_ELIMINADA : "Este teléfono ya está registrado con otro correo.");
    }

    let idCliente: number;
    let nombreFinal = nombre;
    if (existente) {
      // Reutiliza el cliente que capturó la hostess y conserva su historial.
      idCliente = existente.id_cliente as number;
      nombreFinal = String(existente.nombre);
      await ejecutar(cx, "UPDATE cliente SET telefono = ?, lada = ? WHERE id_cliente = ?", [datos.telefono, datos.lada ?? LADA_MEXICO, idCliente]);
    } else {
      idCliente = (
        await ejecutar(cx, "INSERT INTO cliente (nombre, correo, telefono, lada) VALUES (?, ?, ?, ?)", [
          nombre,
          registro.correo,
          datos.telefono,
          datos.lada ?? LADA_MEXICO,
        ])
      ).insertId;
    }
    try {
      await ejecutar(cx, "INSERT INTO cliente_credencial (id_cliente, google_sub) VALUES (?, ?)", [idCliente, registro.sub]);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
        throw new ErrorApi(409, "estado_invalido", "Esta cuenta de Google ya está registrada. Inicia sesión.");
      }
      throw error;
    }
    return { id_cliente: idCliente, nombre: nombreFinal, correo: registro.correo };
  });

  res.status(201).json(sesionCliente(cliente));
};
