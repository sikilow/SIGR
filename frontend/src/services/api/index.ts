// Implementación de los servicios contra la API real (backend/ de este repo, rutas /api/...).
// Solo se usa con VITE_USE_MOCK=false.
import { ErrorServicio } from '../errores'
import type { Servicios } from '../interfaces'
import { solicitar } from './cliente'
import { guardarToken, leerToken, limpiarToken } from './token'
import {
  aCategoriaAdmin,
  aCategoriaMenu,
  aCuenta,
  aDisponibilidad,
  aMesa,
  aPedido,
  aProductoAdmin,
  aUsuario,
  aUsuarioAdmin,
  deCambioProducto,
  deCambioUsuario,
  deActualizacionPedido,
  deCancelacion,
  deCredenciales,
  deItemsDisponibilidad,
  deNuevoPedido,
  deNuevoProducto,
  deNuevoUsuario,
  deSolicitudPago,
  type CategoriaAdminDto,
  type CategoriaMenuDto,
  type CuentaDto,
  type DisponibilidadDto,
  type MesaDto,
  type PedidoDto,
  type ProductoAdminDto,
  type UsuarioAdminDto,
  type UsuarioDto,
} from './mappers'

export function crearServiciosApi(): Servicios {
  return {
    auth: {
      async iniciarSesion(credenciales) {
        const r = await solicitar<{ token: string; usuario: UsuarioDto }>('POST', '/auth/login', {
          cuerpo: deCredenciales(credenciales),
        })
        guardarToken(r.token)
        return aUsuario(r.usuario)
      },

      async cerrarSesion() {
        // El token es un JWT sin estado en el servidor: cerrar sesión es olvidarlo aquí.
        limpiarToken()
      },

      async obtenerSesion() {
        // Sin token no hay nada que recuperar (y nos ahorramos una petición).
        if (!leerToken()) return null
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

    usuarios: {
      async listar() {
        const r = await solicitar<UsuarioAdminDto[]>('GET', '/usuarios')
        return r.map(aUsuarioAdmin)
      },

      async crear(usuario) {
        return aUsuarioAdmin(await solicitar<UsuarioAdminDto>('POST', '/usuarios', { cuerpo: deNuevoUsuario(usuario) }))
      },

      async actualizar(id, cambio) {
        const cuerpo = deCambioUsuario(cambio)
        return aUsuarioAdmin(await solicitar<UsuarioAdminDto>('PATCH', `/usuarios/${id}`, { cuerpo }))
      },

      async cambiarContrasena(id, contrasena) {
        await solicitar<{ ok: boolean }>('POST', `/usuarios/${id}/contrasena`, { cuerpo: { contrasena } })
      },
    },

    catalogo: {
      async listarCategorias() {
        const r = await solicitar<CategoriaAdminDto[]>('GET', '/catalogo/categorias')
        return r.map(aCategoriaAdmin)
      },

      async crearCategoria(nombre) {
        const r = await solicitar<CategoriaAdminDto>('POST', '/catalogo/categorias', { cuerpo: { nombre: nombre.trim() } })
        return aCategoriaAdmin(r)
      },

      async renombrarCategoria(id, nombre) {
        const cuerpo = { nombre: nombre.trim() }
        return aCategoriaAdmin(await solicitar<CategoriaAdminDto>('PATCH', `/catalogo/categorias/${id}`, { cuerpo }))
      },

      async eliminarCategoria(id) {
        await solicitar<{ ok: boolean }>('DELETE', `/catalogo/categorias/${id}`)
      },

      async listarProductos() {
        const r = await solicitar<ProductoAdminDto[]>('GET', '/catalogo/productos')
        return r.map(aProductoAdmin)
      },

      async crearProducto(producto) {
        const cuerpo = deNuevoProducto(producto)
        return aProductoAdmin(await solicitar<ProductoAdminDto>('POST', '/catalogo/productos', { cuerpo }))
      },

      async actualizarProducto(id, cambio) {
        const cuerpo = deCambioProducto(cambio)
        return aProductoAdmin(await solicitar<ProductoAdminDto>('PATCH', `/catalogo/productos/${id}`, { cuerpo }))
      },
    },
  }
}
