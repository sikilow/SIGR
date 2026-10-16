// Reglas de la lista de espera (rol hostess). Funciones puras: las usan la pantalla Espera, el mock y las pruebas.
import type { EstadoEspera, ListaEspera, MesaSalon } from '../types'
import { formatearEspera } from './formato'
import { type OpcionMesa, mesasParaReservacion } from './reservaciones'

/**
 * Minutos de espera a partir de los cuales un grupo se marca como «espera larga». Es una constante para poder
 * cambiarla en un solo lugar (30 minutos por defecto).
 */
export const UMBRAL_ESPERA_LARGA_MIN = 30

/** Filtros de la pantalla (por estado del grupo). */
export type FiltroEspera = 'todas' | 'esperando' | 'asignada' | 'cancelada'

export const FILTROS_ESPERA: readonly FiltroEspera[] = ['esperando', 'todas', 'asignada', 'cancelada']

// ---------- Estados y transiciones ----------

/**
 * Transiciones válidas: `esperando → asignada | cancelada`. `asignada` y `cancelada` son finales; un estado desconocido
 * no cambia (no se sabe qué significa). Nunca se borra la fila.
 */
export function transicionEsperaValida(desde: EstadoEspera, hacia: EstadoEspera): boolean {
  return desde === 'esperando' && (hacia === 'asignada' || hacia === 'cancelada')
}

/** Solo un grupo que sigue esperando se puede sentar. */
export function puedeAsignarEspera(estado: EstadoEspera): boolean {
  return transicionEsperaValida(estado, 'asignada')
}

/** Solo un grupo que sigue esperando se puede quitar de la lista. */
export function puedeQuitarEspera(estado: EstadoEspera): boolean {
  return transicionEsperaValida(estado, 'cancelada')
}

// ---------- Tiempo de espera ----------

/** Minutos completos que lleva esperando el grupo (nunca negativos; una fecha inválida cuenta como 0). */
export function minutosDeEspera(registradoEn: Date, ahora: Date): number {
  const minutos = Math.floor((ahora.getTime() - registradoEn.getTime()) / 60_000)
  return Number.isFinite(minutos) ? Math.max(0, minutos) : 0
}

/** ¿Lleva esperando el umbral o más? (por defecto `UMBRAL_ESPERA_LARGA_MIN`). */
export function esperaLarga(registradoEn: Date, ahora: Date, umbralMin: number = UMBRAL_ESPERA_LARGA_MIN): boolean {
  return minutosDeEspera(registradoEn, ahora) >= umbralMin
}

/** «hace 25 min», «hace 1 h 05 min», «hace menos de 1 min». */
export function textoHaceCuanto(registradoEn: Date, ahora: Date): string {
  const texto = formatearEspera(registradoEn, ahora)
  if (texto === '') return ''
  return texto === 'Menos de 1 min' ? 'hace menos de 1 min' : `hace ${texto}`
}

// ---------- Orden, resumen y filtros ----------

/**
 * Orden de la lista: primero los que siguen esperando (el que lleva más tiempo, arriba) y después los que ya no, también
 * por hora de registro. A igual hora, por número de registro. No modifica el arreglo recibido.
 */
export function ordenarEspera(lista: ListaEspera[]): ListaEspera[] {
  const peso = (e: ListaEspera) => (e.estado === 'esperando' ? 0 : 1)
  return [...lista].sort(
    (a, b) => peso(a) - peso(b) || a.registradoEn.getTime() - b.registradoEn.getTime() || a.idEspera - b.idEspera,
  )
}

export interface ResumenEspera {
  /** Grupos que siguen esperando. */
  grupos: number
  /** Personas en esos grupos. */
  personas: number
  /** Grupos que ya pasaron el umbral de espera larga. */
  largas: number
}

/** Contadores de arriba: solo cuentan a quienes siguen esperando. */
export function resumirEspera(lista: ListaEspera[], ahora: Date, umbralMin: number = UMBRAL_ESPERA_LARGA_MIN): ResumenEspera {
  const esperando = lista.filter((e) => e.estado === 'esperando')
  return {
    grupos: esperando.length,
    personas: esperando.reduce((suma, e) => suma + e.personas, 0),
    largas: esperando.filter((e) => esperaLarga(e.registradoEn, ahora, umbralMin)).length,
  }
}

/** ¿El texto aparece en el nombre, o (si trae al menos 3 dígitos) en el teléfono? Texto vacío = coincide todo. */
export { coincideBusqueda } from './reservaciones'

// ---------- Mesas sugeridas ----------

/**
 * Mesas que se sugieren para sentar a un grupo de `personas`: solo las LIBRES, primero las que alcanzan (de la más
 * justa a la más grande) y al final las que no alcanzan, marcadas para avisar (sin bloquear).
 */
export function mesasSugeridasParaEspera(mesas: MesaSalon[], personas: number): OpcionMesa[] {
  return mesasParaReservacion(mesas, personas, null)
}
