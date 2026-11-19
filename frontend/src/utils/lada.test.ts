import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LADA_PREDETERMINADA, LADAS, opcionesLada, rangoTelefono, textoDigitos, textoTelefono } from './lada'
import { errorTelefono } from './campos'

describe('lada', () => {
  it('México es la lada por defecto y va primero', () => {
    expect(LADA_PREDETERMINADA).toBe('52')
    expect(LADAS[0]).toEqual({ codigo: '52', pais: 'México', min: 10, max: 10 })
  })

  it('muestra el teléfono con su lada (52 si falta)', () => {
    expect(textoTelefono('3115550201', '52')).toBe('+52 3115550201')
    expect(textoTelefono('2125550123', '1')).toBe('+1 2125550123')
    expect(textoTelefono('3115550201')).toBe('+52 3115550201')
    expect(textoTelefono(null, '52')).toBeNull()
  })

  it('conserva una lada fuera de la lista para no perderla al editar', () => {
    expect(opcionesLada('52')).toBe(LADAS)
    expect(opcionesLada('34')).toBe(LADAS)
    expect(opcionesLada('999').map((o) => o.codigo)).toContain('999')
    expect(opcionesLada('abc')).toBe(LADAS)
  })

  it('cada país pide su cantidad de dígitos', () => {
    expect(rangoTelefono('52')).toEqual({ min: 10, max: 10 })
    expect(rangoTelefono('34')).toEqual({ min: 9, max: 9 })
    expect(rangoTelefono('506')).toEqual({ min: 8, max: 8 })
    expect(rangoTelefono('86')).toEqual({ min: 11, max: 11 })
    expect(rangoTelefono('999')).toEqual({ min: 6, max: 14 })
    expect(textoDigitos('52')).toBe('10 dígitos')
    expect(textoDigitos('49')).toBe('de 10 a 13 dígitos')
  })

  it('el mensaje de error del teléfono depende de la lada', () => {
    expect(errorTelefono('3115550201', true, '52')).toBe('')
    expect(errorTelefono('3115550201', true, '34')).toMatch(/9 dígitos/)
    expect(errorTelefono('612345678', true, '34')).toBe('')
    expect(errorTelefono('88887777', true, '506')).toBe('')
    expect(errorTelefono('123456789', true, '49')).toMatch(/de 10 a 13 dígitos/)
    expect(errorTelefono('', false, '34')).toBe('')
  })

  it('la tabla del frontend es idéntica a la del servidor', () => {
    const servidor = readFileSync(new URL('../../../backend/src/utils/campos.ts', import.meta.url), 'utf8')
    const filas = [...servidor.matchAll(/\{ codigo: "(\d+)", pais: "([^"]+)", min: (\d+), max: (\d+) \}/g)].map((m) => ({
      codigo: m[1],
      pais: m[2],
      min: Number(m[3]),
      max: Number(m[4]),
    }))
    expect(filas.length).toBeGreaterThan(10)
    expect(filas).toEqual(LADAS.map((o) => ({ ...o })))
  })
})
