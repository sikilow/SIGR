// Tipo `Cuenta` (tabla `cuenta`). Ver docs/equivalencias-bd.md.
import type { EstadoCuenta } from './estados'
import type { Pedido } from './pedido'

/** Forma de pago solicitada: cobro en caja física o pago digital. SIN COLUMNA EN BD (propuesta: `tipo_pago_solicitado`). */
export type TipoPago = 'fisico' | 'digital'

/** Una cuenta activa por mesa; agrupa varios pedidos. */
export interface Cuenta {
  /** cuenta.id_cuenta */
  idCuenta: number
  /** cuenta.id_mesa */
  idMesa: number
  /** cuenta.estado (texto libre en la BD). */
  estado: EstadoCuenta
  /** cuenta.abierta_en (DATETIME). */
  abiertaEn: Date
  /** cuenta.cerrada_en (DATETIME, NULL mientras la cuenta no se cierra). */
  cerradaEn: Date | null

  // --- Campos CALCULADOS por la API (no son columnas de `cuenta`) ---
  /** Pedidos de la cuenta (`pedido.id_cuenta`). */
  pedidos: Pedido[]
  /** Suma de cantidad × precio_unitario de los pedidos no cancelados, en MXN. */
  total: number

  /** SIN COLUMNA EN BD (propuesta: `cuenta.tipo_pago_solicitado`). */
  tipoPagoSolicitado: TipoPago | null
}
