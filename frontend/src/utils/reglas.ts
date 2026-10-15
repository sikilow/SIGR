// Reglas de negocio PROVISIONALES que la interfaz necesita para habilitar o
// deshabilitar acciones. La API debe validar las mismas reglas del lado servidor.
import type { EstadoPedido } from '../types'

/** El mesero solo puede cancelar pedidos en estos estados. */
const ESTADOS_CANCELABLES_POR_MESERO: readonly EstadoPedido[] = ['registrado', 'enviado']

export function meseroPuedeCancelar(estado: EstadoPedido): boolean {
  return ESTADOS_CANCELABLES_POR_MESERO.includes(estado)
}

/** En preparación solo el gerente puede cancelar. */
export function cancelacionRequiereGerente(estado: EstadoPedido): boolean {
  return estado === 'en_preparacion'
}

/** Mensaje para mostrar junto al botón de cancelar deshabilitado. */
export function mensajeCancelacionBloqueada(estado: EstadoPedido): string | null {
  if (cancelacionRequiereGerente(estado)) {
    return 'El pedido ya está en preparación: solo el gerente puede cancelarlo.'
  }
  if (!meseroPuedeCancelar(estado)) {
    return 'Este pedido ya no se puede cancelar.'
  }
  return null
}

/** Un pedido está "activo" mientras no esté cancelado ni pagado. */
export function esPedidoActivo(estado: EstadoPedido): boolean {
  return estado !== 'cancelado' && estado !== 'pagado'
}
