// Traducción entre el JSON de la API de hostess y los tipos del frontend (mismas reglas que
// `services/api/mappers.ts`): claves = nombres EXACTOS de columna (snake_case), números y fechas tolerantes
// al formato PDO/MySQL, estados de texto libre normalizados (con una advertencia si no se reconocen).
// Contrato compartido con la API real; ver docs/contrato-api-hostess.md.
import type {
  CambioEspera,
  CambioReservacion,
  Cliente,
  GrupoAsignacion,
  ListaEspera,
  MesaSalon,
  NuevaEspera,
  NuevaReservacion,
  NuevoCliente,
  PreferenciasReservacion,
  Reservacion,
  ResultadoAsignacion,
} from '../../types'
import {
  aEstadoEspera,
  aEstadoMesa,
  aEstadoReservacion,
  aFechaMySQL,
  aNumero,
  aNumeroONulo,
  aTexto,
  aZona,
  parseFechaMySQL,
  parseFechaMySQLONula,
} from '../api/conversion'
import { aCaracteristicas, type CaracteristicaDto } from '../api/mappers'

/** INT o DECIMAL tal como puede llegar desde PDO: número o texto ("12"). */
type Numerico = number | string

// ---------- DTOs: formato de la API ----------

/** Fila de GET /mesas. La API puede enviar más campos (estado_cuenta, total_cuenta…): la hostess los ignora. */
export interface MesaSalonDto {
  id_mesa: Numerico
  numero: Numerico
  capacidad: Numerico
  /** mesa.estado (texto libre), p. ej. "libre". */
  estado: string
  /** mesa.zona («sección»). GET /mesas la envía; la respuesta de asignar mesa no: ausente = sin sección. */
  zona?: string | null
  /** Características activas de la mesa (migración 023). */
  caracteristicas?: CaracteristicaDto[]
  /** seccion.es_para_llevar: mesa virtual de pedidos para llevar (la hostess no la ve). */
  es_para_llevar?: boolean | number | string
}

export interface ReservacionDto {
  id_reservacion: Numerico
  id_cliente: Numerico
  id_mesa: Numerico | null
  /** DATETIME de MySQL sin zona horaria, p. ej. "2026-10-16 20:30:00". */
  fecha_hora: string
  personas: Numerico
  estado: string
  llegada_en: string | null
  // --- CALCULADOS por la API (no son columnas de `reservacion`) ---
  /** cliente.nombre (JOIN). */
  cliente_nombre: string
  /** cliente.telefono (JOIN). */
  cliente_telefono: string | null
  cliente_correo?: string | null
  /** mesa.numero (JOIN); NULL si la reservación no tiene mesa. */
  mesa_numero: Numerico | null
  /** Preferencias de mesa (migración 021). Una API anterior no las envía: ausentes = sin preferencias. */
  pref_zona?: string | null
  /** Características que pidió el cliente (migración 023). */
  pref_caracteristicas?: CaracteristicaDto[]
}

export interface ListaEsperaDto {
  id_espera: Numerico
  id_cliente: Numerico
  personas: Numerico
  registrado_en: string
  estado: string
  // --- CALCULADOS por la API (no son columnas de `lista_espera`) ---
  cliente_nombre: string
  cliente_telefono: string | null
}

/** Fila de `cliente`. */
export interface ClienteDto {
  id_cliente: Numerico
  nombre: string
  telefono: string | null
  /** cliente.lada (migración 025). Una API anterior no la envía. */
  lada?: string
  correo: string | null
}

export interface ResultadoAsignacionDto {
  mesa: MesaSalonDto
  /** Solo si el grupo venía de una reservación. */
  reservacion?: ReservacionDto | null
  /** Solo si el grupo venía de la lista de espera. */
  espera?: ListaEsperaDto | null
}

// ---------- API → frontend ----------

/** Un teléfono vacío o ausente es «sin teléfono». */
function aTelefono(valor: unknown): string | null {
  const texto = aTexto(valor).trim()
  return texto === '' ? null : texto
}

/** Preferencias de una fila de `reservacion`: sección y características pedidas. */
export function aPreferencias(dto: Pick<ReservacionDto, 'pref_zona' | 'pref_caracteristicas'>): PreferenciasReservacion {
  const zona = aTexto(dto.pref_zona).trim()
  return { zona: zona === '' ? null : zona, caracteristicas: aCaracteristicas(dto.pref_caracteristicas) }
}

/** Preferencias para POST/PATCH de reservaciones. Una sección vacía viaja como `null` («cualquiera»). */
export function dePreferencias(p: PreferenciasReservacion): { pref_zona: string | null; pref_caracteristicas: number[] } {
  const zona = p.zona?.trim() ?? ''
  return { pref_zona: zona === '' ? null : zona, pref_caracteristicas: p.caracteristicas.map((c) => c.idCaracteristica) }
}

export function aMesaSalon(dto: MesaSalonDto): MesaSalon {
  return {
    idMesa: aNumero(dto.id_mesa, 'id_mesa'),
    numero: aNumero(dto.numero, 'numero'),
    capacidad: aNumero(dto.capacidad, 'capacidad'),
    estado: aEstadoMesa(dto.estado),
    zona: aZona(dto.zona),
    caracteristicas: aCaracteristicas(dto.caracteristicas),
  }
}

