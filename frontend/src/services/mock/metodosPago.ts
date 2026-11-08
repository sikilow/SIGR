import type { MetodoPagoAdmin } from '../../types'

export const metodosPagoMock: MetodoPagoAdmin[] = [
  { idMetodo: 1, nombre: 'Efectivo', activo: true },
  { idMetodo: 2, nombre: 'Tarjeta', activo: true },
  { idMetodo: 3, nombre: 'Transferencia', activo: true },
]