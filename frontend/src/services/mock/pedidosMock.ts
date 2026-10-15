import { MOTIVO_MAX, MOTIVO_MIN, type DetallePedido, type DisponibilidadProducto, type LineaNuevoPedido, type Pedido } from '../../types'
import { cancelacionRequiereGerente, meseroPuedeCancelar } from '../../utils/reglas'
import { ErrorServicio } from '../errores'
import type { PedidosService } from '../interfaces'
import { usuarioActual } from './authMock'
import { baseDatos } from './baseDatos'
import { buscarProducto } from './menuMock'
import { conRetraso, conRetrasoIdempotente, consumirFalloSimulado } from './utiles'

function buscarPedido(id: number): Pedido {
  const pedido = baseDatos.pedidos.find((p) => p.id === id)
  if (!pedido) throw new ErrorServicio('no_encontrado', `El pedido ${id} no existe.`, 404)
  return pedido
}

const totalDe = (detalle: DetallePedido[]): number =>
  detalle.reduce((suma, d) => suma + d.cantidad * d.precioUnitario, 0)

/** Productos de las líneas que están agotados (o ya no existen en el menú). */
function productosAgotados(lineas: Array<{ productoId: number }>): DisponibilidadProducto[] {
  const ids = [...new Set(lineas.map((l) => l.productoId))]
  return ids
    .filter((productoId) => !buscarProducto(productoId)?.disponible)
    .map((productoId) => ({ productoId, disponible: false }))
}

function errorProductoAgotado(agotados: DisponibilidadProducto[]): ErrorServicio {
  return new ErrorServicio('producto_agotado', 'Hay productos agotados en el pedido.', 409, agotados)
}

/** Valida las líneas contra el menú y devuelve el detalle con los precios vigentes (el cliente no manda precios). */
function construirDetalle(lineas: LineaNuevoPedido[]): DetallePedido[] {
  if (lineas.length === 0) {
    throw new ErrorServicio('estado_invalido', 'El pedido no tiene productos.', 422)
  }
  const agotados = productosAgotados(lineas)
  if (agotados.length > 0) throw errorProductoAgotado(agotados)

  return lineas.map((linea) => {
    const producto = buscarProducto(linea.productoId)
    if (!producto) {
      throw new ErrorServicio('no_encontrado', `El producto ${linea.productoId} no existe.`, 404)
    }
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) {
      throw new ErrorServicio('estado_invalido', 'La cantidad debe ser mayor que cero.', 422)
    }
    return {
      productoId: producto.id,
      nombreProducto: producto.nombre,
      cantidad: linea.cantidad,
      observaciones: linea.observaciones,
      precioUnitario: producto.precio,
    }
  })
}

