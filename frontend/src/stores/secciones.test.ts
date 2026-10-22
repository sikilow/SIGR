// Filtro y agrupado por sección en los stores del Panel (mesero) y del Salón (hostess), RF-MES-007.
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Mesa } from '../types'
import { CLAVE_SIN_SECCION, TODAS_LAS_SECCIONES } from '../utils/secciones'
import { useMesasStore } from './mesas'
import { useSalonStore } from './salon'

const mesa = (numero: number, zona: string | null, estado: Mesa['estado'] = 'libre', pedidosListos = 0): Mesa => ({
  idMesa: numero,
  numero,
  capacidad: 4,
  estado,
  zona,
  estadoCuenta: estado === 'ocupada' ? 'abierta' : null,
  pedidosActivos: 0,
  totalCuenta: 0,
  pedidosListos,
  tipoPagoSolicitado: null,
})

const varias = [mesa(9, 'Terraza'), mesa(1, 'Salón', 'ocupada', 1), mesa(2, 'Salón'), mesa(10, 'Terraza', 'ocupada'), mesa(18, null)]

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('store de mesas (Panel del mesero)', () => {
  it('combina el filtro de estado con el de sección; los contadores siguen siendo del total', () => {
    const store = useMesasStore()
    store.mesas = varias
    store.filtro = 'libre'
    store.seccion = 'Terraza'
    expect(store.mesasFiltradas.map((m) => m.numero)).toEqual([9])
    expect(store.contadores).toMatchObject({ todas: 5, libre: 3, ocupada: 2 })
    expect(store.grupos).toHaveLength(1)
    expect(store.grupos[0]).toMatchObject({ nombre: 'Terraza', libres: 1, total: 2 })
  })

  it('«Pedido listo» también se combina con la sección', () => {
    const store = useMesasStore()
    store.mesas = varias
    store.filtro = 'listo'
    store.seccion = 'Terraza'
    expect(store.mesasFiltradas).toEqual([])
    store.seccion = 'Salón'
    expect(store.mesasFiltradas.map((m) => m.numero)).toEqual([1])
  })

  it('agrupa con «Sin sección» al final y ofrece las secciones para el select', () => {
    const store = useMesasStore()
    store.mesas = varias
    expect(store.variasSecciones).toBe(true)
    expect(store.secciones.map((s) => s.clave)).toEqual(['Salón', 'Terraza', CLAVE_SIN_SECCION])
    expect(store.grupos.map((g) => g.mesas.map((m) => m.numero))).toEqual([[1, 2], [9, 10], [18]])
  })

  it('con una sola sección no agrupa y el filtro de sección no se aplica', () => {
    const store = useMesasStore()
    store.mesas = [mesa(2, 'Salón'), mesa(1, 'Salón', 'ocupada')]
    store.seccion = 'Terraza'
    expect(store.variasSecciones).toBe(false)
    expect(store.seccionActiva).toBe(TODAS_LAS_SECCIONES)
    expect(store.mesasFiltradas).toHaveLength(2)
  })

  it('sin ninguna sección todo queda como antes', () => {
    const store = useMesasStore()
    store.mesas = [mesa(1, null), mesa(2, null)]
    expect(store.variasSecciones).toBe(false)
    expect(store.grupos.map((g) => g.nombre)).toEqual(['Sin sección'])
  })
})

describe('store del Salón (hostess)', () => {
  it('combina estado y sección, incluido «Sin sección»', () => {
    const store = useSalonStore()
    store.mesas = varias.map(({ idMesa, numero, capacidad, estado, zona }) => ({ idMesa, numero, capacidad, estado, zona }))
    store.filtro = 'libre'
    store.seccion = CLAVE_SIN_SECCION
    expect(store.mesasFiltradas.map((m) => m.numero)).toEqual([18])
    expect(store.contadores).toMatchObject({ todas: 5, libre: 3 })
    store.seccion = 'Jardín' // sección que ya no existe: se ignora
    expect(store.seccionActiva).toBe(TODAS_LAS_SECCIONES)
    expect(store.mesasFiltradas.map((m) => m.numero)).toEqual([9, 2, 18])
  })
})
