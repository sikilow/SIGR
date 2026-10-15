// PROVISIONAL: modelo de dominio pendiente de validar con el equipo de API.
import type { Pedido } from './pedido'

export type EstadoCuenta = 'abierta' | 'por_pagar' | 'cerrada'

/** Estados de una cuenta activa (la que una mesa puede tener a lo sumo una). */
export type EstadoCuentaActiva = Exclude<EstadoCuenta, 'cerrada'>

/** Forma de pago solicitada: cobro en caja física o pago digital. */
export type TipoPago = 'fisico' | 'digital'

/** Una cuenta activa por mesa; agrupa varios pedidos. */
export interface Cuenta {
  id: number
  mesaId: number
  estado: EstadoCuenta
  pedidos: Pedido[]
  /** Suma de los pedidos no cancelados, en MXN. */
  total: number
  /** Fecha ISO 8601. */
  abiertaEn: string
  tipoPagoSolicitado: TipoPago | null
}
