// Traduce entre la base de datos (SIGR) y el JSON que espera el frontend,
// y reúne las consultas que comparten varias rutas.
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { ejecutar, filas, type Ejecutor } from "./db";
import { ErrorApi } from "./errores";

// ---------- Estados de pedido: código del front  →  nombre en la tabla estado_pedido ----------
// 'Pendiente' (ya existía en tu esquema) se usa como "enviado a cocina".
// 'Registrado' y 'Pagado' los agrega database/migracion_01_front.sql.
export const ESTADO_PEDIDO_DB = {
  registrado: "Registrado",
  enviado: "Pendiente",
  en_preparacion: "En preparacion",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Cancelado",
  pagado: "Pagado",
} as const;

export type EstadoPedido = keyof typeof ESTADO_PEDIDO_DB;
export const ESTADOS_PEDIDO = Object.keys(ESTADO_PEDIDO_DB) as [EstadoPedido, ...EstadoPedido[]];

const ESTADO_DESDE_DB = Object.fromEntries(
  Object.entries(ESTADO_PEDIDO_DB).map(([codigo, nombre]) => [nombre, codigo]),
) as Record<string, EstadoPedido>;

// ---------- Utilidades ----------
const redondear = (n: number): number => Math.round(n * 100) / 100;

/** Valida con zod; si falla, responde 422 con un mensaje legible. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
    throw new ErrorApi(422, "estado_invalido", `Datos inválidos (${detalle.join("; ")}).`);
  }
  return r.data;
}

/** Convierte el parámetro :id de la URL en entero positivo, o responde 404. */
export function idDeRuta(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof texto !== "string" || !/^[1-9]\d*$/.test(texto)) {
    throw new ErrorApi(404, "no_encontrado", "El recurso indicado no existe.");
  }
  return Number(texto);
}

export async function idEstadoPedido(ex: Ejecutor, estado: EstadoPedido): Promise<number> {
  const [fila] = await filas<RowDataPacket>(ex, "SELECT id_estado FROM estado_pedido WHERE nombre = ?", [
    ESTADO_PEDIDO_DB[estado],
  ]);
  if (!fila) {
    throw new ErrorApi(
      500,
      "desconocido",
      `Falta el estado '${ESTADO_PEDIDO_DB[estado]}' en la tabla estado_pedido. Ejecuta database/migracion_01_front.sql.`,
    );
  }
  return fila.id_estado as number;
}

/**
 * El motivo de cancelación es TEXTO LIBRE (5 a 200 caracteres). Se reutiliza la fila si ya existe
 * un motivo igual en motivo_cancelacion; si no, se crea.
 */
export async function idMotivoTexto(ex: Ejecutor, texto: string): Promise<number> {
  const [fila] = await filas<RowDataPacket>(ex, "SELECT id_motivo FROM motivo_cancelacion WHERE descripcion = ? LIMIT 1", [texto]);
  if (fila) return fila.id_motivo as number;
  const res = await ejecutar(ex, "INSERT INTO motivo_cancelacion (descripcion) VALUES (?)", [texto]);
  return res.insertId;
}

// ---------- Productos y disponibilidad ----------
// Un producto está disponible si está activo (producto.disponible) Y (no controla existencia O tiene existencia > 0).
// `controla_existencia = FALSE` es para lo que se prepara al momento: no tiene existencia que contar.
export interface ProductoPrecio {
  id: number;
  nombre: string;
  precio: number;
  disponible: boolean;
}

export async function productosPorId(ex: Ejecutor, ids: number[]): Promise<Map<number, ProductoPrecio>> {
  const mapa = new Map<number, ProductoPrecio>();
  if (ids.length === 0) return mapa;
  const rows = await filas(
    ex,
    `SELECT p.id_producto AS id, p.nombre, p.precio,
            (p.disponible AND (p.controla_existencia = 0 OR COALESCE(i.existencia, 0) > 0)) AS disponible
       FROM producto p
       LEFT JOIN disponibilidadProducto i ON i.id_producto = p.id_producto
      WHERE p.id_producto IN (?)`,
    [ids],
  );
  for (const r of rows) {
    mapa.set(r.id as number, {
      id: r.id as number,
      nombre: r.nombre as string,
      precio: Number(r.precio),
      disponible: Boolean(r.disponible),
    });
  }
  return mapa;
}

/** Lanza 409 `producto_agotado` (con la lista) si alguno de los ids está agotado o ya no existe. */
export async function exigirDisponibles(ex: Ejecutor, ids: number[]): Promise<Map<number, ProductoPrecio>> {
  const unicos = [...new Set(ids)];
  const productos = await productosPorId(ex, unicos);
  const agotados = unicos.filter((id) => !productos.get(id)?.disponible);
  if (agotados.length > 0) {
    throw new ErrorApi(409, "producto_agotado", "Hay productos agotados en el pedido.", {
      productos: agotados.map((producto_id) => ({ producto_id, disponible: false })),
    });
  }
  return productos;
}

