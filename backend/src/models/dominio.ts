// Traduce entre la base de datos (SIGR) y el JSON que espera el frontend,
// y reúne las consultas que comparten varias rutas.
//
// CONTRATO JSON: las claves son los NOMBRES EXACTOS de las columnas de la BD (id_mesa, fecha_hora,
// precio_unitario…). Lo que no es columna se marca como "calculado" (estado, id_mesa y mesa_numero del pedido,
// motivo_descripcion, total, nombre_producto…). Ver docs/contrato-api-mesero.md y docs/equivalencias-bd.md.
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { ejecutar, filas, type Ejecutor } from "../services/db";
import { ErrorApi } from "../utils/errores";

// ---------- Estados de pedido: código interno  →  nombre en la tabla estado_pedido ----------
// 'Pendiente' se usa como "enviado a cocina" (la BD no tiene 'Enviado'). 'Registrado' y 'Pagado' ya vienen en
// database/init.sql. La API ENTREGA el nombre del catálogo ('En preparacion'); el frontend lo normaliza.
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

/** 'En preparación' / 'en_preparacion' / 'EN PREPARACION' → 'en_preparacion' (minúsculas, sin acentos, `_`). */
export function normalizarCodigo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Filtro `?estado=` de GET /pedidos: acepta el código interno (`enviado`), el nombre del catálogo
 * (`Pendiente`, `En preparacion`) o su versión normalizada (`pendiente`). Devuelve el nombre en `estado_pedido`.
 */
export function nombreEstadoDeFiltro(texto: string): string | null {
  const codigo = normalizarCodigo(texto);
  const interno = ESTADOS_PEDIDO.find((e) => e === codigo);
  if (interno) return ESTADO_PEDIDO_DB[interno];
  const porNombre = Object.values(ESTADO_PEDIDO_DB).find((n) => normalizarCodigo(n) === codigo);
  return porNombre ?? null;
}

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
      `Falta el estado '${ESTADO_PEDIDO_DB[estado]}' en la tabla estado_pedido. Ejecuta database/migrations/001_ajustes_front.sql.`,
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
      productos: agotados.map((id_producto) => ({ id_producto, disponible: false })),
    });
  }
  return productos;
}

// ---------- Existencia (inventario) ----------
// La existencia se DESCUENTA al enviar el pedido a cocina y se DEVUELVE si se cancela después de enviarlo.
// Mientras el pedido solo está `registrado` no se descuenta (solo se avisa si ya no alcanza).
// Solo cuentan los productos con `controla_existencia`: lo que se prepara al momento no se limita ni se descuenta.
export interface LineaCantidad {
  id_producto: number;
  cantidad: number;
}

/** Suma las cantidades por producto (el mismo producto puede venir en varias líneas). */
function sumarPorProducto(lineas: LineaCantidad[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const l of lineas) mapa.set(l.id_producto, (mapa.get(l.id_producto) ?? 0) + l.cantidad);
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
      productos: faltantes.map((f) => ({ id_producto: f.id, disponible: false, existencia: f.queda, solicitado: f.pedidas })),
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
  id_detalle: number;
  id_producto: number;
  /** Calculado: producto.nombre (JOIN). No es columna de detalle_pedido. */
  nombre_producto: string;
  cantidad: number;
  indicaciones: string;
  precio_unitario: number;
}

export interface PedidoDto {
  id_pedido: number;
  id_cuenta: number;
  id_mesero: number;
  /** Calculado: usuario.nombre del mesero que creó el pedido. */
  nombre_mesero: string;
  id_estado: number;
  /** Calculado: estado_pedido.nombre (JOIN por pedido.id_estado), p. ej. "En preparacion". */
  estado: string;
  /** pedido.fecha_hora: DATETIME sin zona horaria, "2026-10-15 16:34:00". */
  fecha_hora: string;
  id_motivo: number | null;
  /** Calculado: `pedido` no tiene id_mesa; sale de cuenta.id_mesa. */
  id_mesa: number;
  /** Calculado: mesa.numero (JOIN). */
  mesa_numero: number;
  /** Calculado: motivo_cancelacion.descripcion (JOIN); null si no está cancelado. */
  motivo_descripcion: string | null;
  /** Calculado: suma de cantidad × precio_unitario. */
  total: number;
  detalle: DetallePedidoDto[];
}

const SELECT_PEDIDO = `
  SELECT p.id_pedido, p.id_cuenta, p.id_mesero, u.nombre AS nombre_mesero, p.id_estado,
         ep.nombre AS estado, p.fecha_hora, p.id_motivo,
         c.id_mesa, m.numero AS mesa_numero, mc.descripcion AS motivo_descripcion
    FROM pedido p
    JOIN cuenta c ON c.id_cuenta = p.id_cuenta
    JOIN mesa m ON m.id_mesa = c.id_mesa
    JOIN usuario u ON u.id_usuario = p.id_mesero
    JOIN estado_pedido ep ON ep.id_estado = p.id_estado
    LEFT JOIN motivo_cancelacion mc ON mc.id_motivo = p.id_motivo`;

