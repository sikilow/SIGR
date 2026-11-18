// Horario de reservaciones (migración 022), igual que `backend/src/models/horarioReservacion.ts`: primera y última hora
// para reservar, cada cuántos minutos se ofrecen horas y qué días se reciben reservaciones. Lo configura Gerencia; lo
// usan la pantalla de Reservas del gerente, el formulario de la hostess y el portal de clientes.

export const INTERVALOS_RESERVACION = [15, 30, 60] as const
export type IntervaloReservacion = (typeof INTERVALOS_RESERVACION)[number]

export interface HorarioReservacion {
  /** HH:MM */
  horaApertura: string
  /** HH:MM */
  horaUltima: string
  intervaloMinutos: IntervaloReservacion
  /** Siete caracteres '1'/'0', de lunes a domingo. */
  diasAbiertos: string
}

export const HORARIO_POR_DEFECTO: HorarioReservacion = {
  horaApertura: '13:00',
  horaUltima: '21:00',
  intervaloMinutos: 30,
  diasAbiertos: '1111111',
}

/** Días de la semana, de lunes a domingo (el orden de `diasAbiertos`). */
export const DIAS_SEMANA = [
  { corto: 'L', nombre: 'Lunes', plural: 'lunes' },
  { corto: 'M', nombre: 'Martes', plural: 'martes' },
  { corto: 'M', nombre: 'Miércoles', plural: 'miércoles' },
  { corto: 'J', nombre: 'Jueves', plural: 'jueves' },
  { corto: 'V', nombre: 'Viernes', plural: 'viernes' },
  { corto: 'S', nombre: 'Sábado', plural: 'sábados' },
  { corto: 'D', nombre: 'Domingo', plural: 'domingos' },
] as const

/** "13:30" → 810 */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number) as [number, number]
  return h * 60 + m
}

function aHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

/** Índice de lunes (0) a domingo (6) de una fecha local AAAA-MM-DD. */
export function indiceDia(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return (new Date(a, m - 1, d).getDay() + 6) % 7
}

export function diaAbierto(horario: HorarioReservacion, dia: string): boolean {
  return horario.diasAbiertos[indiceDia(dia)] === '1'
}

/** Horas que se ofrecen en un día abierto: de la primera a la última, cada `intervaloMinutos`. */
export function horasDelDia(horario: HorarioReservacion): string[] {
  const horas: string[] = []
  for (let m = aMinutos(horario.horaApertura); m <= aMinutos(horario.horaUltima); m += horario.intervaloMinutos) horas.push(aHora(m))
  return horas
}

/**
 * Horas que se pueden elegir para un día concreto: ninguna si ese día está cerrado; si es hoy, solo las que respetan la
 * anticipación mínima (la hora debe ser al menos `ahora + anticipacionMinutos`).
 */
export function horasDisponibles(horario: HorarioReservacion, dia: string, ahora: Date, anticipacionMinutos: number): string[] {
  if (!diaAbierto(horario, dia)) return []
  const limite = ahora.getTime() + anticipacionMinutos * 60_000
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return horasDelDia(horario).filter((hora) => {
    const [hh, mm] = hora.split(':').map(Number) as [number, number]
    return new Date(a, m - 1, d, hh, mm).getTime() >= limite
  })
}

/** «Cerrado los lunes y martes». Vacío si abre todos los días. */
export function textoDiasCerrados(horario: HorarioReservacion): string {
  const cerrados = DIAS_SEMANA.filter((_, i) => horario.diasAbiertos[i] !== '1').map((d) => d.plural)
  if (cerrados.length === 0) return ''
  const lista = cerrados.length === 1 ? cerrados[0] : `${cerrados.slice(0, -1).join(', ')} y ${cerrados.at(-1)}`
  return `Cerrado los ${lista}`
}

/** «De 13:00 a 21:00, cada 30 min · Cerrado los lunes». */
export function textoHorario(horario: HorarioReservacion): string {
  const cerrado = textoDiasCerrados(horario)
  return `De ${horario.horaApertura} a ${horario.horaUltima}, cada ${horario.intervaloMinutos} min${cerrado ? ` · ${cerrado}` : ''}`
}

/**
 * Motivo por el que una reservación queda fuera del horario, o `''` si está dentro. `exigirIntervalo`: el portal solo
 * acepta sus horas (13:00, 13:30…); la hostess puede anotar cualquier minuto dentro del horario.
 */
export function motivoFueraDeHorario(horario: HorarioReservacion, dia: string, hora: string, exigirIntervalo: boolean): string {
  if (!diaAbierto(horario, dia)) return `El restaurante no recibe reservaciones los ${DIAS_SEMANA[indiceDia(dia)]!.plural}. Elige otro día.`
  const minutos = aMinutos(hora)
  if (minutos < aMinutos(horario.horaApertura) || minutos > aMinutos(horario.horaUltima)) {
    return `Las reservaciones son de ${horario.horaApertura} a ${horario.horaUltima}.`
  }
  if (exigirIntervalo && (minutos - aMinutos(horario.horaApertura)) % horario.intervaloMinutos !== 0) {
    return `Elige una hora cada ${horario.intervaloMinutos} minutos desde las ${horario.horaApertura}.`
  }
  return ''
}

/** Errores del formulario de horario de Gerencia (vacío = válido). */
export function validarHorario(horario: HorarioReservacion): string {
  const formato = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!formato.test(horario.horaApertura) || !formato.test(horario.horaUltima)) return 'Escribe las horas en formato HH:MM.'
  if (aMinutos(horario.horaApertura) > aMinutos(horario.horaUltima)) return 'La última hora para reservar no puede ser antes de la primera.'
  if (!(INTERVALOS_RESERVACION as readonly number[]).includes(horario.intervaloMinutos)) return 'El intervalo debe ser de 15, 30 o 60 minutos.'
  if (!/^[01]{7}$/.test(horario.diasAbiertos) || horario.diasAbiertos === '0000000') return 'Marca al menos un día en que se reciben reservaciones.'
  return ''
}

/** Cambia un día (0 = lunes) en la cadena de días abiertos. */
export function alternarDia(diasAbiertos: string, indice: number): string {
  return diasAbiertos
    .split('')
    .map((c, i) => (i === indice ? (c === '1' ? '0' : '1') : c))
    .join('')
}
