// PROVISIONAL: modelo de dominio pendiente de validar con el equipo de API.
import type { EstadoCuentaActiva, TipoPago } from './cuenta'

export type EstadoMesa = 'libre' | 'ocupada' | 'reservada'

export interface Mesa {
  id: number
  /** Número visible en el salón (puede diferir del id). */
  numero: number
  capacidad: number
  estado: EstadoMesa

  // --- CAMBIO PROPUESTO EN F3: resumen de la cuenta activa, para el Panel de mesas ---
  /** Estado de la cuenta activa de la mesa; `null` si no hay cuenta activa. */
  estadoCuenta: EstadoCuentaActiva | null
  /** Pedidos de la cuenta activa que no están cancelados ni pagados. */
  pedidosActivos: number
  /** Total acumulado de la cuenta activa (sin pedidos cancelados), en MXN. */
  totalCuenta: number
  /**
   * CAMBIO PROPUESTO EN F6: tipo de pago ya solicitado (`null` si la cuenta aún no se solicitó o si la
   * API no lo envía). El panel lo usa para mostrar "Cuenta solicitada · Pago digital".
   */
  tipoPagoSolicitado: TipoPago | null
  /** Cantidad de pedidos en estado `listo` (cocina terminó; falta servirlos). */
  pedidosListos: number
}
