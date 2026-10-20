// Mappers de H2: clientes, cuerpos de alta y de edición de reservaciones, y la conversión de fechas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aFechaMySQL, parseFechaMySQL } from '../api/conversion'
import {
  aCliente,
  aReservacion,
  deCambioReservacion,
  deLlegada,
  deNuevaReservacion,
  deNuevoCliente,
  type ReservacionDto,
} from './mappers'

let advertencia: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  advertencia = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('aFechaMySQL', () => {
  it('da el DATETIME en hora local, con ceros a la izquierda', () => {
    expect(aFechaMySQL(new Date(2026, 0, 5, 9, 7, 3))).toBe('2026-01-05 09:07:03')
    expect(aFechaMySQL(new Date(2026, 9, 16, 20, 30))).toBe('2026-10-16 20:30:00')
  })

  it('es lo contrario de parseFechaMySQL', () => {
    const fecha = new Date(2026, 11, 31, 23, 59, 0)
    expect(parseFechaMySQL(aFechaMySQL(fecha))).toEqual(fecha)
  })
})

describe('aCliente', () => {
  it('traduce las columnas de cliente', () => {
    expect(aCliente({ id_cliente: 1, nombre: 'Carlos Medina', telefono: '3115550201', correo: 'carlos@correo.test' })).toEqual({
      idCliente: 1,
      nombre: 'Carlos Medina',
      telefono: '3115550201',
      correo: 'carlos@correo.test',
    })
  })

  it('acepta el id como texto (PDO) y los nulos o vacíos quedan en null', () => {
    expect(aCliente({ id_cliente: '8', nombre: 'Cliente Prueba', telefono: null, correo: null })).toEqual({
      idCliente: 8,
      nombre: 'Cliente Prueba',
      telefono: null,
      correo: null,
    })
    expect(aCliente({ id_cliente: 9, nombre: 'Ana', telefono: '  ', correo: '' })).toMatchObject({ telefono: null, correo: null })
  })

  it('un id inválido es un error de contrato', () => {
    expect(() => aCliente({ id_cliente: 'x', nombre: 'Ana', telefono: null, correo: null })).toThrow(/id_cliente/)
  })
})

describe('aReservacion (casos de H2)', () => {
  const dto: ReservacionDto = {
    id_reservacion: '7',
    id_cliente: '3',
    id_mesa: null,
    fecha_hora: '2026-10-17 21:15:00',
    personas: '6',
    estado: 'Pendiente',
    llegada_en: null,
    cliente_nombre: 'Familia González',
    cliente_telefono: '3115550203',
    mesa_numero: null,
  }

  it('todo como texto estilo PDO y nulos: números, fecha local, mesa nula', () => {
    const r = aReservacion(dto)
    expect(r).toMatchObject({ idReservacion: 7, idCliente: 3, idMesa: null, personas: 6, estado: 'pendiente', llegadaEn: null, mesaNumero: null })
    expect(r.fechaHora).toEqual(new Date(2026, 9, 17, 21, 15, 0))
  })

  it('un estado que nadie conoce se muestra como desconocido y avisa una sola vez', () => {
    expect(aReservacion({ ...dto, estado: 'reagendada' }).estado).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(1)
  })

  it('el estado «Llegó» con llegada_en trae la fecha de llegada', () => {
    const r = aReservacion({ ...dto, estado: 'Llegó', id_mesa: '4', mesa_numero: '4', llegada_en: '2026-10-17 21:20:10' })
    expect(r).toMatchObject({ estado: 'llego', idMesa: 4, mesaNumero: 4 })
    expect(r.llegadaEn).toEqual(new Date(2026, 9, 17, 21, 20, 10))
  })
})

describe('cuerpos que se envían a la API (nombres exactos de columna)', () => {
  it('POST /clientes: recorta espacios y manda el correo vacío como null', () => {
    expect(deNuevoCliente({ nombre: ' Laura Pérez ', telefono: ' 3115550999 ', correo: '' })).toEqual({
      nombre: 'Laura Pérez',
      telefono: '3115550999',
      correo: null,
    })
    expect(deNuevoCliente({ nombre: 'Laura', telefono: '3115550999', correo: ' laura@correo.com ' }).correo).toBe('laura@correo.com')
  })

  it('POST /reservaciones: id_cliente, fecha_hora, personas e id_mesa', () => {
    expect(deNuevaReservacion({ idCliente: 6, fechaHora: new Date(2026, 9, 16, 20, 30), personas: 4, idMesa: 4 })).toEqual({
      id_cliente: 6,
      fecha_hora: '2026-10-16 20:30:00',
      personas: 4,
      id_mesa: 4,
    })
    expect(deNuevaReservacion({ idCliente: 6, fechaHora: new Date(2026, 9, 16, 20, 30), personas: 4, idMesa: null }).id_mesa).toBeNull()
  })

  it('PATCH /reservaciones/{id}: solo viajan los campos que cambian', () => {
    expect(deCambioReservacion({ estado: 'confirmada' })).toEqual({ estado: 'confirmada' })
    expect(deCambioReservacion({ estado: 'cancelada' })).toEqual({ estado: 'cancelada' })
    expect(deCambioReservacion({ personas: 5 })).toEqual({ personas: 5 })
    expect(deCambioReservacion({ fechaHora: new Date(2026, 9, 17, 9, 0), idMesa: null })).toEqual({
      fecha_hora: '2026-10-17 09:00:00',
      id_mesa: null,
    })
    expect(deCambioReservacion({})).toEqual({})
  })

  it('POST /reservaciones/{id}/llegada: id_mesa solo si se elige una mesa', () => {
    expect(deLlegada(4)).toEqual({ id_mesa: 4 })
    expect(deLlegada(null)).toEqual({})
  })
})
