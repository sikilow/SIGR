import { describe, expect, it } from 'vitest'
import { formatearHora, formatearMoneda, formatearPedidos, formatearProductos } from './formato'

describe('formato', () => {
  it('moneda: $1,250.00 MXN', () => {
    expect(formatearMoneda(1250)).toBe('$1,250.00 MXN')
    expect(formatearMoneda(0)).toBe('$0.00 MXN')
    expect(formatearMoneda(80.5)).toBe('$80.50 MXN')
  })

  it('hora de 24 h y fecha inválida', () => {
    expect(formatearHora('not-a-date')).toBe('')
    expect(formatearHora(new Date(2026, 9, 14, 18, 5).toISOString())).toBe('18:05')
  })

  it('plurales', () => {
    expect(formatearProductos(1)).toBe('1 producto')
    expect(formatearProductos(3)).toBe('3 productos')
    expect(formatearPedidos(1)).toBe('1 pedido')
    expect(formatearPedidos(0)).toBe('0 pedidos')
  })
})
