import { describe, expect, it } from 'vitest'
import {
  agrupacionSugerida,
  diasDelRango,
  etiquetaPeriodo,
  moverPeriodo,
  periodoEmpezado,
  periodoQueContiene,
  serieDeVentas,
} from './periodos'

// Martes 17 de noviembre de 2026.
const hoy = new Date(2026, 10, 17, 13, 30)

describe('periodos: rangos', () => {
  it('cada tipo da su rango completo', () => {
    expect(periodoQueContiene('dia', hoy)).toMatchObject({ desde: '2026-11-17', hasta: '2026-11-17' })
    expect(periodoQueContiene('semana', hoy)).toMatchObject({ desde: '2026-11-16', hasta: '2026-11-22' })
    expect(periodoQueContiene('mes', hoy)).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-30' })
    expect(periodoQueContiene('trimestre', hoy)).toMatchObject({ desde: '2026-10-01', hasta: '2026-12-31' })
    expect(periodoQueContiene('semestre', hoy)).toMatchObject({ desde: '2026-07-01', hasta: '2026-12-31' })
    expect(periodoQueContiene('anio', hoy)).toMatchObject({ desde: '2026-01-01', hasta: '2026-12-31' })
    expect(periodoQueContiene('personalizado', hoy)).toMatchObject({ desde: '2026-10-19', hasta: '2026-11-17' })
  })

  it('el domingo pertenece a la semana que empezó el lunes anterior', () => {
    expect(periodoQueContiene('semana', new Date(2026, 10, 22))).toMatchObject({ desde: '2026-11-16', hasta: '2026-11-22' })
  })

  it('febrero de año bisiesto termina el 29', () => {
    expect(periodoQueContiene('mes', new Date(2028, 1, 10)).hasta).toBe('2028-02-29')
  })

  it('moverse al anterior y al siguiente', () => {
    expect(moverPeriodo(periodoQueContiene('mes', hoy), -1)).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(moverPeriodo(periodoQueContiene('mes', new Date(2026, 0, 31)), -1)).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' })
    expect(moverPeriodo(periodoQueContiene('semestre', hoy), 1)).toMatchObject({ desde: '2027-01-01', hasta: '2027-06-30' })
    expect(moverPeriodo(periodoQueContiene('trimestre', hoy), -1)).toMatchObject({ desde: '2026-07-01', hasta: '2026-09-30' })
    expect(moverPeriodo(periodoQueContiene('anio', hoy), -1)).toMatchObject({ desde: '2025-01-01', hasta: '2025-12-31' })
    expect(moverPeriodo(periodoQueContiene('semana', hoy), 1)).toMatchObject({ desde: '2026-11-23', hasta: '2026-11-29' })
    // Un rango propio se recorre por su largo (aquí 10 días).
    expect(moverPeriodo({ tipo: 'personalizado', desde: '2026-11-01', hasta: '2026-11-10' }, -1)).toMatchObject({
      desde: '2026-10-22',
      hasta: '2026-10-31',
    })
  })

  it('no se avanza a un periodo que todavía no empieza', () => {
    expect(periodoEmpezado(moverPeriodo(periodoQueContiene('mes', hoy), 1), hoy)).toBe(false)
    expect(periodoEmpezado(periodoQueContiene('mes', hoy), hoy)).toBe(true)
  })

  it('etiquetas legibles', () => {
    expect(etiquetaPeriodo(periodoQueContiene('mes', hoy))).toBe('Noviembre 2026')
    expect(etiquetaPeriodo(periodoQueContiene('semestre', hoy))).toBe('2.º semestre 2026 (jul–dic)')
    expect(etiquetaPeriodo(periodoQueContiene('trimestre', hoy))).toBe('4.º trimestre 2026 (oct–dic)')
    expect(etiquetaPeriodo(periodoQueContiene('anio', hoy))).toBe('2026')
    expect(etiquetaPeriodo(periodoQueContiene('semana', hoy))).toBe('Semana del 16 nov al 22 nov 2026')
    expect(etiquetaPeriodo({ tipo: 'personalizado', desde: '2026-11-01', hasta: '2026-11-10' })).toBe('Del 1 nov 2026 al 10 nov 2026')
  })

  it('días del rango cuentan ambos extremos', () => {
    expect(diasDelRango('2026-11-01', '2026-11-30')).toBe(30)
    expect(diasDelRango('2026-11-17', '2026-11-17')).toBe(1)
  })
})

describe('periodos: serie de ventas', () => {
  const porDia = [
    { dia: '2026-11-02', ventas: 2, total: 100.1 },
    { dia: '2026-11-03', ventas: 1, total: 0.2 },
    { dia: '2026-11-20', ventas: 4, total: 400 },
  ]

  it('agrupación sugerida según el largo', () => {
    expect(agrupacionSugerida('2026-11-01', '2026-11-30')).toBe('dia')
    expect(agrupacionSugerida('2026-07-01', '2026-12-31')).toBe('semana')
    expect(agrupacionSugerida('2026-01-01', '2026-12-31')).toBe('mes')
  })

  it('por día llena con cero los días sin ventas', () => {
    const serie = serieDeVentas(porDia, '2026-11-01', '2026-11-30', 'dia')
    expect(serie).toHaveLength(30)
    expect(serie[0]).toMatchObject({ clave: '2026-11-01', ventas: 0, total: 0, etiqueta: '1 nov' })
    expect(serie[1]).toMatchObject({ clave: '2026-11-02', ventas: 2, total: 100.1 })
  })

  it('por semana suma de lunes a domingo, en centavos', () => {
    const serie = serieDeVentas(porDia, '2026-11-01', '2026-11-30', 'semana')
    // La semana del 26 oct (incluye el 1 nov) va primero.
    expect(serie[0]!.clave).toBe('2026-10-26')
    expect(serie[1]).toMatchObject({ clave: '2026-11-02', ventas: 3, total: 100.3 })
    expect(serie.find((p) => p.clave === '2026-11-16')).toMatchObject({ ventas: 4, total: 400 })
  })

  it('por mes', () => {
    const serie = serieDeVentas(porDia, '2026-01-01', '2026-12-31', 'mes')
    expect(serie).toHaveLength(12)
    expect(serie[10]).toMatchObject({ clave: '2026-11-01', ventas: 7, total: 500.3, etiqueta: 'Nov 2026' })
  })
})
