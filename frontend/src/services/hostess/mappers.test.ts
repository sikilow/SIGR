import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aListaEspera,
  aMesaSalon,
  aReservacion,
  aResultadoAsignacion,
  deAsignacion,
  type ListaEsperaDto,
  type MesaSalonDto,
  type ReservacionDto,
} from './mappers'

let advertencia: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  advertencia = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const reservacionDto: ReservacionDto = {
  id_reservacion: 2,
  id_cliente: 2,
  id_mesa: 11,
  fecha_hora: '2026-10-16 20:30:00',
  personas: 2,
  estado: 'confirmada',
  llegada_en: null,
  cliente_nombre: 'Patricia Ruiz',
  cliente_telefono: '3115550202',
  mesa_numero: 11,
}

const esperaDto: ListaEsperaDto = {
  id_espera: 1,
  id_cliente: 6,
  personas: 3,
  registrado_en: '2026-10-16 19:05:00',
  estado: 'esperando',
  cliente_nombre: 'Héctor Salas',
  cliente_telefono: null,
}

describe('aMesaSalon', () => {
  it('traduce las columnas de mesa; «libre» (BD) es el mismo código en el frontend', () => {
    const dto: MesaSalonDto = { id_mesa: 1, numero: 1, capacidad: 2, estado: 'libre' }
    expect(aMesaSalon(dto)).toEqual({ idMesa: 1, numero: 1, capacidad: 2, estado: 'libre', zona: null })
  })

  it('la sección (mesa.zona) llega recortada; vacía, solo espacios, null o ausente (respuesta de asignar) = null', () => {
    const base: MesaSalonDto = { id_mesa: 1, numero: 1, capacidad: 2, estado: 'libre' }
    expect(aMesaSalon({ ...base, zona: 'Terraza' }).zona).toBe('Terraza')
    expect(aMesaSalon({ ...base, zona: ' Salón principal ' }).zona).toBe('Salón principal')
    expect(aMesaSalon({ ...base, zona: '' }).zona).toBeNull()
    expect(aMesaSalon({ ...base, zona: '   ' }).zona).toBeNull()
    expect(aMesaSalon({ ...base, zona: null }).zona).toBeNull()
    expect(aMesaSalon(base).zona).toBeNull()
  })

  it('tolera «disponible» (nombre anterior) como libre, sin advertir', () => {
    expect(aMesaSalon({ id_mesa: 1, numero: 1, capacidad: 2, estado: 'Disponible' }).estado).toBe('libre')
    expect(advertencia).not.toHaveBeenCalled()
  })

  it('acepta números como texto (PDO) e ignora los campos de cuenta que envía GET /mesas', () => {
    const dto = {
      id_mesa: '3',
      numero: '3',
      capacidad: '4',
      estado: 'ocupada',
      estado_cuenta: 'abierta',
      total_cuenta: '375.00',
      pedidos_activos: '2',
    } as MesaSalonDto
    const mesa = aMesaSalon(dto)
    expect(mesa).toEqual({ idMesa: 3, numero: 3, capacidad: 4, estado: 'ocupada', zona: null })
    expect(Object.keys(mesa)).toEqual(['idMesa', 'numero', 'capacidad', 'estado', 'zona'])
  })

  it('un estado desconocido da «desconocido» con una sola advertencia', () => {
    const mesa = aMesaSalon({ id_mesa: 1, numero: 1, capacidad: 2, estado: 'mantenimiento' })
    expect(mesa.estado).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(1)
  })

  it('un número inválido es un error de contrato', () => {
    expect(() => aMesaSalon({ id_mesa: 'x', numero: 1, capacidad: 2, estado: 'libre' })).toThrow(/id_mesa/)
  })
})

