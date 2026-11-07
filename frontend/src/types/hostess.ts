// Tipos del rol hostess (tablas `cliente`, `reservacion` y `lista_espera`). Ver docs/contrato-api-hostess.md.
import type { EstadoEspera, EstadoReservacion } from './estados'
import type { Mesa } from './mesa'

/** cliente (el mock lo guarda; la pantalla Salón solo muestra su nombre y teléfono). */
export interface Cliente {
  /** cliente.id_cliente */
  idCliente: number
  nombre: string
  /** cliente.telefono (puede ser NULL). */
  telefono: string | null
  /** cliente.correo (puede ser NULL). */
  correo: string | null
}

/**
 * Mesa tal como la ve la hostess: solo lo que es de `mesa`. NO incluye pedidos, cuentas ni totales
 * (esos son del mesero y del cajero).
 */
export type MesaSalon = Pick<
  Mesa,
  'idMesa' | 'numero' | 'capacidad' | 'estado' | 'zona' | 'plantaBaja' | 'espacioCarriola' | 'sinEscaleras'
>

/** reservacion. La tabla NO tiene folio. */
export interface Reservacion {
  /** reservacion.id_reservacion */
  idReservacion: number
  /** reservacion.id_cliente */
  idCliente: number
  /** reservacion.id_mesa: NULL mientras la reservación no tiene mesa. */
  idMesa: number | null
  /** reservacion.fecha_hora */
  fechaHora: Date
  /** reservacion.personas (siempre mayor que 0). */
  personas: number
  /** reservacion.estado (texto libre en la BD). */
  estado: EstadoReservacion
  /** reservacion.llegada_en: se llena cuando el grupo llega y se le asigna mesa. */
  llegadaEn: Date | null

  // --- Campos CALCULADOS por la API (no son columnas de `reservacion`) ---
  /** cliente.nombre (JOIN). */
  clienteNombre: string
  /** cliente.telefono (JOIN); `null` si el cliente no dejó teléfono. */
  clienteTelefono: string | null
  /** cliente.correo (JOIN); obligatorio para reservaciones nuevas. */
  clienteCorreo: string | null
  /** mesa.numero (JOIN); `null` si la reservación no tiene mesa. */
  mesaNumero: number | null
}

/** lista_espera. */
export interface ListaEspera {
  /** lista_espera.id_espera */
  idEspera: number
  /** lista_espera.id_cliente */
  idCliente: number
  /** lista_espera.personas (siempre mayor que 0). */
  personas: number
  /** lista_espera.registrado_en */
  registradoEn: Date
  /** lista_espera.estado (texto libre en la BD). */
  estado: EstadoEspera

  // --- Campos CALCULADOS por la API (no son columnas de `lista_espera`) ---
  /** cliente.nombre (JOIN). */
  clienteNombre: string
  /** cliente.telefono (JOIN); `null` si el cliente no dejó teléfono. */
  clienteTelefono: string | null
}

/** A quién se le asigna la mesa. */
export type GrupoAsignacion =
  | { tipo: 'reservacion'; idReservacion: number }
  | { tipo: 'espera'; idEspera: number }
  /** Grupo que llega sin reservar ni anotarse: solo importa cuántas personas son. */
  | { tipo: 'sinRegistro'; personas: number }

/** Resultado de asignar una mesa: la mesa ya ocupada y el grupo (reservación o espera) ya actualizado. */
export interface ResultadoAsignacion {
  mesa: MesaSalon
  reservacion: Reservacion | null
  espera: ListaEspera | null
}

/** Datos para dar de alta un cliente (cliente.nombre, telefono y correo). */
export interface NuevoCliente {
  nombre: string
  telefono: string
  /** Opcional: `null` si no se captura. */
  correo: string | null
}

/** Datos para anotar un grupo en la lista de espera. Nace en estado `esperando` con `registrado_en` = ahora. */
export interface NuevaEspera {
  idCliente: number
  /** De 1 a 20. */
  personas: number
}

/** Cambio a un grupo que sigue esperando. Hoy solo se puede quitar de la lista (el grupo se fue): pasa a `cancelada`. */
export interface CambioEspera {
  estado: 'cancelada'
}

/** Datos para crear una reservación. Nace en estado `pendiente`. */
export interface NuevaReservacion {
  idCliente: number
  fechaHora: Date
  /** De 1 a 20. */
  personas: number
  /** Solo se puede reservar mesa para reservaciones de HOY; `null` = sin mesa (se elige al llegar). */
  idMesa: number | null
}

/**
 * Cambio a una reservación vigente (pendiente o confirmada). O bien cambia el `estado` (confirmar o cancelar) o bien
 * se editan campos; no las dos cosas a la vez. Un campo ausente no se toca; `idMesa: null` quita la mesa.
 */
export interface CambioReservacion {
  estado?: 'confirmada' | 'cancelada'
  fechaHora?: Date
  personas?: number
  idMesa?: number | null
}
