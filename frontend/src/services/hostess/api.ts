// Servicios de hostess contra la API real. Ver docs/contrato-api-hostess.md.
import { aDiaISO } from '../../utils/reservaciones'
import { solicitar } from '../api/cliente'
import type { HostessService } from './interfaces'
import {
  aCliente,
  aListaEspera,
  aMesaSalon,
  aReservacion,
  aResultadoAsignacion,
  deAsignacion,
  deCambioEspera,
  deCambioReservacion,
  deLlegada,
  deNuevaEspera,
  deNuevaReservacion,
  deNuevoCliente,
  type ClienteDto,
  type ListaEsperaDto,
  type MesaSalonDto,
  type ReservacionDto,
  type ResultadoAsignacionDto,
} from './mappers'

export function crearHostessApi(): HostessService {
  return {
    async listarMesas() {
      const r = await solicitar<MesaSalonDto[]>('GET', '/mesas')
      return r.map(aMesaSalon)
    },

    async listarReservaciones(dia) {
      // Sin día, hoy en hora local (lo que espera `?fecha=`).
      const r = await solicitar<ReservacionDto[]>('GET', '/reservaciones', { consulta: { fecha: dia ?? aDiaISO(new Date()) } })
      return r.map(aReservacion)
    },

    async listarEspera(estado = 'esperando') {
      // `'todas'` no manda `estado`: la API devuelve los de hoy más los que siguen esperando.
      const r = await solicitar<ListaEsperaDto[]>('GET', '/lista-espera', {
        consulta: { estado: estado === 'todas' ? undefined : estado },
      })
      return r.map(aListaEspera)
    },

    async asignarMesa(idMesa, grupo, claveIdempotencia) {
      const r = await solicitar<ResultadoAsignacionDto>('POST', `/mesas/${idMesa}/asignar`, {
        cuerpo: deAsignacion(grupo),
        claveIdempotencia,
      })
      return aResultadoAsignacion(r)
    },

    async buscarClientes(q) {
      const r = await solicitar<ClienteDto[]>('GET', '/clientes', { consulta: { q: q.trim() } })
      return r.map(aCliente)
    },

    async crearCliente(cliente, claveIdempotencia) {
      const r = await solicitar<ClienteDto>('POST', '/clientes', { cuerpo: deNuevoCliente(cliente), claveIdempotencia })
      return aCliente(r)
    },

    async actualizarCorreoCliente(id, correo) {
      const r = await solicitar<ClienteDto>('PATCH', `/clientes/${id}`, { cuerpo: { correo: correo.trim() } })
      return aCliente(r)
    },

    async crearReservacion(reservacion, claveIdempotencia) {
      const r = await solicitar<ReservacionDto>('POST', '/reservaciones', {
        cuerpo: deNuevaReservacion(reservacion),
        claveIdempotencia,
      })
      return aReservacion(r)
    },

    async actualizarReservacion(id, cambio, claveIdempotencia) {
      const r = await solicitar<ReservacionDto>('PATCH', `/reservaciones/${id}`, {
        cuerpo: deCambioReservacion(cambio),
        claveIdempotencia,
      })
      return aReservacion(r)
    },

    async crearEspera(espera, claveIdempotencia) {
      const r = await solicitar<ListaEsperaDto>('POST', '/lista-espera', { cuerpo: deNuevaEspera(espera), claveIdempotencia })
      return aListaEspera(r)
    },

    async actualizarEspera(id, cambio, claveIdempotencia) {
      const r = await solicitar<ListaEsperaDto>('PATCH', `/lista-espera/${id}`, {
        cuerpo: deCambioEspera(cambio),
        claveIdempotencia,
      })
      return aListaEspera(r)
    },

    async registrarLlegada(id, idMesa, claveIdempotencia) {
      const r = await solicitar<ResultadoAsignacionDto>('POST', `/reservaciones/${id}/llegada`, {
        cuerpo: deLlegada(idMesa),
        claveIdempotencia,
      })
      return aResultadoAsignacion(r)
    },
  }
}
