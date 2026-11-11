import type { CobroPorMetodo } from '../types'

export interface FilaDesgloseVista extends CobroPorMetodo {
  /** Parte del total cobrado, de 0 a 1. */
  proporcion: number
}

export interface DesgloseVista {
  totalCobrado: number
  efectivoCobrado: number
  filas: FilaDesgloseVista[]
}

const centavos = (monto: number): number => Math.round(monto * 100)

/** El total sale de sumar el desglose, en centavos: así siempre coincide con las filas que se muestran. */
export function resumirDesglose(desglose: CobroPorMetodo[]): DesgloseVista {
  const total = desglose.reduce((suma, fila) => suma + centavos(fila.monto), 0)
  const efectivo = desglose
    .filter((fila) => fila.esEfectivo)
    .reduce((suma, fila) => suma + centavos(fila.monto), 0)
  return {
    totalCobrado: total / 100,
    efectivoCobrado: efectivo / 100,
    filas: desglose.map((fila) => ({ ...fila, proporcion: total > 0 ? centavos(fila.monto) / total : 0 })),
  }
}

/** Compara, sin errores de punto flotante, la suma de pagos con el total de ventas del corte. */
export function coincideConVentas(totalCobrado: number, totalVentas: number): boolean {
  return centavos(totalCobrado) === centavos(totalVentas)
}
