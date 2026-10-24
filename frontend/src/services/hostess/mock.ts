// Servicios de hostess simulados en memoria. Comparten `baseDatos.mesas` con el mock del mesero: la mesa que
// la hostess ocupa aquí se ve ocupada en el Panel de mesas. Aplican las mismas reglas que `utils/asignacion.ts` y
// `utils/reservaciones.ts`.
import type {
  CambioReservacion,
  Cliente,
  GrupoAsignacion,
  ListaEspera,
  MesaSalon,
  Reservacion,
  ResultadoAsignacion,
} from '../../types'
import { mesaAsignable, reservacionAsignable, validarPersonas } from '../../utils/asignacion'
import {
  aDiaISO,
  coincideBusqueda,
  esFechaPasada,
  esVigente,
  mesaPermitidaEnFecha,
  mesaSeLibera,
  normalizarTelefono,
  validarCliente,
  validarPersonasReservacion,
} from '../../utils/reservaciones'
import { ErrorServicio } from '../errores'
import { baseDatos, type EsperaGuardada, type ReservacionGuardada } from '../mock/baseDatos'
import { conRetraso, conRetrasoIdempotente } from '../mock/utiles'
import type { HostessService } from './interfaces'

/** Siguiente id de una tabla del mock (el mayor + 1). */
const siguienteId = (ids: number[]): number => Math.max(0, ...ids) + 1

function aMesaSalon(idMesa: number): MesaSalon {
  const mesa = baseDatos.mesas.find((m) => m.idMesa === idMesa)
  if (!mesa) throw new ErrorServicio('no_encontrado', `La mesa ${idMesa} no existe.`, 404)
  return {
    idMesa: mesa.idMesa,
    numero: mesa.numero,
    capacidad: mesa.capacidad,
    estado: mesa.estado,
    zona: mesa.zona,
    plantaBaja: mesa.plantaBaja,
    espacioCarriola: mesa.espacioCarriola,
    sinEscaleras: mesa.sinEscaleras,
  }
}

/** Agrega a la reservación los datos calculados (JOIN con cliente y mesa). */
function conCliente(r: ReservacionGuardada): Reservacion {
  const cliente = baseDatos.clientes.find((c) => c.idCliente === r.idCliente)
  const mesa = baseDatos.mesas.find((m) => m.idMesa === r.idMesa)
  return {
    ...r,
    clienteNombre: cliente?.nombre ?? '',
    clienteTelefono: cliente?.telefono ?? null,
    clienteCorreo: cliente?.correo ?? null,
    mesaNumero: mesa?.numero ?? null,
  }
}

function esperaConCliente(e: EsperaGuardada): ListaEspera {
  const cliente = baseDatos.clientes.find((c) => c.idCliente === e.idCliente)
  return { ...e, clienteNombre: cliente?.nombre ?? '', clienteTelefono: cliente?.telefono ?? null }
}

/** Una reservación que no existe o que ya no está vigente (pendiente o confirmada). */
function reservacionVigente(id: number): ReservacionGuardada {
  const r = baseDatos.reservaciones.find((x) => x.idReservacion === id)
  if (!r) throw new ErrorServicio('no_encontrado', 'La reservación no existe.', 404)
  if (!esVigente(r.estado)) {
    throw new ErrorServicio('estado_invalido', 'Solo se pueden cambiar las reservaciones pendientes o confirmadas.', 409)
  }
  return r
}

/** Si la mesa estaba `reservada` y ya no queda otra reservación vigente para ella, vuelve a quedar libre. */
function liberarMesaSiCorresponde(idMesa: number | null, exceptoId: number): void {
  if (idMesa === null) return
  const mesa = baseDatos.mesas.find((m) => m.idMesa === idMesa)
  if (mesa?.estado === 'reservada' && mesaSeLibera(idMesa, baseDatos.reservaciones, exceptoId)) mesa.estado = 'libre'
}

function vencerReservacionesSinLlegada(ahora = new Date()): void {
  const toleranciaMs = baseDatos.configuracionReservacion.toleranciaMinutos * 60_000
  for (const reservacion of baseDatos.reservaciones) {
    if (!esVigente(reservacion.estado) || reservacion.fechaHora.getTime() + toleranciaMs > ahora.getTime()) continue
    const mesaAnterior = reservacion.idMesa
    reservacion.estado = 'vencida'
    reservacion.idMesa = null
    liberarMesaSiCorresponde(mesaAnterior, reservacion.idReservacion)
  }
}

