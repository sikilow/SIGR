// Filtros que se guardan en la URL (?estado=): valores válidos, alias antiguos y valores desconocidos.
import { describe, expect, it } from 'vitest'
import { filtroEsperaDesdeConsulta } from './espera'
import { filtroDesdeConsulta } from './mesas'
import { filtroReservacionesDesdeConsulta } from './reservaciones'
import { filtroSalonDesdeConsulta } from './salon'

describe('filtro de mesas (mesero y hostess): «libre»', () => {
  it.each([
    ['libre', 'libre'],
    ['ocupada', 'ocupada'],
    ['reservada', 'reservada'],
  ])('?estado=%s → %s', (consulta, esperado) => {
    expect(filtroDesdeConsulta(consulta)).toBe(esperado)
    expect(filtroSalonDesdeConsulta(consulta)).toBe(esperado)
  })

  it('«disponible» (nombre anterior en las URL guardadas) se sigue entendiendo como libre', () => {
    expect(filtroDesdeConsulta('disponible')).toBe('libre')
    expect(filtroSalonDesdeConsulta('disponible')).toBe('libre')
  })

  it('valores desconocidos o ausentes dan «todas»', () => {
    for (const valor of ['', 'cualquiera', undefined, null, 3, ['libre']]) {
      expect(filtroDesdeConsulta(valor)).toBe('todas')
      expect(filtroSalonDesdeConsulta(valor)).toBe('todas')
    }
  })

  it('«listo» solo existe para el mesero', () => {
    expect(filtroDesdeConsulta('listo')).toBe('listo')
    expect(filtroSalonDesdeConsulta('listo')).toBe('todas')
  })
})

describe('filtro de reservaciones y de espera', () => {
  it('reservaciones: estados válidos y «todas» por defecto', () => {
    expect(filtroReservacionesDesdeConsulta('pendiente')).toBe('pendiente')
    expect(filtroReservacionesDesdeConsulta('llego')).toBe('llego')
    expect(filtroReservacionesDesdeConsulta('otra')).toBe('todas')
    expect(filtroReservacionesDesdeConsulta(undefined)).toBe('todas')
  })

  it('espera: «esperando» es el filtro por defecto', () => {
    expect(filtroEsperaDesdeConsulta('asignada')).toBe('asignada')
    expect(filtroEsperaDesdeConsulta('cancelada')).toBe('cancelada')
    expect(filtroEsperaDesdeConsulta('todas')).toBe('todas')
    expect(filtroEsperaDesdeConsulta('otra')).toBe('esperando')
    expect(filtroEsperaDesdeConsulta(undefined)).toBe('esperando')
  })
})
