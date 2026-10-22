import { describe, expect, it } from 'vitest'
import type { EstadoEspera, ListaEspera, MesaSalon } from '../types'
import {
  esperaLarga,
  mesasSugeridasParaEspera,
  minutosDeEspera,
  ordenarEspera,
  puedeAsignarEspera,
  puedeQuitarEspera,
  resumirEspera,
  textoHaceCuanto,
  transicionEsperaValida,
  UMBRAL_ESPERA_LARGA_MIN,
} from './espera'

// «Ahora» fijo: viernes 16 de octubre de 2026, 20:00:00.
const ahora = new Date(2026, 9, 16, 20, 0, 0)
const haceMin = (min: number, seg = 0) => new Date(ahora.getTime() - (min * 60 + seg) * 1000)

const grupo = (sobrescribir: Partial<ListaEspera> = {}): ListaEspera => ({
  idEspera: 1,
  idCliente: 1,
  personas: 2,
  registradoEn: haceMin(10),
  estado: 'esperando',
  clienteNombre: 'Héctor Salas',
  clienteTelefono: null,
  ...sobrescribir,
})

const mesa = (idMesa: number, capacidad: number, estado: MesaSalon['estado'] = 'libre'): MesaSalon => ({
  idMesa,
  numero: idMesa,
  capacidad,
  estado,
  zona: null,
})

const ESTADOS: EstadoEspera[] = ['esperando', 'asignada', 'cancelada', 'desconocido']

describe('espera: transiciones', () => {
  it('solo se pasa de esperando a asignada o cancelada', () => {
    const validas = ESTADOS.flatMap((d) => ESTADOS.filter((h) => transicionEsperaValida(d, h)).map((h) => `${d}>${h}`))
    expect(validas.sort()).toEqual(['esperando>asignada', 'esperando>cancelada'])
  })

  it('asignada, cancelada y desconocido son finales: no cambian a nada', () => {
    for (const final of ['asignada', 'cancelada', 'desconocido'] as const) {
      for (const hacia of ESTADOS) expect(transicionEsperaValida(final, hacia)).toBe(false)
    }
  })

  it('solo el que sigue esperando se asigna o se quita', () => {
    expect(puedeAsignarEspera('esperando')).toBe(true)
    expect(puedeQuitarEspera('esperando')).toBe(true)
    for (const estado of ['asignada', 'cancelada', 'desconocido'] as const) {
      expect(puedeAsignarEspera(estado)).toBe(false)
      expect(puedeQuitarEspera(estado)).toBe(false)
    }
  })
})

describe('espera: tiempo de espera', () => {
  it('cuenta minutos completos', () => {
    expect(minutosDeEspera(haceMin(0, 59), ahora)).toBe(0)
    expect(minutosDeEspera(haceMin(1), ahora)).toBe(1)
    expect(minutosDeEspera(haceMin(25, 40), ahora)).toBe(25)
    expect(minutosDeEspera(haceMin(125), ahora)).toBe(125)
  })

  it('una fecha futura o inválida cuenta como cero', () => {
    expect(minutosDeEspera(new Date(ahora.getTime() + 5 * 60_000), ahora)).toBe(0)
    expect(minutosDeEspera(new Date('no-es-fecha'), ahora)).toBe(0)
  })

  it('«hace …» con minutos, horas y menos de un minuto', () => {
    expect(textoHaceCuanto(haceMin(0, 20), ahora)).toBe('hace menos de 1 min')
    expect(textoHaceCuanto(haceMin(25), ahora)).toBe('hace 25 min')
    expect(textoHaceCuanto(haceMin(65), ahora)).toBe('hace 1 h 05 min')
    expect(textoHaceCuanto(new Date('no-es-fecha'), ahora)).toBe('')
  })

  it('la espera larga empieza justo en el umbral (30 min por defecto)', () => {
    expect(UMBRAL_ESPERA_LARGA_MIN).toBe(30)
    expect(esperaLarga(haceMin(29, 59), ahora)).toBe(false)
    expect(esperaLarga(haceMin(30), ahora)).toBe(true)
    expect(esperaLarga(haceMin(90), ahora)).toBe(true)
  })

  it('el umbral se puede cambiar', () => {
    expect(esperaLarga(haceMin(10), ahora, 10)).toBe(true)
    expect(esperaLarga(haceMin(10), ahora, 15)).toBe(false)
  })
})

describe('espera: orden y resumen', () => {
  const lista = [
    grupo({ idEspera: 1, registradoEn: haceMin(10), clienteNombre: 'B' }),
    grupo({ idEspera: 2, registradoEn: haceMin(50), clienteNombre: 'A' }),
    grupo({ idEspera: 3, registradoEn: haceMin(120), estado: 'asignada', clienteNombre: 'C' }),
    grupo({ idEspera: 4, registradoEn: haceMin(30), estado: 'cancelada', clienteNombre: 'D' }),
    grupo({ idEspera: 5, registradoEn: haceMin(10), clienteNombre: 'E' }),
  ]

  it('primero los que esperan, el que lleva más tiempo arriba; después los demás por hora', () => {
    expect(ordenarEspera(lista).map((e) => e.idEspera)).toEqual([2, 1, 5, 3, 4])
  })

  it('no modifica el arreglo original', () => {
    const copia = [...lista]
    ordenarEspera(lista)
    expect(lista).toEqual(copia)
  })

  it('el resumen solo cuenta a quienes esperan: grupos, personas y largas', () => {
    const r = resumirEspera(
      [
        grupo({ idEspera: 1, personas: 3, registradoEn: haceMin(10) }),
        grupo({ idEspera: 2, personas: 4, registradoEn: haceMin(45) }),
        grupo({ idEspera: 3, personas: 6, estado: 'asignada', registradoEn: haceMin(90) }),
        grupo({ idEspera: 4, personas: 2, estado: 'cancelada', registradoEn: haceMin(60) }),
      ],
      ahora,
    )
    expect(r).toEqual({ grupos: 2, personas: 7, largas: 1 })
  })

  it('sin nadie esperando todo es cero', () => {
    expect(resumirEspera([], ahora)).toEqual({ grupos: 0, personas: 0, largas: 0 })
  })
})

describe('espera: mesas sugeridas', () => {
  const mesas = [mesa(1, 2), mesa(2, 4), mesa(3, 4, 'ocupada'), mesa(4, 6), mesa(5, 4, 'reservada'), mesa(6, 8), mesa(7, 4)]

  it('solo libres; primero las que alcanzan, de la más justa a la más grande; al final las que no alcanzan', () => {
    const sugeridas = mesasSugeridasParaEspera(mesas, 4)
    expect(sugeridas.map((o) => o.mesa.idMesa)).toEqual([2, 7, 4, 6, 1])
    expect(sugeridas.map((o) => o.alcanza)).toEqual([true, true, true, true, false])
  })

  it('para 1 persona la más justa es la de 2', () => {
    expect(mesasSugeridasParaEspera(mesas, 1)[0]!.mesa.idMesa).toBe(1)
  })

  it('si el grupo es más grande que cualquier mesa, ninguna alcanza (se avisa, no se bloquea)', () => {
    const sugeridas = mesasSugeridasParaEspera(mesas, 12)
    expect(sugeridas.length).toBe(5)
    expect(sugeridas.every((o) => !o.alcanza)).toBe(true)
  })

  it('sin mesas libres no sugiere ninguna', () => {
    expect(mesasSugeridasParaEspera([mesa(3, 4, 'ocupada'), mesa(5, 4, 'reservada')], 2)).toEqual([])
  })
})