/** La mesa debe existir y estar libre para poder reservarla. */
function mesaLibreParaReservar(idMesa: number): void {
  const mesa = baseDatos.mesas.find((m) => m.idMesa === idMesa)
  if (!mesa) throw new ErrorServicio('no_encontrado', `La mesa ${idMesa} no existe.`, 404)
  if (!mesa.activa || !baseDatos.secciones.some((s) => s.nombre === mesa.zona && s.activa)) {
    throw new ErrorServicio('mesa_no_disponible', `La mesa ${mesa.numero} no está disponible.`, 409)
  }
  if (mesa.estado !== 'libre') {
    throw new ErrorServicio('mesa_no_disponible', `La mesa ${mesa.numero} ya no está libre.`, 409)
  }
}

function validarFechaNueva(fecha: Date): void {
  if (Number.isNaN(fecha.getTime())) throw new ErrorServicio('estado_invalido', 'La fecha no es válida.', 422)
  if (esFechaPasada(fecha, new Date())) throw new ErrorServicio('estado_invalido', 'No se puede reservar en una fecha pasada.', 422)
}

function validarPersonasNuevas(personas: number): void {
  const mensaje = validarPersonasReservacion(personas)
  if (mensaje) throw new ErrorServicio('estado_invalido', mensaje, 422)
}

/** Aplica la asignación a la «base de datos». Lanza ErrorServicio si la mesa o el grupo no son válidos. */
function asignar(idMesa: number, grupo: GrupoAsignacion): ResultadoAsignacion {
  const mesaGuardada = baseDatos.mesas.find((m) => m.idMesa === idMesa)
  if (!mesaGuardada) throw new ErrorServicio('no_encontrado', `La mesa ${idMesa} no existe.`, 404)
  if (!mesaGuardada.activa || !baseDatos.secciones.some((s) => s.nombre === mesaGuardada.zona && s.activa)) {
    throw new ErrorServicio('mesa_no_disponible', `La mesa ${mesaGuardada.numero} no está disponible.`, 409)
  }
  if (!mesaAsignable(aMesaSalon(idMesa))) {
    throw new ErrorServicio('mesa_no_disponible', `La mesa ${mesaGuardada.numero} ya está ocupada.`, 409)
  }

  let reservacion: ReservacionGuardada | undefined
  let espera: EsperaGuardada | undefined

  // Primero se valida todo; solo después se cambia algo (la asignación es todo o nada).
  if (grupo.tipo === 'reservacion') {
    reservacion = baseDatos.reservaciones.find((r) => r.idReservacion === grupo.idReservacion)
    if (!reservacion) throw new ErrorServicio('no_encontrado', 'La reservación no existe.', 404)
    if (!reservacionAsignable(conCliente(reservacion), aMesaSalon(idMesa))) {
      throw new ErrorServicio('estado_invalido', 'Esa reservación ya no se puede asignar a esta mesa.', 409)
    }
  } else if (grupo.tipo === 'espera') {
    espera = baseDatos.listaEspera.find((e) => e.idEspera === grupo.idEspera)
    if (!espera) throw new ErrorServicio('no_encontrado', 'El grupo en espera no existe.', 404)
    if (espera.estado !== 'esperando') {
      throw new ErrorServicio('estado_invalido', 'Ese grupo ya tiene mesa asignada.', 409)
    }
  } else if (validarPersonas(grupo.personas)) {
    throw new ErrorServicio('estado_invalido', 'El número de personas no es válido.', 422)
  }

  mesaGuardada.estado = 'ocupada'
  if (reservacion) {
    reservacion.idMesa = idMesa
    reservacion.estado = 'llego'
    reservacion.llegadaEn = new Date()
  }
  if (espera) espera.estado = 'asignada'

  return {
    mesa: aMesaSalon(idMesa),
    reservacion: reservacion ? conCliente(reservacion) : null,
    espera: espera ? esperaConCliente(espera) : null,
  }
}

/** Confirma o cancela una reservación. */
function cambiarEstado(r: ReservacionGuardada, estado: 'confirmada' | 'cancelada'): void {
  if (estado === 'confirmada') {
    if (r.estado !== 'pendiente') {
      throw new ErrorServicio('estado_invalido', 'Solo una reservación pendiente se puede confirmar.', 409)
    }
    r.estado = 'confirmada'
    return
  }
  // Cancelar: la reservación pierde su mesa y la mesa se libera si nadie más la necesita.
  const mesaAnterior = r.idMesa
  r.estado = 'cancelada'
  r.idMesa = null
  liberarMesaSiCorresponde(mesaAnterior, r.idReservacion)
}

