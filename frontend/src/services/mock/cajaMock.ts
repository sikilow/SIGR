import type { CajaService } from '../interfaces'
import type { CobroPorMetodo, CorteCaja, CorteDetalle, VentaCaja } from '../../types'
import { ErrorServicio } from '../errores'
import { baseDatos } from './baseDatos'
import { conRetraso, conRetrasoIdempotente } from './utiles'

let corte: CorteCaja | null = null
/** Pagos del corte abierto (monto ya sin cambio), para el cuadre al cerrar. */
let pagosDelCorte: Array<{ idMetodo: number; monto: number }> = []
let ventasDelCorte = 0
const cortesCerrados: CorteDetalle[] = []
let siguienteCorte = 1
let siguienteVenta = 1

const metodos = [
  { idMetodo: 1, nombre: 'Efectivo' },
  { idMetodo: 2, nombre: 'Tarjeta' },
  { idMetodo: 3, nombre: 'Transferencia' },
]

const centavos = (monto: number): number => Math.round(monto * 100)

function desglose(): CobroPorMetodo[] {
  return metodos.map((metodo) => {
    const pagos = pagosDelCorte.filter((pago) => pago.idMetodo === metodo.idMetodo)
    return {
      metodo: metodo.nombre,
      cobros: pagos.length,
      monto: pagos.reduce((suma, pago) => suma + centavos(pago.monto), 0) / 100,
    }
  })
}

/** Fecha local AAAA-MM-DD, igual que el filtro de la pantalla. */
function diaLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

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
              meseroNombre: [...new Set(pedidos.map((pedido) => pedido.nombreMesero))].join(' · '),
              pedidosSinEntregar: pedidos
                .filter((pedido) => !['entregado', 'cancelado'].includes(pedido.estado))
                .map((pedido) => ({ idPedido: pedido.idPedido, estado: pedido.estado })),
            }
          }),
        metodosPago: structuredClone(metodos),
      }))
    },
    abrirCorte(fondoInicial) {
      return conRetraso(() => {
        if (corte) throw new ErrorServicio('estado_invalido', 'Ya tienes un corte de caja abierto.', 409)
        if (!Number.isFinite(fondoInicial) || fondoInicial < 0) {
          throw new ErrorServicio('estado_invalido', 'El fondo inicial debe ser un importe de 0 o más.', 422)
        }
        corte = { idCorte: siguienteCorte++, inicio: new Date(), fondoInicial, cobros: 0 }
        pagosDelCorte = []
        ventasDelCorte = 0
        return structuredClone(corte)
      })
    },
    cerrarCorte(efectivoContado) {
      return conRetraso(() => {
        if (!corte) throw new ErrorServicio('estado_invalido', 'No tienes un corte de caja abierto.', 409)
        if (!Number.isFinite(efectivoContado) || efectivoContado < 0) {
          throw new ErrorServicio('estado_invalido', 'El efectivo contado debe ser un importe de 0 o más.', 422)
        }
        const filas = desglose()
        const efectivo = filas.find((fila) => fila.metodo === 'Efectivo')?.monto ?? 0
        const esperado = (centavos(corte.fondoInicial) + centavos(efectivo)) / 100
        const cerrado: CorteDetalle = {
          idCorte: corte.idCorte,
          cajeroNombre: 'Marta Solís',
          inicio: corte.inicio,
          fin: new Date(),
          fondoInicial: corte.fondoInicial,
          cobros: ventasDelCorte,
          totalVentas: filas.reduce((suma, fila) => suma + centavos(fila.monto), 0) / 100,
          efectivoEsperado: esperado,
          efectivoContado,
          diferencia: (centavos(efectivoContado) - centavos(esperado)) / 100,
          totalReportado: null,
          desglose: filas,
        }
        cortesCerrados.unshift(cerrado)
        corte = null
        return structuredClone(cerrado)
      })
    },
    listarCortes(filtro = {}) {
      return conRetraso(() =>
        cortesCerrados
          .filter((item) => (!filtro.desde || diaLocal(item.inicio) >= filtro.desde) && (!filtro.hasta || diaLocal(item.inicio) <= filtro.hasta))
          .map(({ desglose: _desglose, ...resumen }) => structuredClone(resumen)),
      )
    },
    obtenerCorte(idCorte) {
      return conRetraso(() => {
        const encontrado = cortesCerrados.find((item) => item.idCorte === idCorte)
        if (!encontrado) throw new ErrorServicio('no_encontrado', 'El corte no existe o todavía está abierto.', 404)
        return structuredClone(encontrado)
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
        corte.cobros += 1
        ventasDelCorte += 1
        pagosDelCorte.push(...pagos.map((pago) => ({ idMetodo: pago.idMetodo, monto: pago.monto })))
        return venta
      })
    },
  }
}
