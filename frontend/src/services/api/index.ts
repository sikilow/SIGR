// Implementación de los servicios contra la API real (endpoints propuestos en
// docs/contrato-api-mesero.md). Solo se usa con VITE_USE_MOCK=false.
import { ErrorServicio } from '../errores'
import type { Servicios } from '../interfaces'
import { solicitar } from './cliente'
import {
  aCategoriaMenu,
  aCuenta,
  aDisponibilidad,
  aMesa,
  aPedido,
  aUsuario,
  deActualizacionPedido,
  deCancelacion,
  deCredenciales,
  deItemsDisponibilidad,
  deNuevoPedido,
  deSolicitudPago,
  type CategoriaMenuDto,
  type CuentaDto,
  type DisponibilidadDto,
  type MesaDto,
  type PedidoDto,
  type UsuarioDto,
} from './mappers'

export function crearServiciosApi(): Servicios {
  return {
    auth: {
      async iniciarSesion(credenciales) {
        const r = await solicitar<{ usuario: UsuarioDto }>('POST', '/auth/login', { cuerpo: deCredenciales(credenciales) })
        return aUsuario(r.usuario)
      },

      async cerrarSesion() {
        await solicitar<void>('POST', '/auth/logout')
      },

      async obtenerSesion() {
        try {
          const r = await solicitar<{ usuario: UsuarioDto }>('GET', '/auth/me')
          return aUsuario(r.usuario)
        } catch (error) {
          // Sin sesión no es un fallo: simplemente no hay usuario.
          if (error instanceof ErrorServicio && error.codigo === 'no_autenticado') return null
          throw error
        }
      },
    },

    mesas: {
      async listar() {
        const r = await solicitar<MesaDto[]>('GET', '/mesas')
        return r.map(aMesa)
      },
    },

    menu: {
      async obtenerMenu() {
        const r = await solicitar<CategoriaMenuDto[]>('GET', '/menu')
        return r.map(aCategoriaMenu)
      },

      async verificarDisponibilidad(items) {
        const r = await solicitar<{ items: DisponibilidadDto[] }>('POST', '/productos/disponibilidad', {
          cuerpo: deItemsDisponibilidad(items),
        })
        return r.items.map(aDisponibilidad)
      },
    },

    pedidos: {
      async crear(pedido, claveIdempotencia) {
        const r = await solicitar<PedidoDto>('POST', '/pedidos', { cuerpo: deNuevoPedido(pedido), claveIdempotencia })
        return aPedido(r)
      },

      async listar(filtro = {}) {
        const r = await solicitar<PedidoDto[]>('GET', '/pedidos', {
          consulta: { id_mesa: filtro.idMesa, estado: filtro.estado },
        })
        return r.map(aPedido)
      },

      async obtener(id) {
        return aPedido(await solicitar<PedidoDto>('GET', `/pedidos/${id}`))
      },

      async actualizar(id, detalle) {
        const cuerpo = deActualizacionPedido(detalle)
        return aPedido(await solicitar<PedidoDto>('PATCH', `/pedidos/${id}`, { cuerpo }))
      },

      async enviar(id, claveIdempotencia) {
        return aPedido(await solicitar<PedidoDto>('POST', `/pedidos/${id}/enviar`, { claveIdempotencia }))
      },

      async cancelar(id, descripcion, claveIdempotencia) {
        const cuerpo = deCancelacion(descripcion)
        return aPedido(await solicitar<PedidoDto>('POST', `/pedidos/${id}/cancelar`, { cuerpo, claveIdempotencia }))
      },

      async entregar(id, claveIdempotencia) {
        return aPedido(await solicitar<PedidoDto>('POST', `/pedidos/${id}/entregar`, { claveIdempotencia }))
      },
    },

    cuentas: {
      async obtenerPorMesa(idMesa) {
        try {
          return aCuenta(await solicitar<CuentaDto>('GET', `/mesas/${idMesa}/cuenta`))
        } catch (error) {
          // Una mesa sin cuenta activa (p. ej. disponible): la API responde 404 con `no_encontrado`.
          if (error instanceof ErrorServicio && error.codigo === 'no_encontrado') return null
          throw error
        }
      },

      async solicitarPago(idCuenta, tipo, claveIdempotencia) {
        const cuerpo = deSolicitudPago(tipo)
        return aCuenta(
          await solicitar<CuentaDto>('POST', `/cuentas/${idCuenta}/solicitar-pago`, { cuerpo, claveIdempotencia }),
        )
      },
    },
  }
}
