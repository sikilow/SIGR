// Error común de la capa de servicios (igual en mock y en API real).
// PROVISIONAL: los códigos dependen del formato de errores que acuerde el equipo de API.

import type { DisponibilidadProducto } from '../types'

export type CodigoError =
  | 'no_autenticado'
  | 'credenciales_invalidas'
  | 'sin_permiso'
  | 'requiere_gerente'
  | 'no_encontrado'
  | 'estado_invalido'
  | 'producto_agotado'
  | 'mesa_no_disponible'
  | 'red'
  | 'desconocido'

export class ErrorServicio extends Error {
  readonly codigo: CodigoError
  readonly estadoHttp: number | null
  /** Productos agotados que impidieron la operación (solo en errores `producto_agotado`). */
  readonly faltantes: DisponibilidadProducto[]

  constructor(
    codigo: CodigoError,
    mensaje: string,
    estadoHttp: number | null = null,
    faltantes: DisponibilidadProducto[] = [],
  ) {
    super(mensaje)
    this.name = 'ErrorServicio'
    this.codigo = codigo
    this.estadoHttp = estadoHttp
    this.faltantes = faltantes
  }
}
