// Tipos `Producto` y `CategoriaMenu` (tablas `producto` y `categoria_menu`). Ver docs/equivalencias-bd.md.
// La existencia solo existe para los productos que la controlan (postres de vitrina, refrescos...). Lo que se
// prepara al momento no la tiene: no hay tope, solo disponible o agotado (lo decide el gerente).

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
  /** Unidades que quedan. Ausente = no controla existencia (se prepara al momento): sin tope por existencia. */
  existencia?: number
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
