import { DESCRIPCION_MOTIVO_MAX, DESCRIPCION_MOTIVO_MIN, type DetallePedido, type DisponibilidadProducto, type LineaNuevoPedido, type Pedido } from '../../types'
import { cancelacionRequiereGerente, meseroPuedeCancelar, puedeEditarOEnviar } from '../../utils/reglas'
import { ErrorServicio } from '../errores'
import type { PedidosService } from '../interfaces'
import { usuarioActual } from './authMock'
import { baseDatos } from './baseDatos'
import { buscarProducto } from './menuMock'
import { conRetraso, conRetrasoIdempotente, consumirFalloSimulado } from './utiles'

function buscarPedido(id: number): Pedido {
  const pedido = baseDatos.pedidos.find((p) => p.idPedido === id)
  if (!pedido) throw new ErrorServicio('no_encontrado', `El pedido ${id} no existe.`, 404)
  return pedido
}

function exigirPedidoPropio(pedido: Pedido): void {
  const usuario = usuarioActual()
  if (usuario?.rol === 'mesero' && pedido.idMesero !== usuario.idUsuario) {
    throw new ErrorServicio('sin_permiso', 'No tienes permiso para consultar o modificar un pedido de otro mesero.', 403)
  }
}

const totalDe = (detalle: DetallePedido[]): number =>
  detalle.reduce((suma, d) => suma + d.cantidad * d.precioUnitario, 0)

/** Productos de las líneas que están agotados (o ya no existen en el menú). */
function productosAgotados(lineas: Array<{ idProducto: number }>): DisponibilidadProducto[] {
  const ids = [...new Set(lineas.map((l) => l.idProducto))]
  return ids
    .filter((idProducto) => !buscarProducto(idProducto)?.disponible)
    .map((idProducto) => ({ idProducto, disponible: false }))
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
    const producto = buscarProducto(linea.idProducto)
    if (!producto) {
      throw new ErrorServicio('no_encontrado', `El producto ${linea.idProducto} no existe.`, 404)
    }
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) {
      throw new ErrorServicio('estado_invalido', 'La cantidad debe ser mayor que cero.', 422)
    }
    return {
      idProducto: producto.idProducto,
      nombreProducto: producto.nombre,
      cantidad: linea.cantidad,
      indicaciones: linea.indicaciones,
      precioUnitario: producto.precio,
    }
  })
}