/** Edita fecha, personas y mesa de una reservación vigente. Valida todo antes de cambiar nada. */
function editar(r: ReservacionGuardada, cambio: CambioReservacion): void {
  const fecha = cambio.fechaHora ?? r.fechaHora
  const personas = cambio.personas ?? r.personas
  const mesaFinal = cambio.idMesa === undefined ? r.idMesa : cambio.idMesa

  if (cambio.fechaHora !== undefined && cambio.fechaHora.getTime() !== r.fechaHora.getTime()) validarFechaNueva(cambio.fechaHora)
  if (cambio.personas !== undefined) validarPersonasNuevas(personas)
  if (mesaFinal !== null && !mesaPermitidaEnFecha(fecha, new Date())) {
    throw new ErrorServicio('estado_invalido', 'La mesa solo se reserva para reservaciones de hoy.', 422)
  }
  if (mesaFinal !== null && mesaFinal !== r.idMesa) mesaLibreParaReservar(mesaFinal)

  const mesaAnterior = r.idMesa
  r.fechaHora = fecha
  r.personas = personas
  r.idMesa = mesaFinal
  if (mesaFinal !== null && mesaFinal !== mesaAnterior) {
    const mesa = baseDatos.mesas.find((m) => m.idMesa === mesaFinal)
    if (mesa) mesa.estado = 'reservada'
  }
  if (mesaAnterior !== mesaFinal) liberarMesaSiCorresponde(mesaAnterior, r.idReservacion)
}

