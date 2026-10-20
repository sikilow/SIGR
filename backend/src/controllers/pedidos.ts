import type { Request, Response } from "express";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { ESTADO_PEDIDO_DB, ESTADOS_PEDIDO, cargarPedido, cargarPedidos, exigirDisponibles, idDeRuta, idEstadoPedido, idMotivoTexto, devolverExistencia, nombreEstadoDeFiltro, validar, verificarExistencia, type PedidoDto } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { conIdempotencia } from "../services/idempotencia";

// detalle_pedido: id_producto, cantidad (CHECK > 0) e indicaciones (VARCHAR(255)). El cliente NUNCA envía precios.
const Linea = z.object({
  id_producto: z.number().int().positive(),
  cantidad: z.number().int().min(1).max(99),
  indicaciones: z.string().max(255).default(""),
});
type LineaPedido = z.infer<typeof Linea>;

const NuevoPedido = z.object({ id_mesa: z.number().int().positive(), detalle: z.array(Linea).min(1, "El pedido no tiene productos") });
const Actualizacion = z.object({ detalle: z.array(Linea).min(1, "El pedido no tiene productos") });
// motivo_cancelacion.descripcion es VARCHAR(200).
const Cancelacion = z.object({
  descripcion: z
    .string()
    .trim()
    .min(5, "El motivo debe tener al menos 5 caracteres")
    .max(200, "El motivo no puede pasar de 200 caracteres"),
});
const CambioCocina = z.object({ estado: z.enum(["en_preparacion", "listo"]) });
const Filtros = z.object({
  id_mesa: z.coerce.number().int().positive().optional(),
  // Nombre del catálogo ("En preparacion"), su código ("en_preparacion") o el interno ("enviado").
  estado: z.string().min(1).optional(),
});

/** Verifica que los productos existan y estén disponibles, y guarda las líneas con el precio VIGENTE de la BD. */
async function guardarDetalle(cx: PoolConnection, pedidoId: number, lineas: LineaPedido[]): Promise<void> {
  const productos = await exigirDisponibles(cx, lineas.map((l) => l.id_producto));
  const valores = lineas.map((l) => [pedidoId, l.id_producto, l.cantidad, productos.get(l.id_producto)!.precio, l.indicaciones || null]);
  await cx.query("INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario, indicaciones) VALUES ?", [valores]);
}

/** Bloquea la fila del pedido durante la transacción y devuelve su estado (código del front). */
async function bloquearPedido(cx: PoolConnection, id: number) {
  const [fila] = await filas(
    cx,
    `SELECT p.id_pedido, ep.nombre AS estado, c.estado AS estado_cuenta
       FROM pedido p
       JOIN estado_pedido ep ON ep.id_estado = p.id_estado
       JOIN cuenta c ON c.id_cuenta = p.id_cuenta
      WHERE p.id_pedido = ? FOR UPDATE OF p`, // OF p: bloquea solo el pedido, no las filas compartidas
    [id],
  );
  if (!fila) throw new ErrorApi(404, "no_encontrado", `El pedido ${id} no existe.`);
  const estado = ESTADOS_PEDIDO.find((e) => ESTADO_PEDIDO_DB[e] === fila.estado) ?? "registrado";
  return { estado, cuentaPorPagar: fila.estado_cuenta === "por_pagar" };
}

async function pedidoOError(cx: PoolConnection, id: number): Promise<PedidoDto> {
  const pedido = await cargarPedido(cx, id);
  if (!pedido) throw new ErrorApi(404, "no_encontrado", `El pedido ${id} no existe.`);
  return pedido;
}

/**
 * POST /api/pedidos  { id_mesa, detalle: [{ id_producto, cantidad, indicaciones }] }   (acepta Idempotency-Key)
 * Crea el pedido en estado `registrado`. `pedido` no tiene id_mesa: se usa para ubicar (o abrir) la cuenta de la mesa.
 */
