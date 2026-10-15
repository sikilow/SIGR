// Textos visibles para cada estado. Los estados nunca se comunican solo con color.
import type { EstadoCuenta } from './cuenta'
import type { EstadoMesa } from './mesa'
import type { EstadoPedido, MotivoCancelacion } from './pedido'
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

export const ETIQUETA_MOTIVO: Record<MotivoCancelacion, string> = {
  error_captura: 'Error al capturar',
  cliente_desiste: 'El cliente desistió',
  producto_agotado: 'Producto agotado',
  otro: 'Otro',
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  gerente: 'Gerente',
  mesero: 'Mesero',
  cocinero: 'Cocinero',
  cajero: 'Cajero',
  hostess: 'Hostess',
}
