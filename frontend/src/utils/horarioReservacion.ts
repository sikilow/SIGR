// Horario de reservaciones (migraciones 022 y 030), igual que `backend/src/models/horarioReservacion.ts`: cada día de la
// semana tiene su propio horario (abierto o cerrado, primera y última hora para reservar) y hay un solo intervalo para
// todo el restaurante (cada cuántos minutos se ofrecen horas). Lo configura Gerencia; lo usan la pantalla de
// Reservaciones del gerente, el formulario de la hostess y el portal de clientes.

export const INTERVALOS_RESERVACION = [15, 30, 60] as const
export type IntervaloReservacion = (typeof INTERVALOS_RESERVACION)[number]

export interface HorarioDia {
  /** ¿Ese día se reciben reservaciones? Las horas se conservan aunque esté cerrado. */
  abierto: boolean
  /** HH:MM */
  horaApertura: string
  /** HH:MM */
  horaUltima: string
}

export interface HorarioReservacion {
  intervaloMinutos: IntervaloReservacion
  /** Siete días, de lunes (0) a domingo (6). */
  dias: HorarioDia[]
}

const DIA_POR_DEFECTO: HorarioDia = { abierto: true, horaApertura: '13:00', horaUltima: '21:00' }

/** Horario predeterminado: 13:00 a 21:00, cada 30 minutos, todos los días. Cada llamada devuelve una copia nueva. */
export function horarioPorDefecto(): HorarioReservacion {
  return { intervaloMinutos: 30, dias: Array.from({ length: 7 }, () => ({ ...DIA_POR_DEFECTO })) }
}

/** Copia profunda: cambiar la copia no toca el original. */
export function copiarHorario(h: HorarioReservacion): HorarioReservacion {
  return { intervaloMinutos: h.intervaloMinutos, dias: h.dias.map((d) => ({ ...d })) }
}

/** Igual que `horarioPorDefecto()`, para quien solo lee (no lo modifiques: usa `horarioPorDefecto()` o `copiarHorario`). */
export const HORARIO_POR_DEFECTO: Readonly<HorarioReservacion> = horarioPorDefecto()

