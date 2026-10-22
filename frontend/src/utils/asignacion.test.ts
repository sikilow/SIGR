import { describe, expect, it } from 'vitest'
import type { ListaEspera, MesaSalon, Reservacion } from '../types'
import {
  advertenciasAsignacion,
  esperaAsignable,
  gruposParaMesa,
  mesaAsignable,
  motivoMesaNoAsignable,
  reservacionAsignable,
  validarPersonas,
} from './asignacion'

const mesa = (sobrescribir: Partial<MesaSalon> = {}): MesaSalon => ({
  idMesa: 4,
  numero: 4,
  capacidad: 4,
  estado: 'libre',
  zona: null,
  ...sobrescribir,
})

const reservacion = (sobrescribir: Partial<Reservacion> = {}): Reservacion => ({
  idReservacion: 1,
  idCliente: 1,
  idMesa: null,
  fechaHora: new Date(2026, 9, 16, 20, 30),
  personas: 4,
  estado: 'confirmada',
  llegadaEn: null,
  clienteNombre: 'Carlos Medina',
  clienteTelefono: null,
  mesaNumero: null,
  ...sobrescribir,
})

const espera = (sobrescribir: Partial<ListaEspera> = {}): ListaEspera => ({
  idEspera: 1,
  idCliente: 6,
  personas: 3,
  registradoEn: new Date(2026, 9, 16, 19, 0),
  estado: 'esperando',
  clienteNombre: 'Héctor Salas',
  clienteTelefono: null,
  ...sobrescribir,
})

describe('asignar: qué mesas son válidas', () => {
  it.each([
    ['libre', true],
    ['reservada', true],
    ['ocupada', false],
    ['desconocido', false],
  ] as const)('una mesa %s → asignable: %s', (estado, esperado) => {
    expect(mesaAsignable(mesa({ estado }))).toBe(esperado)
  })

  it('las mesas ocupadas y desconocidas explican el motivo; las demás no', () => {
    expect(motivoMesaNoAsignable(mesa({ estado: 'ocupada', numero: 3 }))).toContain('mesa 3 está ocupada')
    expect(motivoMesaNoAsignable(mesa({ estado: 'desconocido' }))).toContain('No se reconoce')
    expect(motivoMesaNoAsignable(mesa({ estado: 'libre' }))).toBeNull()
    expect(motivoMesaNoAsignable(mesa({ estado: 'reservada' }))).toBeNull()
  })
})

describe('asignar: qué grupos son válidos', () => {
  it.each([
    ['pendiente', true],
    ['confirmada', true],
    ['llego', false],
    ['cancelada', false],
    ['desconocido', false],
  ] as const)('reservación %s sin mesa → asignable: %s', (estado, esperado) => {
    expect(reservacionAsignable(reservacion({ estado }), mesa())).toBe(esperado)
  })

  it('una reservación con OTRA mesa no se puede sentar aquí; con ESTA mesa, sí', () => {
    expect(reservacionAsignable(reservacion({ idMesa: 9 }), mesa({ idMesa: 4 }))).toBe(false)
    expect(reservacionAsignable(reservacion({ idMesa: 4 }), mesa({ idMesa: 4 }))).toBe(true)
  })

  it('solo los grupos que siguen esperando se pueden sentar', () => {
    expect(esperaAsignable(espera({ estado: 'esperando' }))).toBe(true)
    expect(esperaAsignable(espera({ estado: 'asignada' }))).toBe(false)
    expect(esperaAsignable(espera({ estado: 'desconocido' }))).toBe(false)
  })

  it('gruposParaMesa filtra, ordena y pone primero las reservaciones de la propia mesa', () => {
    const tarde = reservacion({ idReservacion: 1, fechaHora: new Date(2026, 9, 16, 22, 0) })
    const temprano = reservacion({ idReservacion: 2, fechaHora: new Date(2026, 9, 16, 19, 0) })
    const propia = reservacion({ idReservacion: 3, idMesa: 7, fechaHora: new Date(2026, 9, 16, 23, 0) })
    const deOtraMesa = reservacion({ idReservacion: 4, idMesa: 10 })
    const llego = reservacion({ idReservacion: 5, estado: 'llego' })
    const nuevo = espera({ idEspera: 1, registradoEn: new Date(2026, 9, 16, 19, 30) })
    const viejo = espera({ idEspera: 2, registradoEn: new Date(2026, 9, 16, 18, 0) })
    const asignada = espera({ idEspera: 3, estado: 'asignada' })

    const grupos = gruposParaMesa(
      mesa({ idMesa: 7, estado: 'reservada' }),
      [tarde, temprano, propia, deOtraMesa, llego],
      [nuevo, viejo, asignada],
    )
    expect(grupos.reservaciones.map((r) => r.idReservacion)).toEqual([3, 2, 1])
    expect(grupos.espera.map((e) => e.idEspera)).toEqual([2, 1])
  })

  it('una mesa ocupada no ofrece ningún grupo', () => {
    expect(gruposParaMesa(mesa({ estado: 'ocupada' }), [reservacion()], [espera()])).toEqual({
      reservaciones: [],
      espera: [],
    })
  })
})

describe('asignar: personas de un grupo sin registro', () => {
  it.each([[1], [4], ['12'], [99]])('%s es válido', (valor) => {
    expect(validarPersonas(valor)).toBe('')
  })

  it.each([[''], ['  '], ['0'], ['-2'], ['2.5'], ['abc'], [100]])('«%s» no es válido', (valor) => {
    expect(validarPersonas(valor)).not.toBe('')
  })
})

describe('asignar: avisos (nunca bloquean)', () => {
  it('avisa si las personas pasan de la capacidad, y no si caben justas', () => {
    const grupo = { tipo: 'sinRegistro', personas: 5 } as const
    expect(advertenciasAsignacion(mesa({ capacidad: 4 }), grupo, 5, []).map((a) => a.tipo)).toEqual(['capacidad'])
    expect(advertenciasAsignacion(mesa({ capacidad: 4 }), grupo, 4, [])).toEqual([])
  })

  it('una mesa reservada avisa si el grupo no es el de su reservación', () => {
    const propia = reservacion({ idReservacion: 1, idMesa: 7, clienteNombre: 'Carlos Medina' })
    const m = mesa({ idMesa: 7, numero: 7, estado: 'reservada', capacidad: 4 })

    const otro = advertenciasAsignacion(m, { tipo: 'espera', idEspera: 1 }, 2, [propia])
    expect(otro.map((a) => a.tipo)).toEqual(['mesa_reservada'])
    expect(otro[0]!.texto).toContain('Carlos Medina')

    const suyo = advertenciasAsignacion(m, { tipo: 'reservacion', idReservacion: 1 }, 4, [propia])
    expect(suyo).toEqual([])
  })

  it('puede dar los dos avisos a la vez', () => {
    const propia = reservacion({ idMesa: 7 })
    const avisos = advertenciasAsignacion(
      mesa({ idMesa: 7, estado: 'reservada', capacidad: 2 }),
      { tipo: 'sinRegistro', personas: 6 },
      6,
      [propia],
    )
    expect(avisos.map((a) => a.tipo)).toEqual(['capacidad', 'mesa_reservada'])
  })
})
