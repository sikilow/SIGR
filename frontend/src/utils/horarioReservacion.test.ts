import { describe, expect, it } from 'vitest'
import {
  alternarDia,
  diaAbierto,
  HORARIO_POR_DEFECTO,
  type HorarioReservacion,
  horasDelDia,
  horasDisponibles,
  motivoFueraDeHorario,
  textoHorario,
  validarHorario,
} from './horarioReservacion'

// Cerrado los lunes; de 13:00 a 21:30 cada 30 minutos.
const horario: HorarioReservacion = { horaApertura: '13:00', horaUltima: '21:30', intervaloMinutos: 30, diasAbiertos: '0111111' }

describe('horario de reservaciones', () => {
  it('arma las horas del día', () => {
    expect(horasDelDia(HORARIO_POR_DEFECTO)).toHaveLength(17)
    expect(horasDelDia({ ...horario, intervaloMinutos: 60 })).toEqual(['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'])
    expect(horasDelDia({ ...horario, intervaloMinutos: 15 }).slice(0, 3)).toEqual(['13:00', '13:15', '13:30'])
  })

  it('días cerrados (2026-11-16 es lunes)', () => {
    expect(diaAbierto(horario, '2026-11-16')).toBe(false)
    expect(diaAbierto(horario, '2026-11-17')).toBe(true)
  })

  it('horas disponibles: ninguna en día cerrado; hoy, solo las que cumplen la anticipación', () => {
    const ahora = new Date(2026, 10, 17, 15, 10)
    expect(horasDisponibles(horario, '2026-11-16', ahora, 60)).toEqual([])
    expect(horasDisponibles(horario, '2026-11-17', ahora, 60)[0]).toBe('16:30')
    expect(horasDisponibles(horario, '2026-11-18', ahora, 60)).toHaveLength(18)
    // Ya pasó la última hora.
    expect(horasDisponibles(horario, '2026-11-17', new Date(2026, 10, 17, 21, 0), 60)).toEqual([])
  })

  it('motivos fuera de horario; la hostess no necesita el intervalo', () => {
    expect(motivoFueraDeHorario(horario, '2026-11-16', '14:00', true)).toMatch(/lunes/)
    expect(motivoFueraDeHorario(horario, '2026-11-17', '12:00', false)).toMatch(/de 13:00 a 21:30/)
    expect(motivoFueraDeHorario(horario, '2026-11-17', '19:45', true)).toMatch(/cada 30 minutos/)
    expect(motivoFueraDeHorario(horario, '2026-11-17', '19:45', false)).toBe('')
  })

  it('texto y validación del formulario del gerente', () => {
    expect(textoHorario(horario)).toBe('De 13:00 a 21:30, cada 30 min · Cerrado los lunes')
    expect(textoHorario(HORARIO_POR_DEFECTO)).toBe('De 13:00 a 21:00, cada 30 min')
    expect(validarHorario(horario)).toBe('')
    expect(validarHorario({ ...horario, horaApertura: '22:00' })).toMatch(/antes de la primera/)
    expect(validarHorario({ ...horario, diasAbiertos: '0000000' })).toMatch(/al menos un día/)
    expect(alternarDia('0111111', 0)).toBe('1111111')
    expect(alternarDia('1111111', 6)).toBe('1111110')
  })
})
