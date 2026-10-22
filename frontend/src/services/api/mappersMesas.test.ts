// Conversión de mesas del gerente entre el JSON de la API y los tipos del frontend.
import { describe, expect, it } from 'vitest'
import { aMesaAdmin, deCambioMesa, deNuevaMesa } from './mappers'

describe('aMesaAdmin', () => {
  it('convierte números y booleanos que llegan como texto o como 0 y 1', () => {
    expect(aMesaAdmin({ id_mesa: '7', numero: '7', capacidad: '4', zona: 'Terraza', activa: 1, estado: 'libre' })).toEqual({
      idMesa: 7,
      numero: 7,
      capacidad: 4,
      zona: 'Terraza',
      activa: true,
      estado: 'libre',
    })
  })

  it('una sección vacía o nula queda como null y 0 es no disponible', () => {
    const base = { id_mesa: 1, numero: 1, capacidad: 2, estado: 'ocupada' }
    expect(aMesaAdmin({ ...base, zona: null, activa: 0 })).toMatchObject({ zona: null, activa: false })
    expect(aMesaAdmin({ ...base, zona: '  ', activa: true })).toMatchObject({ zona: null, activa: true })
  })
})

describe('deNuevaMesa y deCambioMesa', () => {
  it('al crear no manda la sección si está vacía', () => {
    expect(deNuevaMesa({ numero: 9, capacidad: 4, zona: '  ', activa: true })).toEqual({ numero: 9, capacidad: 4, activa: true })
    expect(deNuevaMesa({ numero: 9, capacidad: 4, zona: ' Barra ', activa: false })).toEqual({ numero: 9, capacidad: 4, zona: 'Barra', activa: false })
  })

  it('al editar solo manda los campos que cambiaron', () => {
    expect(deCambioMesa({ activa: false })).toEqual({ activa: false })
    expect(deCambioMesa({ capacidad: 6, zona: ' Terraza ' })).toEqual({ capacidad: 6, zona: 'Terraza' })
  })

  it('quitar la sección viaja como texto vacío para que el backend la guarde como NULL', () => {
    expect(deCambioMesa({ zona: '' })).toEqual({ zona: '' })
  })
})
