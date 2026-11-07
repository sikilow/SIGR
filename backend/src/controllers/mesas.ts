import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { cargarCuenta, idDeRuta, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { conIdempotencia } from "../services/idempotencia";

/**
 * GET /api/mesas  →  [{ id_mesa, numero, capacidad, zona, estado, ... }]
 * Solo trae mesas disponibles: tanto las marcadas como no disponibles como las de una sección inhabilitada
 * quedan fuera del panel y del salón. Las primeras cinco son columnas de `mesa`. El resto es el resumen CALCULADO de su cuenta activa (la que no
 * está cerrada), que el Panel de mesas necesita: estado_cuenta, pedidos_activos (no cancelados ni pagados),
 * total_cuenta (sin cancelados) y pedidos_listos. tipo_pago_solicitado es la columna de `cuenta`.
 */
export const listarMesas = async (_req: Request, res: Response) => {
  const rows = await filas(
    pool,
    `SELECT m.id_mesa, m.numero, m.capacidad, m.zona, m.planta_baja, m.espacio_carriola, m.sin_escaleras, m.estado,
            c.estado AS estado_cuenta, c.tipo_pago_solicitado,
            COALESCE(pa.pedidos_activos, 0) AS pedidos_activos,
            COALESCE(pa.pedidos_listos, 0)  AS pedidos_listos,
            COALESCE(t.total, 0)            AS total_cuenta
       FROM mesa m
       LEFT JOIN cuenta c ON c.id_mesa = m.id_mesa AND c.estado <> 'cerrada'
       LEFT JOIN (
              SELECT p.id_cuenta,
                     SUM(ep.nombre NOT IN ('Cancelado', 'Pagado')) AS pedidos_activos,
                     SUM(ep.nombre = 'Listo')                      AS pedidos_listos
                FROM pedido p JOIN estado_pedido ep ON ep.id_estado = p.id_estado
               GROUP BY p.id_cuenta
            ) pa ON pa.id_cuenta = c.id_cuenta
       LEFT JOIN (
              SELECT p.id_cuenta, SUM(dp.cantidad * dp.precio_unitario) AS total
                FROM pedido p
                JOIN estado_pedido ep ON ep.id_estado = p.id_estado
                JOIN detalle_pedido dp ON dp.id_pedido = p.id_pedido
               WHERE ep.nombre <> 'Cancelado'
               GROUP BY p.id_cuenta
            ) t ON t.id_cuenta = c.id_cuenta
      WHERE m.activa = TRUE
        AND EXISTS (SELECT 1 FROM seccion s WHERE s.nombre = m.zona AND s.activa = TRUE)
      ORDER BY m.numero`,
  );

  res.json(
    rows.map((r) => ({
      id_mesa: r.id_mesa as number,
      numero: r.numero as number,
      capacidad: r.capacidad as number,
      zona: (r.zona as string | null) ?? null,
      planta_baja: Number(r.planta_baja) === 1,
      espacio_carriola: Number(r.espacio_carriola) === 1,
      sin_escaleras: Number(r.sin_escaleras) === 1,
      estado: r.estado as string,
      estado_cuenta: (r.estado_cuenta as string | null) ?? null,
      tipo_pago_solicitado: (r.tipo_pago_solicitado as string | null) ?? null,
      pedidos_activos: Number(r.pedidos_activos),
      total_cuenta: Number(r.total_cuenta),
      pedidos_listos: Number(r.pedidos_listos),
    })),
  );
};

/** GET /api/mesas/:id/cuenta  →  cuenta activa con sus pedidos; 404 si la mesa no tiene. */
export const obtenerCuentaDeMesa = async (req: Request, res: Response) => {
  const mesaId = idDeRuta(req.params.id);
  const [activa] = await filas(
    pool,
    "SELECT id_cuenta FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' ORDER BY id_cuenta DESC LIMIT 1",
    [mesaId],
  );
  const cuenta = activa ? await cargarCuenta(pool, activa.id_cuenta as number) : null;
  if (!cuenta) throw new ErrorApi(404, "no_encontrado", "La mesa no tiene una cuenta activa.");
  res.json(cuenta);
};

// Valores de mesa.estado que permite el CHECK de init.sql (libre, ocupada, reservada).
const CambioEstado = z.object({ estado: z.enum(["libre", "ocupada", "reservada"]) });
const Asignacion = z.union([
  z.object({ id_reservacion: z.number().int().positive() }).strict(),
  z.object({ id_espera: z.number().int().positive() }).strict(),
  z.object({ personas: z.number().int().min(1).max(99) }).strict(),
]);

/** POST /api/mesas/:id/asignar: ocupa una mesa y actualiza el grupo en una sola transacción. */
export const asignarMesa = async (req: Request, res: Response) => {
  const mesaId = idDeRuta(req.params.id);
  const grupo = validar(Asignacion, req.body);

  await conIdempotencia(req, res, 200, () =>
    transaccion(async (cx) => {
      if ("id_reservacion" in grupo) {
        const [reservacion] = await filas(
          cx,
          "SELECT id_reservacion, estado, id_mesa FROM reservacion WHERE id_reservacion = ? FOR UPDATE",
          [grupo.id_reservacion],
        );
        if (!reservacion) throw new ErrorApi(404, "no_encontrado", "La reservación no existe.");
        if (!["pendiente", "confirmada"].includes(reservacion.estado) ||
            (reservacion.id_mesa !== null && Number(reservacion.id_mesa) !== mesaId)) {
          throw new ErrorApi(409, "estado_invalido", "Esa reservación ya no se puede asignar a esta mesa.");
        }
      } else if ("id_espera" in grupo) {
        const [espera] = await filas(
          cx,
          "SELECT id_espera, estado FROM lista_espera WHERE id_espera = ? FOR UPDATE",
          [grupo.id_espera],
        );
        if (!espera) throw new ErrorApi(404, "no_encontrado", "El grupo en espera no existe.");
        if (espera.estado !== "esperando") {
          throw new ErrorApi(409, "estado_invalido", "Ese grupo ya tiene mesa asignada.");
        }
      }

      const [disponibilidad] = await filas(
        cx,
        `SELECT m.numero, m.activa, s.activa AS seccion_activa
           FROM mesa m JOIN seccion s ON s.nombre = m.zona
          WHERE m.id_mesa = ? FOR UPDATE`,
        [mesaId],
      );
      if (!disponibilidad) throw new ErrorApi(404, "no_encontrado", `La mesa ${mesaId} no existe.`);
      if (!disponibilidad.activa || !disponibilidad.seccion_activa) {
        throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${disponibilidad.numero} no está disponible.`);
      }

      const cambioMesa = await ejecutar(
        cx,
        `UPDATE mesa AS m
            SET estado = 'ocupada'
          WHERE m.id_mesa = ? AND m.activa = TRUE AND m.estado IN ('libre', 'reservada')
            AND EXISTS (SELECT 1 FROM seccion s WHERE s.nombre = m.zona AND s.activa = TRUE)`,
        [mesaId],
      );
      if (cambioMesa.affectedRows === 0) {
        const [mesaExistente] = await filas(
          cx,
          `SELECT m.numero, m.activa, s.activa AS seccion_activa
             FROM mesa m LEFT JOIN seccion s ON s.nombre = m.zona
            WHERE m.id_mesa = ?`,
          [mesaId],
        );
        if (!mesaExistente) throw new ErrorApi(404, "no_encontrado", `La mesa ${mesaId} no existe.`);
        if (!mesaExistente.activa || !mesaExistente.seccion_activa) throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesaExistente.numero} no está disponible.`);
        throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesaExistente.numero} ya está ocupada.`);
      }

      let reservacionId: number | null = null;
      let esperaId: number | null = null;

      if ("id_reservacion" in grupo) {
        await ejecutar(
          cx,
          "UPDATE reservacion SET id_mesa = ?, estado = 'llego', llegada_en = NOW() WHERE id_reservacion = ?",
          [mesaId, grupo.id_reservacion],
        );
        reservacionId = grupo.id_reservacion;
      } else if ("id_espera" in grupo) {
        await ejecutar(cx, "UPDATE lista_espera SET estado = 'asignada' WHERE id_espera = ?", [grupo.id_espera]);
        esperaId = grupo.id_espera;
      }

      const [mesa] = await filas(
        cx,
        "SELECT id_mesa, numero, capacidad, zona, planta_baja, espacio_carriola, sin_escaleras, estado FROM mesa WHERE id_mesa = ?",
        [mesaId],
      );
      const [reservacion] = reservacionId
        ? await filas(
            cx,
            `SELECT r.id_reservacion, r.id_cliente, r.id_mesa, r.fecha_hora, r.personas, r.estado, r.llegada_en,
                    c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.correo AS cliente_correo, m.numero AS mesa_numero
               FROM reservacion r
               JOIN cliente c ON c.id_cliente = r.id_cliente
               LEFT JOIN mesa m ON m.id_mesa = r.id_mesa
              WHERE r.id_reservacion = ?`,
            [reservacionId],
          )
        : [null];
      const [espera] = esperaId
        ? await filas(
            cx,
            `SELECT le.id_espera, le.id_cliente, le.personas, le.registrado_en, le.estado,
                    c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
               FROM lista_espera le
               JOIN cliente c ON c.id_cliente = le.id_cliente
              WHERE le.id_espera = ?`,
            [esperaId],
          )
        : [null];

      return { mesa, reservacion, espera };
    }),
  );
};

/**
 * PATCH /api/mesas/:id/estado  { estado }
 * Es la acción de la hostess (sentar / liberar / reservar). Aún no hay pantalla para ella:
 * mientras tanto sirve para probar (ver instrucciones). No se puede liberar una mesa con cuenta activa.
 */
export const cambiarEstadoMesa = async (req: Request, res: Response) => {
  const mesaId = idDeRuta(req.params.id);
  const { estado } = validar(CambioEstado, req.body);

  await transaccion(async (cx) => {
    const [mesa] = await filas(
      cx,
      `SELECT m.id_mesa, m.numero, m.activa, s.activa AS seccion_activa
         FROM mesa m LEFT JOIN seccion s ON s.nombre = m.zona
        WHERE m.id_mesa = ? FOR UPDATE`,
      [mesaId],
    );
    if (!mesa) throw new ErrorApi(404, "no_encontrado", `La mesa ${mesaId} no existe.`);
    if (!mesa.activa || !mesa.seccion_activa) throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesa.numero} no está disponible.`);

    if (estado !== "ocupada") {
      const [activa] = await filas(cx, "SELECT 1 AS x FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' LIMIT 1", [mesaId]);
      if (activa) throw new ErrorApi(409, "estado_invalido", "La mesa tiene una cuenta activa: primero hay que cerrarla.");
    }

    await ejecutar(cx, "UPDATE mesa SET estado = ? WHERE id_mesa = ?", [estado, mesaId]);
  });
  res.json({ id_mesa: mesaId, estado });
};
