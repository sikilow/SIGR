import { Router } from "express";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion } from "../db";
import {
  ESTADO_PEDIDO_DB,
  ESTADOS_PEDIDO,
  MOTIVOS,
  cargarPedido,
  cargarPedidos,
  exigirDisponibles,
  idDeRuta,
  idEstadoPedido,
  idMotivo,
  validar,
  type PedidoDto,
} from "../dominio";
import { ErrorApi } from "../errores";
import { requiereAuth } from "../middlewares/auth";

export const pedidosRouter = Router();

const Linea = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().int().min(1).max(99),
  observaciones: z.string().max(120).default(""),
});
type LineaPedido = z.infer<typeof Linea>;

const NuevoPedido = z.object({ mesa_id: z.number().int().positive(), detalle: z.array(Linea).min(1, "El pedido no tiene productos") });
const Actualizacion = z.object({ detalle: z.array(Linea).min(1, "El pedido no tiene productos") });
const Cancelacion = z.object({ motivo: z.enum(MOTIVOS) });
const Filtros = z.object({
  mesa_id: z.coerce.number().int().positive().optional(),
  estado: z.enum(ESTADOS_PEDIDO).optional(),
});

/** Verifica que los productos existan y estén disponibles, y guarda las líneas con el precio VIGENTE de la BD. */
async function guardarDetalle(cx: PoolConnection, pedidoId: number, lineas: LineaPedido[]): Promise<void> {
  const productos = await exigirDisponibles(cx, lineas.map((l) => l.producto_id));
  const valores = lineas.map((l) => [pedidoId, l.producto_id, l.cantidad, productos.get(l.producto_id)!.precio, l.observaciones || null]);
  await cx.query("INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario, indicaciones) VALUES ?", [valores]);
}

/** Bloquea la fila del pedido durante la transacción y devuelve su estado (código del front). */
async function bloquearPedido(cx: PoolConnection, id: number) {
  const [fila] = await filas(
    cx,
    `SELECT p.id_pedido, ep.nombre AS estado
       FROM pedido p JOIN estado_pedido ep ON ep.id_estado = p.id_estado
      WHERE p.id_pedido = ? FOR UPDATE OF p`, // OF p: bloquea solo el pedido, no la fila compartida del estado
    [id],
  );
  if (!fila) throw new ErrorApi(404, "no_encontrado", `El pedido ${id} no existe.`);
  const estado = ESTADOS_PEDIDO.find((e) => ESTADO_PEDIDO_DB[e] === fila.estado) ?? "registrado";
  return { estado };
}

async function pedidoOError(cx: PoolConnection, id: number): Promise<PedidoDto> {
  const pedido = await cargarPedido(cx, id);
  if (!pedido) throw new ErrorApi(404, "no_encontrado", `El pedido ${id} no existe.`);
  return pedido;
}

/**
 * POST /api/pedidos  { mesa_id, detalle: [{ producto_id, cantidad, observaciones }] }
 * Crea el pedido en estado `registrado`. Si la mesa no tiene cuenta activa, abre una.
 */
