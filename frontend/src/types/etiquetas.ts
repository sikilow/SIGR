// Textos visibles para cada estado. Los estados nunca se comunican solo con color.
import type { EstadoCuenta, TipoPago } from './cuenta'
import type { EstadoMesa } from './mesa'
import type { EstadoPedido } from './pedido'
import type { Rol } from './usuario'

export const ETIQUETA_ESTADO_MESA: Record<EstadoMesa, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  reservada: 'Reservada',
}

export const ETIQUETA_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  registrado: 'Registrado',
  enviado: 'Enviado a cocina',
  en_preparacion: 'En preparación',
  listo: 'Listo para entregar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  pagado: 'Pagado',
}

export const ETIQUETA_ESTADO_CUENTA: Record<EstadoCuenta, string> = {
  abierta: 'Abierta',
  por_pagar: 'Por pagar',
  cerrada: 'Cerrada',
}

export const ETIQUETA_TIPO_PAGO: Record<TipoPago, string> = {
  fisico: 'Pago físico',
  digital: 'Pago digital',
}

/** Atajos que solo rellenan el motivo de cancelación (el dato enviado es el texto). */
export const MOTIVOS_RAPIDOS: readonly string[] = [
  'El cliente cambió de opinión',
  'Error al tomar el pedido',
  'Producto agotado',
  'Demora excesiva',
]

export const ETIQUETA_ROL: Record<Rol, string> = {
  gerente: 'Gerente',
  mesero: 'Mesero',
  cocinero: 'Cocinero',
  cajero: 'Cajero',
  hostess: 'Hostess',
}
