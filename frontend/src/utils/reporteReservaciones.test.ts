import { describe, expect, it } from 'vitest'
import { DIAS_SEMANA, tasa, tasaCancelacion, tasaInasistencia, textoHora, textoPorcentaje } from './reporteReservaciones'

describe('reporte de reservaciones: tasas', () => {
  it('sin datos no hay tasa (no es 0 %)', () => {
    expect(tasa(0, 0)).toBeNull()
    expect(textoPorcentaje(null)).toBe('—')
  })

  it('la inasistencia solo compara a quienes ya llegaron o no llegaron', () => {
    // 6 llegaron, 2 no llegaron, 5 canceladas, 3 por llegar: 2 / 8
    expect(tasaInasistencia({ llegaron: 6, vencidas: 2 })).toBe(0.25)
    expect(tasaInasistencia({ llegaron: 0, vencidas: 0 })).toBeNull()
    expect(tasaInasistencia({ llegaron: 0, vencidas: 3 })).toBe(1)
  })

  it('la cancelación se mide contra todas las reservaciones', () => {
    expect(tasaCancelacion({ canceladas: 5, total: 16 })).toBe(0.3125)
    expect(tasaCancelacion({ canceladas: 0, total: 0 })).toBeNull()
  })

  it('formatea el porcentaje y la hora', () => {
    expect(textoPorcentaje(0.25)).toContain('25')
    expect(textoPorcentaje(1 / 3)).toMatch(/33[.,]3/)
    expect(textoHora(9)).toBe('09:00')
    expect(textoHora(21)).toBe('21:00')
  })

  it('la semana empieza en lunes, como la API', () => {
    expect(DIAS_SEMANA[0]).toBe('Lunes')
    expect(DIAS_SEMANA[6]).toBe('Domingo')
    expect(DIAS_SEMANA).toHaveLength(7)
  })
})