pedidosRouter.post("/", requiereAuth("mesero", "gerente"), async (req, res) => {
  const { mesa_id, detalle } = validar(NuevoPedido, req.body);
  const meseroId = req.usuario!.id;

  const pedido = await transaccion(async (cx) => {
    // FOR UPDATE: dos meseros que piden a la vez en la misma mesa no pueden abrir dos cuentas.
    const [mesa] = await filas(cx, "SELECT numero, estado FROM mesa WHERE id_mesa = ? FOR UPDATE", [mesa_id]);
    if (!mesa) throw new ErrorApi(404, "no_encontrado", `La mesa ${mesa_id} no existe.`);
    if (mesa.estado !== "ocupada") {
      throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesa.numero} no está ocupada.`);
    }

    // Se valida antes de abrir la cuenta: si hay productos agotados no se crea nada.
    await exigirDisponibles(cx, detalle.map((l) => l.producto_id));

    const [activa] = await filas(cx, "SELECT id_cuenta, estado FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' LIMIT 1", [mesa_id]);
    if (activa?.estado === "por_pagar") throw new ErrorApi(409, "estado_invalido", "La cuenta ya solicitó el pago.");
    const cuentaId = activa
      ? (activa.id_cuenta as number)
      : (await ejecutar(cx, "INSERT INTO cuenta (id_mesa) VALUES (?)", [mesa_id])).insertId;

    const idEstado = await idEstadoPedido(cx, "registrado");
    const { insertId } = await ejecutar(cx, "INSERT INTO pedido (id_cuenta, id_mesero, id_estado) VALUES (?, ?, ?)", [cuentaId, meseroId, idEstado]);
    await guardarDetalle(cx, insertId, detalle);
    return pedidoOError(cx, insertId);
  });

  res.status(201).json(pedido);
});

/**
 * GET /api/pedidos?mesa_id=&estado=
 * Un mesero solo ve SUS pedidos; el resto de los roles ve todos.
 */
pedidosRouter.get("/", requiereAuth(), async (req, res) => {
  const { mesa_id, estado } = validar(Filtros, req.query);
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (mesa_id !== undefined) {
    condiciones.push("c.id_mesa = ?");
    params.push(mesa_id);
  }
  if (estado !== undefined) {
    condiciones.push("ep.nombre = ?");
    params.push(ESTADO_PEDIDO_DB[estado]);
  }
  if (req.usuario!.rol === "mesero") {
    condiciones.push("p.id_mesero = ?");
    params.push(req.usuario!.id);
  }

  res.json(await cargarPedidos(pool, condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "", params));
});

/** GET /api/pedidos/:id */
pedidosRouter.get("/:id", requiereAuth(), async (req, res) => {
  const pedido = await cargarPedido(pool, idDeRuta(req.params.id));
  if (!pedido) throw new ErrorApi(404, "no_encontrado", "El pedido no existe.");
  res.json(pedido);
});

/** PATCH /api/pedidos/:id  { detalle }  → reemplaza TODO el detalle. Solo si el pedido sigue `registrado`. */
pedidosRouter.patch("/:id", requiereAuth("mesero", "gerente"), async (req, res) => {
  const id = idDeRuta(req.params.id);
  const { detalle } = validar(Actualizacion, req.body);

  const pedido = await transaccion(async (cx) => {
    const { estado } = await bloquearPedido(cx, id);
    if (estado !== "registrado") {
      throw new ErrorApi(409, "estado_invalido", "El pedido ya no está en estado registrado.");
    }
    await exigirDisponibles(cx, detalle.map((l) => l.producto_id));
    await ejecutar(cx, "DELETE FROM detalle_pedido WHERE id_pedido = ?", [id]);
    await guardarDetalle(cx, id, detalle);
    return pedidoOError(cx, id);
  });

  res.json(pedido);
});

/** POST /api/pedidos/:id/enviar  → `registrado` pasa a `enviado` (a cocina). */
pedidosRouter.post("/:id/enviar", requiereAuth("mesero", "gerente"), async (req, res) => {
  const id = idDeRuta(req.params.id);

  const pedido = await transaccion(async (cx) => {
    const { estado } = await bloquearPedido(cx, id);
    if (estado !== "registrado") {
      throw new ErrorApi(409, "estado_invalido", "Solo se puede enviar un pedido registrado.");
    }
    // Un producto pudo agotarse entre el registro y el envío.
    const detalle = await filas(cx, "SELECT DISTINCT id_producto FROM detalle_pedido WHERE id_pedido = ?", [id]);
    await exigirDisponibles(cx, detalle.map((d) => d.id_producto as number));

    await ejecutar(cx, "UPDATE pedido SET id_estado = ? WHERE id_pedido = ?", [await idEstadoPedido(cx, "enviado"), id]);
    return pedidoOError(cx, id);
  });

  res.json(pedido);
});

/**
 * POST /api/pedidos/:id/cancelar  { motivo }
 * El pedido NO se borra (queda el historial): pasa a `cancelado` con su motivo.
 *  - registrado / enviado: lo puede cancelar el mesero o el gerente.
 *  - en_preparacion: solo el gerente (el mesero recibe 403 `requiere_gerente`).
 *  - cualquier otro estado: 409.
 */
pedidosRouter.post("/:id/cancelar", requiereAuth("mesero", "gerente"), async (req, res) => {
  const id = idDeRuta(req.params.id);
  const { motivo } = validar(Cancelacion, req.body);
  const rol = req.usuario!.rol;

  const pedido = await transaccion(async (cx) => {
    const { estado } = await bloquearPedido(cx, id);
    if (estado === "en_preparacion" && rol !== "gerente") {
      throw new ErrorApi(403, "requiere_gerente", "El pedido está en preparación: solo el gerente puede cancelarlo.");
    }
    if (estado !== "registrado" && estado !== "enviado" && estado !== "en_preparacion") {
      throw new ErrorApi(409, "estado_invalido", "Este pedido ya no se puede cancelar.");
    }
    await ejecutar(cx, "UPDATE pedido SET id_estado = ?, id_motivo = ? WHERE id_pedido = ?", [
      await idEstadoPedido(cx, "cancelado"),
      await idMotivo(cx, motivo),
      id,
    ]);
    return pedidoOError(cx, id);
  });

  res.json(pedido);
});