export function aReservacion(dto: ReservacionDto): Reservacion {
  return {
    idReservacion: aNumero(dto.id_reservacion, 'id_reservacion'),
    idCliente: aNumero(dto.id_cliente, 'id_cliente'),
    idMesa: aNumeroONulo(dto.id_mesa, 'id_mesa'),
    fechaHora: parseFechaMySQL(dto.fecha_hora, 'fecha_hora'),
    personas: aNumero(dto.personas, 'personas'),
    estado: aEstadoReservacion(dto.estado),
    llegadaEn: parseFechaMySQLONula(dto.llegada_en, 'llegada_en'),
    clienteNombre: aTexto(dto.cliente_nombre),
    clienteTelefono: aTelefono(dto.cliente_telefono),
    clienteCorreo: aTelefono(dto.cliente_correo),
    mesaNumero: aNumeroONulo(dto.mesa_numero, 'mesa_numero'),
    preferencias: aPreferencias(dto),
  }
}

export function aListaEspera(dto: ListaEsperaDto): ListaEspera {
  return {
    idEspera: aNumero(dto.id_espera, 'id_espera'),
    idCliente: aNumero(dto.id_cliente, 'id_cliente'),
    personas: aNumero(dto.personas, 'personas'),
    registradoEn: parseFechaMySQL(dto.registrado_en, 'registrado_en'),
    estado: aEstadoEspera(dto.estado),
    clienteNombre: aTexto(dto.cliente_nombre),
    clienteTelefono: aTelefono(dto.cliente_telefono),
  }
}

export function aCliente(dto: ClienteDto): Cliente {
  const correo = aTexto(dto.correo).trim()
  return {
    idCliente: aNumero(dto.id_cliente, 'id_cliente'),
    nombre: aTexto(dto.nombre),
    telefono: aTelefono(dto.telefono),
    lada: typeof dto.lada === 'string' && dto.lada !== '' ? dto.lada : undefined,
    correo: correo === '' ? null : correo,
  }
}

export function aResultadoAsignacion(dto: ResultadoAsignacionDto): ResultadoAsignacion {
  return {
    mesa: aMesaSalon(dto.mesa),
    reservacion: dto.reservacion ? aReservacion(dto.reservacion) : null,
    espera: dto.espera ? aListaEspera(dto.espera) : null,
  }
}

// ---------- frontend → API ----------

/** Cuerpo de POST /mesas/{id}/asignar: exactamente UNA de las tres claves (id_reservacion, id_espera o personas). */
export function deAsignacion(grupo: GrupoAsignacion): Record<string, number> {
  switch (grupo.tipo) {
    case 'reservacion':
      return { id_reservacion: grupo.idReservacion }
    case 'espera':
      return { id_espera: grupo.idEspera }
    case 'sinRegistro':
      return { personas: grupo.personas }
  }
}

/** Cuerpo de POST /clientes. El correo vacío viaja como `null`. */
export function deNuevoCliente(c: NuevoCliente): Record<string, string | null> {
  const correo = c.correo?.trim() ?? ''
  return { nombre: c.nombre.trim(), telefono: c.telefono.trim(), ...(c.lada ? { lada: c.lada } : {}), correo: correo === '' ? null : correo }
}

/** Cuerpo de POST /reservaciones. */
export function deNuevaReservacion(r: NuevaReservacion): Record<string, string | number | number[] | null> {
  return {
    id_cliente: r.idCliente,
    fecha_hora: aFechaMySQL(r.fechaHora),
    personas: r.personas,
    id_mesa: r.idMesa,
    ...(r.preferencias ? dePreferencias(r.preferencias) : {}),
  }
}

/** Cuerpo de PATCH /reservaciones/{id}: solo viajan los campos que cambian (`id_mesa: null` quita la mesa). */
export function deCambioReservacion(c: CambioReservacion): Record<string, string | number | number[] | null> {
  const cuerpo: Record<string, string | number | number[] | null> = {}
  if (c.estado !== undefined) cuerpo.estado = c.estado
  if (c.fechaHora !== undefined) cuerpo.fecha_hora = aFechaMySQL(c.fechaHora)
  if (c.personas !== undefined) cuerpo.personas = c.personas
  if (c.idMesa !== undefined) cuerpo.id_mesa = c.idMesa
  if (c.preferencias !== undefined) Object.assign(cuerpo, dePreferencias(c.preferencias))
  return cuerpo
}

/** Cuerpo de POST /lista-espera: `id_cliente` y `personas` (el resto lo pone la API: `registrado_en` y `estado`). */
export function deNuevaEspera(e: NuevaEspera): Record<string, number> {
  return { id_cliente: e.idCliente, personas: e.personas }
}

/** Cuerpo de PATCH /lista-espera/{id}: `{ estado: 'cancelada' }` (quitar) o `{ personas }` (corregir el grupo). */
export function deCambioEspera(c: CambioEspera): Record<string, string | number> {
  return 'estado' in c ? { estado: c.estado } : { personas: c.personas }
}

/** Cuerpo de POST /reservaciones/{id}/llegada: `id_mesa` solo si se elige una mesa. */
export function deLlegada(idMesa: number | null): Record<string, number> {
  return idMesa === null ? {} : { id_mesa: idMesa }
}
