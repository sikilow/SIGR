// Cálculos del reporte de reservaciones e inasistencias. Puros: sirven para la pantalla y se prueban solos.
import type { ConteoReservaciones } from '../types'

/** 0 = lunes ... 6 = domingo (igual que `horario_reservacion_dia` y la API). */
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

/** `parte / total` (0 a 1), o `null` si no hay con qué comparar. */
export function tasa(parte: number, total: number): number | null {
  return total > 0 ? parte / total : null
}

/**
 * Inasistencia: de los grupos que ya «se resolvieron» (llegaron o no llegaron), cuántos NO llegaron. Las canceladas no
 * cuentan: avisaron. Las que siguen por llegar tampoco.
 */
export function tasaInasistencia(c: Pick<ConteoReservaciones, 'llegaron' | 'vencidas'>): number | null {
  return tasa(c.vencidas, c.llegaron + c.vencidas)
}

/** Cancelación: de todas las reservaciones, cuántas se cancelaron. */
export function tasaCancelacion(c: Pick<ConteoReservaciones, 'canceladas' | 'total'>): number | null {
  return tasa(c.canceladas, c.total)
}

/** «12.5 %» o «—» si no hay dato. */
export function textoPorcentaje(t: number | null): string {
  return t === null ? '—' : `${(t * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`
}

/** Hora de la reservación como «14:00». */
export const textoHora = (hora: number): string => `${String(hora).padStart(2, '0')}:00`
