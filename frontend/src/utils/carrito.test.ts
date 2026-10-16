import { describe, expect, it } from 'vitest'
import type { Producto } from '../types'
import {
  agregarProducto,
  agregarSugerencia,
  aLineasNuevoPedido,
  cambiarCantidad,
  cantidadDe,
  carritosIguales,
  establecerIndicaciones,
  lineasDesdeDetalle,
  MAX_CANTIDAD,
  MAX_INDICACIONES,
  quitarLinea,
  topeCantidad,
  totalEstimado,
  totalUnidades,
  type LineaCarrito,
} from './carrito'

const taco: Producto = { idProducto: 16, idCategoria: 2, nombre: 'Tacos al pastor', descripcion: '', precio: 120, disponible: true }
const cafe: Producto = { idProducto: 14, idCategoria: 4, nombre: 'Café de olla', descripcion: '', precio: 40, disponible: true }
const ceviche: Producto = { idProducto: 4, idCategoria: 1, nombre: 'Ceviche', descripcion: '', precio: 140, disponible: false }

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
    expect(quitarLinea(lineas, 16).map((l) => l.idProducto)).toEqual([14])
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

describe('carrito: indicaciones', () => {
  it('guarda el texto y lo recorta a MAX_INDICACIONES', () => {
    const base = agregarProducto([], taco)
    expect(establecerIndicaciones(base, 16, 'Sin cebolla')[0]?.indicaciones).toBe('Sin cebolla')
    const larga = establecerIndicaciones(base, 16, 'x'.repeat(MAX_INDICACIONES + 30))[0]?.indicaciones
    expect(larga).toHaveLength(MAX_INDICACIONES)
  })

  it('las sugerencias se agregan sin duplicarse', () => {
    expect(agregarSugerencia('', 'Sin cebolla')).toBe('Sin cebolla')
    expect(agregarSugerencia('Sin picante', 'Extra queso')).toBe('Sin picante, Extra queso')
    expect(agregarSugerencia('Sin cebolla', 'sin cebolla')).toBe('Sin cebolla')
  })

  it('una sugerencia que no cabe no se agrega', () => {
    const casiLleno = 'a'.repeat(MAX_INDICACIONES - 3)
    expect(agregarSugerencia(casiLleno, 'Extra queso')).toBe(casiLleno)
  })

  it('a la API se envían las líneas sin precios y con indicaciones recortadas de espacios', () => {
    const lineas = establecerIndicaciones(agregarProducto([], taco), 16, '  Sin piña  ')
    expect(aLineasNuevoPedido(lineas)).toEqual([{ idProducto: 16, cantidad: 1, indicaciones: 'Sin piña' }])
  })
})

describe('carrito: edición de un pedido existente', () => {
  it('convierte el detalle en líneas editables y detecta si hubo cambios', () => {
    const detalle = [{ idProducto: 14, nombreProducto: 'Café de olla', cantidad: 2, indicaciones: '', precioUnitario: 40 }]
    const lineas = lineasDesdeDetalle(detalle)
    expect(lineas).toEqual([{ idProducto: 14, nombre: 'Café de olla', precioUnitario: 40, cantidad: 2, indicaciones: '' }])
    expect(carritosIguales(lineas, lineasDesdeDetalle(detalle))).toBe(true)
    expect(carritosIguales(lineas, cambiarCantidad(lineas, 14, 1))).toBe(false)
  })
})

describe('carrito: tope por existencia', () => {
  // Cerveza viene embotellada: controla existencia (quedan 2). El taco se prepara al momento: sin existencia.
  const cerveza: Producto = { idProducto: 15, idCategoria: 4, nombre: 'Cerveza artesanal', descripcion: '', precio: 75, disponible: true, existencia: 2 }
  it('topeCantidad: sin existencia usa el máximo general; con existencia, lo que hay (sin pasar del máximo)', () => {
    expect(topeCantidad(undefined)).toBe(MAX_CANTIDAD)
    expect(topeCantidad(5)).toBe(5)
    expect(topeCantidad(5000)).toBe(MAX_CANTIDAD)
    expect(topeCantidad(0)).toBe(0)
  })

  it('no deja agregar más unidades de las que hay en existencia', () => {
    const una = agregarProducto([], cerveza)
    const dos = agregarProducto(una, cerveza)
    expect(cantidadDe(dos, 15)).toBe(2)
    const tres = agregarProducto(dos, cerveza)
    expect(tres).toBe(dos) // mismo arreglo: no cambió nada
    expect(cantidadDe(tres, 15)).toBe(2)
  })

  it('lo que se prepara al momento (sin existencia) no tiene tope por existencia', () => {
    let lineas: LineaCarrito[] = []
    for (let i = 0; i < 50; i++) lineas = agregarProducto(lineas, taco)
    expect(cantidadDe(lineas, 16)).toBe(50)
  })

  it('con existencia justa se puede pedir todo lo que hay y ni una más', () => {
    const ultima: Producto = { ...cerveza, existencia: 1 }
    const una = agregarProducto([], ultima)
    expect(cantidadDe(una, 15)).toBe(1)
    expect(agregarProducto(una, ultima)).toBe(una)
  })

  it('cambiarCantidad respeta el máximo indicado y nunca baja de 1', () => {
    const dos = agregarProducto(agregarProducto([], cerveza), cerveza)
    expect(cantidadDe(cambiarCantidad(dos, 15, 1, topeCantidad(2)), 15)).toBe(2) // ya está en el tope
    expect(cantidadDe(cambiarCantidad(dos, 15, -1, topeCantidad(2)), 15)).toBe(1)
    expect(cantidadDe(cambiarCantidad(dos, 15, -5, topeCantidad(2)), 15)).toBe(1)
  })

  it('si la existencia bajó después de agregar, "−" deja la línea dentro del nuevo tope', () => {
    const cinco = cambiarCantidad(agregarProducto([], taco), 16, 4) // 5 unidades
    expect(cantidadDe(cinco, 16)).toBe(5)
    expect(cantidadDe(cambiarCantidad(cinco, 16, -1, topeCantidad(3)), 16)).toBe(3)
  })
})
