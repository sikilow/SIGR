import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearCajaMock } from './cajaMock'

// El entorno de pruebas no tiene sessionStorage: se simula uno con el usuario de la sesión demo.
function sesionComo(rol: 'cajero' | 'gerente'): void {
  const usuario =
    rol === 'cajero'
      ? { idUsuario: 3, idRol: 4, nombre: 'Marta Solís', correo: '', activo: true, rol: 'cajero' }
      : { idUsuario: 2, idRol: 1, nombre: 'Luis Ramírez', correo: '', activo: true, rol: 'gerente' }
  vi.stubGlobal('sessionStorage', { getItem: vi.fn((clave: string) => (clave === 'sigr.mock.sesion' ? JSON.stringify(usuario) : null)) })
}

/** Deja correr el retraso simulado de red y devuelve el resultado (o lanza el error). */
async function esperar<T>(promesa: Promise<T>): Promise<T> {
  const resultado = promesa.then(
    (valor) => ({ ok: true as const, valor }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  await vi.advanceTimersByTimeAsync(400)
  const r = await resultado
  if (!r.ok) throw r.error
  return r.valor
}

async function mensajeDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await esperar(promesa)
  } catch (e) {
    return (e as Error).message
  }
  return 'sin error'
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('tickets y devoluciones (demo)', () => {
  it('recorre el flujo: cobrar, solicitar, autorizar, cuadrar el corte y reportar', async () => {
    const caja = crearCajaMock()

    // ---- El cajero cobra la cuenta 3 (480: 300 efectivo + 180 tarjeta) ----
    sesionComo('cajero')
    await esperar(caja.abrirCorte(500))
    const venta = await esperar(caja.cobrar(3, [
      { idMetodo: 1, monto: 300, montoRecibido: 300 },
      { idMetodo: 2, monto: 180, montoRecibido: 180 },
    ]))

    const lista = await esperar(caja.listarVentas())
    expect(lista.map((v) => v.idVenta)).toContain(venta.idVenta)
    // «q» busca por número de ticket o de mesa
    expect((await esperar(caja.listarVentas({ q: String(venta.idVenta) }))).some((v) => v.idVenta === venta.idVenta)).toBe(true)
    await expect(esperar(caja.listarVentas({ q: 'abc' }))).rejects.toThrow('solo números')
    await expect(esperar(caja.listarVentas({ desde: '2026-01-01', hasta: '2026-12-31' }))).rejects.toThrow('92 días')

    const detalle = await esperar(caja.obtenerVenta(venta.idVenta))
    expect(detalle.total).toBe(480)
    expect(detalle.lineas.length).toBeGreaterThan(0)
    expect(detalle.pagos.map((p) => p.metodo)).toEqual(['Efectivo', 'Tarjeta'])
    expect(detalle.referenciaFiscal).toBeUndefined() // el cajero no ve lo fiscal

    // ---- Reimpresión: queda constancia ----
    expect((await esperar(caja.registrarReimpresion(venta.idVenta))).reimpresiones).toBe(1)
    expect((await esperar(caja.registrarReimpresion(venta.idVenta))).reimpresiones).toBe(2)
    expect((await esperar(caja.obtenerVenta(venta.idVenta))).reimpresiones).toBe(2)

    // ---- El cajero SOLICITA devolver 1 unidad de la primera línea, en efectivo ----
    const linea = detalle.lineas[0]!
    const importe = linea.precioUnitario
    expect(importe).toBeLessThanOrEqual(300)
    const solicitud = {
      lineas: [{ idDetalle: linea.idDetalle, cantidad: 1 }],
      pagos: [{ idMetodo: 1, monto: importe }],
      motivo: 'El platillo llegó frío',
      reponerInventario: false,
    }
    const pendiente = await esperar(caja.solicitarDevolucion(venta.idVenta, solicitud))
    expect(pendiente).toMatchObject({ estado: 'pendiente', total: importe, solicitante: 'Marta Solís', idCorte: null })

    // Lo pedido queda apartado: no se puede pedir de nuevo más de lo que queda
    const despues = await esperar(caja.obtenerVenta(venta.idVenta))
    expect(despues.lineas[0]!.pendiente).toBe(1)
    expect(despues.devuelto).toBe(0) // todavía no sale dinero
    const exceso = { ...solicitud, lineas: [{ idDetalle: linea.idDetalle, cantidad: linea.cantidad }], pagos: [{ idMetodo: 1, monto: importe * linea.cantidad }] }
    expect(await mensajeDe(caja.solicitarDevolucion(venta.idVenta, exceso))).toContain('solo se pueden devolver')

    // El cajero no autoriza ni guarda lo fiscal
    expect(await mensajeDe(caja.aprobarDevolucion(pendiente.idDevolucion))).toContain('Solo el gerente')
    expect(await mensajeDe(caja.guardarReferenciaFiscal(venta.idVenta, { referenciaContador: 'X-1' }))).toContain('Solo el gerente')
    // El cajero ve solo las suyas
    expect((await esperar(caja.listarDevoluciones({ estado: 'pendiente' }))).map((d) => d.idDevolucion)).toEqual([pendiente.idDevolucion])

    // ---- El gerente autoriza ----
    sesionComo('gerente')
    expect(await mensajeDe(caja.rechazarDevolucion(pendiente.idDevolucion, '  '))).toContain('por qué se rechaza')
    const aprobada = await esperar(caja.aprobarDevolucion(pendiente.idDevolucion, 'Ok'))
    expect(aprobada).toMatchObject({ estado: 'aprobada', resolutor: 'Luis Ramírez', notaResolucion: 'Ok', idCorte: 1 })
    expect(await mensajeDe(caja.aprobarDevolucion(pendiente.idDevolucion))).toContain('ya está aprobada')

    const conDevolucion = await esperar(caja.obtenerVenta(venta.idVenta))
    expect(conDevolucion.devuelto).toBe(importe)
    expect(conDevolucion.estadoDevolucion).toBe('parcial')
    expect(conDevolucion.pagos[0]!.devuelto).toBe(importe)
    expect(conDevolucion.referenciaFiscal).toBeNull() // el gerente sí la ve (todavía sin referencia)

    // ---- Referencia fiscal (solo gerente; los datos del cliente son opcionales) ----
    expect(await mensajeDe(caja.guardarReferenciaFiscal(venta.idVenta, { referenciaContador: 'F-100', rfc: 'MALO' }))).toContain('RFC no válido')
    const fiscal = await esperar(caja.guardarReferenciaFiscal(venta.idVenta, { referenciaContador: 'F-100' }))
    expect(fiscal).toMatchObject({ referenciaContador: 'F-100', rfc: null, correo: null, registradoPor: 'Luis Ramírez' })
    const conRfc = await esperar(caja.guardarReferenciaFiscal(venta.idVenta, { referenciaContador: 'F-100', rfc: 'xaxx010101000', correo: 'A@B.com' }))
    expect(conRfc).toMatchObject({ rfc: 'XAXX010101000', correo: 'a@b.com' })
    expect((await esperar(caja.listarVentas({ q: String(venta.idVenta) }))).find((v) => v.idVenta === venta.idVenta)!.conReferenciaFiscal).toBe(true)
    await esperar(caja.quitarReferenciaFiscal(venta.idVenta))
    expect(await mensajeDe(caja.quitarReferenciaFiscal(venta.idVenta))).toContain('no tiene referencia')

    // ---- Una solicitud (cerveza con tarjeta) se rechaza con nota: no mueve dinero y libera lo apartado ----
    const cerveza = detalle.lineas[1]!
    const porTarjeta = {
      lineas: [{ idDetalle: cerveza.idDetalle, cantidad: 1 }],
      pagos: [{ idMetodo: 2, monto: cerveza.precioUnitario }],
      motivo: 'Cerveza sin gas',
      reponerInventario: false,
    }
    sesionComo('cajero')
    const aRechazar = await esperar(caja.solicitarDevolucion(venta.idVenta, porTarjeta))
    sesionComo('gerente')
    const rechazada = await esperar(caja.rechazarDevolucion(aRechazar.idDevolucion, 'No procede'))
    expect(rechazada).toMatchObject({ estado: 'rechazada', notaResolucion: 'No procede' })
    expect((await esperar(caja.obtenerVenta(venta.idVenta))).lineas[1]!.pendiente).toBe(0)

    // ---- El gerente registra la misma cerveza ya aprobada (no pasa por la caja de nadie) ----
    const directa = await esperar(caja.solicitarDevolucion(venta.idVenta, { ...porTarjeta, motivo: 'Cortesía por la espera' }))
    expect(directa).toMatchObject({ estado: 'aprobada', idCorte: null })

    // ---- El corte cuadra con lo devuelto: baja el efectivo esperado ----
    sesionComo('cajero')
    const cierre = await esperar(caja.cerrarCorte(0))
    // Solo la que pidió el cajero sale de su corte; la que registró el gerente no.
    expect(cierre.totalDevuelto).toBe(importe)
    expect(cierre.efectivoEsperado).toBe(500 + 300 - importe)
    expect(cierre.desglose.find((f) => f.metodo === 'Efectivo')?.devuelto).toBe(importe)
    expect(cierre.desglose.find((f) => f.metodo === 'Tarjeta')?.devuelto).toBe(0)

    // ---- El reporte de ventas muestra devoluciones y neto ----
    sesionComo('gerente')
    const hoy = new Date()
    const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const reporte = await esperar(caja.reporteVentas(dia, dia))
    const devuelto = importe + cerveza.precioUnitario
    expect(reporte.resumen.devoluciones).toBe(2) // la autorizada y la que registró el gerente
    expect(reporte.resumen.devuelto).toBe(devuelto)
    expect(reporte.resumen.neto).toBeCloseTo(reporte.resumen.total - devuelto, 2)
  })

  it('un cajero sin caja iniciada no puede entregar el efectivo de una devolución autorizada', async () => {
    const caja = crearCajaMock()
    sesionComo('cajero')
    const lista = await esperar(caja.listarVentas())
    const antigua = lista.find((v) => v.idVenta > 1000) // una venta de ejemplo de días anteriores o de hoy
    expect(antigua).toBeDefined()
    const detalle = await esperar(caja.obtenerVenta(antigua!.idVenta))
    const linea = detalle.lineas[0]!
    const pago = detalle.pagos[0]!
    const importe = linea.precioUnitario
    expect(pago.monto).toBeGreaterThanOrEqual(importe)
    const solicitud = {
      lineas: [{ idDetalle: linea.idDetalle, cantidad: 1 }],
      pagos: [{ idMetodo: pago.idMetodo, monto: importe }],
      motivo: 'Producto equivocado',
      reponerInventario: false,
    }
    const pendiente = await esperar(caja.solicitarDevolucion(antigua!.idVenta, solicitud))
    sesionComo('gerente')
    if (pago.esEfectivo) {
      expect(await mensajeDe(caja.aprobarDevolucion(pendiente.idDevolucion))).toContain('no tiene la caja iniciada')
      // Sigue pendiente: no quedó nada a medias
      expect((await esperar(caja.listarDevoluciones({ estado: 'pendiente' }))).map((d) => d.idDevolucion)).toContain(pendiente.idDevolucion)
    } else {
      // Con tarjeta o transferencia no hace falta caja.
      expect((await esperar(caja.aprobarDevolucion(pendiente.idDevolucion))).estado).toBe('aprobada')
    }
  })
})
