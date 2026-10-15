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
  cuentaId: number
  meseroId: number
  estado: EstadoPedido
  detalle: DetallePedido[]
  /** Suma de cantidad × precioUnitario, en MXN. */
  total: number
  /** Fecha ISO 8601. */
  creadoEn: string
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

/** Códigos de motivo al cancelar un pedido. */
export type MotivoCancelacion =
  | 'error_captura'
  | 'cliente_desiste'
  | 'producto_agotado'
  | 'otro'
