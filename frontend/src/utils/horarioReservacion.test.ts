import { describe, expect, it } from 'vitest'
import {
  copiarHorario,
  diaAbierto,
  horarioDelDia,
  horarioPorDefecto,
  type HorarioReservacion,
  horasDelDia,
  horasDeUnDia,
  horasDisponibles,
  motivoFueraDeHorario,
  textoHorario,
  validarHorario,
} from './horarioReservacion'

/**
 * Lunes cerrado; martes a jueves de 13:00 a 21:30; viernes y sábado abren temprano (11:00) y cierran tarde (23:00);
 * domingo de 09:00 a 16:00. Horas cada 30 minutos. (2026-11-16 es lunes.)
 */
function horario(): HorarioReservacion {
  const h = horarioPorDefecto()
  h.dias[0] = { abierto: false, horaApertura: '13:00', horaUltima: '21:00' }
  for (const i of [1, 2, 3]) h.dias[i] = { abierto: true, horaApertura: '13:00', horaUltima: '21:30' }
  for (const i of [4, 5]) h.dias[i] = { abierto: true, horaApertura: '11:00', horaUltima: '23:00' }
  h.dias[6] = { abierto: true, horaApertura: '09:00', horaUltima: '16:00' }
  return h
}

describe('horario de reservaciones por día', () => {
  it('arma las horas de cada día con su propia apertura y cierre', () => {
    expect(horasDelDia(horarioPorDefecto(), '2026-11-17')).toHaveLength(17)
    expect(horasDelDia(horario(), '2026-11-17').at(-1)).toBe('21:30') // martes
    expect(horasDelDia(horario(), '2026-11-20')[0]).toBe('11:00') // viernes abre antes
    expect(horasDelDia(horario(), '2026-11-20').at(-1)).toBe('23:00') // y cierra después
    expect(horasDelDia(horario(), '2026-11-22')).toHaveLength(15) // domingo 09:00 a 16:00
    expect(horasDelDia(horario(), '2026-11-16')).toEqual([]) // lunes cerrado
    expect(horasDelDia(horario(), '')).toEqual([])
    expect(horasDelDia({ ...horario(), intervaloMinutos: 60 }, '2026-11-17')).toEqual(['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'])
    expect(horasDelDia({ ...horario(), intervaloMinutos: 15 }, '2026-11-17').slice(0, 3)).toEqual(['13:00', '13:15', '13:30'])
    expect(horasDeUnDia({ abierto: false, horaApertura: '10:00', horaUltima: '12:00' }, 30)).toEqual([])
  })

  it('días cerrados (2026-11-16 es lunes)', () => {
    expect(diaAbierto(horario(), '2026-11-16')).toBe(false)
    expect(diaAbierto(horario(), '2026-11-17')).toBe(true)
    expect(horarioDelDia(horario(), '2026-11-20')).toMatchObject({ horaApertura: '11:00', horaUltima: '23:00' })
  })

  it('horas disponibles: ninguna en día cerrado; hoy, solo las que cumplen la anticipación', () => {
    const ahora = new Date(2026, 10, 17, 15, 10)
    expect(horasDisponibles(horario(), '2026-11-16', ahora, 60)).toEqual([])
    expect(horasDisponibles(horario(), '2026-11-17', ahora, 60)[0]).toBe('16:30')
    expect(horasDisponibles(horario(), '2026-11-18', ahora, 60)).toHaveLength(18)
    // Ya pasó la última hora de ese día.
    expect(horasDisponibles(horario(), '2026-11-17', new Date(2026, 10, 17, 21, 0), 60)).toEqual([])
    // El viernes todavía hay horas a las 21:00 porque cierra a las 23:00.
    expect(horasDisponibles(horario(), '2026-11-20', new Date(2026, 10, 20, 19, 30), 60).at(-1)).toBe('23:00')
  })

  it('motivos fuera de horario según el día; la hostess no necesita el intervalo', () => {
    expect(motivoFueraDeHorario(horario(), '2026-11-16', '14:00', true)).toMatch(/lunes/)
    expect(motivoFueraDeHorario(horario(), '2026-11-17', '12:00', false)).toMatch(/martes.*de 13:00 a 21:30/)
    expect(motivoFueraDeHorario(horario(), '2026-11-17', '23:00', false)).toMatch(/de 13:00 a 21:30/)
    expect(motivoFueraDeHorario(horario(), '2026-11-20', '23:00', true)).toBe('') // viernes sí
    expect(motivoFueraDeHorario(horario(), '2026-11-22', '17:00', false)).toMatch(/domingos.*de 09:00 a 16:00/)
    expect(motivoFueraDeHorario(horario(), '2026-11-17', '19:45', true)).toMatch(/cada 30 minutos/)
    expect(motivoFueraDeHorario(horario(), '2026-11-17', '19:45', false)).toBe('')
  })

  it('el intervalo se cuenta desde la primera hora de ese día', () => {
    const h = horario()
    h.dias[1] = { abierto: true, horaApertura: '13:15', horaUltima: '21:00' }
    expect(motivoFueraDeHorario(h, '2026-11-17', '13:45', true)).toBe('')
    expect(motivoFueraDeHorario(h, '2026-11-17', '14:00', true)).toMatch(/desde las 13:15/)
    expect(horasDelDia(h, '2026-11-17').slice(0, 2)).toEqual(['13:15', '13:45'])
  })

  it('resumen del horario: todos igual o agrupado por días seguidos', () => {
    expect(textoHorario(horarioPorDefecto())).toBe('De 13:00 a 21:00, cada 30 min')
    const cerradoLunes = horarioPorDefecto()
    cerradoLunes.dias[0]!.abierto = false
    expect(textoHorario(cerradoLunes)).toBe('De 13:00 a 21:00, cada 30 min · Cerrado los lunes')
    expect(textoHorario(horario())).toBe('Mar a Jue de 13:00 a 21:30 · Vie y Sáb de 11:00 a 23:00 · Dom de 09:00 a 16:00, cada 30 min · Cerrado los lunes')
  })

  it('validación del formulario del gerente', () => {
    expect(validarHorario(horario())).toBe('')
    const tarde = horario()
    tarde.dias[2]!.horaApertura = '22:00'
    expect(validarHorario(tarde)).toMatch(/Miércoles: la última hora.*antes de la primera/)
    const formato = horario()
    formato.dias[1]!.horaUltima = '25:00'
    expect(validarHorario(formato)).toMatch(/Martes: escribe las horas/)
    const cerrado = horarioPorDefecto()
    for (const d of cerrado.dias) d.abierto = false
    expect(validarHorario(cerrado)).toMatch(/al menos un día/)
    expect(validarHorario({ ...horario(), intervaloMinutos: 45 as never })).toMatch(/15, 30 o 60/)
    expect(validarHorario({ ...horario(), dias: horario().dias.slice(0, 6) })).toMatch(/siete días/)
  })

  it('copiarHorario no comparte los días con el original', () => {
    const original = horario()
    const copia = copiarHorario(original)
    copia.dias[1]!.horaUltima = '10:00'
    expect(original.dias[1]!.horaUltima).toBe('21:30')
  })
})
