// Reglas de las reservaciones (rol hostess). Funciones puras: las usan la pantalla Reservaciones, el mock y las pruebas.
import type { Cliente, EstadoReservacion, MesaSalon, Reservacion } from '../types'

export const MIN_PERSONAS_RESERVACION = 1
export const MAX_PERSONAS_RESERVACION = 20
/** Hasta cuántos días por delante se acepta una reservación. */
export const MAX_DIAS_ADELANTE = 365

// ---------- Estados y transiciones ----------

/** Estados en los que la reservación sigue «viva»: se puede editar, confirmar, cancelar o registrar su llegada. */
const VIGENTES: readonly EstadoReservacion[] = ['pendiente', 'confirmada']

export function esVigente(estado: EstadoReservacion): boolean {
  return VIGENTES.includes(estado)
}

/** Solo una reservación pendiente o confirmada se edita. */
export function puedeEditar(estado: EstadoReservacion): boolean {
  return esVigente(estado)
}

export function puedeConfirmar(estado: EstadoReservacion): boolean {
  return estado === 'pendiente'
}

export function puedeCancelar(estado: EstadoReservacion): boolean {
  return esVigente(estado)
}

export function puedeRegistrarLlegada(estado: EstadoReservacion): boolean {
  return esVigente(estado)
}

/**
 * Transiciones válidas: pendiente → confirmada | cancelada | llego, confirmada → cancelada | llego.
 * `llego` y `cancelada` son finales; un estado desconocido no cambia (no se sabe qué significa).
 */
export function transicionValida(desde: EstadoReservacion, hacia: EstadoReservacion): boolean {
  if (desde === 'pendiente') return hacia === 'confirmada' || hacia === 'cancelada' || hacia === 'llego'
  if (desde === 'confirmada') return hacia === 'cancelada' || hacia === 'llego'
  return false
}

export type AccionReservacion = 'confirmar' | 'llegada' | 'editar' | 'cancelar'

/** Acciones que se ofrecen para una reservación, en el orden en que se muestran. */
export function accionesDisponibles(estado: EstadoReservacion): AccionReservacion[] {
  const acciones: AccionReservacion[] = []
  if (puedeConfirmar(estado)) acciones.push('confirmar')
  if (puedeRegistrarLlegada(estado)) acciones.push('llegada')
  if (puedeEditar(estado)) acciones.push('editar')
  if (puedeCancelar(estado)) acciones.push('cancelar')
  return acciones
}

/**
 * Cancelar una reservación libera su mesa si la mesa estaba `reservada` y NO queda otra reservación vigente para
 * ella. `reservaciones` son las que se conocen (la cancelada puede venir incluida: se excluye con `exceptoId`).
 */
export function mesaSeLibera(
  idMesa: number,
  reservaciones: ReadonlyArray<Pick<Reservacion, 'idReservacion' | 'idMesa' | 'estado'>>,
  exceptoId: number,
): boolean {
  return !reservaciones.some((r) => r.idReservacion !== exceptoId && r.idMesa === idMesa && esVigente(r.estado))
}

// ---------- Fechas ----------

const dos = (n: number) => String(n).padStart(2, '0')

