import { Router } from "express";
import { z } from "zod";
import { ejecutar, filas, pool } from "../db";
import { cargarCuenta, idDeRuta, validar } from "../dominio";
import { ErrorApi } from "../errores";
import { requiereAuth } from "../middlewares/auth";

export const mesasRouter = Router();

/**
 * GET /api/mesas  →  [{ id_mesa, numero, capacidad, estado, ... }]
 * Las primeras cuatro son columnas de `mesa`. El resto es el resumen CALCULADO de su cuenta activa (la que no
 * está cerrada), que el Panel de mesas necesita: estado_cuenta, pedidos_activos (no cancelados ni pagados),
 * total_cuenta (sin cancelados) y pedidos_listos. tipo_pago_solicitado es la columna de `cuenta`.
 */
mesasRouter.get("/", requiereAuth(), async (_req, res) => {
  const rows = await filas(
    pool,
    `SELECT m.id_mesa, m.numero, m.capacidad, m.estado,
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
      ORDER BY m.numero`,
  );

  res.json(
    rows.map((r) => ({
      id_mesa: r.id_mesa as number,
      numero: r.numero as number,
      capacidad: r.capacidad as number,
      estado: r.estado as string,
      estado_cuenta: (r.estado_cuenta as string | null) ?? null,
      tipo_pago_solicitado: (r.tipo_pago_solicitado as string | null) ?? null,
      pedidos_activos: Number(r.pedidos_activos),
      total_cuenta: Number(r.total_cuenta),
      pedidos_listos: Number(r.pedidos_listos),
    })),
  );
});

/** GET /api/mesas/:id/cuenta  →  cuenta activa con sus pedidos; 404 si la mesa no tiene. */
mesasRouter.get("/:id/cuenta", requiereAuth(), async (req, res) => {
  const mesaId = idDeRuta(req.params.id);
  const [activa] = await filas(
    pool,
    "SELECT id_cuenta FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' ORDER BY id_cuenta DESC LIMIT 1",
    [mesaId],
  );
  const cuenta = activa ? await cargarCuenta(pool, activa.id_cuenta as number) : null;
  if (!cuenta) throw new ErrorApi(404, "no_encontrado", "La mesa no tiene una cuenta activa.");
  res.json(cuenta);
});

// Valores de mesa.estado que permite el CHECK de schema.sql (libre, ocupada, reservada).
const CambioEstado = z.object({ estado: z.enum(["libre", "ocupada", "reservada"]) });

/**
 * PATCH /api/mesas/:id/estado  { estado }
 * Es la acción de la hostess (sentar / liberar / reservar). Aún no hay pantalla para ella:
 * mientras tanto sirve para probar (ver instrucciones). No se puede liberar una mesa con cuenta activa.
 */
mesasRouter.patch("/:id/estado", requiereAuth("hostess", "gerente"), async (req, res) => {
  const mesaId = idDeRuta(req.params.id);
  const { estado } = validar(CambioEstado, req.body);

  const [mesa] = await filas(pool, "SELECT id_mesa FROM mesa WHERE id_mesa = ?", [mesaId]);
  if (!mesa) throw new ErrorApi(404, "no_encontrado", `La mesa ${mesaId} no existe.`);

  if (estado !== "ocupada") {
    const [activa] = await filas(pool, "SELECT 1 AS x FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' LIMIT 1", [mesaId]);
    if (activa) throw new ErrorApi(409, "estado_invalido", "La mesa tiene una cuenta activa: primero hay que cerrarla.");
  }

  await ejecutar(pool, "UPDATE mesa SET estado = ? WHERE id_mesa = ?", [estado, mesaId]);
  res.json({ id_mesa: mesaId, estado });
});
