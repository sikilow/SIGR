import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { idDeRuta, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { conIdempotencia } from "../services/idempotencia";

const FiltroReservaciones = z.object({ fecha: z.string().optional() });
const FiltroEspera = z.object({ estado: z.enum(["esperando", "asignada", "cancelada"]).optional() });
const FiltroClientes = z.object({ q: z.string().trim().optional() });
const ClienteNuevo = z.object({
  nombre: z.string().trim().min(1).max(100),
  telefono: z.string().trim().regex(/^\d{10}$/, "el teléfono debe tener 10 dígitos"),
  correo: z.union([z.string().trim().email().max(120), z.literal("")]).nullable().optional(),
}).strict();
const ReservacionNueva = z.object({
  id_cliente: z.number().int().positive(),
  fecha_hora: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  personas: z.number().int().min(1).max(20),
  id_mesa: z.number().int().positive().nullable().optional(),
}).strict();
const EsperaNueva = z.object({
  id_cliente: z.number().int().positive(),
  personas: z.number().int().min(1).max(20),
}).strict();
const CambioReservacion = z.object({
  estado: z.enum(["confirmada", "cancelada"]).optional(),
  fecha_hora: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).optional(),
  personas: z.number().int().min(1).max(20).optional(),
  id_mesa: z.number().int().positive().nullable().optional(),
}).strict().refine(
  (cambio) => Object.values(cambio).some((valor) => valor !== undefined),
  "debe indicar al menos un campo para cambiar",
);
const LlegadaReservacion = z.object({
  id_mesa: z.number().int().positive().optional(),
}).strict();

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

function esFechaHoraMySQLValida(fechaHora: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(fechaHora);
  if (!partes) return false;
  const [anio, mes, dia, hh, mm, ss] = partes.slice(1).map(Number) as [number, number, number, number, number, number];
  if (anio < 1000) return false;
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia, hh, mm, ss));
  return comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia &&
    comprobacion.getUTCHours() === hh &&
    comprobacion.getUTCMinutes() === mm &&
    comprobacion.getUTCSeconds() === ss;
}

async function cargarCliente(ex: Ejecutor, id: number) {
  const [cliente] = await filas(ex, "SELECT id_cliente, nombre, telefono, correo FROM cliente WHERE id_cliente = ?", [id]);
  return cliente ?? null;
}

async function cargarReservacion(ex: Ejecutor, id: number) {
  const [reservacion] = await filas(
    ex,
    `SELECT r.id_reservacion, r.id_cliente, r.id_mesa, r.fecha_hora, r.personas, r.estado, r.llegada_en,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, m.numero AS mesa_numero
       FROM reservacion r
       JOIN cliente c ON c.id_cliente = r.id_cliente
       LEFT JOIN mesa m ON m.id_mesa = r.id_mesa
      WHERE r.id_reservacion = ?`,
    [id],
  );
  return reservacion ?? null;
}

async function cargarEspera(ex: Ejecutor, id: number) {
  const [espera] = await filas(
    ex,
    `SELECT le.id_espera, le.id_cliente, le.personas, le.registrado_en, le.estado,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM lista_espera le
       JOIN cliente c ON c.id_cliente = le.id_cliente
      WHERE le.id_espera = ?`,
    [id],
  );
  return espera ?? null;
}

function exigirRegistro<T>(registro: T | null, nombre: string): T {
  if (!registro) throw new ErrorApi(500, "desconocido", `No se pudo recuperar el registro recién creado (${nombre}).`);
  return registro;
}

function esFechaISOValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  if (Number(fecha.slice(0, 4)) < 1000) return false;
  const fechaUTC = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isFinite(fechaUTC.getTime()) && fechaUTC.toISOString().slice(0, 10) === fecha;
}

