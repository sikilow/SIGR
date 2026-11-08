
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { JWT_SECRET } from "../utils/config";
import { filas, pool } from "../services/db";
import { ErrorApi } from "../utils/errores";

// Validaciones para registrar clientes
const RegistroCliente = z.object({
  nombre: z.string().trim().min(2).max(100),
  correo: z.string().trim().email().max(120),
  telefono: z.string().trim().max(20),
  contrasena: z.string().min(8).max(72),
});

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
  const datos = RegistroCliente.parse(req.body);

  const correo = datos.correo.toLowerCase();

  const [existente] = await filas(
    pool,
    "SELECT id_cliente FROM cliente WHERE correo = ?",
    [correo]
  );

  if (existente) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      "Este correo ya está registrado."
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

    const [resultado] = await conexion.execute(
      `INSERT INTO cliente
       (nombre, correo, telefono)
       VALUES (?, ?, ?)`,
      [datos.nombre, correo, datos.telefono]
    );

    const idCliente = (resultado as { insertId: number })
      .insertId;

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
  const datos = LoginCliente.parse(req.body);

  const [cliente] = await filas(
    pool,
    `SELECT
        c.id_cliente,
        c.nombre,
        c.correo,
        cc.password_hash
     FROM cliente c
     JOIN cliente_credencial cc
       ON cc.id_cliente = c.id_cliente
     WHERE c.correo = ?`,
    [datos.correo.toLowerCase()]
  );

  if (
    !cliente ||
    !(await bcrypt.compare(
      datos.contrasena,
      cliente.password_hash as string
    ))
  ) {
    throw new ErrorApi(
      401,
      "credenciales_invalidas",
      "Correo o contraseña incorrectos."
    );
  }

  const token = jwt.sign(
    {
      id: cliente.id_cliente,
      tipo: "cliente",
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    cliente: {
      id_cliente: cliente.id_cliente,
      nombre: cliente.nombre,
      correo: cliente.correo,
    },
  });
};