describe('aReservacion', () => {
  it('traduce columnas, fechas MySQL (hora local) y campos calculados', () => {
    const r = aReservacion(reservacionDto)
    expect(r).toMatchObject({
      idReservacion: 2,
      idCliente: 2,
      idMesa: 11,
      personas: 2,
      estado: 'confirmada',
      llegadaEn: null,
      clienteNombre: 'Patricia Ruiz',
      clienteTelefono: '3115550202',
      mesaNumero: 11,
    })
    expect(r.fechaHora).toEqual(new Date(2026, 9, 16, 20, 30, 0))
  })

  it('acepta números como texto (PDO)', () => {
    const r = aReservacion({
      ...reservacionDto,
      id_reservacion: '2',
      id_cliente: '2',
      id_mesa: '11',
      personas: '6',
      mesa_numero: '11',
    })
    expect(r).toMatchObject({ idReservacion: 2, idCliente: 2, idMesa: 11, personas: 6, mesaNumero: 11 })
  })

  it('una reservación sin mesa y sin llegada trae nulos (no ceros ni cadenas vacías)', () => {
    const r = aReservacion({ ...reservacionDto, id_mesa: null, mesa_numero: null, llegada_en: null })
    expect(r.idMesa).toBeNull()
    expect(r.mesaNumero).toBeNull()
    expect(r.llegadaEn).toBeNull()
  })

  it('llegada_en se convierte a fecha cuando viene', () => {
    const r = aReservacion({ ...reservacionDto, estado: 'llego', llegada_en: '2026-10-16 20:41:30' })
    expect(r.llegadaEn).toEqual(new Date(2026, 9, 16, 20, 41, 30))
  })

  it('el teléfono ausente o vacío es null', () => {
    expect(aReservacion({ ...reservacionDto, cliente_telefono: null }).clienteTelefono).toBeNull()
    expect(aReservacion({ ...reservacionDto, cliente_telefono: '  ' }).clienteTelefono).toBeNull()
  })

  it.each([
    ['Pendiente', 'pendiente'],
    ['CONFIRMADA', 'confirmada'],
    ['Llegó', 'llego'],
    ['llego', 'llego'],
    [' cancelada ', 'cancelada'],
  ])('el estado «%s» se normaliza a «%s» sin advertir', (original, esperado) => {
    expect(aReservacion({ ...reservacionDto, estado: original }).estado).toBe(esperado)
    expect(advertencia).not.toHaveBeenCalled()
  })

  it('un estado desconocido da «desconocido» y UNA sola advertencia', () => {
    const r = aReservacion({ ...reservacionDto, estado: 'en_revision' })
    expect(r.estado).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(1)
    expect(advertencia.mock.calls[0]![0]).toContain('en_revision')
  })

  it('una fecha imposible es un error de contrato', () => {
    expect(() => aReservacion({ ...reservacionDto, fecha_hora: '2026-02-31 10:00:00' })).toThrow(/fecha_hora/)
  })
})

describe('aListaEspera', () => {
  it('traduce columnas y fechas', () => {
    const e = aListaEspera(esperaDto)
    expect(e).toMatchObject({ idEspera: 1, idCliente: 6, personas: 3, estado: 'esperando', clienteNombre: 'Héctor Salas', clienteTelefono: null })
    expect(e.registradoEn).toEqual(new Date(2026, 9, 16, 19, 5, 0))
  })

  it('acepta números como texto (PDO)', () => {
    expect(aListaEspera({ ...esperaDto, id_espera: '1', id_cliente: '6', personas: '3' })).toMatchObject({
      idEspera: 1,
      idCliente: 6,
      personas: 3,
    })
  })

  it.each([
    ['Esperando', 'esperando'],
    ['ASIGNADA', 'asignada'],
  ])('el estado «%s» se normaliza a «%s»', (original, esperado) => {
    expect(aListaEspera({ ...esperaDto, estado: original }).estado).toBe(esperado)
  })

  it('un estado desconocido da «desconocido» y UNA sola advertencia', () => {
    expect(aListaEspera({ ...esperaDto, estado: 'cancelado' }).estado).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(1)
  })
})

describe('aResultadoAsignacion', () => {
  it('trae la mesa y el grupo actualizado; el que no aplica queda en null', () => {
    const r = aResultadoAsignacion({
      mesa: { id_mesa: 11, numero: 11, capacidad: 2, estado: 'ocupada' },
      reservacion: { ...reservacionDto, estado: 'llego', llegada_en: '2026-10-16 20:35:00' },
    })
    expect(r.mesa.estado).toBe('ocupada')
    expect(r.reservacion?.estado).toBe('llego')
    expect(r.espera).toBeNull()
  })

  it('de la lista de espera', () => {
    const r = aResultadoAsignacion({
      mesa: { id_mesa: 4, numero: 4, capacidad: 4, estado: 'ocupada' },
      espera: { ...esperaDto, estado: 'asignada' },
    })
    expect(r.espera?.estado).toBe('asignada')
    expect(r.reservacion).toBeNull()
  })
})

describe('deAsignacion (cuerpo de POST /mesas/{id}/asignar)', () => {
  it('usa los nombres exactos de columna y exactamente una clave', () => {
    expect(deAsignacion({ tipo: 'reservacion', idReservacion: 3 })).toEqual({ id_reservacion: 3 })
    expect(deAsignacion({ tipo: 'espera', idEspera: 1 })).toEqual({ id_espera: 1 })
    expect(deAsignacion({ tipo: 'sinRegistro', personas: 5 })).toEqual({ personas: 5 })
  })
})
