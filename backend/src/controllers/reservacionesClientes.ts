
import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";

// Validaciones del formulario
const NuevaReservacionCliente = z.object({
  fecha_hora: z.string().regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    "Formato de fecha y hora incorrecto."
  ),
  personas: z.number().int().min(1).max(20),
}).strict();


function fechaValida(valor: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(valor);

  if (!partes) return false;

  const [anio, mes, dia, hora, minuto, segundo] =
    partes.slice(1).map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number
    ];

  if (anio < 1000) return false;

  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia, hora, minuto, segundo)
  );

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia &&
    fecha.getUTCHours() === hora &&
    fecha.getUTCMinutes() === minuto &&
    fecha.getUTCSeconds() === segundo
  );
}


// CREAR SOLICITUD DE RESERVACION
export const crearReservacionCliente = async (
  req: Request,
  res: Response
) => {
  const idCliente = req.clienteId;

  if (!idCliente) {
    throw new ErrorApi(
      401,
      "no_autenticado",
      "Debes iniciar sesión."
    );
  }

  const datos = validar(
    NuevaReservacionCliente,
    req.body ?? {}
  );

  if (!fechaValida(datos.fecha_hora)) {
    throw new ErrorApi(
      422,
      "estado_invalido",
      "Selecciona una fecha válida."
    );
  }

  const reservacion = await transaccion(async (cx) => {
    // Verificar fecha contra la hora de MySQL
    const [fecha] = await filas(
      cx,
      `SELECT
         ? < NOW() AS pasada,
         ? > DATE_ADD(NOW(), INTERVAL 365 DAY) AS lejana`,
      [datos.fecha_hora, datos.fecha_hora]
    );

    if (!fecha ||
        Number(fecha.pasada) === 1 ||
        Number(fecha.lejana) === 1) {
      throw new ErrorApi(
        422,
        "estado_invalido",
        "La fecha debe ser futura y no superar un año."
      );
    }

    // No permitir la misma solicitud activa duplicada
    const [duplicada] = await filas(
      cx,
      `SELECT id_reservacion
       FROM reservacion
       WHERE id_cliente = ?
         AND fecha_hora = ?
         AND estado IN ('pendiente', 'confirmada')
       LIMIT 1`,
      [idCliente, datos.fecha_hora]
    );

    if (duplicada) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        "Ya tienes una reservación para esa fecha y hora."
      );
    }

    // La mesa sera asignada por Hostess.
    const resultado = await ejecutar(
      cx,
      `INSERT INTO reservacion
       (id_cliente, id_mesa, fecha_hora, personas, estado)
       VALUES (?, NULL, ?, ?, 'pendiente')`,
      [idCliente, datos.fecha_hora, datos.personas]
    );

    const [nueva] = await filas(
      cx,
      `SELECT id_reservacion, id_cliente,
              fecha_hora, personas, estado
       FROM reservacion
       WHERE id_reservacion = ?`,
      [resultado.insertId]
    );

    return nueva;
  });

  res.status(201).json({
    mensaje: "Solicitud de reservación registrada. Pendiente de confirmación.",
    reservacion,
  });
};

// CONSULTAR SOLO MIS RESERVACIONES
export const listarMisReservaciones = async (
  req: Request,
  res: Response
) => {
  const idCliente = req.clienteId;

  if (!idCliente) {
    throw new ErrorApi(
      401,
      "no_autenticado",
      "Debes iniciar sesión."
    );
  }

  const reservaciones = await filas(
    pool,
    `SELECT
       r.id_reservacion,
       r.fecha_hora,
       r.personas,
       r.estado,
       m.numero AS mesa_numero
     FROM reservacion r
     LEFT JOIN mesa m
       ON m.id_mesa = r.id_mesa
     WHERE r.id_cliente = ?
     ORDER BY r.fecha_hora DESC`,
    [idCliente]
  );

  res.json(reservaciones);
};
