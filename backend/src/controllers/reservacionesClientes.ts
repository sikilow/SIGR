
import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { exigirAnticipacionMinima, validar } from "../models/dominio";
import { exigirMesaDisponible } from "../services/disponibilidadReservacion";
import { encolarNotificacionReservacion, solicitarProcesamientoReservaciones } from "../services/notificacionesReservacion";
import { ErrorApi } from "../utils/errores";
import { CamposPreferencias, normalizarPreferencias } from "./hostess";
import { cargarHorario, exigirHorarioReservacion } from "../models/horarioReservacion";
import { conCaracteristicasPedidas, guardarCaracteristicasReservacion } from "../models/caracteristicasMesa";

// Validaciones del formulario
const NuevaReservacionCliente = z.object({
  fecha_hora: z.string().regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    "Formato de fecha y hora incorrecto."
  ),
  personas: z.number().int().min(1).max(20),
  // Preferencias de mesa (opcionales): la hostess las ve al confirmar y al sentar al grupo.
  ...CamposPreferencias,
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
    await exigirAnticipacionMinima(cx, datos.fecha_hora);
    // El portal solo acepta las horas que ofrece (día abierto, dentro del horario y en el intervalo).
    await exigirHorarioReservacion(cx, datos.fecha_hora, true);
    // Una solicitud solo se acepta si hay una mesa posible para ese grupo a esa hora.
    await exigirMesaDisponible(cx, { fechaHora: datos.fecha_hora, personas: datos.personas });

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
    const pref = normalizarPreferencias(datos);
    const resultado = await ejecutar(
      cx,
      `INSERT INTO reservacion
       (id_cliente, id_mesa, fecha_hora, personas, estado, pref_zona)
       VALUES (?, NULL, ?, ?, 'pendiente', ?)`,
      [idCliente, datos.fecha_hora, datos.personas, pref.pref_zona]
    );
    await guardarCaracteristicasReservacion(cx, resultado.insertId, datos.pref_caracteristicas ?? []);

    const [nueva] = await filas(
      cx,
      `SELECT id_reservacion, id_cliente,
              fecha_hora, personas, estado,
              pref_zona
       FROM reservacion
       WHERE id_reservacion = ?`,
      [resultado.insertId]
    );

    // Aviso de «solicitud recibida»: no promete mesa, la confirma después la hostess.
    const [cliente] = await filas(cx, "SELECT correo FROM cliente WHERE id_cliente = ?", [idCliente]);
    await encolarNotificacionReservacion(
      cx,
      { id_reservacion: resultado.insertId, cliente_correo: (cliente?.correo as string | null) ?? null } as never,
      "confirmacion",
      "creada",
    );

    const [conCaracteristicas] = nueva ? await conCaracteristicasPedidas(cx, [nueva]) : [nueva];
    return conCaracteristicas;
  });
  solicitarProcesamientoReservaciones();

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
       r.pref_zona,
       m.numero AS mesa_numero
     FROM reservacion r
     LEFT JOIN mesa m
       ON m.id_mesa = r.id_mesa
     WHERE r.id_cliente = ?
     ORDER BY r.fecha_hora DESC`,
    [idCliente]
  );

  res.json(await conCaracteristicasPedidas(pool, reservaciones));
};

/**
 * GET /api/reservaciones-clientes/opciones-mesa: lo que el cliente puede pedir al reservar.
 *   - `secciones`: cada sección activa del salón (no las de «para llevar») con cuántas mesas tiene, para cuántas
 *     personas es la más grande y qué características (ids) tiene alguna de sus mesas.
 *   - `caracteristicas`: las características ACTIVAS del catálogo de Gerencia que tiene al menos una mesa del salón.
 * No dice qué mesas están libres ni reserva ninguna: la mesa la asigna la hostess.
 */
export const opcionesMesaCliente = async (_req: Request, res: Response) => {
  const secciones = await filas(
    pool,
    `SELECT s.nombre AS seccion, COUNT(m.id_mesa) AS mesas, MAX(m.capacidad) AS capacidad_maxima
       FROM seccion s
       JOIN mesa m ON m.zona = s.nombre AND m.activa = 1
      WHERE s.activa = 1 AND s.es_para_llevar = 0
      GROUP BY s.nombre
      ORDER BY s.nombre`,
  );
  const enSecciones = await filas(
    pool,
    `SELECT DISTINCT m.zona AS seccion, c.id_caracteristica, c.nombre
       FROM mesa m
       JOIN seccion s ON s.nombre = m.zona AND s.activa = 1 AND s.es_para_llevar = 0
       JOIN mesa_caracteristica mc ON mc.id_mesa = m.id_mesa
       JOIN caracteristica_mesa c ON c.id_caracteristica = mc.id_caracteristica AND c.activa = 1
      WHERE m.activa = 1
      ORDER BY c.nombre`,
  );
  const catalogo = new Map<number, string>();
  for (const f of enSecciones) catalogo.set(Number(f.id_caracteristica), String(f.nombre));
  res.json({
    secciones: secciones.map((s) => ({
      seccion: s.seccion as string,
      mesas: Number(s.mesas),
      capacidad_maxima: Number(s.capacidad_maxima),
      caracteristicas: enSecciones.filter((f) => f.seccion === s.seccion).map((f) => Number(f.id_caracteristica)),
    })),
    caracteristicas: [...catalogo.entries()].map(([id_caracteristica, nombre]) => ({ id_caracteristica, nombre })),
  });
};

/**
 * GET /api/reservaciones-clientes/horario: con qué horas arma el portal la lista para reservar (lo configura Gerencia):
 * primera y última hora, intervalo, días abiertos y anticipación mínima.
 */
export const horarioClientes = async (_req: Request, res: Response) => {
  const [fila] = await filas(pool, "SELECT anticipacion_minutos FROM configuracion_reservacion WHERE id = 1");
  res.json({ ...(await cargarHorario(pool)), anticipacion_minutos: Number(fila?.anticipacion_minutos ?? 60) });
};
