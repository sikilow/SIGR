import type { Mesa } from '../../types'
import { ErrorServicio } from '../errores'
import { esPedidoActivo } from '../../utils/reglas'
import type { MesasService } from '../interfaces'
import { baseDatos, caracteristicasDeMesa, esMesaParaLlevar, type CuentaGuardada, type MesaGuardada } from './baseDatos'
import { conRetraso } from './utiles'

/** Agrega a la mesa el resumen de su cuenta activa y de sus pedidos. */
function conResumen(mesaGuardada: MesaGuardada): Mesa {
  // La disponibilidad no viaja en el panel (solo se listan las mesas disponibles); la sección sí, como en GET /mesas.
  const { activa: _activa, ...mesa } = mesaGuardada
  const cuenta = baseDatos.cuentas.find((c) => c.idMesa === mesa.idMesa && c.estado !== 'cerrada')
  const pedidos = cuenta ? baseDatos.pedidos.filter((p) => p.idCuenta === cuenta.idCuenta) : []

  return {
    ...mesa,
    caracteristicas: caracteristicasDeMesa(mesaGuardada),
    estadoCuenta: cuenta && cuenta.estado !== 'cerrada' ? cuenta.estado : null,
    pedidosActivos: pedidos.filter((p) => esPedidoActivo(p.estado)).length,
    tipoPagoSolicitado: cuenta?.tipoPagoSolicitado ?? null,
    totalCuenta: pedidos.filter((p) => p.estado !== 'cancelado').reduce((suma, p) => suma + p.total, 0),
    pedidosListos: pedidos.filter((p) => p.estado === 'listo').length,
    ...(esMesaParaLlevar(mesaGuardada) ? { esParaLlevar: true, canal: cuenta?.canal ?? null, referencia: cuenta?.referencia ?? null } : {}),
  }
}

export function crearMesasMock(): MesasService {
  return {
    listar() {
      return conRetraso(() => baseDatos.mesas
        .filter((m) => m.activa && baseDatos.secciones.some((s) => s.nombre === m.zona && s.activa))
        .map(conResumen))
    },

    abrirParaLlevar(idCanal, referencia) {
      return conRetraso(() => {
        const canal = baseDatos.canales.find((c) => c.idCanal === idCanal)
        if (!canal || !canal.activo) throw new ErrorServicio('estado_invalido', 'Elige un canal de pedido activo.', 422)
        const mesa = baseDatos.mesas
          .filter(
            (m) =>
              m.activa &&
              m.estado === 'libre' &&
              esMesaParaLlevar(m) &&
              baseDatos.secciones.some((s) => s.nombre === m.zona && s.activa) &&
              !baseDatos.cuentas.some((c) => c.idMesa === m.idMesa && c.estado !== 'cerrada'),
          )
          .sort((a, b) => a.numero - b.numero)[0]
        if (!mesa) {
          throw new ErrorServicio(
            'mesa_no_disponible',
            'No hay mesas para llevar libres. Libera una sin pedidos o pide a Gerencia que agregue más en la sección «Para llevar».',
            409,
          )
        }
        mesa.estado = 'ocupada'
        const cuenta: CuentaGuardada = {
          idCuenta: baseDatos.siguienteIdCuenta++,
          idMesa: mesa.idMesa,
          estado: 'abierta',
          abiertaEn: new Date(),
          cerradaEn: null,
          tipoPagoSolicitado: null,
          idMetodoPagoSolicitado: null,
          idCanal: canal.idCanal,
          canal: canal.nombre,
          referencia: referencia?.trim() || null,
        }
        baseDatos.cuentas.push(cuenta)
        return {
          idMesa: mesa.idMesa,
          numero: mesa.numero,
          idCuenta: cuenta.idCuenta,
          idCanal: canal.idCanal,
          canal: canal.nombre,
          referencia: cuenta.referencia ?? null,
        }
      })
    },

    liberarParaLlevar(idMesa) {
      return conRetraso(() => {
        const mesa = baseDatos.mesas.find((m) => m.idMesa === idMesa)
        if (!mesa) throw new ErrorServicio('no_encontrado', `La mesa ${idMesa} no existe.`, 404)
        if (!esMesaParaLlevar(mesa)) {
          throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} no es una mesa para llevar.`, 409)
        }
        const cuenta = baseDatos.cuentas.find((c) => c.idMesa === idMesa && c.estado !== 'cerrada')
        if (cuenta) {
          const vigentes = baseDatos.pedidos.filter((p) => p.idCuenta === cuenta.idCuenta && p.estado !== 'cancelado')
          if (vigentes.length > 0) {
            throw new ErrorServicio('estado_invalido', 'El pedido tiene productos: cancélalos o cóbralo en Caja.', 409)
          }
          cuenta.estado = 'cerrada'
          cuenta.cerradaEn = new Date()
        }
        mesa.estado = 'libre'
      })
    },
  }
}
