// Tipo `Mesa` (tabla `mesa`). Ver docs/equivalencias-bd.md.
import type { TipoPago } from './cuenta'
import type { EstadoCuentaActiva, EstadoMesa } from './estados'

export interface Mesa {
  /** mesa.id_mesa */
  idMesa: number
  /** mesa.numero: número visible en el salón (puede diferir del id). */
  numero: number
  /** mesa.capacidad (siempre mayor que 0). */
  capacidad: number
  /** mesa.estado (texto libre en la BD). */
  estado: EstadoMesa

  // --- Campos CALCULADOS por la API (no son columnas de `mesa`) ---
  /** Estado de la cuenta activa de la mesa; `null` si no hay cuenta activa. */
  estadoCuenta: EstadoCuentaActiva | null
  /** Pedidos de la cuenta activa que no están cancelados ni pagados. */
  pedidosActivos: number
  /** Total acumulado de la cuenta activa (sin pedidos cancelados), en MXN. */
  totalCuenta: number
  /** Cantidad de pedidos en estado `listo` (cocina terminó; falta servirlos). */
  pedidosListos: number

  /** cuenta.tipo_pago_solicitado de la cuenta activa (columna de `cuenta`, no de `mesa`). `null` si no se solicitó o la API no lo envía. */
  tipoPagoSolicitado: TipoPago | null
}
