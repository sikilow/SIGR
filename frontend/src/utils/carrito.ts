// Operaciones puras sobre el carrito (pedido en armado). Cada una devuelve un arreglo NUEVO,
// así el estado reactivo y el borrador guardado nunca comparten referencias mutables.
import type { DetallePedido, LineaNuevoPedido, Producto } from '../types'

/** Línea del carrito: lo mínimo para mostrarla y estimar el total. Los precios NO se envían a la API. */
export interface LineaCarrito {
  idProducto: number
  nombre: string
  /** Precio visto al agregar; solo sirve para el total ESTIMADO. */
  precioUnitario: number
  cantidad: number
  indicaciones: string
}

export const MAX_INDICACIONES = 120
/** Tope por línea para evitar cantidades absurdas por error al tocar. */
export const MAX_CANTIDAD = 99

/**
 * Máximo de unidades de una línea: lo que hay en existencia (si el producto la controla) o el tope general.
 * Un producto sin `existencia` se prepara al momento y no tiene tope por existencia.
 */
export function topeCantidad(existencia: number | undefined): number {
  return existencia === undefined ? MAX_CANTIDAD : Math.min(MAX_CANTIDAD, Math.max(0, existencia))
}

export function lineaDesdeProducto(producto: Producto): LineaCarrito {
  return {
    idProducto: producto.idProducto,
    nombre: producto.nombre,
    precioUnitario: producto.precio,
    cantidad: 1,
    indicaciones: '',
  }
}

/** Convierte el detalle de un pedido existente en líneas editables. */
export function lineasDesdeDetalle(detalle: DetallePedido[]): LineaCarrito[] {
  return detalle.map((d) => ({
    idProducto: d.idProducto,
    nombre: d.nombreProducto,
    precioUnitario: d.precioUnitario,
    cantidad: d.cantidad,
    indicaciones: d.indicaciones,
  }))
}

/** Líneas en el formato que espera la API (sin precios). */
export function aLineasNuevoPedido(lineas: LineaCarrito[]): LineaNuevoPedido[] {
  return lineas.map((l) => ({ idProducto: l.idProducto, cantidad: l.cantidad, indicaciones: l.indicaciones.trim() }))
}

export function cantidadDe(lineas: LineaCarrito[], idProducto: number): number {
  return lineas.find((l) => l.idProducto === idProducto)?.cantidad ?? 0
}

/**
 * Suma 1 unidad del producto (lo agrega si no estaba). Un producto agotado no se puede agregar, ni más
 * unidades de las que hay en existencia (si la controla): en esos casos devuelve el mismo arreglo, sin cambios.
 */
export function agregarProducto(lineas: LineaCarrito[], producto: Producto): LineaCarrito[] {
  if (!producto.disponible) return lineas
  const actual = cantidadDe(lineas, producto.idProducto)
  if (actual >= topeCantidad(producto.existencia)) return lineas
  if (actual === 0) return [...lineas, lineaDesdeProducto(producto)]
  return lineas.map((l) => (l.idProducto === producto.idProducto ? { ...l, cantidad: l.cantidad + 1 } : l))
}

/**
 * Cambia la cantidad en `delta`. Nunca baja de 1 (para quitar un producto se usa `quitarLinea`)
 * ni sube de `maximo` (por defecto MAX_CANTIDAD; para un producto con existencia, `topeCantidad(existencia)`).
 */
export function cambiarCantidad(
  lineas: LineaCarrito[],
  idProducto: number,
  delta: number,
  maximo: number = MAX_CANTIDAD,
): LineaCarrito[] {
  return lineas.map((l) =>
    l.idProducto === idProducto ? { ...l, cantidad: Math.max(1, Math.min(maximo, l.cantidad + delta)) } : l,
  )
}

export function quitarLinea(lineas: LineaCarrito[], idProducto: number): LineaCarrito[] {
  return lineas.filter((l) => l.idProducto !== idProducto)
}

export function establecerIndicaciones(lineas: LineaCarrito[], idProducto: number, texto: string): LineaCarrito[] {
  return lineas.map((l) => (l.idProducto === idProducto ? { ...l, indicaciones: texto.slice(0, MAX_INDICACIONES) } : l))
}

/**
 * Agrega una sugerencia rápida al texto de indicaciones (solo rellena el campo; no es un dato
 * del modelo). Evita duplicarla y respeta el máximo de caracteres.
 */
export function agregarSugerencia(textoActual: string, sugerencia: string): string {
  const actual = textoActual.trim()
  if (actual.toLowerCase().includes(sugerencia.toLowerCase())) return textoActual
  const combinado = actual ? `${actual}, ${sugerencia}` : sugerencia
  return combinado.length <= MAX_INDICACIONES ? combinado : textoActual
}

export const subtotalDe = (linea: LineaCarrito): number => linea.cantidad * linea.precioUnitario

export function totalEstimado(lineas: LineaCarrito[]): number {
  return lineas.reduce((suma, l) => suma + subtotalDe(l), 0)
}

export function totalUnidades(lineas: LineaCarrito[]): number {
  return lineas.reduce((suma, l) => suma + l.cantidad, 0)
}

/** Dos carritos son iguales si tienen las mismas líneas (para detectar cambios sin guardar). */
export function carritosIguales(a: LineaCarrito[], b: LineaCarrito[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
