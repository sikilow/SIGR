// Conversión de mesas del gerente entre el JSON de la API y los tipos del frontend.
import { describe, expect, it } from 'vitest'
import { aConfiguracionReservacion, aMesaAdmin, aSeccionAdmin, deCambioMesa, deNuevaMesa } from './mappers'

describe('aConfiguracionReservacion', () => {
  it('convierte los minutos enviados por MySQL', () => {
    expect(aConfiguracionReservacion({ tolerancia_minutos: '15', recordatorio_minutos: 5 }))
      .toEqual({ toleranciaMinutos: 15, recordatorioMinutos: 5 })
  })
})

describe('aMesaAdmin', () => {
  it('convierte números y booleanos que llegan como texto o como 0 y 1', () => {
    expect(aMesaAdmin({ id_mesa: '7', numero: '7', capacidad: '4', zona: 'Terraza', activa: 1, estado: 'libre' })).toEqual({
      idMesa: 7,
      numero: 7,
      capacidad: 4,
      zona: 'Terraza',
      plantaBaja: false,
      espacioCarriola: false,
      sinEscaleras: false,
      activa: true,
      estado: 'libre',
    })
  })

  it('rechaza respuestas sin sección y convierte 0 en no disponible', () => {
    const base = { id_mesa: 1, numero: 1, capacidad: 2, estado: 'ocupada' }
    expect(() => aMesaAdmin({ ...base, zona: null, activa: 0 })).toThrow('mesa sin sección')
    expect(() => aMesaAdmin({ ...base, zona: '  ', activa: true })).toThrow('mesa sin sección')
    expect(aMesaAdmin({ ...base, zona: ' General ', activa: 0 })).toMatchObject({ zona: 'General', activa: false })
  })

  it('convierte las características de acceso de la mesa', () => {
    expect(aMesaAdmin({
      id_mesa: 1, numero: 1, capacidad: 4, zona: 'Salón', activa: true, estado: 'libre',
      planta_baja: 1, espacio_carriola: '0', sin_escaleras: true,
    })).toMatchObject({ plantaBaja: true, espacioCarriola: false, sinEscaleras: true })
  })
})

describe('deNuevaMesa y deCambioMesa', () => {
  it('manda la sección obligatoria recortada al crear', () => {
    expect(deNuevaMesa({ numero: 9, capacidad: 4, zona: '  ', activa: true })).toEqual({
      numero: 9, capacidad: 4, zona: '', planta_baja: false, espacio_carriola: false, sin_escaleras: false, activa: true,
    })
    expect(deNuevaMesa({ numero: 9, capacidad: 4, zona: ' Barra ', activa: false })).toEqual({
      numero: 9, capacidad: 4, zona: 'Barra', planta_baja: false, espacio_carriola: false, sin_escaleras: false, activa: false,
    })
  })

  describe('aSeccionAdmin', () => {
    it('convierte el estado y el total de mesas del catálogo', () => {
      expect(aSeccionAdmin({ nombre: 'Terraza', activa: 0, total_mesas: '4' })).toEqual({
        nombre: 'Terraza',
        activa: false,
        totalMesas: 4,
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
