import { describe, expect, it } from 'vitest'
import { estadoInventario } from './inventario'

describe('estadoInventario', () => {
  it('separa agotado, poco stock y disponible según el mínimo', () => {
    const base = { controlaExistencia: true, existencia: 0, stockMinimo: 2 }
    expect(estadoInventario(base)).toBe('agotado')
    expect(estadoInventario({ ...base, existencia: 1 })).toBe('poco_stock')
    expect(estadoInventario({ ...base, existencia: 2 })).toBe('poco_stock')
    expect(estadoInventario({ ...base, existencia: 3 })).toBe('disponible')
  })

  it('no asigna estados de stock a productos sin control de existencia', () => {
    expect(estadoInventario({ controlaExistencia: false, existencia: 0, stockMinimo: 5 })).toBe('sin_control')
  })
})
