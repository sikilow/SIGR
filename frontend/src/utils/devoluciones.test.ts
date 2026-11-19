import { describe, expect, it } from 'vitest'
import type { SolicitudDevolucion, VentaDetalle } from '../types'
import { capacidadDePago, disponibleDeLinea, repartirDevolucion, totalDeLineas, validarSolicitudDevolucion } from './devoluciones'

/** Venta de 330: 2 × 100 + 1 × 130; pagada 200 en efectivo y 130 con tarjeta. */
function venta(sobre: Partial<VentaDetalle> = {}): VentaDetalle {
  return {
    idVenta: 1,
    idCuenta: 1,
    fechaHora: new Date(),
    total: 330,
    cajero: 'Marta',
    meseros: 'Ana',
    mesaNumero: 4,
    seccion: null,
    canal: null,
    referencia: null,
    lineas: [
      { idDetalle: 10, producto: 'Tacos', presentacion: null, cantidad: 2, precioUnitario: 100, importe: 200, indicaciones: null, devuelta: 0, pendiente: 0 },
      { idDetalle: 11, producto: 'Pozole', presentacion: 'Grande', cantidad: 1, precioUnitario: 130, importe: 130, indicaciones: null, devuelta: 0, pendiente: 0 },
    ],
    pagos: [
      { idMetodo: 1, metodo: 'Efectivo', esEfectivo: true, monto: 200, montoRecibido: 200, cambio: 0, devuelto: 0, pendiente: 0 },
      { idMetodo: 2, metodo: 'Tarjeta', esEfectivo: false, monto: 130, montoRecibido: 130, cambio: 0, devuelto: 0, pendiente: 0 },
    ],
    devoluciones: [],
    devuelto: 0,
    estadoDevolucion: 'ninguna',
    reimpresiones: 0,
    ultimaReimpresion: null,
    ...sobre,
  }
}

const base = (s: Partial<SolicitudDevolucion> = {}): SolicitudDevolucion => ({
  lineas: [{ idDetalle: 10, cantidad: 1 }],
  pagos: [{ idMetodo: 1, monto: 100 }],
  motivo: 'Llegó frío',
  reponerInventario: false,
  ...s,
})

describe('devoluciones: cantidades y dinero', () => {
  it('disponible = vendido − devuelto − pendiente', () => {
    expect(disponibleDeLinea({ cantidad: 3, devuelta: 1, pendiente: 1 })).toBe(1)
    expect(disponibleDeLinea({ cantidad: 1, devuelta: 1, pendiente: 1 })).toBe(0)
  })

  it('la capacidad de un método descarta lo ya devuelto y lo apartado', () => {
    expect(capacidadDePago({ monto: 200, devuelto: 50, pendiente: 25.5 })).toBe(124.5)
    expect(capacidadDePago({ monto: 10, devuelto: 10, pendiente: 5 })).toBe(0)
  })

  it('suma el importe de las unidades elegidas', () => {
    expect(totalDeLineas(venta().lineas, { 10: 2, 11: 1 })).toBe(330)
    expect(totalDeLineas(venta().lineas, { 10: 1 })).toBe(100)
    expect(totalDeLineas(venta().lineas, {})).toBe(0)
  })

  it('reparte el dinero método por método en el orden de la venta', () => {
    expect(repartirDevolucion(100, venta().pagos)).toEqual([{ idMetodo: 1, monto: 100 }])
    expect(repartirDevolucion(250, venta().pagos)).toEqual([
      { idMetodo: 1, monto: 200 },
      { idMetodo: 2, monto: 50 },
    ])
    // Si el efectivo ya se devolvió, se pasa al siguiente método
    const sinEfectivo = venta().pagos.map((p) => (p.idMetodo === 1 ? { ...p, devuelto: 200 } : p))
    expect(repartirDevolucion(100, sinEfectivo)).toEqual([{ idMetodo: 2, monto: 100 }])
  })
})

describe('devoluciones: validación de la solicitud', () => {
  it('acepta una devolución parcial bien armada', () => {
    expect(validarSolicitudDevolucion(venta(), base())).toBeNull()
  })

  it('pide al menos un producto, el motivo y cómo se devuelve el dinero', () => {
    expect(validarSolicitudDevolucion(venta(), base({ lineas: [] }))).toContain('al menos un producto')
    expect(validarSolicitudDevolucion(venta(), base({ motivo: 'ab' }))).toContain('motivo')
    expect(validarSolicitudDevolucion(venta(), base({ motivo: 'x'.repeat(201) }))).toContain('200')
    expect(validarSolicitudDevolucion(venta(), base({ pagos: [] }))).toContain('cómo se devuelve')
  })

  it('no deja pasar de lo vendido ni de lo ya devuelto', () => {
    expect(validarSolicitudDevolucion(venta(), base({ lineas: [{ idDetalle: 10, cantidad: 3 }], pagos: [{ idMetodo: 1, monto: 300 }] }))).toContain('solo se pueden devolver 2')
    const yaDevuelta = venta({ lineas: venta().lineas.map((l) => (l.idDetalle === 10 ? { ...l, devuelta: 2 } : l)) })
    expect(validarSolicitudDevolucion(yaDevuelta, base())).toContain('ya se devolvió por completo')
    const apartada = venta({ lineas: venta().lineas.map((l) => (l.idDetalle === 10 ? { ...l, devuelta: 1, pendiente: 1 } : l)) })
    expect(validarSolicitudDevolucion(apartada, base())).toContain('ya se devolvió por completo')
  })

  it('rechaza líneas ajenas o repetidas', () => {
    expect(validarSolicitudDevolucion(venta(), base({ lineas: [{ idDetalle: 99, cantidad: 1 }] }))).toContain('no pertenece')
    expect(validarSolicitudDevolucion(venta(), base({ lineas: [{ idDetalle: 10, cantidad: 1 }, { idDetalle: 10, cantidad: 1 }], pagos: [{ idMetodo: 1, monto: 200 }] }))).toContain('dos veces')
  })

  it('solo se devuelve con métodos de la venta y sin pasar de lo cobrado con cada uno', () => {
    expect(validarSolicitudDevolucion(venta(), base({ pagos: [{ idMetodo: 9, monto: 100 }] }))).toContain('métodos de pago que se usaron')
    // 130 con tarjeta es lo cobrado: devolver 150 por esa vía no se puede
    expect(validarSolicitudDevolucion(venta(), base({ lineas: [{ idDetalle: 10, cantidad: 2 }], pagos: [{ idMetodo: 2, monto: 200 }] }))).toContain('solo se pueden devolver $130.00')
    const conDevuelto = venta({ pagos: venta().pagos.map((p) => (p.idMetodo === 1 ? { ...p, devuelto: 150 } : p)) })
    expect(validarSolicitudDevolucion(conDevuelto, base({ pagos: [{ idMetodo: 1, monto: 100 }] }))).toContain('solo se pueden devolver $50.00')
  })

  it('los importes deben sumar exactamente el total a devolver', () => {
    expect(validarSolicitudDevolucion(venta(), base({ pagos: [{ idMetodo: 1, monto: 90 }] }))).toContain('deben sumar el total')
    expect(validarSolicitudDevolucion(venta(), base({ pagos: [{ idMetodo: 1, monto: 60 }, { idMetodo: 2, monto: 40 }] }))).toBeNull()
  })
})
