import { describe, expect, it } from 'vitest'
import {
  errorCorreo,
  errorNombrePersona,
  errorNota,
  errorTelefono,
  errorTextoCatalogo,
  limpiarCampo,
  REGEX_NOTA,
  REGEX_TEXTO_CATALOGO,
} from './campos'
import { MOTIVOS_RAPIDOS } from '../types'

describe('limpiarCampo', () => {
  it('nombre: solo letras, espacios y . \' -', () => {
    expect(limpiarCampo('nombre', 'María-José O\'Brien Jr.')).toBe('María-José O\'Brien Jr.')
    expect(limpiarCampo('nombre', 'Ana123 <script>')).toBe('Ana script')
    expect(limpiarCampo('nombre', '  Juan   Pérez')).toBe('Juan Pérez')
    expect(limpiarCampo('nombre', '123Ñandú')).toBe('Ñandú')
  })

  it('texto: letras, números y signos comunes de un nombre de producto', () => {
    expect(limpiarCampo('texto', 'Coca-Cola 600 ml (lata)')).toBe('Coca-Cola 600 ml (lata)')
    expect(limpiarCampo('texto', 'Pizza $%^ #1 <b>')).toBe('Pizza % 1 b')
    expect(limpiarCampo('texto', '*Taco')).toBe('Taco')
  })

  it('nota: puntuación común sí, símbolos raros no', () => {
    expect(limpiarCampo('nota', 'Sin cebolla, por favor. ¡Gracias!')).toBe('Sin cebolla, por favor. ¡Gracias!')
    expect(limpiarCampo('nota', 'Sin <cebolla> {ni} [ajo] \\ | ~ ^ `')).toBe('Sin cebolla ni ajo ')
  })

  it('digitos: solo números', () => {
    expect(limpiarCampo('digitos', '(311) 555-0201 ext.9')).toBe('31155502019')
    expect(limpiarCampo('digitos', 'abc')).toBe('')
  })

  it('decimal: un punto y máximo 2 decimales; la coma cuenta como punto', () => {
    expect(limpiarCampo('decimal', '1,250.5')).toBe('1250.5')
    expect(limpiarCampo('decimal', '12,5')).toBe('12.5')
    expect(limpiarCampo('decimal', '12.345')).toBe('12.34')
    expect(limpiarCampo('decimal', '1.2.3')).toBe('1.23')
    expect(limpiarCampo('decimal', '-5e3')).toBe('53')
    expect(limpiarCampo('decimal', '$ 100')).toBe('100')
  })

  it('usuario: letras sin acento, números, punto, guion y guion bajo', () => {
    expect(limpiarCampo('usuario', 'Mesero_2.ñ -x!')).toBe('Mesero_2.-x')
  })

  it('correo: un solo @ y sin espacios ni símbolos raros', () => {
    expect(limpiarCampo('correo', 'ana perez@@correo.com ')).toBe('anaperez@correo.com')
    expect(limpiarCampo('correo', 'a!b#c$d@x.mx')).toBe('abcd@x.mx')
  })

  it('no toca lo que ya es válido', () => {
    for (const modo of ['nombre', 'texto', 'nota', 'digitos', 'decimal', 'usuario', 'correo'] as const) {
      expect(limpiarCampo(modo, '')).toBe('')
    }
    expect(limpiarCampo('digitos', '3115550201')).toBe('3115550201')
  })
})

describe('validadores', () => {
  it('nombre de persona', () => {
    expect(errorNombrePersona('Ana López')).toBe('')
    expect(errorNombrePersona('')).not.toBe('')
    expect(errorNombrePersona('Ana2')).not.toBe('')
    expect(errorNombrePersona('x'.repeat(101))).not.toBe('')
  })

  it('texto de catálogo', () => {
    expect(errorTextoCatalogo('Café 1/2 kg', 40)).toBe('')
    expect(errorTextoCatalogo('Café @ casa', 40)).not.toBe('')
    expect(errorTextoCatalogo('', 40)).not.toBe('')
    expect(errorTextoCatalogo('', 40, true)).toBe('')
  })

  it('nota', () => {
    expect(errorNota('Sin gluten (celíaco).', 255)).toBe('')
    expect(errorNota('<script>', 255)).not.toBe('')
  })

  it('teléfono: exactamente 10 dígitos', () => {
    expect(errorTelefono('3115550201')).toBe('')
    expect(errorTelefono('311555020')).not.toBe('')
    expect(errorTelefono('311-555-0201')).not.toBe('')
    expect(errorTelefono('', false)).toBe('')
    expect(errorTelefono('')).not.toBe('')
  })

  it('correo', () => {
    expect(errorCorreo('ana.lopez+1@correo.com.mx')).toBe('')
    expect(errorCorreo('ana@correo')).not.toBe('')
    expect(errorCorreo('ana perez@correo.com')).not.toBe('')
    expect(errorCorreo('ana@@correo.com')).not.toBe('')
  })
})

describe('textos fijos del sistema cumplen las reglas', () => {
  it('motivos rápidos de cancelación', () => {
    for (const motivo of MOTIVOS_RAPIDOS) expect(REGEX_NOTA.test(motivo)).toBe(true)
  })

  it('sugerencias de características de mesa', () => {
    for (const s of ['Junto a la ventana', 'Terraza techada', 'Área infantil cerca', 'Silla para bebé', 'Zona tranquila', 'Vista al jardín']) {
      expect(REGEX_TEXTO_CATALOGO.test(s)).toBe(true)
    }
  })
})