export function crearPedidosMock(): PedidosService {
  return {
    crear(nuevo, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const mesa = baseDatos.mesas.find((m) => m.id === nuevo.mesaId)
        if (!mesa) throw new ErrorServicio('no_encontrado', `La mesa ${nuevo.mesaId} no existe.`, 404)
        // Regla: solo se registran pedidos en mesas OCUPADAS (la hostess las ocupa).
        if (mesa.estado !== 'ocupada') {
          throw new ErrorServicio('mesa_no_disponible', `La mesa ${mesa.numero} no está ocupada.`, 409)
        }
        const detalle = construirDetalle(nuevo.detalle)

        // Una cuenta activa por mesa. Suposición: el primer pedido de una mesa ocupada sin
        // cuenta abre la cuenta (pregunta abierta para el equipo de API).
        let cuenta = baseDatos.cuentas.find((c) => c.mesaId === mesa.id && c.estado !== 'cerrada')
        if (cuenta?.estado === 'por_pagar') {
          throw new ErrorServicio('estado_invalido', 'La cuenta ya solicitó el pago.', 409)
        }
        if (!cuenta) {
          cuenta = {
            id: baseDatos.siguienteIdCuenta++,
            mesaId: mesa.id,
            estado: 'abierta',
            abiertaEn: new Date().toISOString(),
            tipoPagoSolicitado: null,
          }
          baseDatos.cuentas.push(cuenta)
        }

        const pedido: Pedido = {
          id: baseDatos.siguienteIdPedido++,
          mesaId: mesa.id,
          mesaNumero: mesa.numero,
          cuentaId: cuenta.id,
          meseroId: usuarioActual()?.id ?? 1,
          estado: 'registrado',
          detalle,
          total: totalDe(detalle),
          creadoEn: new Date().toISOString(),
          motivoCancelacion: null,
        }
        baseDatos.pedidos.push(pedido)
        return pedido
      })
    },

    listar(filtro = {}) {
      return conRetraso(() => {
        const usuario = usuarioActual()
        return baseDatos.pedidos
          .filter((p) => filtro.mesaId === undefined || p.mesaId === filtro.mesaId)
          .filter((p) => filtro.estado === undefined || p.estado === filtro.estado)
          // Un mesero solo ve sus propios pedidos
          .filter((p) => usuario?.rol !== 'mesero' || p.meseroId === usuario.id)
          .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      })
    },

    obtener(id) {
      return conRetraso(() => buscarPedido(id))
    },

    actualizar(id, lineas) {
      return conRetraso(() => {
        const pedido = buscarPedido(id)
        // Solo se modifica mientras no se haya enviado a cocina.
        if (pedido.estado !== 'registrado') {
          throw new ErrorServicio('estado_invalido', 'El pedido ya no está en estado registrado.', 409)
        }
        pedido.detalle = construirDetalle(lineas)
        pedido.total = totalDe(pedido.detalle)
        return pedido
      })
    },

    enviar(id, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const pedido = buscarPedido(id)
        // Fallo simulado (ver utiles.ts) para probar "Reintentar envío": falla ANTES de aplicar la acción.
        if (pedido.estado === 'registrado' && consumirFalloSimulado('sigr.mock.fallarEnvio')) {
          throw new ErrorServicio('desconocido', 'Fallo simulado al enviar a cocina.', 500)
        }
        if (pedido.estado !== 'registrado') {
          throw new ErrorServicio('estado_invalido', 'Solo se puede enviar un pedido registrado.', 409)
        }
        // Se verifica de nuevo: un producto pudo agotarse entre el registro y el envío.
        const agotados = productosAgotados(pedido.detalle)
        if (agotados.length > 0) throw errorProductoAgotado(agotados)
        pedido.estado = 'enviado'
        return pedido
      })
    },

    cancelar(id, motivo, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const pedido = buscarPedido(id)
        const texto = motivo.trim()
        if (texto.length < MOTIVO_MIN || texto.length > MOTIVO_MAX) {
          throw new ErrorServicio('estado_invalido', `El motivo debe tener entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres.`, 422)
        }
        if (cancelacionRequiereGerente(pedido.estado)) {
          throw new ErrorServicio('requiere_gerente', 'El pedido está en preparación: solo el gerente puede cancelarlo.', 403)
        }
        if (!meseroPuedeCancelar(pedido.estado)) {
          throw new ErrorServicio('estado_invalido', 'Este pedido ya no se puede cancelar.', 409)
        }
        // SUPOSICIÓN (pregunta abierta c): con la cuenta ya solicitada no se cancelan pedidos.
        const cuenta = baseDatos.cuentas.find((c) => c.id === pedido.cuentaId)
        if (cuenta?.estado === 'por_pagar') {
          throw new ErrorServicio('estado_invalido', 'La cuenta ya solicitó el pago: no se pueden cancelar pedidos.', 409)
        }
        pedido.estado = 'cancelado'
        pedido.motivoCancelacion = texto
        return pedido
      })
    },

    // CAMBIO PROPUESTO EN F5
    entregar(id, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const pedido = buscarPedido(id)
        if (pedido.estado !== 'listo') {
          throw new ErrorServicio('estado_invalido', 'Solo se puede entregar un pedido que está listo.', 409)
        }
        pedido.estado = 'entregado'
        return pedido
      })
    },
  }
}