export function crearPedidosMock(): PedidosService {
  return {
    crear(nuevo, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const mesa = baseDatos.mesas.find((m) => m.idMesa === nuevo.idMesa)
        if (!mesa) throw new ErrorServicio('no_encontrado', `La mesa ${nuevo.idMesa} no existe.`, 404)
        // Regla: solo se registran pedidos en mesas OCUPADAS (la hostess las ocupa).
        if (mesa.estado !== 'ocupada') {
          throw new ErrorServicio('mesa_no_disponible', `La mesa ${mesa.numero} no está ocupada.`, 409)
        }
        const detalle = construirDetalle(nuevo.detalle)

        // Una cuenta activa por mesa. Suposición: el primer pedido de una mesa ocupada sin
        // cuenta abre la cuenta (pregunta abierta para el equipo de API).
        let cuenta = baseDatos.cuentas.find((c) => c.idMesa === mesa.idMesa && c.estado !== 'cerrada')
        if (cuenta?.estado === 'por_pagar') {
          throw new ErrorServicio('estado_invalido', 'La cuenta ya solicitó el pago.', 409)
        }
        if (!cuenta) {
          cuenta = {
            idCuenta: baseDatos.siguienteIdCuenta++,
            idMesa: mesa.idMesa,
            estado: 'abierta',
            abiertaEn: new Date(),
            cerradaEn: null,
            tipoPagoSolicitado: null,
          }
          baseDatos.cuentas.push(cuenta)
        }

        const pedido: Pedido = {
          idPedido: baseDatos.siguienteIdPedido++,
          idMesa: mesa.idMesa,
          mesaNumero: mesa.numero,
          idCuenta: cuenta.idCuenta,
          idMesero: usuarioActual()?.idUsuario ?? 1,
          estado: 'registrado',
          detalle,
          total: totalDe(detalle),
          fechaHora: new Date(),
          idMotivo: null,
          motivoDescripcion: null,
        }
        baseDatos.pedidos.push(pedido)
        return pedido
      })
    },

    listar(filtro = {}) {
      return conRetraso(() => {
        const usuario = usuarioActual()
        return baseDatos.pedidos
          .filter((p) => filtro.idMesa === undefined || p.idMesa === filtro.idMesa)
          .filter((p) => filtro.estado === undefined || p.estado === filtro.estado)
          // Un mesero solo ve sus propios pedidos
          .filter((p) => usuario?.rol !== 'mesero' || p.idMesero === usuario.idUsuario)
          .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime())
      })
    },

    obtener(id) {
      return conRetraso(() => {
        const pedido = buscarPedido(id)
        exigirPedidoPropio(pedido)
        return pedido
      })
    },

    actualizar(id, lineas) {
      return conRetraso(() => {
        const pedido = buscarPedido(id)
        exigirPedidoPropio(pedido)
        // Solo se modifica mientras no se haya enviado a cocina.
        if (!puedeEditarOEnviar(pedido.estado)) {
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
        exigirPedidoPropio(pedido)
        // Fallo simulado (ver utiles.ts) para probar "Reintentar envío": falla ANTES de aplicar la acción.
        if (puedeEditarOEnviar(pedido.estado) && consumirFalloSimulado('sigr.mock.fallarEnvio')) {
          throw new ErrorServicio('desconocido', 'Fallo simulado al enviar a cocina.', 500)
        }
        if (!puedeEditarOEnviar(pedido.estado)) {
          throw new ErrorServicio('estado_invalido', 'Solo se puede enviar un pedido registrado.', 409)
        }
        // Se verifica de nuevo: un producto pudo agotarse entre el registro y el envío.
        const agotados = productosAgotados(pedido.detalle)
        if (agotados.length > 0) throw errorProductoAgotado(agotados)
        // El catálogo de la BD no tiene `enviado`: un pedido enviado a cocina queda `pendiente`
        // (las reglas lo tratan igual que `enviado`).
        pedido.estado = 'pendiente'
        return pedido
      })
    },

    cancelar(id, descripcion, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const pedido = buscarPedido(id)
        exigirPedidoPropio(pedido)
        const texto = descripcion.trim()
        if (texto.length < DESCRIPCION_MOTIVO_MIN || texto.length > DESCRIPCION_MOTIVO_MAX) {
          throw new ErrorServicio(
            'estado_invalido',
            `El motivo debe tener entre ${DESCRIPCION_MOTIVO_MIN} y ${DESCRIPCION_MOTIVO_MAX} caracteres.`,
            422,
          )
        }
        if (cancelacionRequiereGerente(pedido.estado)) {
          throw new ErrorServicio('requiere_gerente', 'El pedido está en preparación: solo el gerente puede cancelarlo.', 403)
        }
        if (!meseroPuedeCancelar(pedido.estado)) {
          throw new ErrorServicio('estado_invalido', 'Este pedido ya no se puede cancelar.', 409)
        }
        // SUPOSICIÓN (pregunta abierta c): con la cuenta ya solicitada no se cancelan pedidos.
        const cuenta = baseDatos.cuentas.find((c) => c.idCuenta === pedido.idCuenta)
        if (cuenta?.estado === 'por_pagar') {
          throw new ErrorServicio('estado_invalido', 'La cuenta ya solicitó el pago: no se pueden cancelar pedidos.', 409)
        }
        // Como en la BD: cada cancelación crea una fila en `motivo_cancelacion` y el pedido guarda su `id_motivo`.
        const motivo = { idMotivo: baseDatos.siguienteIdMotivo++, descripcion: texto }
        baseDatos.motivos.push(motivo)
        pedido.estado = 'cancelado'
        pedido.idMotivo = motivo.idMotivo
        pedido.motivoDescripcion = motivo.descripcion
        return pedido
      })
    },

    entregar(id, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const pedido = buscarPedido(id)
        exigirPedidoPropio(pedido)
        if (pedido.estado !== 'listo') {
          throw new ErrorServicio('estado_invalido', 'Solo se puede entregar un pedido que está listo.', 409)
        }
        pedido.estado = 'entregado'
        return pedido
      })
    },

    cambiarEstadoCocina(id, estado) {
      return conRetraso(() => {
        const pedido = buscarPedido(id)
        const requerido = estado === 'en_preparacion' ? 'pendiente' : 'en_preparacion'
        if (pedido.estado !== requerido) {
          throw new ErrorServicio('estado_invalido', `Para pasar a ${estado} el pedido debe estar en ${requerido}.`, 409)
        }
        pedido.estado = estado
        return pedido
      })
    },
  }
}
