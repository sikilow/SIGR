
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config";
import { ErrorApi } from "./errores";
import { filas, pool } from "../services/db";

declare global {
  namespace Express {
    interface Request {
      clienteId?: number;
    }
  }
}

// Verifica que el token pertenezca a un cliente real.
export const requiereCliente: RequestHandler = async (
  req,
  _res,
  next
) => {
  const cabecera = req.headers.authorization;

  if (!cabecera?.startsWith("Bearer ")) {
    throw new ErrorApi(
      401,
      "no_autenticado",
      "Debes iniciar sesión para reservar."
    );
  }

  let payload: string | jwt.JwtPayload;

  try {
    payload = jwt.verify(
      cabecera.slice(7),
      JWT_SECRET
    );
  } catch {
    throw new ErrorApi(
      401,
      "no_autenticado",
      "Tu sesión no es válida o ha vencido."
    );
  }

  // Solo se aceptan tokens de clientes.
  if (
    typeof payload === "string" ||
    payload.tipo !== "cliente" ||
    typeof payload.id !== "number" ||
    !Number.isSafeInteger(payload.id) ||
    payload.id <= 0
  ) {
    throw new ErrorApi(
      403,
      "sin_permiso",
      "Esta función es exclusiva para clientes."
    );
  }

  // Comprueba que la cuenta todavía exista en MySQL.
  const [cliente] = await filas(
    pool,
    `SELECT c.id_cliente
     FROM cliente c
     JOIN cliente_credencial cc
       ON cc.id_cliente = c.id_cliente
     WHERE c.id_cliente = ?`,
    [payload.id]
  );

  if (!cliente) {
    throw new ErrorApi(
      401,
      "no_autenticado",
      "La cuenta del cliente ya no existe."
    );
  }

  // El ID proviene del token verificado,
  // nunca de los datos enviados en el formulario.
  req.clienteId = payload.id;

  next();
};
