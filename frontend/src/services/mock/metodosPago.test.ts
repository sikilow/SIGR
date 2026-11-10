import { describe, expect, it } from 'vitest'
import { crearCatalogoMock } from './adminMock'

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
      .toContainEqual(nuevo)
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