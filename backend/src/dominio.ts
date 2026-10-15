// Traduce entre la base de datos (SIGR) y el JSON que espera el frontend,
// y reúne las consultas que comparten varias rutas.
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { filas, type Ejecutor } from "./db";
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

// ---------- Motivos de cancelación: código del front  →  descripción en motivo_cancelacion ----------
export const MOTIVO_DB = {
  error_captura: "Error al capturar",
  cliente_desiste: "Cliente cambió de opinión",
  producto_agotado: "Producto agotado",
  otro: "Otro",
} as const;

export type MotivoCancelacion = keyof typeof MOTIVO_DB;
export const MOTIVOS = Object.keys(MOTIVO_DB) as [MotivoCancelacion, ...MotivoCancelacion[]];

const MOTIVO_DESDE_DB = Object.fromEntries(
  Object.entries(MOTIVO_DB).map(([codigo, descripcion]) => [descripcion, codigo]),
) as Record<string, MotivoCancelacion>;

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

export async function idMotivo(ex: Ejecutor, motivo: MotivoCancelacion): Promise<number> {
  const [fila] = await filas<RowDataPacket>(ex, "SELECT id_motivo FROM motivo_cancelacion WHERE descripcion = ? LIMIT 1", [
    MOTIVO_DB[motivo],
  ]);
  if (!fila) {
    throw new ErrorApi(
      500,
      "desconocido",
      `Falta el motivo '${MOTIVO_DB[motivo]}' en motivo_cancelacion. Ejecuta database/migracion_01_front.sql.`,
    );
  }
  return fila.id_motivo as number;
}

// ---------- Productos y disponibilidad ----------
// Un producto está disponible si está activo (producto.disponible) Y tiene existencia > 0.
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
            (p.disponible AND COALESCE(i.existencia, 0) > 0) AS disponible
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
  cuenta_id: number;
  mesero_id: number;
  estado: EstadoPedido;
  detalle: DetallePedidoDto[];
  total: number;
  creado_en: string;
  motivo_cancelacion: MotivoCancelacion | null;
}

const SELECT_PEDIDO = `
  SELECT p.id_pedido AS id, c.id_mesa AS mesa_id, p.id_cuenta AS cuenta_id, p.id_mesero AS mesero_id,
         ep.nombre AS estado, p.fecha_hora AS creado_en, mc.descripcion AS motivo
    FROM pedido p
    JOIN cuenta c ON c.id_cuenta = p.id_cuenta
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
      cuenta_id: p.cuenta_id as number,
      mesero_id: p.mesero_id as number,
      estado: ESTADO_DESDE_DB[p.estado as string] ?? "registrado",
      detalle,
      // El total SIEMPRE se calcula aquí, nunca viene del cliente.
      total: redondear(detalle.reduce((suma, d) => suma + d.cantidad * d.precio_unitario, 0)),
      creado_en: (p.creado_en as Date).toISOString(),
      motivo_cancelacion: p.motivo ? (MOTIVO_DESDE_DB[p.motivo as string] ?? "otro") : null,
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
