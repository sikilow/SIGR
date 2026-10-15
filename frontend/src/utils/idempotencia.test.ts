import { describe, expect, it } from 'vitest'
import { ErrorServicio } from '../services/errores'
import { crearClaveIdempotencia, esFalloReintentable, generarUuid } from './idempotencia'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('generarUuid', () => {
  it('devuelve un UUID v4 distinto cada vez', () => {
    const a = generarUuid()
    expect(a).toMatch(UUID)
    expect(generarUuid()).not.toBe(a)
  })
})

describe('crearClaveIdempotencia (una clave por intención)', () => {
  it('un reintento de la MISMA intención reutiliza la clave', () => {
    const claves = crearClaveIdempotencia()
    const primera = claves.para('cancelar|5|Producto agotado')
    expect(claves.para('cancelar|5|Producto agotado')).toBe(primera)
    expect(claves.para('cancelar|5|Producto agotado')).toBe(primera)
  })

  it('una intención nueva (otra firma) genera una clave nueva', () => {
    const claves = crearClaveIdempotencia()
    const primera = claves.para('cancelar|5|Producto agotado')
    const otra = claves.para('cancelar|5|Demora excesiva')
    expect(otra).not.toBe(primera)
    expect(otra).toMatch(UUID)
  })

  it('tras soltar (éxito o rechazo definitivo), la misma firma ya es una intención nueva', () => {
    const claves = crearClaveIdempotencia()
    const primera = claves.para('enviar|8')
    claves.soltar()
    expect(claves.para('enviar|8')).not.toBe(primera)
  })

  it('cada instancia lleva sus propias claves', () => {
    const a = crearClaveIdempotencia()
    const b = crearClaveIdempotencia()
    expect(a.para('x')).not.toBe(b.para('x'))
  })
})

describe('esFalloReintentable', () => {
  it('solo cuando el resultado es desconocido (red o error inesperado)', () => {
    expect(esFalloReintentable(new ErrorServicio('red', 'sin conexión'))).toBe(true)
    expect(esFalloReintentable(new ErrorServicio('desconocido', 'boom', 500))).toBe(true)
    expect(esFalloReintentable(new ErrorServicio('estado_invalido', 'ya no', 409))).toBe(false)
    expect(esFalloReintentable(new ErrorServicio('requiere_gerente', 'gerente', 403))).toBe(false)
    expect(esFalloReintentable(new Error('otro'))).toBe(false)
  })
})
