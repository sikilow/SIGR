import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function nuevoCatalogo() {
  vi.resetModules()
  const { crearCatalogoMock } = await import('./adminMock')
  return crearCatalogoMock()
}

async function resolver<T>(promesa: Promise<T>): Promise<T> {
  const lista = promesa.then(
    (valor) => ({ valor }),
    (error: unknown) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(400)
  const resultado = await lista
  if ('error' in resultado) throw resultado.error
  return resultado.valor
}

async function errorDe(promesa: Promise<unknown>): Promise<{ codigo: string; mensaje: string }> {
  try {
    await resolver(promesa)
  } catch (error) {
    const err = error as { codigo?: string; message?: string }
    if (err.codigo) return { codigo: err.codigo, mensaje: err.message ?? '' }
    throw error
  }
  throw new Error('Se esperaba un error y no hubo ninguno')
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('catálogo e inventario de productos', () => {
  it('permite consultar y actualizar la tolerancia y el recordatorio de reservaciones', async () => {
    const catalogo = await nuevoCatalogo()
    expect(await resolver(catalogo.obtenerConfiguracionReservacion())).toEqual({ toleranciaMinutos: 15, recordatorioMinutos: 5 })
    expect(await resolver(catalogo.actualizarConfiguracionReservacion({ toleranciaMinutos: 20, recordatorioMinutos: 10 })))
      .toEqual({ toleranciaMinutos: 20, recordatorioMinutos: 10 })
    expect((await errorDe(catalogo.actualizarConfiguracionReservacion({ toleranciaMinutos: 2, recordatorioMinutos: 10 }))).codigo)
      .toBe('estado_invalido')
  })

  it('rechaza el alta repetida de la misma variante sin cambiar el inventario', async () => {
    const catalogo = await nuevoCatalogo()
    const antes = await resolver(catalogo.listarProductos())
    const producto = antes.find((p) => p.nombre === 'Cerveza artesanal')!

    const resultado = await errorDe(catalogo.crearProducto({
      idCategoria: producto.idCategoria,
      nombre: producto.nombre,
      presentacion: producto.presentacion,
      descripcion: producto.descripcion,
      precio: producto.precio,
      activo: producto.activo,
      controlaExistencia: true,
      existencia: 7,
      stockMinimo: 2,
    }))

    expect(resultado.codigo).toBe('estado_invalido')
    expect(resultado.mensaje).toContain('edita sus datos o existencias')
    expect(await resolver(catalogo.listarProductos())).toEqual(antes)
  })

  it('considera una presentación distinta un producto diferente', async () => {
    const catalogo = await nuevoCatalogo()
    const antes = await resolver(catalogo.listarProductos())
    const producto = antes.find((p) => p.nombre === 'Cerveza artesanal')!

    const productoNuevo = await resolver(catalogo.crearProducto({
      idCategoria: producto.idCategoria,
      nombre: producto.nombre,
      presentacion: 'Lata de 355 ml',
      descripcion: 'Lata de 355 ml',
      precio: producto.precio,
      activo: true,
      controlaExistencia: true,
      existencia: 4,
      stockMinimo: 1,
    }))

    expect(productoNuevo.idProducto).not.toBe(producto.idProducto)
    expect(productoNuevo.presentacion).toBe('Lata de 355 ml')
    expect(await resolver(catalogo.listarProductos())).toHaveLength(antes.length + 1)
  })

  it('no permite editar un producto para duplicar otro de la misma categoría', async () => {
    const catalogo = await nuevoCatalogo()
    const productos = await resolver(catalogo.listarProductos())
    const producto = productos.find((p) => p.nombre === 'Café de olla')!
    const duplicado = productos.find((p) => p.nombre === 'Agua de horchata')!

    const error = await errorDe(catalogo.actualizarProducto(producto.idProducto, {
      nombre: duplicado.nombre,
      presentacion: duplicado.presentacion,
    }))

    expect(error.codigo).toBe('estado_invalido')
    expect(error.mensaje).toContain('misma categoría, nombre y presentación')
  })

  it('permite crear la misma bebida en otra presentación', async () => {
    const catalogo = await nuevoCatalogo()
    const cerveza = (await resolver(catalogo.listarProductos())).find((p) => p.nombre === 'Cerveza artesanal')!

    const producto = await resolver(catalogo.crearProducto({
      idCategoria: cerveza.idCategoria,
      nombre: cerveza.nombre,
      presentacion: 'Lata de 473 ml',
      descripcion: 'Cerveza artesanal clara',
      precio: cerveza.precio,
      activo: true,
      controlaExistencia: true,
      existencia: 8,
      stockMinimo: 2,
    }))

    expect(producto.presentacion).toBe('Lata de 473 ml')
    expect(await resolver(catalogo.listarProductos())).toHaveLength(17)
  })
})