export function crearHostessMock(): HostessService {
  return {
    listarMesas() {
      return conRetraso(() => baseDatos.mesas
        .filter((m) => m.activa && baseDatos.secciones.some((s) => s.nombre === m.zona && s.activa))
        .map((m) => aMesaSalon(m.idMesa)))
    },

    listarReservaciones(dia) {
      // Las reservaciones del día, de cualquier estado (la pantalla decide cuáles muestra).
      return conRetraso(() => {
        vencerReservacionesSinLlegada()
        const buscado = dia ?? aDiaISO(new Date())
        return baseDatos.reservaciones
          .filter((r) => aDiaISO(r.fechaHora) === buscado)
          .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime())
          .map(conCliente)
      })
    },

    listarEspera(estado = 'esperando') {
      return conRetraso(() => {
        const hoy = aDiaISO(new Date())
        // `'todas'`: todos los estados de hoy más los que siguen esperando (aunque se hayan anotado otro día).
        return baseDatos.listaEspera
          .filter((e) => (estado === 'todas' ? e.estado === 'esperando' || aDiaISO(e.registradoEn) === hoy : e.estado === estado))
          .map(esperaConCliente)
      })
    },

    crearEspera(espera, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        if (!baseDatos.clientes.some((c) => c.idCliente === espera.idCliente)) {
          throw new ErrorServicio('no_encontrado', 'El cliente no existe.', 404)
        }
        validarPersonasNuevas(espera.personas)
        if (baseDatos.listaEspera.some((e) => e.idCliente === espera.idCliente && e.estado === 'esperando')) {
          throw new ErrorServicio('estado_invalido', 'Ese cliente ya está en la lista de espera.', 409)
        }
        const nueva: EsperaGuardada = {
          idEspera: siguienteId(baseDatos.listaEspera.map((e) => e.idEspera)),
          idCliente: espera.idCliente,
          personas: espera.personas,
          registradoEn: new Date(),
          estado: 'esperando',
        }
        baseDatos.listaEspera.push(nueva)
        return esperaConCliente(nueva)
      })
    },

    actualizarEspera(id, cambio, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const e = baseDatos.listaEspera.find((x) => x.idEspera === id)
        if (!e) throw new ErrorServicio('no_encontrado', 'El grupo en espera no existe.', 404)
        if (cambio.estado !== 'cancelada') {
          throw new ErrorServicio('estado_invalido', 'Solo se puede quitar al grupo de la lista (cancelada).', 422)
        }
        // Solo quien sigue esperando se puede quitar: asignada y cancelada son finales. La fila nunca se borra.
        if (e.estado !== 'esperando') {
          throw new ErrorServicio('estado_invalido', 'Ese grupo ya no está esperando: no se puede quitar.', 409)
        }
        e.estado = 'cancelada'
        return esperaConCliente(e)
      })
    },

    asignarMesa(idMesa, grupo, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => asignar(idMesa, grupo))
    },

    buscarClientes(q) {
      return conRetraso(() => {
        if (q.trim().length < 2) return []
        return baseDatos.clientes
          .filter((c) => coincideBusqueda(c.nombre, c.telefono, q))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
          .slice(0, 20)
      })
    },

    crearCliente(cliente, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const errores = validarCliente({ nombre: cliente.nombre, telefono: cliente.telefono, correo: cliente.correo ?? '' })
        const primero = errores.nombre ?? errores.telefono ?? errores.correo
        if (primero) throw new ErrorServicio('estado_invalido', primero, 422)

        const telefono = normalizarTelefono(cliente.telefono)
        if (baseDatos.clientes.some((c) => c.telefono !== null && normalizarTelefono(c.telefono) === telefono)) {
          throw new ErrorServicio('estado_invalido', 'Ya existe un cliente con ese teléfono. Búscalo en la lista.', 409)
        }
        const nuevo: Cliente = {
          idCliente: siguienteId(baseDatos.clientes.map((c) => c.idCliente)),
          nombre: cliente.nombre.trim(),
          telefono,
          correo: cliente.correo?.trim() ? cliente.correo.trim() : null,
        }
        baseDatos.clientes.push(nuevo)
        return nuevo
      })
    },

    actualizarCorreoCliente(id, correo) {
      return conRetraso(() => {
        const error = validarCliente({ nombre: 'Cliente', telefono: '1234567890', correo })
        if (error.correo) throw new ErrorServicio('estado_invalido', error.correo, 422)
        const cliente = baseDatos.clientes.find((c) => c.idCliente === id)
        if (!cliente) throw new ErrorServicio('no_encontrado', 'El cliente no existe.', 404)
        cliente.correo = correo.trim()
        return { ...cliente }
      })
    },

    crearReservacion(reservacion, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const cliente = baseDatos.clientes.find((c) => c.idCliente === reservacion.idCliente)
        if (!cliente) {
          throw new ErrorServicio('no_encontrado', 'El cliente no existe.', 404)
        }
        if (!cliente.correo) throw new ErrorServicio('estado_invalido', 'Agrega un correo al cliente antes de crear la reservación.', 422)
        validarPersonasNuevas(reservacion.personas)
        validarFechaNueva(reservacion.fechaHora)
        if (reservacion.idMesa !== null) {
          if (!mesaPermitidaEnFecha(reservacion.fechaHora, new Date())) {
            throw new ErrorServicio('estado_invalido', 'La mesa solo se reserva para reservaciones de hoy.', 422)
          }
          mesaLibreParaReservar(reservacion.idMesa)
        }

        const nueva: ReservacionGuardada = {
          idReservacion: siguienteId(baseDatos.reservaciones.map((r) => r.idReservacion)),
          idCliente: reservacion.idCliente,
          idMesa: reservacion.idMesa,
          fechaHora: new Date(reservacion.fechaHora),
          personas: reservacion.personas,
          estado: 'pendiente',
          llegadaEn: null,
        }
        baseDatos.reservaciones.push(nueva)
        if (nueva.idMesa !== null) {
          const mesa = baseDatos.mesas.find((m) => m.idMesa === nueva.idMesa)
          if (mesa) mesa.estado = 'reservada'
        }
        return conCliente(nueva)
      })
    },

    actualizarReservacion(id, cambio, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const r = reservacionVigente(id)
        if (cambio.estado !== undefined) {
          // Un cambio de estado no se mezcla con la edición de campos.
          if (cambio.fechaHora !== undefined || cambio.personas !== undefined || cambio.idMesa !== undefined) {
            throw new ErrorServicio('estado_invalido', 'Cambia el estado o edita los datos, no las dos cosas a la vez.', 422)
          }
          cambiarEstado(r, cambio.estado)
        } else {
          editar(r, cambio)
        }
        return conCliente(r)
      })
    },

    registrarLlegada(id, idMesa, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const r = reservacionVigente(id)
        const destino = idMesa ?? r.idMesa
        if (destino === null) {
          throw new ErrorServicio('estado_invalido', 'Elige la mesa en la que se sienta esta reservación.', 422)
        }
        if (!mesaAsignable(aMesaSalon(destino))) {
          throw new ErrorServicio('mesa_no_disponible', `La mesa ${aMesaSalon(destino).numero} ya está ocupada.`, 409)
        }
        // Si cambia de mesa, la anterior se libera (si nadie más la necesita) y la reservación se liga a la nueva.
        const anterior = r.idMesa
        if (anterior !== destino) r.idMesa = null
        const resultado = asignar(destino, { tipo: 'reservacion', idReservacion: id })
        if (anterior !== null && anterior !== destino) liberarMesaSiCorresponde(anterior, id)
        return resultado
      })
    },
  }
}
