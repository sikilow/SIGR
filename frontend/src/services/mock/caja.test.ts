import { describe, expect, it } from 'vitest'
import { crearCajaMock } from './cajaMock'
import { baseDatos } from './baseDatos'

describe('caja demo', () => {
  it('cobra una cuenta solicitada con pago dividido, registra el cambio y libera la mesa', async () => {
    const caja = crearCajaMock()
    const inicial = await caja.obtenerEstado()
    const cuenta = inicial.cuentas.find((item) => item.cuenta.idCuenta === 3)
    expect(cuenta?.cuenta.total).toBe(480)
    expect(cuenta?.pedidosSinEntregar).toEqual([])

    const corte = await caja.abrirCorte(500)
    expect(corte).toMatchObject({ fondoInicial: 500, cobros: 0 })

    const venta = await caja.cobrar(3, [
      { idMetodo: 1, monto: 300, montoRecibido: 320 },
      { idMetodo: 2, monto: 180, montoRecibido: 180 },
    ])

    expect(venta.total).toBe(480)
    expect(venta.cambio).toBe(20)
    expect(venta.pagos).toHaveLength(2)
    const estado = await caja.obtenerEstado()
    expect(estado.cuentas.some((item) => item.cuenta.idCuenta === 3)).toBe(false)
    expect(estado.corte?.cobros).toBe(1)
    // El estado del corte abierto no revela totales: el efectivo se cuenta sin conocer lo esperado.
    expect(estado.corte).not.toHaveProperty('totalVentas')

    // Esperado = fondo 500 + efectivo 300 (el cambio de 20 ya salió de la caja); la tarjeta no se cuenta.
    const cierre = await caja.cerrarCorte(790)
    expect(cierre).toMatchObject({ totalVentas: 480, efectivoEsperado: 800, efectivoContado: 790, diferencia: -10 })
    expect(cierre.desglose).toEqual([
      { metodo: 'Efectivo', cobros: 1, monto: 300 },
      { metodo: 'Tarjeta', cobros: 1, monto: 180 },
      { metodo: 'Transferencia', cobros: 0, monto: 0 },
    ])

    const historial = await caja.listarCortes()
    expect(historial.map((item) => item.idCorte)).toContain(cierre.idCorte)
    expect(await caja.obtenerCorte(cierre.idCorte)).toEqual(cierre)
  })

  it('rechaza un fondo inicial negativo', async () => {
    const caja = crearCajaMock()
    await expect(caja.abrirCorte(-1)).rejects.toThrow('fondo inicial')
  })

  it('no cobra una cuenta con pedidos listos que todavía no se han entregado', async () => {
    const cuentaGuardada = baseDatos.cuentas.find((item) => item.idCuenta === 4)
    if (!cuentaGuardada) throw new Error('No existe una cuenta disponible para la prueba')
    cuentaGuardada.estado = 'por_pagar'
    cuentaGuardada.tipoPagoSolicitado = 'fisico'
    const pedidosCuenta = baseDatos.pedidos.filter((pedido) => pedido.idCuenta === cuentaGuardada.idCuenta)
    pedidosCuenta.forEach((pedido) => { pedido.estado = 'entregado' })
    const pedidoListo = pedidosCuenta[0]
    if (!pedidoListo) throw new Error('La cuenta no tiene pedidos')
    pedidoListo.estado = 'listo'

    const caja = crearCajaMock()
    const estado = await caja.obtenerEstado()
    expect(estado.cuentas.some((item) => item.cuenta.idCuenta === cuentaGuardada.idCuenta)).toBe(true)
    await caja.abrirCorte(500)
    await expect(caja.cobrar(cuentaGuardada.idCuenta, [{ idMetodo: 1, monto: 310, montoRecibido: 310 }])).rejects.toThrow(
      'aún no se han entregado',
    )
  })
})
