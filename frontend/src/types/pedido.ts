// PROVISIONAL: modelo de dominio pendiente de validar con el equipo de API.

export type EstadoPedido =
  | 'registrado'
  | 'enviado'
  | 'en_preparacion'
  | 'listo'
  | 'entregado'
  | 'cancelado'
  | 'pagado'

export interface DetallePedido {
  productoId: number
  nombreProducto: string
  cantidad: number
  observaciones: string
  /** Precio vigente al registrar el pedido, en MXN. */
  precioUnitario: number
}

export interface Pedido {
  id: number
  mesaId: number
  /** CAMBIO PROPUESTO EN F5: número visible de la mesa (puede diferir del id), para listar sin pedir las mesas. */
  mesaNumero: number
  cuentaId: number
  meseroId: number
  estado: EstadoPedido
  detalle: DetallePedido[]
  /** Suma de cantidad × precioUnitario, en MXN. */
  total: number
  /** Fecha ISO 8601. */
  creadoEn: string
  /** Texto libre (5 a 200 caracteres) escrito al cancelar; `null` si el pedido no está cancelado. */
  motivoCancelacion: MotivoCancelacion | null
}

/** Línea que el cliente envía al registrar o modificar un pedido. NO incluye precios: los fija el servidor. */
export interface LineaNuevoPedido {
  productoId: number
  cantidad: number
  observaciones: string
}

/** Datos para registrar un pedido nuevo (queda en estado `registrado`). */
export interface NuevoPedido {
  mesaId: number
  detalle: LineaNuevoPedido[]
}

export interface FiltroPedidos {
  mesaId?: number
  estado?: EstadoPedido
}

/**
 * Motivo al cancelar un pedido.
 * CAMBIO PROPUESTO EN F5: antes era un código fijo (`error_captura`, `cliente_desiste`…); ahora es
 * texto libre obligatorio de 5 a 200 caracteres (los atajos de la interfaz solo rellenan el texto).
 */
export type MotivoCancelacion = string

export const MOTIVO_MIN = 5
export const MOTIVO_MAX = 200
