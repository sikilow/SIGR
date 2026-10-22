// Tipos `Pedido` y `DetallePedido` (tablas `pedido` y `detalle_pedido`). Ver docs/equivalencias-bd.md.
import type { EstadoPedido } from './estados'

export interface DetallePedido {
  /** detalle_pedido.id_producto */
  idProducto: number
  /** CALCULADO por la API (JOIN con producto.nombre); no es columna de `detalle_pedido`. */
  nombreProducto: string
  /** detalle_pedido.cantidad (siempre mayor que 0). */
  cantidad: number
  /** detalle_pedido.indicaciones (VARCHAR(255), NULL en la BD; aquí `''` si no hay). En pantalla se llaman «Observaciones». */
  indicaciones: string
  /** detalle_pedido.precio_unitario: precio vigente al registrar el pedido, en MXN. */
  precioUnitario: number
}

export interface Pedido {
  /** pedido.id_pedido */
  idPedido: number
  /** pedido.id_cuenta */
  idCuenta: number
  /** pedido.id_mesero */
  idMesero: number
  /** usuario.nombre del mesero que creó el pedido. */
  nombreMesero: string
  /** pedido.id_estado, ya traducido a código con el nombre de estado_pedido (JOIN). */
  estado: EstadoPedido
  /** pedido.fecha_hora (DATETIME sin zona horaria, interpretada como hora local). */
  fechaHora: Date
  /** pedido.id_motivo; `null` si el pedido no está cancelado. */
  idMotivo: number | null
  /** Líneas del pedido (`detalle_pedido.id_pedido`). */
  detalle: DetallePedido[]

  // --- Campos CALCULADOS por la API (no son columnas de `pedido`) ---
  /** `pedido` NO tiene `id_mesa`: la API lo obtiene de `cuenta.id_mesa`. */
  idMesa: number
  /** mesa.numero (JOIN): número visible de la mesa, para listar sin pedir las mesas. */
  mesaNumero: number
  /** motivo_cancelacion.descripcion (JOIN); `null` si el pedido no está cancelado. */
  motivoDescripcion: string | null
  /** Suma de cantidad × precioUnitario, en MXN. */
  total: number
}

/** Línea que el cliente envía al registrar o modificar un pedido. NO incluye precios: los fija el servidor. */
export interface LineaNuevoPedido {
  idProducto: number
  cantidad: number
  indicaciones: string
}

/** Datos para registrar un pedido nuevo (queda en estado `registrado`). La API resuelve (o abre) la cuenta de la mesa. */
export interface NuevoPedido {
  idMesa: number
  detalle: LineaNuevoPedido[]
}

export interface FiltroPedidos {
  idMesa?: number
  estado?: EstadoPedido
}

/** Tabla `motivo_cancelacion`. Al cancelar, el cliente envía solo la `descripcion`; la API crea el motivo. */
export interface MotivoCancelacion {
  idMotivo: number
  descripcion: string
}

/** motivo_cancelacion.descripcion es VARCHAR(200) en database/init.sql: el texto de cancelación va de 5 a 200 caracteres. */
export const DESCRIPCION_MOTIVO_MIN = 5
export const DESCRIPCION_MOTIVO_MAX = 200
