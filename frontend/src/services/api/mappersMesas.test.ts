// Conversión de mesas del gerente entre el JSON de la API y los tipos del frontend.
import { describe, expect, it } from 'vitest'
import { aConfiguracionReservacion, aMesaAdmin, aSeccionAdmin, deCambioMesa, deNuevaMesa } from './mappers'

describe('aConfiguracionReservacion', () => {
  it('convierte los minutos enviados por MySQL', () => {
    expect(aConfiguracionReservacion({ tolerancia_minutos: '15', recordatorio_minutos: 5, anticipacion_minutos: '60' }))
      .toEqual({ toleranciaMinutos: 15, recordatorioMinutos: 5, anticipacionMinutos: 60, duracionReservacionMinutos: 90, horaApertura: '13:00', horaUltima: '21:00', intervaloMinutos: 30, diasAbiertos: '1111111' })
  })

  it('lee el horario (TIME de MySQL) y descarta valores inválidos', () => {
    expect(
      aConfiguracionReservacion({
        tolerancia_minutos: 15,
        recordatorio_minutos: 5,
        anticipacion_minutos: 60,
        hora_apertura: '12:30:00',
        hora_ultima_reservacion: '22:00',
        intervalo_minutos: '15',
        dias_abiertos: '0111111',
      }),
    ).toMatchObject({ horaApertura: '12:30', horaUltima: '22:00', intervaloMinutos: 15, diasAbiertos: '0111111' })
    expect(
      aConfiguracionReservacion({ tolerancia_minutos: 15, recordatorio_minutos: 5, anticipacion_minutos: 60, intervalo_minutos: 45, dias_abiertos: 'x' }),
    ).toMatchObject({ intervaloMinutos: 30, diasAbiertos: '1111111' })
  })
})

describe('aMesaAdmin', () => {
  it('convierte números y booleanos que llegan como texto o como 0 y 1', () => {
    expect(aMesaAdmin({ id_mesa: '7', numero: '7', capacidad: '4', zona: 'Terraza', activa: 1, estado: 'libre' })).toEqual({
      idMesa: 7,
      numero: 7,
      capacidad: 4,
      zona: 'Terraza',
      caracteristicas: [],
      activa: true,
      estado: 'libre',
      eliminadoEn: null,
    })
  })

  it('rechaza respuestas sin sección y convierte 0 en no disponible', () => {
    const base = { id_mesa: 1, numero: 1, capacidad: 2, estado: 'ocupada' }
    expect(() => aMesaAdmin({ ...base, zona: null, activa: 0 })).toThrow('mesa sin sección')
    expect(() => aMesaAdmin({ ...base, zona: '  ', activa: true })).toThrow('mesa sin sección')
    expect(aMesaAdmin({ ...base, zona: ' General ', activa: 0 })).toMatchObject({ zona: 'General', activa: false })
  })

  it('convierte los ids de las características de la mesa (catálogo de Gerencia)', () => {
    expect(aMesaAdmin({
      id_mesa: 1, numero: 1, capacidad: 4, zona: 'Salón', activa: true, estado: 'libre', caracteristicas: ['1', 3],
    })).toMatchObject({ caracteristicas: [1, 3] })
    expect(aMesaAdmin({ id_mesa: 1, numero: 1, capacidad: 4, zona: 'Salón', activa: true, estado: 'libre' }).caracteristicas).toEqual([])
  })
})

describe('deNuevaMesa y deCambioMesa', () => {
  it('manda la sección obligatoria recortada al crear', () => {
    expect(deNuevaMesa({ numero: 9, capacidad: 4, zona: '  ', activa: true })).toEqual({
      numero: 9, capacidad: 4, zona: '', caracteristicas: [], activa: true,
    })
    expect(deNuevaMesa({ numero: 9, capacidad: 4, zona: ' Barra ', activa: false })).toEqual({
      numero: 9, capacidad: 4, zona: 'Barra', caracteristicas: [], activa: false,
    })
  })

  describe('aSeccionAdmin', () => {
    it('convierte el estado y el total de mesas del catálogo', () => {
      expect(aSeccionAdmin({ nombre: 'Terraza', activa: 0, total_mesas: '4' })).toEqual({
        nombre: 'Terraza',
        activa: false,
        totalMesas: 4,
        eliminadoEn: null,
      })
    })
  })

  it('al editar solo manda los campos que cambiaron', () => {
    expect(deCambioMesa({ activa: false })).toEqual({ activa: false })
    expect(deCambioMesa({ capacidad: 6, zona: ' Terraza ' })).toEqual({ capacidad: 6, zona: 'Terraza' })
  })

  it('la actualización de sección conserva el texto vacío para que el backend la rechace', () => {
    expect(deCambioMesa({ zona: '' })).toEqual({ zona: '' })
  })
})
