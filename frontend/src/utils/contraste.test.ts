// Contraste de color: el cálculo (casos conocidos de WCAG) y los pares de la hostess con los tokens REALES de tokens.css.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluarPares, hexARgb, leerTokens, luminancia, PARES_HOSTESS, relacionContraste } from './contraste'

const tokens = leerTokens(readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8'))

describe('cálculo de contraste (WCAG 2.x)', () => {
  it('negro sobre blanco es 21:1 y un color sobre sí mismo es 1:1', () => {
    expect(relacionContraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(relacionContraste('#767676', '#767676')).toBeCloseTo(1, 5)
  })

  it('es simétrico: no importa cuál es el texto y cuál el fondo', () => {
    expect(relacionContraste('#c2410c', '#ffffff')).toBeCloseTo(relacionContraste('#ffffff', '#c2410c'), 10)
  })

  it('caso conocido: gris #767676 sobre blanco ≈ 4.54:1 (justo sobre AA)', () => {
    expect(relacionContraste('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it('luminancia del blanco es 1 y la del negro 0', () => {
    expect(luminancia('#ffffff')).toBeCloseTo(1, 10)
    expect(luminancia('#000000')).toBe(0)
  })

  it('convierte hexadecimal a RGB', () => {
    expect(hexARgb('#c2410c')).toEqual([194, 65, 12])
  })

  it('lee las variables de color de un CSS y se salta lo que no es hexadecimal', () => {
    expect(leerTokens(':root { --a: #112233; --radio: 16px; --b-c: #AABBCC; }')).toEqual({ a: '#112233', 'b-c': '#AABBCC' })
  })

  it('un token que no existe es un error (no un falso «cumple»)', () => {
    expect(() => evaluarPares({}, [{ uso: 'x', texto: 'nada', fondo: 'nada', tipo: 'texto' }])).toThrow(/Falta el token/)
  })
})

describe('pares de la hostess con los tokens reales', () => {
  const resultados = evaluarPares(tokens, PARES_HOSTESS)

  it('hay pares de insignias, botones, avisos y marcas', () => {
    const usos = resultados.map((r) => r.uso).join(' | ')
    for (const parte of ['Insignia', 'Botón primario', 'Botón secundario', 'Botón destructivo', 'Espera larga', 'Aviso de capacidad']) {
      expect(usos).toContain(parte)
    }
  })

  it.each(resultados.map((r) => [r.uso, r] as const))('%s', (_uso, r) => {
    expect(r.relacion, `${r.colorTexto} sobre ${r.colorFondo} = ${r.relacion.toFixed(2)}:1 (mínimo ${r.minimo})`).toBeGreaterThanOrEqual(r.minimo)
  })
})