/** Pedidos (con su detalle) que cumplen `condicion` (un WHERE con `?`), del más nuevo al más viejo. */
export async function cargarPedidos(ex: Ejecutor, condicion = "", params: unknown[] = []): Promise<PedidoDto[]> {
  const pedidos = await filas(ex, `${SELECT_PEDIDO} ${condicion} ORDER BY p.fecha_hora DESC, p.id_pedido DESC`, params);
  if (pedidos.length === 0) return [];

  const detalles = await filas(
    ex,
    `SELECT dp.id_detalle, dp.id_pedido, dp.id_producto, pr.nombre AS nombre_producto,
            dp.cantidad, dp.indicaciones, dp.precio_unitario
       FROM detalle_pedido dp
       JOIN producto pr ON pr.id_producto = dp.id_producto
      WHERE dp.id_pedido IN (?)
      ORDER BY dp.id_detalle`,
    [pedidos.map((p) => p.id_pedido as number)],
  );

  const porPedido = new Map<number, DetallePedidoDto[]>();
  for (const d of detalles) {
    const lista = porPedido.get(d.id_pedido as number) ?? [];
    lista.push({
      id_detalle: d.id_detalle as number,
      id_producto: d.id_producto as number,
      nombre_producto: d.nombre_producto as string,
      cantidad: d.cantidad as number,
      indicaciones: (d.indicaciones as string | null) ?? "",
      precio_unitario: Number(d.precio_unitario),
    });
    porPedido.set(d.id_pedido as number, lista);
  }

  return pedidos.map((p) => {
    const detalle = porPedido.get(p.id_pedido as number) ?? [];
    return {
      id_pedido: p.id_pedido as number,
      id_cuenta: p.id_cuenta as number,
      id_mesero: p.id_mesero as number,
      nombre_mesero: p.nombre_mesero as string,
      id_estado: p.id_estado as number,
      estado: p.estado as string,
      fecha_hora: p.fecha_hora as string,
      id_motivo: (p.id_motivo as number | null) ?? null,
      id_mesa: p.id_mesa as number,
      mesa_numero: p.mesa_numero as number,
      motivo_descripcion: (p.motivo_descripcion as string | null) ?? null,
      // El total SIEMPRE se calcula aquí, nunca viene del cliente.
      total: redondear(detalle.reduce((suma, d) => suma + d.cantidad * d.precio_unitario, 0)),
      detalle,
    };
  });
}

export async function cargarPedido(ex: Ejecutor, id: number): Promise<PedidoDto | null> {
  const [pedido] = await cargarPedidos(ex, "WHERE p.id_pedido = ?", [id]);
  return pedido ?? null;
}

// ---------- Cuentas ----------
export interface CuentaDto {
  id_cuenta: number;
  id_mesa: number;
  estado: string;
  abierta_en: string;
  cerrada_en: string | null;
  /** cuenta.tipo_pago_solicitado ("fisico" | "digital"); NULL mientras no se solicite. */
  tipo_pago_solicitado: string | null;
  /** Calculado: pedidos de la cuenta (pedido.id_cuenta). */
  pedidos: PedidoDto[];
  /** Calculado: suma de cantidad × precio_unitario de los pedidos NO cancelados. */
  total: number;
}

/** Cuenta con sus pedidos. El total excluye los pedidos cancelados. */
export async function cargarCuenta(ex: Ejecutor, idCuenta: number): Promise<CuentaDto | null> {
  const [c] = await filas(
    ex,
    "SELECT id_cuenta, id_mesa, estado, abierta_en, cerrada_en, tipo_pago_solicitado FROM cuenta WHERE id_cuenta = ?",
    [idCuenta],
  );
  if (!c) return null;
  const pedidos = await cargarPedidos(ex, "WHERE p.id_cuenta = ?", [idCuenta]);
  return {
    id_cuenta: c.id_cuenta as number,
    id_mesa: c.id_mesa as number,
    estado: c.estado as string,
    abierta_en: c.abierta_en as string,
    cerrada_en: (c.cerrada_en as string | null) ?? null,
    tipo_pago_solicitado: (c.tipo_pago_solicitado as string | null) ?? null,
    pedidos,
    total: redondear(pedidos.filter((p) => p.estado !== ESTADO_PEDIDO_DB.cancelado).reduce((suma, p) => suma + p.total, 0)),
  };
}
