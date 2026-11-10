import type { CategoriaMetodoPagoAdmin, MetodoPagoAdmin } from '../../types'

export const categoriasMetodoPagoMock: CategoriaMetodoPagoAdmin[] = [
  { idCategoriaMetodoPago: 1, nombre: 'Físico', tipo: 'fisico', activo: true, metodos: [] },
  { idCategoriaMetodoPago: 2, nombre: 'Digital', tipo: 'digital', activo: true, metodos: [] },
]

export const metodosPagoMock: MetodoPagoAdmin[] = [
  { idMetodo: 1, nombre: 'Efectivo', idCategoriaMetodoPago: 1, categoria: 'Físico', tipo: 'fisico', esEfectivo: true, activo: true },
  { idMetodo: 2, nombre: 'Tarjeta', idCategoriaMetodoPago: 2, categoria: 'Digital', tipo: 'digital', esEfectivo: false, activo: true },
  { idMetodo: 3, nombre: 'Transferencia', idCategoriaMetodoPago: 2, categoria: 'Digital', tipo: 'digital', esEfectivo: false, activo: true },
]