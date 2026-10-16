// Textos visibles para cada estado. Los estados nunca se comunican solo con color.
import type { EstadoCuenta, EstadoMesa, EstadoPedido } from './estados'
import type { TipoPago } from './cuenta'
import type { Rol } from './usuario'

/** Texto de cualquier estado que la API envíe y la interfaz no reconozca. */
export const ETIQUETA_ESTADO_DESCONOCIDO = 'Estado desconocido'

export const ETIQUETA_ESTADO_MESA: Record<EstadoMesa, string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
  reservada: 'Reservada',
  desconocido: ETIQUETA_ESTADO_DESCONOCIDO,
}

export const ETIQUETA_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  registrado: 'Registrado',
  enviado: 'Enviado a cocina',
  // `pendiente` (catálogo de la BD) se muestra igual que `enviado` mientras la BD no tenga ese estado.
  pendiente: 'Enviado a cocina',
  en_preparacion: 'En preparación',
  listo: 'Listo para entregar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  pagado: 'Pagado',
  desconocido: ETIQUETA_ESTADO_DESCONOCIDO,
}

export const ETIQUETA_ESTADO_CUENTA: Record<EstadoCuenta, string> = {
  abierta: 'Abierta',
  por_pagar: 'Por pagar',
  cerrada: 'Cerrada',
  desconocido: ETIQUETA_ESTADO_DESCONOCIDO,
}

export const ETIQUETA_TIPO_PAGO: Record<TipoPago, string> = {
  fisico: 'Pago físico',
  digital: 'Pago digital',
}

/** Atajos que solo rellenan la descripción del motivo de cancelación (el dato enviado es el texto). */
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