export const crearPedido = async (req: Request, res: Response) => {
  const { id_mesa, detalle } = validar(NuevoPedido, req.body);
  const meseroId = req.usuario!.id;

  await conIdempotencia(req, res, 201, () =>
    transaccion(async (cx) => {
      // FOR UPDATE: dos meseros que piden a la vez en la misma mesa no pueden abrir dos cuentas.
      const [mesa] = await filas(cx, "SELECT numero, estado FROM mesa WHERE id_mesa = ? FOR UPDATE", [id_mesa]);
      if (!mesa) throw new ErrorApi(404, "no_encontrado", `La mesa ${id_mesa} no existe.`);
      if (mesa.estado !== "ocupada") {
        throw new ErrorApi(409, "mesa_no_disponible", `La mesa ${mesa.numero} no está ocupada.`);
      }

      // Se valida antes de abrir la cuenta: si hay productos agotados no se crea nada.
      await exigirDisponibles(cx, detalle.map((l) => l.id_producto));
      await verificarExistencia(cx, detalle, false); // aviso temprano; el descuento real es al enviar

      const [activa] = await filas(cx, "SELECT id_cuenta, estado FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' LIMIT 1", [id_mesa]);
      if (activa?.estado === "por_pagar") throw new ErrorApi(409, "estado_invalido", "La cuenta ya solicitó el pago.");
      const cuentaId = activa
        ? (activa.id_cuenta as number)
        : (await ejecutar(cx, "INSERT INTO cuenta (id_mesa) VALUES (?)", [id_mesa])).insertId;

      const idEstado = await idEstadoPedido(cx, "registrado");
      const { insertId } = await ejecutar(cx, "INSERT INTO pedido (id_cuenta, id_mesero, id_estado) VALUES (?, ?, ?)", [cuentaId, meseroId, idEstado]);
      await guardarDetalle(cx, insertId, detalle);
      return pedidoOError(cx, insertId);
    }),
  );
};

/**
 * GET /api/pedidos?id_mesa=&estado=
 * Un mesero solo ve SUS pedidos; el resto de los roles ve todos.
 */
export const listarPedidos = async (req: Request, res: Response) => {
  const { id_mesa, estado } = validar(Filtros, req.query);
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (id_mesa !== undefined) {
    condiciones.push("c.id_mesa = ?");
    params.push(id_mesa);
  }
  if (estado !== undefined) {
    const nombre = nombreEstadoDeFiltro(estado);
    if (!nombre) throw new ErrorApi(422, "estado_invalido", `El estado '${estado}' no existe.`);
    condiciones.push("ep.nombre = ?");
    params.push(nombre);
  }
  if (req.usuario!.rol === "mesero") {
    condiciones.push("p.id_mesero = ?");
    params.push(req.usuario!.id);
  }

  res.json(await cargarPedidos(pool, condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "", params));
};

/** GET /api/pedidos/:id */
export const obtenerPedido = async (req: Request, res: Response) => {
  const pedido = await cargarPedido(pool, idDeRuta(req.params.id));
  if (!pedido) throw new ErrorApi(404, "no_encontrado", "El pedido no existe.");
  res.json(pedido);
};

/**
 * PATCH /api/pedidos/:id  { detalle }  → reemplaza TODO el detalle.
 * Solo si el pedido sigue `registrado` y su cuenta no ha solicitado el pago.
 */
export const editarPedido = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { detalle } = validar(Actualizacion, req.body);

  const pedido = await transaccion(async (cx) => {
    const { estado, cuentaPorPagar } = await bloquearPedido(cx, id);
    if (estado !== "registrado") {
      throw new ErrorApi(409, "estado_invalido", "El pedido ya no está en estado registrado.");
    }
    if (cuentaPorPagar) {
      throw new ErrorApi(409, "estado_invalido", "La cuenta ya solicitó el pago: no se pueden editar pedidos.");
    }
    await exigirDisponibles(cx, detalle.map((l) => l.id_producto));
    await verificarExistencia(cx, detalle, false);
    await ejecutar(cx, "DELETE FROM detalle_pedido WHERE id_pedido = ?", [id]);
    await guardarDetalle(cx, id, detalle);
    return pedidoOError(cx, id);
  });

  res.json(pedido);
};