// ---------- Existencia (inventario) ----------
// La existencia se DESCUENTA al enviar el pedido a cocina y se DEVUELVE si se cancela después de enviarlo.
// Mientras el pedido solo está `registrado` no se descuenta (solo se avisa si ya no alcanza).
// Solo cuentan los productos con `controla_existencia`: lo que se prepara al momento no se limita ni se descuenta.
export interface LineaCantidad {
  producto_id: number;
  cantidad: number;
}

/** Suma las cantidades por producto (el mismo producto puede venir en varias líneas). */
function sumarPorProducto(lineas: LineaCantidad[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const l of lineas) mapa.set(l.producto_id, (mapa.get(l.producto_id) ?? 0) + l.cantidad);
  return mapa;
}

/**
 * Revisa que la existencia alcance para las cantidades pedidas. Lanza 409 `producto_agotado` con el detalle
 * (cuánto se pidió y cuánto queda). Con `descontar: true` además resta la existencia, bloqueando las filas de
 * inventario (FOR UPDATE, siempre en orden de id para evitar interbloqueos): dos meseros que piden lo último
 * a la vez no pueden vender el mismo producto dos veces. Debe llamarse dentro de una transacción.
 */
export async function verificarExistencia(ex: Ejecutor, lineas: LineaCantidad[], descontar: boolean): Promise<void> {
  const pedidas = sumarPorProducto(lineas);
  const ids = [...pedidas.keys()].sort((a, b) => a - b);
  if (ids.length === 0) return;

  const productos = await filas(
    ex,
    "SELECT id_producto, nombre, disponible, controla_existencia FROM producto WHERE id_producto IN (?)",
    [ids],
  );
  const infoProducto = new Map(
    productos.map((r) => [
      r.id_producto as number,
      { nombre: r.nombre as string, activo: Boolean(r.disponible), controla: Boolean(r.controla_existencia) },
    ]),
  );

  // Solo los productos que controlan existencia entran al inventario. Lo que se prepara al momento
  // (controla_existencia = 0) no se limita ni se descuenta, aunque tenga una fila de inventario.
  const controlados = ids.filter((id) => infoProducto.get(id)?.controla);
  const existencias = new Map<number, number>();
  if (controlados.length > 0) {
    const inventario = await filas(
      ex,
      `SELECT id_producto, existencia FROM disponibilidadProducto WHERE id_producto IN (?) ORDER BY id_producto${descontar ? " FOR UPDATE" : ""}`,
      [controlados],
    );
    for (const r of inventario) existencias.set(r.id_producto as number, r.existencia as number);
  }

  const faltantes = ids.flatMap((id) => {
    const info = infoProducto.get(id);
    if (info?.activo && !info.controla) return []; // se prepara al momento: sin límite
    const queda = info?.activo ? (existencias.get(id) ?? 0) : 0;
    const pedido = pedidas.get(id)!;
    return queda < pedido ? [{ id, nombre: info?.nombre ?? `Producto ${id}`, pedidas: pedido, queda }] : [];
  });

  if (faltantes.length > 0) {
    const texto = faltantes
      .map((f) => (f.queda === 0 ? `${f.nombre} (agotado)` : `${f.nombre} (pides ${f.pedidas}, solo quedan ${f.queda})`))
      .join("; ");
    throw new ErrorApi(409, "producto_agotado", `No hay existencia suficiente: ${texto}.`, {
      productos: faltantes.map((f) => ({ producto_id: f.id, disponible: false, existencia: f.queda, solicitado: f.pedidas })),
    });
  }

  if (descontar) {
    for (const id of controlados) {
      await ejecutar(ex, "UPDATE disponibilidadProducto SET existencia = existencia - ? WHERE id_producto = ?", [pedidas.get(id)!, id]);
    }
  }
}

/** Devuelve al inventario lo que consumió un pedido ya enviado (al cancelarlo); solo productos que controlan existencia. Dentro de una transacción. */
export async function devolverExistencia(ex: Ejecutor, pedidoId: number): Promise<void> {
  const lineas = await filas(
    ex,
    `SELECT dp.id_producto, SUM(dp.cantidad) AS cantidad
       FROM detalle_pedido dp
       JOIN producto p ON p.id_producto = dp.id_producto
      WHERE dp.id_pedido = ? AND p.controla_existencia = 1
      GROUP BY dp.id_producto
      ORDER BY dp.id_producto`,
    [pedidoId],
  );
  for (const l of lineas) {
    await ejecutar(ex, "UPDATE disponibilidadProducto SET existencia = existencia + ? WHERE id_producto = ?", [
      Number(l.cantidad),
      l.id_producto,
    ]);
  }
}

// ---------- Pedidos ----------
export interface DetallePedidoDto {
  producto_id: number;
  nombre_producto: string;
  cantidad: number;
  observaciones: string;
  precio_unitario: number;
}

