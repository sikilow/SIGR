import type { ProductoAdmin } from '../types'

export type EstadoInventario = 'sin_control' | 'disponible' | 'poco_stock' | 'agotado'

export function estadoInventario(producto: Pick<ProductoAdmin, 'controlaExistencia' | 'existencia' | 'stockMinimo'>): EstadoInventario {
  if (!producto.controlaExistencia) return 'sin_control'
  if (producto.existencia === 0) return 'agotado'
  if (producto.existencia <= producto.stockMinimo) return 'poco_stock'
  return 'disponible'
}
