import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Eliminado lógico de productos y categorías (migración 026) en la demo: lo eliminado sale del menú y de las listas,
// se conserva y se restaura.

async function nuevo() {
  vi.resetModules()
  const { crearCatalogoMock } = await import('./adminMock')
  const { baseDatos } = await import('./baseDatos')
  return { catalogo: crearCatalogoMock(), baseDatos }
}

async function resolver<T>(promesa: Promise<T>): Promise<T> {
  const lista = promesa.then(
    (valor) => ({ valor }),
    (error: unknown) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(400)
  const r = await lista
  if ('error' in r) throw r.error
  return r.valor
}

async function mensajeDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await resolver(promesa)
  } catch (e) {
    return (e as { message?: string }).message ?? ''
  }
  throw new Error('Se esperaba un error')
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('eliminar y restaurar productos', () => {
  it('un producto eliminado sale de la lista y del menú, aparece en «eliminados» y se restaura', async () => {
    const { catalogo, baseDatos } = await nuevo()
    const lista = await resolver(catalogo.listarProductos())
    const p = lista.find((x) => x.activo)!

    const eliminado = await resolver(catalogo.eliminarProducto(p.idProducto))
    expect(eliminado.eliminadoEn).toBeInstanceOf(Date)
    expect(eliminado.disponible).toBe(false)

    expect((await resolver(catalogo.listarProductos())).some((x) => x.idProducto === p.idProducto)).toBe(false)
    expect((await resolver(catalogo.listarProductos({ eliminados: true }))).map((x) => x.idProducto)).toEqual([p.idProducto])
    expect(baseDatos.categorias.some((c) => c.productos.some((x) => x.idProducto === p.idProducto))).toBe(false)

    const restaurado = await resolver(catalogo.restaurarProducto(p.idProducto))
    expect(restaurado.eliminadoEn).toBeNull()
    expect((await resolver(catalogo.listarProductos())).some((x) => x.idProducto === p.idProducto)).toBe(true)
    expect(await resolver(catalogo.listarProductos({ eliminados: true }))).toEqual([])
  })

  it('no se elimina dos veces ni se restaura uno vigente', async () => {
    const { catalogo } = await nuevo()
    const p = (await resolver(catalogo.listarProductos()))[0]!
    expect(await mensajeDeError(catalogo.restaurarProducto(p.idProducto))).toMatch(/no está eliminado/)
    await resolver(catalogo.eliminarProducto(p.idProducto))
    expect(await mensajeDeError(catalogo.eliminarProducto(p.idProducto))).toMatch(/ya está eliminado/)
  })

  it('un producto en un pedido sin entregar no se elimina', async () => {
    const { catalogo, baseDatos } = await nuevo()
    const pedido = baseDatos.pedidos.find((x) => ['registrado', 'enviado', 'en_preparacion', 'listo'].includes(x.estado) && x.detalle.length > 0)!
    const idProducto = pedido.detalle[0]!.idProducto
    expect(await mensajeDeError(catalogo.eliminarProducto(idProducto))).toMatch(/aún no se entregan/)
  })

  it('crear uno igual a uno eliminado avisa que hay que restaurarlo', async () => {
    const { catalogo } = await nuevo()
    const p = (await resolver(catalogo.listarProductos()))[0]!
    await resolver(catalogo.eliminarProducto(p.idProducto))
    const mensaje = await mensajeDeError(
      catalogo.crearProducto({ idCategoria: p.idCategoria, nombre: p.nombre, presentacion: p.presentacion, descripcion: 'otra', precio: 10, activo: true, existencia: 1, stockMinimo: 0, controlaExistencia: true }),
    )
    expect(mensaje).toMatch(/eliminado/)
  })

  it('no se restaura un producto si su categoría está eliminada', async () => {
    const { catalogo } = await nuevo()
    const cat = await resolver(catalogo.crearCategoria('Temporal'))
    const p = await resolver(
      catalogo.crearProducto({ idCategoria: cat.idCategoria, nombre: 'Prueba', presentacion: '', descripcion: 'solo de prueba', precio: 10, activo: true, existencia: 1, stockMinimo: 0, controlaExistencia: true }),
    )
    await resolver(catalogo.eliminarProducto(p.idProducto))
    await resolver(catalogo.eliminarCategoria(cat.idCategoria))
    expect(await mensajeDeError(catalogo.restaurarProducto(p.idProducto))).toMatch(/categoría está eliminada/)
    await resolver(catalogo.restaurarCategoria(cat.idCategoria))
    expect((await resolver(catalogo.restaurarProducto(p.idProducto))).eliminadoEn).toBeNull()
  })
})

