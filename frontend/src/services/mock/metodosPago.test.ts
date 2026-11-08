import { describe, expect, it } from 'vitest'
import { ErrorServicio } from '../errores'
import { crearCatalogoMock } from './adminMock'

describe('métodos de pago administrables', () => {
  it('agrega y desactiva métodos sin permitir dejar Caja sin opciones', async () => {
    const catalogo = crearCatalogoMock()
    const iniciales = await catalogo.listarMetodosPago()
    const nuevo = await catalogo.crearMetodoPago('Vale de consumo')

    expect(nuevo.activo).toBe(true)
    expect((await catalogo.listarMetodosPago()).some((metodo) => metodo.nombre === 'Vale de consumo')).toBe(true)
    expect((await catalogo.actualizarMetodoPago(nuevo.idMetodo, { activo: false })).activo).toBe(false)

    for (const metodo of iniciales.slice(0, -1)) {
      await catalogo.actualizarMetodoPago(metodo.idMetodo, { activo: false })
    }
    const ultimoActivo = (await catalogo.listarMetodosPago()).find((metodo) => metodo.activo)
    expect(ultimoActivo).toBeDefined()
    await expect(catalogo.actualizarMetodoPago(ultimoActivo!.idMetodo, { activo: false })).rejects.toBeInstanceOf(ErrorServicio)
    for (const metodo of iniciales) {
      await catalogo.actualizarMetodoPago(metodo.idMetodo, { activo: true })
    }
  })
})