/** Días de la semana, de lunes a domingo (el orden de `HorarioReservacion.dias`). */
export const DIAS_SEMANA = [
  { corto: 'L', abreviado: 'Lun', nombre: 'Lunes', plural: 'lunes' },
  { corto: 'M', abreviado: 'Mar', nombre: 'Martes', plural: 'martes' },
  { corto: 'M', abreviado: 'Mié', nombre: 'Miércoles', plural: 'miércoles' },
  { corto: 'J', abreviado: 'Jue', nombre: 'Jueves', plural: 'jueves' },
  { corto: 'V', abreviado: 'Vie', nombre: 'Viernes', plural: 'viernes' },
  { corto: 'S', abreviado: 'Sáb', nombre: 'Sábado', plural: 'sábados' },
  { corto: 'D', abreviado: 'Dom', nombre: 'Domingo', plural: 'domingos' },
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

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/

/** Horario de la fecha AAAA-MM-DD (sin fecha válida, el del lunes). */
export function horarioDelDia(horario: HorarioReservacion, dia: string): HorarioDia {
  return horario.dias[FECHA_VALIDA.test(dia) ? indiceDia(dia) : 0] ?? DIA_POR_DEFECTO
}

export function diaAbierto(horario: HorarioReservacion, dia: string): boolean {
  return FECHA_VALIDA.test(dia) && (horario.dias[indiceDia(dia)]?.abierto ?? false)
}

/** Horas de un día con ese horario: de la primera a la última, cada `intervaloMinutos` (vacío si está cerrado). */
export function horasDeUnDia(d: HorarioDia, intervaloMinutos: number): string[] {
  const horas: string[] = []
  if (!d.abierto) return horas
  for (let m = aMinutos(d.horaApertura); m <= aMinutos(d.horaUltima); m += intervaloMinutos) horas.push(aHora(m))
  return horas
}

/** Horas que se ofrecen en la fecha AAAA-MM-DD (ninguna si ese día está cerrado o no hay fecha). */
export function horasDelDia(horario: HorarioReservacion, dia: string): string[] {
  return FECHA_VALIDA.test(dia) ? horasDeUnDia(horarioDelDia(horario, dia), horario.intervaloMinutos) : []
}

/**
 * Horas que se pueden elegir para un día concreto: ninguna si ese día está cerrado; si es hoy, solo las que respetan la
 * anticipación mínima (la hora debe ser al menos `ahora + anticipacionMinutos`).
 */
export function horasDisponibles(horario: HorarioReservacion, dia: string, ahora: Date, anticipacionMinutos: number): string[] {
  if (!diaAbierto(horario, dia)) return []
  const limite = ahora.getTime() + anticipacionMinutos * 60_000
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return horasDelDia(horario, dia).filter((hora) => {
    const [hh, mm] = hora.split(':').map(Number) as [number, number]
    return new Date(a, m - 1, d, hh, mm).getTime() >= limite
  })
}

/** «Cerrado los lunes y martes». Vacío si abre todos los días. */
export function textoDiasCerrados(horario: HorarioReservacion): string {
  const cerrados = DIAS_SEMANA.filter((_, i) => !horario.dias[i]?.abierto).map((d) => d.plural)
  if (cerrados.length === 0) return ''
  const lista = cerrados.length === 1 ? cerrados[0] : `${cerrados.slice(0, -1).join(', ')} y ${cerrados.at(-1)}`
  return `Cerrado los ${lista}`
}

/**
 * Resumen del horario. Si todos los días abren igual: «De 13:00 a 21:00, cada 30 min». Si no, agrupa los días
 * seguidos con el mismo horario: «Lun a Jue de 13:00 a 21:30 · Vie y Sáb de 11:00 a 23:00 · Cerrado los domingos».
 */
export function textoHorario(horario: HorarioReservacion): string {
  const clave = (d: HorarioDia) => (d.abierto ? `${d.horaApertura}-${d.horaUltima}` : '')
  const abiertos = horario.dias.filter((d) => d.abierto)
  const cerrado = textoDiasCerrados(horario)
  const cada = `cada ${horario.intervaloMinutos} min`
  if (abiertos.length > 0 && new Set(abiertos.map(clave)).size === 1) {
    const d = abiertos[0]!
    return `De ${d.horaApertura} a ${d.horaUltima}, ${cada}${cerrado ? ` · ${cerrado}` : ''}`
  }
  const grupos: string[] = []
  let i = 0
  while (i < 7) {
    const d = horario.dias[i]
    if (!d || !d.abierto) {
      i++
      continue
    }
    let j = i
    while (j + 1 < 7 && horario.dias[j + 1]?.abierto && clave(horario.dias[j + 1]!) === clave(d)) j++
    const nombre =
      j === i ? DIAS_SEMANA[i]!.abreviado : j === i + 1 ? `${DIAS_SEMANA[i]!.abreviado} y ${DIAS_SEMANA[j]!.abreviado}` : `${DIAS_SEMANA[i]!.abreviado} a ${DIAS_SEMANA[j]!.abreviado}`
    grupos.push(`${nombre} de ${d.horaApertura} a ${d.horaUltima}`)
    i = j + 1
  }
  return `${grupos.join(' · ')}, ${cada}${cerrado ? ` · ${cerrado}` : ''}`
}

/**
 * Motivo por el que una reservación queda fuera del horario de ese día, o `''` si está dentro. `exigirIntervalo`: el
 * portal solo acepta sus horas (contadas desde la primera hora de ese día); la hostess puede anotar cualquier minuto
 * dentro del horario.
 */
export function motivoFueraDeHorario(horario: HorarioReservacion, dia: string, hora: string, exigirIntervalo: boolean): string {
  const indice = indiceDia(dia)
  const d = horario.dias[indice]
  if (!d || !d.abierto) return `El restaurante no recibe reservaciones los ${DIAS_SEMANA[indice]!.plural}. Elige otro día.`
  const minutos = aMinutos(hora)
  if (minutos < aMinutos(d.horaApertura) || minutos > aMinutos(d.horaUltima)) {
    return `Los ${DIAS_SEMANA[indice]!.plural} las reservaciones son de ${d.horaApertura} a ${d.horaUltima}.`
  }
  if (exigirIntervalo && (minutos - aMinutos(d.horaApertura)) % horario.intervaloMinutos !== 0) {
    return `Elige una hora cada ${horario.intervaloMinutos} minutos desde las ${d.horaApertura}.`
  }
  return ''
}

/** Errores del formulario de horario de Gerencia (vacío = válido). */
export function validarHorario(horario: HorarioReservacion): string {
  const formato = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!(INTERVALOS_RESERVACION as readonly number[]).includes(horario.intervaloMinutos)) return 'El intervalo debe ser de 15, 30 o 60 minutos.'
  if (horario.dias.length !== 7) return 'El horario debe tener los siete días de la semana.'
  for (const [i, d] of horario.dias.entries()) {
    const nombre = DIAS_SEMANA[i]!.nombre
    if (!formato.test(d.horaApertura) || !formato.test(d.horaUltima)) return `${nombre}: escribe las horas en formato HH:MM.`
    if (aMinutos(d.horaApertura) > aMinutos(d.horaUltima)) return `${nombre}: la última hora para reservar no puede ser antes de la primera.`
  }
  if (!horario.dias.some((d) => d.abierto)) return 'Marca al menos un día en que se reciben reservaciones.'
  return ''
}