function diaSiguiente(fecha: string): string {
  const siguiente = new Date(`${fecha}T00:00:00.000Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  return siguiente.toISOString().slice(0, 10);
}

async function liberarMesaSiCorresponde(ex: Ejecutor, idMesa: number | null, exceptoId: number): Promise<void> {
  if (idMesa === null) return;

  const [mesa] = await filas(ex, "SELECT estado FROM mesa WHERE id_mesa = ? FOR UPDATE", [idMesa]);
  if (!mesa || mesa.estado !== "reservada") return;

  const [otraReservacion] = await filas(
    ex,
    `SELECT id_reservacion
       FROM reservacion
      WHERE id_mesa = ? AND id_reservacion <> ? AND estado IN ('pendiente', 'confirmada')
      LIMIT 1`,
    [idMesa, exceptoId],
  );
  if (!otraReservacion) {
    await ejecutar(ex, "UPDATE mesa SET estado = 'libre' WHERE id_mesa = ? AND estado = 'reservada'", [idMesa]);
  }
}

/** GET /api/clientes?q=: hasta 20 clientes por nombre o teléfono. */
export const listarClientes = async (req: Request, res: Response) => {
  const { q = "" } = validar(FiltroClientes, req.query);
  if (q.length < 2) {
    res.json([]);
    return;
  }

  const digitos = q.replace(/\D/g, "");
  const porTelefono = digitos.length >= 3;
  const rows = await filas(
    pool,
    `SELECT id_cliente, nombre, telefono, correo
       FROM cliente
      WHERE LOCATE(?, nombre) > 0${porTelefono ? " OR LOCATE(?, telefono) > 0" : ""}
      ORDER BY nombre, id_cliente
      LIMIT 20`,
    porTelefono ? [q, digitos] : [q],
  );
  res.json(rows);
};

/** POST /api/clientes: crea un cliente para reservaciones o lista de espera. */
export const registrarCliente = async (req: Request, res: Response) => {
  const datos = validar(ClienteNuevo, req.body);
  const correo = datos.correo?.trim() || null;
  await conIdempotencia(req, res, 201, async () => {
    const [existente] = await filas(pool, "SELECT id_cliente FROM cliente WHERE telefono = ? LIMIT 1", [datos.telefono]);
    if (existente) {
      throw new ErrorApi(409, "estado_invalido", "Ya existe un cliente con ese teléfono. Búscalo para seleccionarlo.");
    }
    try {
      const insertado = await ejecutar(
        pool,
        "INSERT INTO cliente (nombre, telefono, correo) VALUES (?, ?, ?)",
        [datos.nombre, datos.telefono, correo],
      );
      return exigirRegistro(await cargarCliente(pool, insertado.insertId), "cliente");
    } catch (error) {
      if (esDuplicado(error)) {
        throw new ErrorApi(409, "estado_invalido", "Ya existe un cliente con ese teléfono. Búscalo para seleccionarlo.");
      }
      throw error;
    }
  });
};

/** GET /api/reservaciones?fecha=AAAA-MM-DD: reservaciones del día, de cualquier estado. */
export const listarReservaciones = async (req: Request, res: Response) => {
  const { fecha } = validar(FiltroReservaciones, req.query);
  if (fecha !== undefined && !esFechaISOValida(fecha)) {
    throw new ErrorApi(422, "estado_invalido", "La fecha debe tener formato AAAA-MM-DD y ser válida.");
  }

  let filtroFecha: string;
  let params: string[];
  if (fecha === undefined) {
    filtroFecha = "r.fecha_hora >= CURDATE() AND r.fecha_hora < DATE_ADD(CURDATE(), INTERVAL 1 DAY)";
    params = [];
  } else if (fecha === "9999-12-31") {
    filtroFecha = "r.fecha_hora >= ? AND r.fecha_hora <= ?";
    params = [`${fecha} 00:00:00`, `${fecha} 23:59:59`];
  } else {
    filtroFecha = "r.fecha_hora >= ? AND r.fecha_hora < ?";
    params = [`${fecha} 00:00:00`, `${diaSiguiente(fecha)} 00:00:00`];
  }
  const rows = await filas(
    pool,
    `SELECT r.id_reservacion, r.id_cliente, r.id_mesa, r.fecha_hora, r.personas, r.estado, r.llegada_en,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, m.numero AS mesa_numero
       FROM reservacion r
       JOIN cliente c ON c.id_cliente = r.id_cliente
       LEFT JOIN mesa m ON m.id_mesa = r.id_mesa
      WHERE ${filtroFecha}
      ORDER BY r.fecha_hora, r.id_reservacion`,
    params,
  );
  res.json(rows);
};

/** POST /api/reservaciones: registra una reservación pendiente y, si aplica, reserva una mesa libre. */
export const crearReservacion = async (req: Request, res: Response) => {
  const datos = validar(ReservacionNueva, req.body);
  if (!esFechaHoraMySQLValida(datos.fecha_hora)) {
    throw new ErrorApi(422, "estado_invalido", "La fecha y hora de la reservación no son válidas.");
  }

  await conIdempotencia(req, res, 201, () =>
    transaccion(async (cx) => {
      const [fecha] = await filas(
        cx,
        `SELECT
           ? < DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00') AS pasada,
           ? > DATE_ADD(NOW(), INTERVAL 365 DAY) AS lejana,
           DATE(?) = CURDATE() AS es_hoy`,
        [datos.fecha_hora, datos.fecha_hora, datos.fecha_hora],
      );
      if (!fecha) throw new ErrorApi(500, "desconocido", "No se pudo validar la fecha de la reservación.");
      if (Number(fecha.pasada) === 1 || Number(fecha.lejana) === 1) {
        throw new ErrorApi(422, "estado_invalido", "La fecha debe ser desde ahora y no puede superar un año.");
      }
      if (datos.id_mesa !== undefined && datos.id_mesa !== null && Number(fecha.es_hoy) !== 1) {
        throw new ErrorApi(422, "estado_invalido", "Solo se puede asignar una mesa a una reservación de hoy.");
      }

      const [cliente] = await filas(cx, "SELECT id_cliente FROM cliente WHERE id_cliente = ?", [datos.id_cliente]);
      if (!cliente) throw new ErrorApi(404, "no_encontrado", "El cliente no existe.");

      if (datos.id_mesa !== undefined && datos.id_mesa !== null) {
        const [mesa] = await filas(cx, "SELECT numero, estado FROM mesa WHERE id_mesa = ? FOR UPDATE", [datos.id_mesa]);
        if (!mesa) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
        if (mesa.estado !== "libre") {
          throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesa.numero} ya no está libre.`);
        }
        await ejecutar(cx, "UPDATE mesa SET estado = 'reservada' WHERE id_mesa = ?", [datos.id_mesa]);
      }

      const insertado = await ejecutar(
        cx,
        "INSERT INTO reservacion (id_cliente, id_mesa, fecha_hora, personas) VALUES (?, ?, ?, ?)",
        [datos.id_cliente, datos.id_mesa ?? null, datos.fecha_hora, datos.personas],
      );
      return exigirRegistro(await cargarReservacion(cx, insertado.insertId), "reservación");
    }),
  );
};

