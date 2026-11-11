import { describe, expect, it } from 'vitest'
import { coincideConVentas, resumirDesglose } from './corteVista'

const desglose = [
  { metodo: 'Monedas y billetes', esEfectivo: true, cobros: 2, monto: 300.3 },
  { metodo: 'Tarjeta', esEfectivo: false, cobros: 1, monto: 180 },
  { metodo: 'Transferencia', esEfectivo: false, cobros: 0, monto: 0 },
]

describe('resumirDesglose', () => {
  it('el total cobrado es la suma exacta del desglose', () => {
    const { totalCobrado, filas } = resumirDesglose(desglose)
    expect(totalCobrado).toBe(480.3)
    expect(filas.map((fila) => fila.monto)).toEqual([300.3, 180, 0])
  })

  it('no acumula errores de punto flotante', () => {
    const { totalCobrado } = resumirDesglose([
      { metodo: 'A', esEfectivo: false, cobros: 1, monto: 0.1 },
      { metodo: 'B', esEfectivo: false, cobros: 1, monto: 0.2 },
    ])
    expect(totalCobrado).toBe(0.3)
  })

  it('identifica el efectivo por su marca y no por el nombre del método', () => {
    expect(resumirDesglose(desglose).efectivoCobrado).toBe(300.3)
  })

  it('reparte las proporciones sobre el total', () => {
    const proporciones = resumirDesglose(desglose).filas.map((fila) => fila.proporcion)
    expect(proporciones.reduce((suma, valor) => suma + valor, 0)).toBeCloseTo(1)
    expect(proporciones[2]).toBe(0)
  })

  it('un corte sin cobros da cero sin dividir entre cero', () => {
    const vacio = resumirDesglose([{ metodo: 'Efectivo', esEfectivo: true, cobros: 0, monto: 0 }])
    expect(vacio.totalCobrado).toBe(0)
    expect(vacio.filas[0]?.proporcion).toBe(0)
  })
})

describe('coincideConVentas', () => {
  it('compara al centavo', () => {
    expect(coincideConVentas(0.1 + 0.2, 0.3)).toBe(true)
    expect(coincideConVentas(480.3, 480.31)).toBe(false)
  })
})
