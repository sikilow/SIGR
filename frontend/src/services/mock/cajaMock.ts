import type { CajaService } from '../interfaces'
import type { CorteCaja, TipoCierreCaja, VentaCaja, VentaCajaReporte } from '../../types'
import { ErrorServicio } from '../errores'
import { baseDatos } from './baseDatos'
import { metodosPagoMock } from './metodosPago'
import { conRetraso, conRetrasoIdempotente } from './utiles'

let corte: CorteCaja | null = null
let siguienteVenta = 1
let siguienteCorte = 1
const ventasRegistradas: Array<VentaCajaReporte & { idCorte: number }> = []

function resumirCorte(abierto: CorteCaja): CorteCaja {
  const ventas = ventasRegistradas.filter((venta) => venta.idCorte === abierto.idCorte)
  const metodosPago = metodosPagoMock.map((metodo) => ({
    idMetodo: metodo.idMetodo,
    nombre: metodo.nombre,
    cantidadPagos: ventas.reduce((total, venta) => total + venta.pagos.filter((pago) => pago.metodo === metodo.nombre).length, 0),
    monto: ventas.reduce(
      (total, venta) => total + venta.pagos.filter((pago) => pago.metodo === metodo.nombre).reduce((suma, pago) => suma + pago.monto, 0),
      0,
    ),
  }))
  const efectivo = metodosPago.find((metodo) => metodo.nombre === 'Efectivo')?.monto ?? 0
  return {
    ...abierto,
    totalVentas: ventas.reduce((total, venta) => total + venta.total, 0),
    efectivoEsperado: Math.round((abierto.efectivoInicial + efectivo) * 100) / 100,
    metodosPago,
    ventas: ventas.map(({ idCorte: _idCorte, ...venta }) => venta),
  }
}

export function crearCajaMock(): CajaService {
  return {
    obtenerEstado() {
      return conRetraso(() => ({
        corte: corte ? structuredClone(resumirCorte(corte)) : null,
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
              meseroNombre: [...new Set(pedidos.map((pedido) => pedido.nombreMesero))].join(' · '),
              pedidosSinEntregar: pedidos
                .filter((pedido) => !['entregado', 'cancelado'].includes(pedido.estado))
                .map((pedido) => ({ idPedido: pedido.idPedido, estado: pedido.estado })),
            }
          }),
        metodosPago: structuredClone(metodosPagoMock.filter((metodo) => metodo.activo)),
      }))
    },
    abrirCorte(efectivoInicial) {
      return conRetraso(() => {
        if (corte) throw new ErrorServicio('estado_invalido', 'Ya tienes un corte de caja abierto.', 409)
        corte = {
          idCorte: siguienteCorte++,
          idCajero: 1,
          cajeroNombre: 'Cajero demo',
          inicio: new Date(),
          efectivoInicial,
          totalVentas: 0,
          efectivoEsperado: efectivoInicial,
          metodosPago: [],
          ventas: [],
          fin: null,
          tipoCierre: null,
          efectivoContado: null,
          diferenciaEfectivo: null,
        }
        return structuredClone(resumirCorte(corte))
      })
    },
    cerrarCorte(efectivoContado, tipoCierre: TipoCierreCaja) {
      return conRetraso(() => {
        if (!corte) throw new ErrorServicio('estado_invalido', 'No tienes un corte de caja abierto.', 409)
        const resumen = resumirCorte(corte)
        const cerrado: CorteCaja = {
          ...resumen,
          fin: new Date(),
          tipoCierre,
          efectivoContado,
          diferenciaEfectivo: Math.round((efectivoContado - resumen.efectivoEsperado) * 100) / 100,
        }
        corte = null
        return cerrado
      })
    },
    cobrar(idCuenta, pagos, claveIdempotencia, confirmarCambioMetodo = false) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        if (!corte) throw new ErrorServicio('estado_invalido', 'Abre un corte de caja antes de cobrar.', 409)
        const cuenta = baseDatos.cuentas.find((item) => item.idCuenta === idCuenta)
        if (!cuenta || cuenta.estado !== 'por_pagar') {
          throw new ErrorServicio('estado_invalido', 'Solo se pueden cobrar cuentas solicitadas por el mesero.', 409)
        }
        const nombresPago = pagos.map((pago) => metodosPagoMock.find((metodo) => metodo.idMetodo === pago.idMetodo && metodo.activo)?.nombre.toLowerCase())
        const coincideSolicitud = cuenta.tipoPagoSolicitado === 'fisico'
          ? nombresPago.includes('efectivo')
          : cuenta.tipoPagoSolicitado === 'digital'
            ? nombresPago.some((nombre) => !!nombre && nombre !== 'efectivo')
            : true
        if (!coincideSolicitud && !confirmarCambioMetodo) {
          throw new ErrorServicio(
            'estado_invalido',
            'El método cobrado no coincide con el solicitado por el mesero. Confirma el cambio antes de continuar.',
            422,
          )
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
            metodo: metodosPagoMock.find((metodo) => metodo.idMetodo === pago.idMetodo && metodo.activo)?.nombre ?? 'Desconocido',
            monto: pago.monto,
            montoRecibido: pago.montoRecibido,
            cambio: Math.round((pago.montoRecibido - pago.monto) * 100) / 100,
          })),
        }
        ventasRegistradas.push({
          ...venta,
          idCorte: corte.idCorte,
          cajeroNombre: corte.cajeroNombre,
          meseroNombre: [...new Set(pedidos.map((pedido) => pedido.nombreMesero))].join(' · '),
        })
        cuenta.estado = 'cerrada'
        cuenta.cerradaEn = new Date()
        pedidos.filter((pedido) => pedido.estado !== 'cancelado').forEach((pedido) => { pedido.estado = 'pagado' })
        const mesa = baseDatos.mesas.find((item) => item.idMesa === cuenta.idMesa)
        if (mesa) mesa.estado = 'libre'
        return venta
      })
    },
  }
}