/** POST /api/pedidos/:id/enviar  → `registrado` pasa a `enviado` (a cocina). Acepta Idempotency-Key. */
export const enviarPedido = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);

  await conIdempotencia(req, res, 200, () =>
    transaccion(async (cx) => {
      const { estado } = await bloquearPedido(cx, id);
      if (estado !== "registrado") {
        throw new ErrorApi(409, "estado_invalido", "Solo se puede enviar un pedido registrado.");
      }
      // Un producto pudo agotarse entre el registro y el envío: se bloquea el inventario, se verifica que
      // alcance y se descuenta. Si no alcanza, lanza 409 y la transacción se deshace (nada se descuenta).
      const detalle = await filas(cx, "SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = ?", [id]);
      await verificarExistencia(
        cx,
        detalle.map((d) => ({ id_producto: d.id_producto as number, cantidad: d.cantidad as number })),
        true,
      );

      await ejecutar(cx, "UPDATE pedido SET id_estado = ? WHERE id_pedido = ?", [await idEstadoPedido(cx, "enviado"), id]);
      return pedidoOError(cx, id);
    }),
  );
};

/**
 * POST /api/pedidos/:id/cancelar  { descripcion }   (motivo_cancelacion.descripcion: texto de 5 a 200 caracteres;
 * acepta Idempotency-Key). El pedido NO se borra (queda el historial): pasa a `cancelado` con su id_motivo.
 *  - registrado / enviado: lo puede cancelar el mesero o el gerente. Si ya se había enviado, devuelve la existencia.
 *  - en_preparacion: solo el gerente (el mesero recibe 403 `requiere_gerente`).
 *  - cuenta por_pagar o cualquier otro estado: 409.
 */
export const cancelarPedido = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { descripcion } = validar(Cancelacion, req.body);
  const rol = req.usuario!.rol;

  await conIdempotencia(req, res, 200, () =>
    transaccion(async (cx) => {
      const { estado, cuentaPorPagar } = await bloquearPedido(cx, id);
      if (estado === "en_preparacion" && rol !== "gerente") {
        throw new ErrorApi(403, "requiere_gerente", "El pedido está en preparación: solo el gerente puede cancelarlo.");
      }
      if (estado !== "registrado" && estado !== "enviado" && estado !== "en_preparacion") {
        throw new ErrorApi(409, "estado_invalido", "Este pedido ya no se puede cancelar.");
      }
      if (cuentaPorPagar) {
        throw new ErrorApi(409, "estado_invalido", "La cuenta ya solicitó el pago: no se pueden cancelar pedidos.");
      }
      // Si ya se había enviado a cocina, su existencia ya estaba descontada: se devuelve al inventario.
      if (estado === "enviado" || estado === "en_preparacion") await devolverExistencia(cx, id);
      await ejecutar(cx, "UPDATE pedido SET id_estado = ?, id_motivo = ? WHERE id_pedido = ?", [
        await idEstadoPedido(cx, "cancelado"),
        await idMotivoTexto(cx, descripcion),
        id,
      ]);
      return pedidoOError(cx, id);
    }),
  );
};

/** POST /api/pedidos/:id/entregar  → `listo` pasa a `entregado` (el mesero lo sirvió). Acepta Idempotency-Key. */
export const entregarPedido = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);

  await conIdempotencia(req, res, 200, () =>
    transaccion(async (cx) => {
      const { estado } = await bloquearPedido(cx, id);
      if (estado !== "listo") {
        throw new ErrorApi(409, "estado_invalido", "Solo se puede entregar un pedido que está listo.");
      }
      await ejecutar(cx, "UPDATE pedido SET id_estado = ? WHERE id_pedido = ?", [await idEstadoPedido(cx, "entregado"), id]);
      return pedidoOError(cx, id);
    }),
  );
};

/**
 * PATCH /api/pedidos/:id/estado  { estado: "en_preparacion" | "listo" }
 * Acción de la cocina (aún no hay pantalla para el cocinero; sirve para probar el flujo del mesero).
 * Solo avanza: enviado → en_preparacion → listo.
 */
export const cambiarEstadoPedido = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { estado: nuevo } = validar(CambioCocina, req.body);
  const requerido = nuevo === "en_preparacion" ? "enviado" : "en_preparacion";

  const pedido = await transaccion(async (cx) => {
    const { estado } = await bloquearPedido(cx, id);
    if (estado !== requerido) {
      throw new ErrorApi(409, "estado_invalido", `Para pasar a ${nuevo} el pedido debe estar en ${requerido}.`);
    }
    await ejecutar(cx, "UPDATE pedido SET id_estado = ? WHERE id_pedido = ?", [await idEstadoPedido(cx, nuevo), id]);
    return pedidoOError(cx, id);
  });

  res.json(pedido);
};
