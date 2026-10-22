import { describe, expect, it } from 'vitest'
import { crearCajaMock } from './cajaMock'

describe('caja demo', () => {
  it('cobra una cuenta solicitada con pago dividido, registra el cambio y libera la mesa', async () => {
    const caja = crearCajaMock()
    const inicial = await caja.obtenerEstado()
    const cuenta = inicial.cuentas.find((item) => item.cuenta.idCuenta === 3)
    expect(cuenta?.cuenta.total).toBe(480)
    expect(cuenta?.pedidosSinEntregar).toEqual([])

    const corte = await caja.abrirCorte()
    expect(corte.totalVentas).toBe(0)

    const venta = await caja.cobrar(3, [
      { idMetodo: 1, monto: 300, montoRecibido: 320 },
      { idMetodo: 2, monto: 180, montoRecibido: 180 },
    ])

    expect(venta.total).toBe(480)
    expect(venta.cambio).toBe(20)
    expect(venta.pagos).toHaveLength(2)
    expect((await caja.obtenerEstado()).cuentas.some((item) => item.cuenta.idCuenta === 3)).toBe(false)
    expect((await caja.obtenerEstado()).corte?.totalVentas).toBe(480)

    const cierre = await caja.cerrarCorte(480)
    expect(cierre.diferencia).toBe(0)
  })
})
