import type { DisponibilidadProducto, Producto } from '../../types'
import type { MenuService } from '../interfaces'
import { baseDatos } from './baseDatos'
import { conRetraso } from './utiles'

/** Busca un producto en todas las categorías. */
export function buscarProducto(productoId: number): Producto | undefined {
  for (const categoria of baseDatos.categorias) {
    const producto = categoria.productos.find((p) => p.id === productoId)
    if (producto) return producto
  }
  return undefined
}

export function crearMenuMock(): MenuService {
  return {
    obtenerMenu() {
      return conRetraso(() => baseDatos.categorias)
    },

    verificarDisponibilidad(items) {
      return conRetraso<DisponibilidadProducto[]>(() =>
        items.map(({ productoId }) => ({
          productoId,
          disponible: buscarProducto(productoId)?.disponible ?? false,
        })),
      )
    },
  }
}
