// Operaciones puras sobre el carrito (pedido en armado). Cada una devuelve un arreglo NUEVO,
// así el estado reactivo y el borrador guardado nunca comparten referencias mutables.
import type { DetallePedido, LineaNuevoPedido, Producto } from '../types'

/** Línea del carrito: lo mínimo para mostrarla y estimar el total. Los precios NO se envían a la API. */
export interface LineaCarrito {
  productoId: number
  nombre: string
  /** Precio visto al agregar; solo sirve para el total ESTIMADO. */
  precioUnitario: number
  cantidad: number
  observaciones: string
}

export const MAX_OBSERVACIONES = 120
/** Tope por línea para evitar cantidades absurdas por error al tocar. */
export const MAX_CANTIDAD = 99

export function lineaDesdeProducto(producto: Producto): LineaCarrito {
  return {
    productoId: producto.id,
    nombre: producto.nombre,
    precioUnitario: producto.precio,
    cantidad: 1,
    observaciones: '',
  }
}

/** Convierte el detalle de un pedido existente en líneas editables. */
export function lineasDesdeDetalle(detalle: DetallePedido[]): LineaCarrito[] {
  return detalle.map((d) => ({
    productoId: d.productoId,
    nombre: d.nombreProducto,
    precioUnitario: d.precioUnitario,
    cantidad: d.cantidad,
    observaciones: d.observaciones,
  }))
}

/** Líneas en el formato que espera la API (sin precios). */
export function aLineasNuevoPedido(lineas: LineaCarrito[]): LineaNuevoPedido[] {
  return lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, observaciones: l.observaciones.trim() }))
}

export function cantidadDe(lineas: LineaCarrito[], productoId: number): number {
  return lineas.find((l) => l.productoId === productoId)?.cantidad ?? 0
}

/**
 * Suma 1 unidad del producto (lo agrega si no estaba). Un producto agotado no se puede agregar:
 * en ese caso devuelve el mismo arreglo, sin cambios.
 */
export function agregarProducto(lineas: LineaCarrito[], producto: Producto): LineaCarrito[] {
  if (!producto.disponible) return lineas
  const actual = cantidadDe(lineas, producto.id)
  if (actual >= MAX_CANTIDAD) return lineas
  if (actual === 0) return [...lineas, lineaDesdeProducto(producto)]
  return lineas.map((l) => (l.productoId === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l))
}

/**
 * Cambia la cantidad en `delta`. Nunca baja de 1 (para quitar un producto se usa `quitarLinea`)
 * ni sube de MAX_CANTIDAD.
 */
export function cambiarCantidad(lineas: LineaCarrito[], productoId: number, delta: number): LineaCarrito[] {
  return lineas.map((l) =>
    l.productoId === productoId ? { ...l, cantidad: Math.min(MAX_CANTIDAD, Math.max(1, l.cantidad + delta)) } : l,
  )
}

export function quitarLinea(lineas: LineaCarrito[], productoId: number): LineaCarrito[] {
  return lineas.filter((l) => l.productoId !== productoId)
}

export function establecerObservaciones(lineas: LineaCarrito[], productoId: number, texto: string): LineaCarrito[] {
  return lineas.map((l) => (l.productoId === productoId ? { ...l, observaciones: texto.slice(0, MAX_OBSERVACIONES) } : l))
}

/**
 * Agrega una sugerencia rápida al texto de observaciones (solo rellena el campo; no es un dato
 * del modelo). Evita duplicarla y respeta el máximo de caracteres.
 */
export function agregarSugerencia(textoActual: string, sugerencia: string): string {
  const actual = textoActual.trim()
  if (actual.toLowerCase().includes(sugerencia.toLowerCase())) return textoActual
  const combinado = actual ? `${actual}, ${sugerencia}` : sugerencia
  return combinado.length <= MAX_OBSERVACIONES ? combinado : textoActual
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
