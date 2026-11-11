
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { JWT_SECRET } from "../utils/config";
import { ejecutar, esDuplicado, filas, pool, transaccion } from "../services/db";
import { validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";

// Validaciones para registrar clientes
// (mismo formato de telefono que exige la hostess)
const RegistroCliente = z.object({
  nombre: z.string().trim().min(2).max(100),
  correo: z.string().trim().email().max(120),
  telefono: z.string().trim().regex(/^\d{10}$/, "el teléfono debe tener 10 dígitos"),
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
  const datos = validar(RegistroCliente, req.body);

  const correo = datos.correo.toLowerCase();

  const [existente] = await filas(
    pool,
    `SELECT c.id_cliente, c.telefono, cc.id_credencial
     FROM cliente c
     LEFT JOIN cliente_credencial cc
       ON cc.id_cliente = c.id_cliente
     WHERE c.correo = ?`,
    [correo]
  );

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
    "SELECT id_cliente FROM cliente WHERE telefono = ? AND id_cliente <> ? LIMIT 1",
    [datos.telefono, existente?.id_cliente ?? 0]
  );

  if (otroConTelefono) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      "Este teléfono ya está registrado con otro correo."
    );
  }

  const passwordHash = await bcrypt.hash(
    datos.contrasena,
    12
  );

  // Ambas inserciones se realizan en una transaccion.
  try {
    const idCliente = await transaccion(async (cx) => {
      if (existente) {
        // Reutiliza el cliente que capturo la hostess y conserva su historial.
        const id = existente.id_cliente as number;
        await ejecutar(cx, "UPDATE cliente SET telefono = ? WHERE id_cliente = ?", [datos.telefono, id]);
        await ejecutar(cx, "INSERT INTO cliente_credencial (id_cliente, password_hash) VALUES (?, ?)", [id, passwordHash]);
        return id;
      }
      const { insertId } = await ejecutar(
        cx,
        `INSERT INTO cliente
         (nombre, correo, telefono)
         VALUES (?, ?, ?)
         RETURNING id_cliente`,
        [datos.nombre, correo, datos.telefono]
      );
      await ejecutar(cx, "INSERT INTO cliente_credencial (id_cliente, password_hash) VALUES (?, ?)", [insertId, passwordHash]);
      return insertId;
    });

    res.status(201).json({
      mensaje: "Cuenta creada correctamente.",
      cliente: {
        id_cliente: idCliente,
        nombre: datos.nombre,
        correo,
      },
    });
  } catch (error) {
    if (esDuplicado(error)) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        "Este correo ya está registrado."
      );
    }

    throw error;
  }
};

// INICIAR SESION DEL CLIENTE
export const iniciarSesionCliente = async (
  req: Request,
  res: Response
) => {
  const datos = validar(LoginCliente, req.body);

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
