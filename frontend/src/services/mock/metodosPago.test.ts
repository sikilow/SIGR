import { describe, expect, it } from 'vitest'
import { crearCatalogoMock } from './adminMock'
import { crearCajaMock } from './cajaMock'

describe('métodos de pago administrables', () => {
  it('administra categorías y métodos, respetando la disponibilidad de ambos niveles', async () => {
    const catalogo = crearCatalogoMock()
    const iniciales = await catalogo.listarMetodosPago()
    expect(iniciales.map((categoria) => categoria.tipo)).toEqual(['fisico', 'digital'])
    expect((await catalogo.listarMetodosPagoDisponibles()).map((metodo) => metodo.nombre)).toEqual(['Efectivo', 'Tarjeta', 'Transferencia'])
    const categoria = await catalogo.crearCategoriaMetodoPago('Vales', 'digital')
    const nuevo = await catalogo.crearMetodoPago('Vale de consumo', categoria.idCategoriaMetodoPago, false)

    expect(nuevo.activo).toBe(true)
    expect(nuevo.tipo).toBe('digital')
    expect((await catalogo.listarMetodosPago()).find((item) => item.idCategoriaMetodoPago === categoria.idCategoriaMetodoPago)?.metodos)
      .toContainEqual({ ...nuevo, eliminadoEn: null })
    expect((await catalogo.listarMetodosPagoDisponibles()).some((metodo) => metodo.idMetodo === nuevo.idMetodo)).toBe(true)
    expect((await catalogo.actualizarMetodoPago(nuevo.idMetodo, { activo: false })).activo).toBe(false)
    expect((await catalogo.listarMetodosPagoDisponibles()).some((metodo) => metodo.idMetodo === nuevo.idMetodo)).toBe(false)

    const desactivada = await catalogo.actualizarCategoriaMetodoPago(categoria.idCategoriaMetodoPago, { activo: false })
    expect(desactivada.activo).toBe(false)
    expect((await catalogo.listarMetodosPagoDisponibles()).some((metodo) => metodo.idCategoriaMetodoPago === categoria.idCategoriaMetodoPago)).toBe(false)
    await catalogo.actualizarCategoriaMetodoPago(categoria.idCategoriaMetodoPago, { activo: true })
    for (const metodo of iniciales.flatMap((item) => item.metodos)) {
      await catalogo.actualizarMetodoPago(metodo.idMetodo, { activo: true })
    }
    await catalogo.actualizarMetodoPago(nuevo.idMetodo, { activo: true })
    expect((await catalogo.listarMetodosPagoDisponibles()).some((metodo) => metodo.idCategoriaMetodoPago === categoria.idCategoriaMetodoPago)).toBe(true)
  })
})

// Va después de la otra suite: los datos del mock son compartidos y esa espera el catálogo inicial.
describe('métodos de pago nuevos llegan al mesero y al cajero', () => {
  it('un método físico no efectivo aparece en «disponibles» (mesero) y en el estado de Caja, y se oculta al desactivarlo', async () => {
    const catalogo = crearCatalogoMock()
    const caja = crearCajaMock()
    const categoria = await catalogo.crearCategoriaMetodoPago('Vales de despensa', 'fisico')
    const vale = await catalogo.crearMetodoPago('Vale Sodexo', categoria.idCategoriaMetodoPago, false)

    const paraMesero = await catalogo.listarMetodosPagoDisponibles()
    expect(paraMesero.find((m) => m.idMetodo === vale.idMetodo)).toMatchObject({ tipo: 'fisico', categoria: 'Vales de despensa' })
    expect((await caja.obtenerEstado()).metodosPago.map((m) => m.idMetodo)).toContain(vale.idMetodo)

    await catalogo.actualizarMetodoPago(vale.idMetodo, { activo: false })
    expect((await catalogo.listarMetodosPagoDisponibles()).map((m) => m.idMetodo)).not.toContain(vale.idMetodo)
    expect((await caja.obtenerEstado()).metodosPago.map((m) => m.idMetodo)).not.toContain(vale.idMetodo)
  })
})
