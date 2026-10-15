import { describe, expect, it } from 'vitest'
import type { Producto } from '../types'
import {
  agregarProducto,
  agregarSugerencia,
  aLineasNuevoPedido,
  cambiarCantidad,
  cantidadDe,
  carritosIguales,
  establecerObservaciones,
  lineasDesdeDetalle,
  MAX_CANTIDAD,
  MAX_OBSERVACIONES,
  quitarLinea,
  totalEstimado,
  totalUnidades,
  type LineaCarrito,
} from './carrito'

const taco: Producto = { id: 16, categoriaId: 2, nombre: 'Tacos al pastor', descripcion: '', precio: 120, disponible: true }
const cafe: Producto = { id: 14, categoriaId: 4, nombre: 'Café de olla', descripcion: '', precio: 40, disponible: true }
const ceviche: Producto = { id: 4, categoriaId: 1, nombre: 'Ceviche', descripcion: '', precio: 140, disponible: false }

describe('carrito: agregar y cantidades', () => {
  it('agrega un producto nuevo con cantidad 1 y lo suma si ya estaba', () => {
    const una = agregarProducto([], taco)
    expect(una).toHaveLength(1)
    expect(cantidadDe(una, 16)).toBe(1)
    expect(cantidadDe(agregarProducto(una, taco), 16)).toBe(2)
    expect(cantidadDe(una, 999)).toBe(0)
  })

  it('un producto agotado no se agrega (devuelve el mismo arreglo)', () => {
    const vacio: LineaCarrito[] = []
    expect(agregarProducto(vacio, ceviche)).toBe(vacio)
  })

  it('no modifica el arreglo original', () => {
    const original = agregarProducto([], taco)
    agregarProducto(original, taco)
    cambiarCantidad(original, 16, 3)
    expect(cantidadDe(original, 16)).toBe(1)
  })

  it('la cantidad no baja de 1 ni sube de MAX_CANTIDAD', () => {
    const base = agregarProducto([], taco)
    expect(cantidadDe(cambiarCantidad(base, 16, -5), 16)).toBe(1)
    expect(cantidadDe(cambiarCantidad(base, 16, 500), 16)).toBe(MAX_CANTIDAD)
    const lleno = cambiarCantidad(base, 16, MAX_CANTIDAD)
    expect(agregarProducto(lleno, taco)).toBe(lleno)
  })

  it('quita una línea sin tocar las demás', () => {
    const lineas = agregarProducto(agregarProducto([], taco), cafe)
    expect(quitarLinea(lineas, 16).map((l) => l.productoId)).toEqual([14])
  })
})

describe('carrito: total estimado y unidades', () => {
  it('suma cantidad × precio de cada línea', () => {
    let lineas = agregarProducto([], taco) // 120
    lineas = cambiarCantidad(lineas, 16, 1) // 2 × 120 = 240
    lineas = agregarProducto(lineas, cafe) // + 40
    expect(totalEstimado(lineas)).toBe(280)
    expect(totalUnidades(lineas)).toBe(3)
  })

  it('un carrito vacío vale 0', () => {
    expect(totalEstimado([])).toBe(0)
    expect(totalUnidades([])).toBe(0)
  })
})

describe('carrito: observaciones', () => {
  it('guarda el texto y lo recorta a MAX_OBSERVACIONES', () => {
    const base = agregarProducto([], taco)
    expect(establecerObservaciones(base, 16, 'Sin cebolla')[0]?.observaciones).toBe('Sin cebolla')
    const larga = establecerObservaciones(base, 16, 'x'.repeat(MAX_OBSERVACIONES + 30))[0]?.observaciones
    expect(larga).toHaveLength(MAX_OBSERVACIONES)
  })

  it('las sugerencias se agregan sin duplicarse', () => {
    expect(agregarSugerencia('', 'Sin cebolla')).toBe('Sin cebolla')
    expect(agregarSugerencia('Sin picante', 'Extra queso')).toBe('Sin picante, Extra queso')
    expect(agregarSugerencia('Sin cebolla', 'sin cebolla')).toBe('Sin cebolla')
  })

  it('una sugerencia que no cabe no se agrega', () => {
    const casiLleno = 'a'.repeat(MAX_OBSERVACIONES - 3)
    expect(agregarSugerencia(casiLleno, 'Extra queso')).toBe(casiLleno)
  })

  it('a la API se envían las líneas sin precios y con observaciones recortadas de espacios', () => {
    const lineas = establecerObservaciones(agregarProducto([], taco), 16, '  Sin piña  ')
    expect(aLineasNuevoPedido(lineas)).toEqual([{ productoId: 16, cantidad: 1, observaciones: 'Sin piña' }])
  })
})

describe('carrito: edición de un pedido existente', () => {
  it('convierte el detalle en líneas editables y detecta si hubo cambios', () => {
    const detalle = [{ productoId: 14, nombreProducto: 'Café de olla', cantidad: 2, observaciones: '', precioUnitario: 40 }]
    const lineas = lineasDesdeDetalle(detalle)
    expect(lineas).toEqual([{ productoId: 14, nombre: 'Café de olla', precioUnitario: 40, cantidad: 2, observaciones: '' }])
    expect(carritosIguales(lineas, lineasDesdeDetalle(detalle))).toBe(true)
    expect(carritosIguales(lineas, cambiarCantidad(lineas, 14, 1))).toBe(false)
  })
})
