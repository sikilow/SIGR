// Tipos `Producto` y `CategoriaMenu` (tablas `producto` y `categoria_menu`). Ver docs/equivalencias-bd.md.
// El menú NO maneja cantidades en existencia: un producto solo está disponible o agotado.

export interface Producto {
  /** producto.id_producto */
  idProducto: number
  /** producto.id_categoria */
  idCategoria: number
  nombre: string
  descripcion: string
  /** producto.precio (DECIMAL(10,2), mayor o igual que 0), en pesos mexicanos (MXN). */
  precio: number
  /** producto.disponible. `false` = agotado: no se puede agregar a un pedido. */
  disponible: boolean
}

export interface CategoriaMenu {
  /** categoria_menu.id_categoria */
  idCategoria: number
  nombre: string
  /** CALCULADO por la API: productos de la categoría (`producto.id_categoria`). */
  productos: Producto[]
}

/** Producto cuya disponibilidad se quiere verificar antes de registrar un pedido. */
export interface ItemDisponibilidad {
  idProducto: number
}

/** Resultado de verificar `producto.disponible`. */
export interface DisponibilidadProducto {
  idProducto: number
  disponible: boolean
  /** Cuántas unidades quedan (solo cuando el servidor rechaza por existencia insuficiente). */
  existencia?: number
}