describe('eliminar y restaurar categorías', () => {
  it('una categoría vacía se elimina y se restaura', async () => {
    const { catalogo } = await nuevo()
    const nueva = await resolver(catalogo.crearCategoria('Categoría de prueba'))
    await resolver(catalogo.eliminarCategoria(nueva.idCategoria))
    expect((await resolver(catalogo.listarCategorias())).some((c) => c.idCategoria === nueva.idCategoria)).toBe(false)
    const eliminadas = await resolver(catalogo.listarCategorias({ eliminados: true }))
    expect(eliminadas.map((c) => c.nombre)).toEqual(['Categoría de prueba'])
    expect(eliminadas[0]!.eliminadoEn).toBeInstanceOf(Date)

    const restaurada = await resolver(catalogo.restaurarCategoria(nueva.idCategoria))
    expect(restaurada.eliminadoEn).toBeNull()
    expect((await resolver(catalogo.listarCategorias())).some((c) => c.idCategoria === nueva.idCategoria)).toBe(true)
  })

  it('eliminar una categoría con productos elimina también sus productos; restaurarla devuelve los que se eliminaron con ella', async () => {
    const { catalogo } = await nuevo()
    const categoria = await resolver(catalogo.crearCategoria('Cat cascada'))
    const crear = (nombre: string) =>
      resolver(catalogo.crearProducto({ idCategoria: categoria.idCategoria, nombre, presentacion: '', descripcion: 'Algo muy rico', precio: 50, activo: true, existencia: 5, stockMinimo: 1, controlaExistencia: false }))
    const uno = await crear('Uno')
    await crear('Dos')
    await crear('Tres')

    // Eliminar uno solo elimina solo ese.
    await resolver(catalogo.eliminarProducto(uno.idProducto))
    const nombresDe = async (eliminados: boolean) =>
      (await resolver(catalogo.listarProductos({ eliminados }))).filter((p) => p.idCategoria === categoria.idCategoria).map((p) => p.nombre).sort()
    expect(await nombresDe(false)).toEqual(['Dos', 'Tres'])

    // Eliminar la categoría: se va con todo lo que tenía vigente.
    await resolver(catalogo.eliminarCategoria(categoria.idCategoria))
    expect(await nombresDe(false)).toEqual([])
    expect(await nombresDe(true)).toEqual(['Dos', 'Tres', 'Uno'])

    // Restaurar: vuelven Dos y Tres; Uno (eliminado antes por separado) sigue eliminado.
    await resolver(catalogo.restaurarCategoria(categoria.idCategoria))
    expect(await nombresDe(false)).toEqual(['Dos', 'Tres'])
    expect(await nombresDe(true)).toEqual(['Uno'])
  })

  it('un producto en un pedido sin entregar frena la eliminación de toda su categoría (todo o nada)', async () => {
    const { catalogo, baseDatos } = await nuevo()
    const pedido = baseDatos.pedidos.find((p) => ['registrado', 'enviado', 'en_preparacion', 'listo'].includes(p.estado) && p.detalle.length > 0)!
    const categoria = baseDatos.categorias.find((c) => c.productos.some((p) => p.idProducto === pedido.detalle[0]!.idProducto))!
    const total = categoria.productos.length
    const mensaje = await mensajeDeError(catalogo.eliminarCategoria(categoria.idCategoria))
    expect(mensaje).toMatch(/No se puede eliminar/)
    expect(mensaje).toMatch(/pedido/)
    // No se eliminó nada.
    expect((await resolver(catalogo.listarProductos())).filter((p) => p.idCategoria === categoria.idCategoria)).toHaveLength(total)
    expect((await resolver(catalogo.listarCategorias())).some((c) => c.idCategoria === categoria.idCategoria)).toBe(true)
  })
})
