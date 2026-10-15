// PROVISIONAL: modelo de dominio pendiente de validar con el equipo de API.
// El menú NO maneja cantidades en existencia: un producto solo está disponible o agotado.

export interface Producto {
  id: number
  categoriaId: number
  nombre: string
  descripcion: string
  /** Precio en pesos mexicanos (MXN). */
  precio: number
  /** `false` = agotado: no se puede agregar a un pedido. */
  disponible: boolean
}

export interface CategoriaMenu {
  id: number
  nombre: string
  productos: Producto[]
}

/** Producto cuya disponibilidad se quiere verificar antes de registrar un pedido. */
export interface ItemDisponibilidad {
  productoId: number
}

export interface DisponibilidadProducto {
  productoId: number
  disponible: boolean
}