export interface PedidoDto {
  id: number;
  mesa_id: number;
  mesa_numero: number;
  cuenta_id: number;
  mesero_id: number;
  estado: EstadoPedido;
  detalle: DetallePedidoDto[];
  total: number;
  creado_en: string;
  /** Texto libre escrito al cancelar; null si no está cancelado. */
  motivo_cancelacion: string | null;
}

const SELECT_PEDIDO = `
  SELECT p.id_pedido AS id, c.id_mesa AS mesa_id, m.numero AS mesa_numero, p.id_cuenta AS cuenta_id, p.id_mesero AS mesero_id,
         ep.nombre AS estado, p.fecha_hora AS creado_en, mc.descripcion AS motivo
    FROM pedido p
    JOIN cuenta c ON c.id_cuenta = p.id_cuenta
    JOIN mesa m ON m.id_mesa = c.id_mesa
    JOIN estado_pedido ep ON ep.id_estado = p.id_estado
    LEFT JOIN motivo_cancelacion mc ON mc.id_motivo = p.id_motivo`;

/** Pedidos (con su detalle) que cumplen `condicion` (un WHERE con `?`), del más nuevo al más viejo. */
export async function cargarPedidos(ex: Ejecutor, condicion = "", params: unknown[] = []): Promise<PedidoDto[]> {
  const pedidos = await filas(ex, `${SELECT_PEDIDO} ${condicion} ORDER BY p.fecha_hora DESC, p.id_pedido DESC`, params);
  if (pedidos.length === 0) return [];

  const detalles = await filas(
    ex,
    `SELECT dp.id_pedido AS pedido_id, dp.id_producto AS producto_id, pr.nombre AS nombre_producto,
            dp.cantidad, dp.indicaciones AS observaciones, dp.precio_unitario
       FROM detalle_pedido dp
       JOIN producto pr ON pr.id_producto = dp.id_producto
      WHERE dp.id_pedido IN (?)
      ORDER BY dp.id_detalle`,
    [pedidos.map((p) => p.id as number)],
  );

  const porPedido = new Map<number, DetallePedidoDto[]>();
  for (const d of detalles) {
    const lista = porPedido.get(d.pedido_id as number) ?? [];
    lista.push({
      producto_id: d.producto_id as number,
      nombre_producto: d.nombre_producto as string,
      cantidad: d.cantidad as number,
      observaciones: (d.observaciones as string | null) ?? "",
      precio_unitario: Number(d.precio_unitario),
    });
    porPedido.set(d.pedido_id as number, lista);
  }

  return pedidos.map((p) => {
    const detalle = porPedido.get(p.id as number) ?? [];
    return {
      id: p.id as number,
      mesa_id: p.mesa_id as number,
      mesa_numero: p.mesa_numero as number,
      cuenta_id: p.cuenta_id as number,
      mesero_id: p.mesero_id as number,
      estado: ESTADO_DESDE_DB[p.estado as string] ?? "registrado",
      detalle,
      // El total SIEMPRE se calcula aquí, nunca viene del cliente.
      total: redondear(detalle.reduce((suma, d) => suma + d.cantidad * d.precio_unitario, 0)),
      creado_en: (p.creado_en as Date).toISOString(),
      motivo_cancelacion: (p.motivo as string | null) ?? null,
    };
  });
}

export async function cargarPedido(ex: Ejecutor, id: number): Promise<PedidoDto | null> {
  const [pedido] = await cargarPedidos(ex, "WHERE p.id_pedido = ?", [id]);
  return pedido ?? null;
}

// ---------- Cuentas ----------
export interface CuentaDto {
  id: number;
  mesa_id: number;
  estado: "abierta" | "por_pagar" | "cerrada";
  pedidos: PedidoDto[];
  total: number;
  abierta_en: string;
  tipo_pago_solicitado: "fisico" | "digital" | null;
}

/** Cuenta con sus pedidos. El total excluye los pedidos cancelados. */
export async function cargarCuenta(ex: Ejecutor, idCuenta: number): Promise<CuentaDto | null> {
  const [c] = await filas(
    ex,
    "SELECT id_cuenta, id_mesa, estado, abierta_en, tipo_pago_solicitado FROM cuenta WHERE id_cuenta = ?",
    [idCuenta],
  );
  if (!c) return null;
  const pedidos = await cargarPedidos(ex, "WHERE p.id_cuenta = ?", [idCuenta]);
  return {
    id: c.id_cuenta as number,
    mesa_id: c.id_mesa as number,
    estado: c.estado as CuentaDto["estado"],
    pedidos,
    total: redondear(pedidos.filter((p) => p.estado !== "cancelado").reduce((suma, p) => suma + p.total, 0)),
    abierta_en: (c.abierta_en as Date).toISOString(),
    tipo_pago_solicitado: (c.tipo_pago_solicitado as CuentaDto["tipo_pago_solicitado"]) ?? null,
  };
}