/** Date → «AAAA-MM-DD» en hora local (el formato de <input type="date"> y de `?fecha=`). */
export function aDiaISO(fecha: Date): string {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

/** Date → «HH:MM» en hora local (el formato de <input type="time">). */
export function aHoraISO(fecha: Date): string {
  return `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
}

/** «AAAA-MM-DD» + «HH:MM» → Date local; `null` si falta algo o la fecha no existe ("2026-02-31"). */
export function combinarFechaHora(dia: string, hora: string): Date | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia.trim())
  const h = /^(\d{2}):(\d{2})$/.exec(hora.trim())
  if (!f || !h) return null
  const [anio, mes, d] = [Number(f[1]), Number(f[2]), Number(f[3])]
  const [hh, mm] = [Number(h[1]), Number(h[2])]
  const fecha = new Date(anio, mes - 1, d, hh, mm, 0, 0)
  const coincide =
    fecha.getFullYear() === anio &&
    fecha.getMonth() === mes - 1 &&
    fecha.getDate() === d &&
    fecha.getHours() === hh &&
    fecha.getMinutes() === mm
  return coincide ? fecha : null
}

export function esMismoDia(a: Date, b: Date): boolean {
  return aDiaISO(a) === aDiaISO(b)
}

/** Suma `dias` (puede ser negativo) a un día «AAAA-MM-DD». */
export function sumarDias(dia: string, dias: number): string {
  const fecha = combinarFechaHora(dia, '12:00')
  if (!fecha) return dia
  fecha.setDate(fecha.getDate() + dias)
  return aDiaISO(fecha)
}

/** ¿Ya pasó? Se compara por MINUTO: reservar para «las 20:30» a las 20:30:40 sigue siendo válido. */
export function esFechaPasada(fecha: Date, ahora: Date): boolean {
  const inicioDelMinuto = new Date(ahora)
  inicioDelMinuto.setSeconds(0, 0)
  return fecha.getTime() < inicioDelMinuto.getTime()
}

export interface ErroresFechaHora {
  fecha?: string
  hora?: string
}

/**
 * Valida fecha y hora de una reservación. Al CREAR no se permiten fechas pasadas. Al EDITAR, `original` es la fecha
 * que ya tenía: si no se cambió, no se vuelve a exigir que sea futura (una reservación de las 20:00 puede seguir
 * pendiente a las 20:15 y aun así editarse, p. ej., sus personas).
 */
export function validarFechaHora(dia: string, hora: string, ahora: Date, original: Date | null = null): ErroresFechaHora {
  const errores: ErroresFechaHora = {}
  if (dia.trim() === '') errores.fecha = 'Elige la fecha de la reservación.'
  if (hora.trim() === '') errores.hora = 'Elige la hora de la reservación.'
  if (errores.fecha || errores.hora) return errores

  const fecha = combinarFechaHora(dia, hora)
  if (!fecha) {
    errores.fecha = 'La fecha o la hora no son válidas.'
    return errores
  }
  if (original && fecha.getTime() === original.getTime()) return errores

  if (esFechaPasada(fecha, ahora)) {
    // Si es otro día el problema es la fecha; si es hoy, la hora.
    if (esMismoDia(fecha, ahora)) errores.hora = 'Esa hora ya pasó. Elige una hora a partir de ahora.'
    else errores.fecha = 'No se puede reservar en una fecha pasada.'
    return errores
  }
  const limite = new Date(ahora)
  limite.setDate(limite.getDate() + MAX_DIAS_ADELANTE)
  if (fecha.getTime() > limite.getTime()) errores.fecha = 'La fecha es demasiado lejana: el máximo es un año.'
  return errores
}

/** La mesa solo se puede reservar para reservaciones de HOY (la mesa solo guarda su estado actual). */
export function mesaPermitidaEnFecha(fecha: Date, ahora: Date): boolean {
  return esMismoDia(fecha, ahora)
}

// ---------- Personas y mesa ----------

/** Validación de las personas de una reservación o de un grupo en espera (1 a 20). `''` = válido. */
export function validarPersonasReservacion(valor: number | string): string {
  const texto = String(valor).trim()
  if (texto === '') return 'Escribe cuántas personas son.'
  const numero = Number(texto)
  if (!Number.isInteger(numero)) return 'Escribe un número entero de personas.'
  if (numero < MIN_PERSONAS_RESERVACION || numero > MAX_PERSONAS_RESERVACION) {
    return `El grupo debe ser de ${MIN_PERSONAS_RESERVACION} a ${MAX_PERSONAS_RESERVACION} personas.`
  }
  return ''
}

export interface OpcionMesa {
  mesa: MesaSalon
  /** `false` si las personas no caben (se avisa, no se bloquea). */
  alcanza: boolean
}

/**
 * Mesas que se pueden ofrecer para una reservación: las LIBRES y la que la reservación ya tiene (aunque esté
 * `reservada`, es la suya). Primero las que alcanzan, de la más justa a la más grande; después las que no alcanzan.
 */
export function mesasParaReservacion(mesas: MesaSalon[], personas: number, idMesaActual: number | null): OpcionMesa[] {
  return mesas
    .filter((m) => m.estado === 'libre' || m.idMesa === idMesaActual)
    .map((mesa) => ({ mesa, alcanza: mesa.capacidad >= personas }))
    .sort((a, b) => {
      if (a.alcanza !== b.alcanza) return a.alcanza ? -1 : 1
      return a.mesa.capacidad - b.mesa.capacidad || a.mesa.numero - b.mesa.numero
    })
}

/** Aviso (no bloquea) cuando las personas no caben en la mesa elegida; `null` si caben. */
export function advertenciaCapacidadMesa(mesa: MesaSalon, personas: number): string | null {
  return personas > mesa.capacidad
    ? `Son ${personas} personas y la mesa ${mesa.numero} es para ${mesa.capacidad}. Puedes continuar si las acomodas.`
    : null
}

// ---------- Cliente ----------

/** Estado del selector de cliente del formulario: uno existente (buscado) o uno nuevo (datos escritos). */
export interface ClienteForm {
  modo: 'existente' | 'nuevo'
  seleccionado: Cliente | null
  nombre: string
  telefono: string
  correo: string
}

export function clienteFormVacio(): ClienteForm {
  return { modo: 'existente', seleccionado: null, nombre: '', telefono: '', correo: '' }
}

export interface DatosCliente {
  nombre: string
  telefono: string
  correo: string
}

export interface ErroresCliente {
  nombre?: string
  telefono?: string
  correo?: string
}

/** Deja solo los dígitos de un teléfono («(311) 555-0201» → «3115550201»). */
export function normalizarTelefono(texto: string): string {
  return texto.replace(/\D/g, '')
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Valida un cliente nuevo: nombre (hasta 100), teléfono de 10 dígitos y correo opcional (hasta 120). */
export function validarCliente(datos: DatosCliente): ErroresCliente {
  const errores: ErroresCliente = {}
  const nombre = datos.nombre.trim()
  if (nombre === '') errores.nombre = 'Escribe el nombre del cliente.'
  else if (nombre.length > 100) errores.nombre = 'El nombre es demasiado largo (máximo 100 letras).'

  const telefono = normalizarTelefono(datos.telefono)
  if (datos.telefono.trim() === '') errores.telefono = 'Escribe el teléfono del cliente.'
  else if (telefono.length !== 10) errores.telefono = 'Escribe un teléfono de 10 dígitos.'

  const correo = datos.correo.trim()
  if (correo !== '') {
    if (!CORREO.test(correo)) errores.correo = 'Escribe un correo válido, por ejemplo nombre@correo.com.'
    else if (correo.length > 120) errores.correo = 'El correo es demasiado largo (máximo 120 caracteres).'
  }
  return errores
}

// ---------- Búsqueda y filtros ----------

export type FiltroReservaciones = 'todas' | 'pendiente' | 'confirmada' | 'llego' | 'cancelada'

export const FILTROS_RESERVACIONES: readonly FiltroReservaciones[] = ['todas', 'pendiente', 'confirmada', 'llego', 'cancelada']

/** Minúsculas y sin acentos, para buscar «gonzalez» y encontrar «González». */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/** ¿El texto aparece en el nombre, o (si trae al menos 3 dígitos) en el teléfono? Texto vacío = coincide todo. */
export function coincideBusqueda(nombre: string, telefono: string | null, texto: string): boolean {
  const buscado = normalizarBusqueda(texto)
  if (buscado === '') return true
  if (normalizarBusqueda(nombre).includes(buscado)) return true
  const digitos = normalizarTelefono(texto)
  return digitos.length >= 3 && telefono !== null && normalizarTelefono(telefono).includes(digitos)
}

/** Filtra por estado y por texto (nombre o teléfono) y ordena por hora. No modifica el arreglo recibido. */
export function filtrarReservaciones(
  reservaciones: Reservacion[],
  filtro: FiltroReservaciones,
  texto: string,
): Reservacion[] {
  return reservaciones
    .filter((r) => (filtro === 'todas' ? true : r.estado === filtro))
    .filter((r) => coincideBusqueda(r.clienteNombre, r.clienteTelefono, texto))
    .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime())
}
