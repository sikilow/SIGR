// Reglas de «Asignar mesa» (rol hostess). Funciones puras: las usan la pantalla Salón, el mock y las pruebas.
import type { GrupoAsignacion, ListaEspera, MesaSalon, Reservacion } from '../types'
import { formatearHora } from './formato'

/** Estados de reservación que todavía pueden sentarse (el resto: ya llegó, se canceló o es desconocido). */
const RESERVACION_ASIGNABLE: readonly string[] = ['pendiente', 'confirmada']

/** Máximo de personas que se acepta al registrar un grupo sin reservación (evita un tecleo accidental). */
export const MAX_PERSONAS_SIN_REGISTRO = 99

/** Solo una mesa libre o reservada se puede asignar. */
export function mesaAsignable(mesa: MesaSalon): boolean {
  return mesa.estado === 'libre' || mesa.estado === 'reservada'
}

/** Por qué no se puede asignar la mesa (para mostrarlo y para aria-describedby); `null` si sí se puede. */
export function motivoMesaNoAsignable(mesa: MesaSalon): string | null {
  if (mesa.estado === 'ocupada') return `La mesa ${mesa.numero} está ocupada: ya tiene clientes sentados.`
  if (mesa.estado === 'desconocido') return `No se reconoce el estado de la mesa ${mesa.numero}. Actualiza el salón.`
  return null
}

/** ¿Esta reservación se puede sentar en ESTA mesa? Pendiente/confirmada y sin mesa, o con esta misma mesa. */
export function reservacionAsignable(reservacion: Reservacion, mesa: MesaSalon): boolean {
  return (
    RESERVACION_ASIGNABLE.includes(reservacion.estado) &&
    (reservacion.idMesa === null || reservacion.idMesa === mesa.idMesa)
  )
}

/** Solo los grupos que siguen esperando se pueden sentar. */
export function esperaAsignable(espera: ListaEspera): boolean {
  return espera.estado === 'esperando'
}

export interface GruposAsignables {
  reservaciones: Reservacion[]
  espera: ListaEspera[]
}

/**
 * Grupos que se pueden elegir para una mesa. Las reservaciones van por hora (las de esta mesa, primero);
 * la lista de espera, por orden de llegada. Una mesa no asignable no ofrece ningún grupo.
 */
export function gruposParaMesa(mesa: MesaSalon, reservaciones: Reservacion[], espera: ListaEspera[]): GruposAsignables {
  if (!mesaAsignable(mesa)) return { reservaciones: [], espera: [] }
  const propia = (r: Reservacion) => (r.idMesa === mesa.idMesa ? 0 : 1)
  return {
    reservaciones: reservaciones
      .filter((r) => reservacionAsignable(r, mesa))
      .sort((a, b) => propia(a) - propia(b) || a.fechaHora.getTime() - b.fechaHora.getTime()),
    espera: espera.filter(esperaAsignable).sort((a, b) => a.registradoEn.getTime() - b.registradoEn.getTime()),
  }
}

/** Validación del número de personas de un grupo sin registro. `''` = válido. */
export function validarPersonas(valor: number | string): string {
  const texto = String(valor).trim()
  if (texto === '') return 'Escribe cuántas personas son.'
  const numero = Number(texto)
  if (!Number.isInteger(numero) || numero < 1) return 'Escribe un número entero de personas, de 1 en adelante.'
  if (numero > MAX_PERSONAS_SIN_REGISTRO) return `El máximo es ${MAX_PERSONAS_SIN_REGISTRO} personas.`
  return ''
}

export interface Advertencia {
  tipo: 'capacidad' | 'mesa_reservada'
  texto: string
}

/**
 * Avisos antes de confirmar. NUNCA bloquean: la hostess decide (puede juntar sillas o sentar a un grupo en
 * una mesa reservada para más tarde).
 *  - `capacidad`: el grupo es más grande que la mesa.
 *  - `mesa_reservada`: la mesa está reservada y el grupo NO es el de su reservación.
 */
export function advertenciasAsignacion(
  mesa: MesaSalon,
  grupo: GrupoAsignacion,
  personas: number,
  reservaciones: Reservacion[],
): Advertencia[] {
  const avisos: Advertencia[] = []
  if (personas > mesa.capacidad) {
    avisos.push({
      tipo: 'capacidad',
      texto: `Son ${personas} personas y la mesa ${mesa.numero} es para ${mesa.capacidad}. Puedes continuar si las acomodas.`,
    })
  }
  if (mesa.estado === 'reservada') {
    const propias = reservaciones.filter(
      (r) => r.idMesa === mesa.idMesa && RESERVACION_ASIGNABLE.includes(r.estado),
    )
    const esDeLaMesa = grupo.tipo === 'reservacion' && propias.some((r) => r.idReservacion === grupo.idReservacion)
    if (!esDeLaMesa && propias.length > 0) {
      const detalle = propias.map((r) => `${r.clienteNombre} a las ${formatearHora(r.fechaHora)}`).join('; ')
      avisos.push({
        tipo: 'mesa_reservada',
        texto: `La mesa ${mesa.numero} está reservada para ${detalle}. Si la asignas a otro grupo, esa reservación queda sin mesa libre.`,
      })
    }
  }
  return avisos
}
