import type { CajaService } from '../interfaces'
import type { CorteCaja, VentaCaja } from '../../types'
import { ErrorServicio } from '../errores'
import { baseDatos } from './baseDatos'
import { conRetraso, conRetrasoIdempotente } from './utiles'

let corte: CorteCaja | null = null
let siguienteVenta = 1

const metodos = [
  { idMetodo: 1, nombre: 'Efectivo' },
  { idMetodo: 2, nombre: 'Tarjeta' },
  { idMetodo: 3, nombre: 'Transferencia' },
]

export function crearCajaMock(): CajaService {
  return {
    obtenerEstado() {
      return conRetraso(() => ({
        corte: corte ? structuredClone(corte) : null,
        cuentas: baseDatos.cuentas
          .filter((cuenta) => cuenta.estado === 'por_pagar')
          .map((cuenta) => {
            const pedidos = baseDatos.pedidos.filter((pedido) => pedido.idCuenta === cuenta.idCuenta)
            return {
              cuenta: {
                ...cuenta,
                pedidos,
                total: pedidos.filter((pedido) => pedido.estado !== 'cancelado').reduce((suma, pedido) => suma + pedido.total, 0),
              },
              mesaNumero: baseDatos.mesas.find((mesa) => mesa.idMesa === cuenta.idMesa)?.numero ?? cuenta.idMesa,
              pedidosSinEntregar: pedidos
                .filter((pedido) => !['entregado', 'cancelado'].includes(pedido.estado))
                .map((pedido) => ({ idPedido: pedido.idPedido, estado: pedido.estado })),
            }
          }),
        metodosPago: structuredClone(metodos),
      }))
    },
    abrirCorte() {
      return conRetraso(() => {
        if (corte) throw new ErrorServicio('estado_invalido', 'Ya tienes un corte de caja abierto.', 409)
        corte = { idCorte: 1, inicio: new Date(), totalVentas: 0 }
        return structuredClone(corte)
      })
    },
    cerrarCorte(totalReportado) {
      return conRetraso(() => {
        if (!corte) throw new ErrorServicio('estado_invalido', 'No tienes un corte de caja abierto.', 409)
        const cerrado: CorteCaja = {
          ...corte,
          fin: new Date(),
          totalReportado,
          diferencia: Math.round((totalReportado - corte.totalVentas) * 100) / 100,
        }
        corte = null
        return cerrado
      })
    },
    cobrar(idCuenta, pagos, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        if (!corte) throw new ErrorServicio('estado_invalido', 'Abre un corte de caja antes de cobrar.', 409)
        const cuenta = baseDatos.cuentas.find((item) => item.idCuenta === idCuenta)
        if (!cuenta || cuenta.estado !== 'por_pagar') {
          throw new ErrorServicio('estado_invalido', 'Solo se pueden cobrar cuentas solicitadas por el mesero.', 409)
        }
        const pedidos = baseDatos.pedidos.filter((pedido) => pedido.idCuenta === idCuenta)
        const pendientes = pedidos.filter((pedido) => !['entregado', 'cancelado'].includes(pedido.estado))
        if (pendientes.length) throw new ErrorServicio('estado_invalido', 'Hay pedidos que aún no se han entregado.', 409)
        const total = pedidos.filter((pedido) => pedido.estado !== 'cancelado').reduce((suma, pedido) => suma + pedido.total, 0)
        const aplicado = pagos.reduce((suma, pago) => suma + Math.round(pago.monto * 100), 0)
        if (total <= 0 || aplicado !== Math.round(total * 100)) {
          throw new ErrorServicio('estado_invalido', 'La suma de los pagos debe cubrir exactamente el total de la cuenta.', 422)
        }
        const cambio = Math.round(pagos.reduce((suma, pago) => suma + (pago.montoRecibido - pago.monto), 0) * 100) / 100
        const venta: VentaCaja = {
          idVenta: siguienteVenta++,
          fechaHora: new Date(),
          total,
          idCuenta,
          mesaNumero: cuenta.idMesa,
          cambio,
          pagos: pagos.map((pago) => ({
            metodo: metodos.find((metodo) => metodo.idMetodo === pago.idMetodo)?.nombre ?? 'Desconocido',
            monto: pago.monto,
            montoRecibido: pago.montoRecibido,
            cambio: Math.round((pago.montoRecibido - pago.monto) * 100) / 100,
          })),
        }
        cuenta.estado = 'cerrada'
        cuenta.cerradaEn = new Date()
        pedidos.filter((pedido) => pedido.estado !== 'cancelado').forEach((pedido) => { pedido.estado = 'pagado' })
        const mesa = baseDatos.mesas.find((item) => item.idMesa === cuenta.idMesa)
        if (mesa) mesa.estado = 'libre'
        corte.totalVentas += total
        return venta
      })
    },
  }
}
