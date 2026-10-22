import { describe, expect, it } from 'vitest'
import type { EstadoMesa } from '../types'
import {
  CLAVE_SIN_SECCION,
  TODAS_LAS_SECCIONES,
  agruparPorSeccion,
  compararSecciones,
  describirFiltroMesas,
  filtrarPorSeccion,
  formatearLibresDe,
  hayVariasSecciones,
  seccionDesdeConsulta,
  seccionEfectiva,
  seccionesDe,
  sufijoSeccion,
  type MesaConSeccion,
} from './secciones'

const mesa = (numero: number, zona: string | null, estado: EstadoMesa = 'libre'): MesaConSeccion => ({
  idMesa: numero,
  numero,
  estado,
  zona,
})

// Desordenadas a propósito: el agrupado ordena secciones y números
const salon = [
  mesa(12, 'Terraza', 'ocupada'),
  mesa(3, 'Salón'),
  mesa(18, null),
  mesa(1, 'Salón', 'reservada'),
  mesa(9, 'Terraza'),
  mesa(15, 'Barra', 'ocupada'),
  mesa(10, 'Terraza'),
]

describe('compararSecciones y seccionesDe', () => {
  it('ordena alfabéticamente en español y deja «Sin sección» al final', () => {
    expect(seccionesDe(salon)).toEqual([
      { clave: 'Barra', nombre: 'Barra' },
      { clave: 'Salón', nombre: 'Salón' },
      { clave: 'Terraza', nombre: 'Terraza' },
      { clave: CLAVE_SIN_SECCION, nombre: 'Sin sección' },
    ])
  })

  it('no distingue acentos ni mayúsculas al ordenar y compara números como números', () => {
    const zonas = ['terraza', 'Área 10', 'Área 2', 'Barra', null, 'Ático']
    expect([...zonas].sort(compararSecciones)).toEqual(['Área 2', 'Área 10', 'Ático', 'Barra', 'terraza', null])
  })
})

describe('hayVariasSecciones', () => {
  it('sin secciones o todas iguales: no (la pantalla queda como antes)', () => {
    expect(hayVariasSecciones([])).toBe(false)
    expect(hayVariasSecciones([mesa(1, null), mesa(2, null)])).toBe(false)
    expect(hayVariasSecciones([mesa(1, 'Salón'), mesa(2, 'Salón')])).toBe(false)
  })

  it('dos secciones, o una sección más mesas sin sección: sí', () => {
    expect(hayVariasSecciones([mesa(1, 'Salón'), mesa(2, 'Terraza')])).toBe(true)
    expect(hayVariasSecciones([mesa(1, 'Salón'), mesa(2, null)])).toBe(true)
  })
})

describe('agruparPorSeccion', () => {
  it('agrupa en orden alfabético, «Sin sección» al final y las mesas por número', () => {
    const grupos = agruparPorSeccion(salon, salon)
    expect(grupos.map((g) => g.nombre)).toEqual(['Barra', 'Salón', 'Terraza', 'Sin sección'])
    expect(grupos.map((g) => g.mesas.map((m) => m.numero))).toEqual([[15], [1, 3], [9, 10, 12], [18]])
  })

  it('los conteos del encabezado son de toda la sección aunque se filtre por estado', () => {
    const libres = salon.filter((m) => m.estado === 'libre')
    const grupos = agruparPorSeccion(libres, salon)
    // Barra no tiene mesas libres: su grupo no aparece
    expect(grupos.map((g) => g.clave)).toEqual(['Salón', 'Terraza', CLAVE_SIN_SECCION])
    expect(grupos.map((g) => [g.libres, g.total])).toEqual([
      [1, 2],
      [2, 3],
      [1, 1],
    ])
  })

  it('sin mesas visibles no hay grupos', () => {
    expect(agruparPorSeccion([], salon)).toEqual([])
  })
})

describe('filtro de sección', () => {
  it('lee la URL: ausente, vacía o no texto = todas; recorta espacios', () => {
    expect(seccionDesdeConsulta(undefined)).toBe(TODAS_LAS_SECCIONES)
    expect(seccionDesdeConsulta(null)).toBe(TODAS_LAS_SECCIONES)
    expect(seccionDesdeConsulta(['Terraza'])).toBe(TODAS_LAS_SECCIONES)
    expect(seccionDesdeConsulta('  ')).toBe(TODAS_LAS_SECCIONES)
    expect(seccionDesdeConsulta(' Terraza ')).toBe('Terraza')
    expect(seccionDesdeConsulta(CLAVE_SIN_SECCION)).toBe(CLAVE_SIN_SECCION)
  })

  it('solo se aplica si hay varias secciones y la sección existe', () => {
    expect(seccionEfectiva('Terraza', salon)).toBe('Terraza')
    expect(seccionEfectiva(CLAVE_SIN_SECCION, salon)).toBe(CLAVE_SIN_SECCION)
    expect(seccionEfectiva('Jardín', salon)).toBe(TODAS_LAS_SECCIONES)
    expect(seccionEfectiva('Salón', [mesa(1, 'Salón'), mesa(2, 'Salón')])).toBe(TODAS_LAS_SECCIONES)
    expect(seccionEfectiva(CLAVE_SIN_SECCION, [mesa(1, 'Salón'), mesa(2, 'Terraza')])).toBe(TODAS_LAS_SECCIONES)
  })

  it('filtra por nombre exacto o por «sin sección»', () => {
    expect(filtrarPorSeccion(salon, 'Terraza').map((m) => m.numero)).toEqual([12, 9, 10])
    expect(filtrarPorSeccion(salon, CLAVE_SIN_SECCION).map((m) => m.numero)).toEqual([18])
    expect(filtrarPorSeccion(salon, TODAS_LAS_SECCIONES)).toHaveLength(salon.length)
  })
})

describe('textos', () => {
  it('formatearLibresDe concuerda en singular y plural', () => {
    expect(formatearLibresDe(2, 6)).toBe('2 libres de 6 mesas')
    expect(formatearLibresDe(1, 1)).toBe('1 libre de 1 mesa')
    expect(formatearLibresDe(0, 3)).toBe('0 libres de 3 mesas')
  })

  it('sufijoSeccion completa el mensaje de vacío', () => {
    expect(sufijoSeccion(TODAS_LAS_SECCIONES)).toBe('')
    expect(sufijoSeccion('Terraza')).toBe(' en Terraza')
    expect(sufijoSeccion(CLAVE_SIN_SECCION)).toBe(' sin sección')
  })

  it('describirFiltroMesas arma el anuncio de la región aria-live', () => {
    expect(describirFiltroMesas(18, null, TODAS_LAS_SECCIONES)).toBe('Todas las mesas. 18 mesas.')
    expect(describirFiltroMesas(3, 'libres', 'Terraza')).toBe('Filtro: libres, sección Terraza. 3 mesas.')
    expect(describirFiltroMesas(1, null, CLAVE_SIN_SECCION)).toBe('Filtro: sin sección. 1 mesa.')
    expect(describirFiltroMesas(0, 'ocupadas', 'Barra')).toBe('Filtro: ocupadas, sección Barra. Ninguna mesa.')
  })
})
