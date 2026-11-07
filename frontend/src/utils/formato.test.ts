import { describe, expect, it } from 'vitest'
import { formatearEspera, formatearFechaHoraCorta, formatearHora, formatearMoneda, formatearPedidos, formatearProductos } from './formato'

describe('formatearFechaHoraCorta (historial de pedidos)', () => {
  const ahora = new Date(2026, 9, 21, 15, 0)

  it('hoy solo muestra la hora', () => {
    expect(formatearFechaHoraCorta(new Date(2026, 9, 21, 9, 5), ahora)).toBe('09:05')
  })

  it('otro día agrega día y mes; otro año, también el año', () => {
    expect(formatearFechaHoraCorta(new Date(2026, 9, 20, 21, 30), ahora)).toBe('20 oct · 21:30')
    expect(formatearFechaHoraCorta(new Date(2025, 11, 31, 23, 59), ahora)).toBe('31 dic 2025 · 23:59')
  })

  it('una fecha inválida da texto vacío', () => {
    expect(formatearFechaHoraCorta(new Date('no'), ahora)).toBe('')
  })
})

describe('formato', () => {
  it('moneda: $1,250.00 MXN', () => {
    expect(formatearMoneda(1250)).toBe('$1,250.00 MXN')
    expect(formatearMoneda(0)).toBe('$0.00 MXN')
    expect(formatearMoneda(80.5)).toBe('$80.50 MXN')
  })

  it('hora de 24 h y fecha inválida', () => {
    expect(formatearHora(new Date('not-a-date'))).toBe('')
    expect(formatearHora(new Date(2026, 9, 14, 18, 5))).toBe('18:05')
  })

  it('plurales', () => {
    expect(formatearProductos(1)).toBe('1 producto')
    expect(formatearProductos(3)).toBe('3 productos')
    expect(formatearPedidos(1)).toBe('1 pedido')
    expect(formatearPedidos(0)).toBe('0 pedidos')
  })
})

describe('formatearEspera', () => {
  const ahora = new Date(2026, 9, 16, 20, 0, 0)
  const hace = (minutos: number, segundos = 0) => new Date(ahora.getTime() - (minutos * 60 + segundos) * 1000)

  it('menos de un minuto, minutos y horas', () => {
    expect(formatearEspera(hace(0, 30), ahora)).toBe('Menos de 1 min')
    expect(formatearEspera(hace(1), ahora)).toBe('1 min')
    expect(formatearEspera(hace(25), ahora)).toBe('25 min')
    expect(formatearEspera(hace(60), ahora)).toBe('1 h 00 min')
    expect(formatearEspera(hace(125), ahora)).toBe('2 h 05 min')
  })

  it('una fecha futura cuenta como cero y una inválida da texto vacío', () => {
    expect(formatearEspera(new Date(ahora.getTime() + 5 * 60_000), ahora)).toBe('Menos de 1 min')
    expect(formatearEspera(new Date('no-es-fecha'), ahora)).toBe('')
  })
})