/** PATCH /api/reservaciones/:id: confirma, cancela o edita una reservación vigente. */
export const editarReservacion = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const cambio = validar(CambioReservacion, req.body);

  await conIdempotencia(req, res, 200, () =>
    transaccion(async (cx) => {
      const [reservacion] = await filas(
        cx,
        "SELECT id_reservacion, id_mesa, fecha_hora, personas, estado FROM reservacion WHERE id_reservacion = ? FOR UPDATE",
        [id],
      );
      if (!reservacion) throw new ErrorApi(404, "no_encontrado", "La reservación no existe.");
      if (!["pendiente", "confirmada"].includes(reservacion.estado)) {
        throw new ErrorApi(409, "estado_invalido", "Solo se pueden cambiar las reservaciones pendientes o confirmadas.");
      }

      const mesaAnterior = reservacion.id_mesa === null ? null : Number(reservacion.id_mesa);
      if (cambio.estado !== undefined) {
        if (Object.keys(cambio).length !== 1) {
          throw new ErrorApi(422, "estado_invalido", "Cambia el estado o edita los datos, no las dos cosas a la vez.");
        }
        if (cambio.estado === "confirmada") {
          if (reservacion.estado !== "pendiente") {
            throw new ErrorApi(409, "estado_invalido", "Solo una reservación pendiente se puede confirmar.");
          }
          await ejecutar(cx, "UPDATE reservacion SET estado = 'confirmada' WHERE id_reservacion = ?", [id]);
        } else {
          await ejecutar(cx, "UPDATE reservacion SET estado = 'cancelada', id_mesa = NULL WHERE id_reservacion = ?", [id]);
          await liberarMesaSiCorresponde(cx, mesaAnterior, id);
        }
      } else {
        const fechaAnterior = reservacion.fecha_hora as string;
        const fechaFinal = cambio.fecha_hora ?? fechaAnterior;
        const personasFinales = cambio.personas ?? Number(reservacion.personas);
        const mesaFinal = cambio.id_mesa === undefined ? mesaAnterior : cambio.id_mesa;

        if (cambio.fecha_hora !== undefined) {
          if (!esFechaHoraMySQLValida(cambio.fecha_hora)) {
            throw new ErrorApi(422, "estado_invalido", "La fecha y hora de la reservación no son válidas.");
          }
          if (cambio.fecha_hora !== fechaAnterior) {
            const [fecha] = await filas(
              cx,
              `SELECT
                 ? < DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00') AS pasada,
                 ? > DATE_ADD(NOW(), INTERVAL 365 DAY) AS lejana`,
              [cambio.fecha_hora, cambio.fecha_hora],
            );
            if (!fecha) throw new ErrorApi(500, "desconocido", "No se pudo validar la fecha de la reservación.");
            if (Number(fecha.pasada) === 1 || Number(fecha.lejana) === 1) {
              throw new ErrorApi(422, "estado_invalido", "La fecha debe ser desde ahora y no puede superar un año.");
            }
          }
        }

        if (mesaFinal !== null) {
          const [fechaMesa] = await filas(cx, "SELECT DATE(?) = CURDATE() AS es_hoy", [fechaFinal]);
          if (!fechaMesa) throw new ErrorApi(500, "desconocido", "No se pudo validar la fecha de la reservación.");
          if (Number(fechaMesa.es_hoy) !== 1) {
            throw new ErrorApi(422, "estado_invalido", "Solo se puede asignar una mesa a una reservación de hoy.");
          }
        }

        if (mesaFinal !== null && mesaFinal !== mesaAnterior) {
          const [mesa] = await filas(cx, "SELECT numero, estado FROM mesa WHERE id_mesa = ? FOR UPDATE", [mesaFinal]);
          if (!mesa) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
          if (mesa.estado !== "libre") {
            throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesa.numero} ya no está libre.`);
          }
          await ejecutar(cx, "UPDATE mesa SET estado = 'reservada' WHERE id_mesa = ?", [mesaFinal]);
        }

        const columnas: string[] = [];
        const valores: unknown[] = [];
        if (cambio.fecha_hora !== undefined) {
          columnas.push("fecha_hora = ?");
          valores.push(cambio.fecha_hora);
        }
        if (cambio.personas !== undefined) {
          columnas.push("personas = ?");
          valores.push(personasFinales);
        }
        if (cambio.id_mesa !== undefined) {
          columnas.push("id_mesa = ?");
          valores.push(cambio.id_mesa);
        }
        await ejecutar(cx, `UPDATE reservacion SET ${columnas.join(", ")} WHERE id_reservacion = ?`, [...valores, id]);
        if (mesaFinal !== mesaAnterior) await liberarMesaSiCorresponde(cx, mesaAnterior, id);
      }

      return exigirRegistro(await cargarReservacion(cx, id), "reservación");
    }),
  );
};

/** POST /api/reservaciones/:id/llegada: ocupa una mesa y registra la llegada de una reservación. */
export const registrarLlegada = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { id_mesa: idMesaElegida } = validar(LlegadaReservacion, req.body ?? {});

  await conIdempotencia(req, res, 200, () =>
    transaccion(async (cx) => {
      const [reservacion] = await filas(
        cx,
        "SELECT id_reservacion, id_mesa, estado FROM reservacion WHERE id_reservacion = ? FOR UPDATE",
        [id],
      );
      if (!reservacion) throw new ErrorApi(404, "no_encontrado", "La reservación no existe.");
      if (!["pendiente", "confirmada"].includes(reservacion.estado)) {
        throw new ErrorApi(409, "estado_invalido", "Esa reservación ya no se puede asignar a una mesa.");
      }

      const mesaAnterior = reservacion.id_mesa === null ? null : Number(reservacion.id_mesa);
      const mesaId = idMesaElegida ?? mesaAnterior;
      if (mesaId === null) {
        throw new ErrorApi(422, "estado_invalido", "Elige la mesa en la que se sienta esta reservación.");
      }
      const [mesa] = await filas(
        cx,
        "SELECT id_mesa, numero, capacidad, estado FROM mesa WHERE id_mesa = ? FOR UPDATE",
        [mesaId],
      );
      if (!mesa) throw new ErrorApi(404, "no_encontrado", `La mesa ${mesaId} no existe.`);
      if (!["libre", "reservada"].includes(mesa.estado)) {
        throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesa.numero} ya está ocupada.`);
      }
      if (mesa.estado === "reservada" && mesaId !== mesaAnterior) {
        const [otraReservacion] = await filas(
          cx,
          `SELECT id_reservacion
             FROM reservacion
            WHERE id_mesa = ? AND id_reservacion <> ? AND estado IN ('pendiente', 'confirmada')
            LIMIT 1`,
          [mesaId, id],
        );
        if (otraReservacion) {
          throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesa.numero} está reservada para otra reservación.`);
        }
      }

      await ejecutar(cx, "UPDATE mesa SET estado = 'ocupada' WHERE id_mesa = ?", [mesaId]);
      await ejecutar(
        cx,
        "UPDATE reservacion SET id_mesa = ?, estado = 'llego', llegada_en = NOW() WHERE id_reservacion = ?",
        [mesaId, id],
      );
      if (mesaId !== mesaAnterior) await liberarMesaSiCorresponde(cx, mesaAnterior, id);

      const [mesaActualizada] = await filas(
        cx,
        "SELECT id_mesa, numero, capacidad, estado FROM mesa WHERE id_mesa = ?",
        [mesaId],
      );
      return {
        mesa: exigirRegistro(mesaActualizada ?? null, "mesa"),
        reservacion: exigirRegistro(await cargarReservacion(cx, id), "reservación"),
        espera: null,
      };
    }),
  );
};

/** GET /api/lista-espera?estado=: grupos de espera, enriquecidos con los datos del cliente. */
export const listarEspera = async (req: Request, res: Response) => {
  const { estado } = validar(FiltroEspera, req.query);
  const filtro =
    estado !== undefined
      ? "le.estado = ?"
      : "(le.registrado_en >= CURDATE() AND le.registrado_en < DATE_ADD(CURDATE(), INTERVAL 1 DAY) OR le.estado = 'esperando')";
  const rows = await filas(
    pool,
    `SELECT le.id_espera, le.id_cliente, le.personas, le.registrado_en, le.estado,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM lista_espera le
       JOIN cliente c ON c.id_cliente = le.id_cliente
      WHERE ${filtro}
      ORDER BY le.registrado_en, le.id_espera`,
    estado === undefined ? [] : [estado],
  );
  res.json(rows);
};

/** POST /api/lista-espera: anota un cliente si no tiene ya un grupo esperando. */
export const agregarEspera = async (req: Request, res: Response) => {
  const datos = validar(EsperaNueva, req.body);
  await conIdempotencia(req, res, 201, () =>
    transaccion(async (cx) => {
      const [cliente] = await filas(cx, "SELECT id_cliente FROM cliente WHERE id_cliente = ? FOR UPDATE", [datos.id_cliente]);
      if (!cliente) throw new ErrorApi(404, "no_encontrado", "El cliente no existe.");

      const [esperaActiva] = await filas(
        cx,
        "SELECT id_espera FROM lista_espera WHERE id_cliente = ? AND estado = 'esperando' LIMIT 1",
        [datos.id_cliente],
      );
      if (esperaActiva) throw new ErrorApi(409, "estado_invalido", "Ese cliente ya está en la lista de espera.");

      const insertado = await ejecutar(
        cx,
        "INSERT INTO lista_espera (id_cliente, personas) VALUES (?, ?)",
        [datos.id_cliente, datos.personas],
      );
      return exigirRegistro(await cargarEspera(cx, insertado.insertId), "grupo de espera");
    }),
  );
};
