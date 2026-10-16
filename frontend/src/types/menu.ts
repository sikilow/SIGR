// PROVISIONAL: modelo de dominio pendiente de validar con el equipo de API.
// La existencia solo existe para los productos que la controlan (postres de vitrina, refrescos...). Lo que se
// prepara al momento no la tiene: no hay tope, solo disponible o agotado (lo decide el gerente).

export interface Producto {
  id: number
  categoriaId: number
  nombre: string
  descripcion: string
  /** Precio en pesos mexicanos (MXN). */
  precio: number
  /** `false` = agotado: no se puede agregar a un pedido. */
  disponible: boolean
  /** Unidades que quedan. Ausente = no controla existencia (se prepara al momento): sin tope por existencia. */
  existencia?: number
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
  /** Cuántas unidades quedan (solo cuando el servidor rechaza por existencia insuficiente). */
  existencia?: number
}
