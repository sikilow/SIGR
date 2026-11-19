import type { CajaService } from '../interfaces'
import type { CobroPorMetodo, CorteCaja, CorteDetalle, VentaCaja } from '../../types'
import { ErrorServicio } from '../errores'
import { baseDatos } from './baseDatos'
import { categoriasMetodoPagoMock, metodosPagoMock } from './metodosPago'
import { reporteVentasMock } from './reporteVentasMock'
import { crearTicketsMock, devolucionesAprobadasEntre, devolucionesDelCorte, registrarVentaMock } from './ticketsMock'
import { usuarioActual } from './authMock'
import { conRetraso, conRetrasoIdempotente } from './utiles'

let corte: CorteCaja | null = null
/** Pagos del corte abierto (monto ya sin cambio), para el cuadre al cerrar. */
let pagosDelCorte: Array<{ idMetodo: number; monto: number }> = []
let ventasDelCorte = 0
const cortesCerrados: CorteDetalle[] = []
let siguienteCorte = 1
let siguienteVenta = 1

const centavos = (monto: number): number => Math.round(monto * 100)

function desglose(): CobroPorMetodo[] {
  const devueltas = corte ? devolucionesDelCorte(corte.idCorte).flatMap((d) => d.pagos) : []
  return metodosPagoMock.map((metodo) => {
    const pagos = pagosDelCorte.filter((pago) => pago.idMetodo === metodo.idMetodo)
    return {
      metodo: metodo.nombre,
      cobros: pagos.length,
      monto: pagos.reduce((suma, pago) => suma + centavos(pago.monto), 0) / 100,
      devuelto: devueltas.filter((p) => p.idMetodo === metodo.idMetodo).reduce((suma, p) => suma + centavos(p.monto), 0) / 100,
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
        corte: corte
          ? {
              ...structuredClone(corte),
              // Como la API: sin efectivo (se cuenta a ciegas al cerrar).
              desglose: desglose()
                .filter((m) => m.cobros > 0 && !metodosPagoMock.find((x) => x.nombre === m.metodo)?.esEfectivo)
                .sort((a, b) => b.monto - a.monto)
                .map(({ metodo, cobros, monto }) => ({ metodo, cobros, monto })),
            }
          : null,
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
        metodosPago: structuredClone(
          metodosPagoMock.filter(
            (metodo) => {
              const solicitado = baseDatos.cuentas.some(
                (cuenta) => cuenta.estado === 'por_pagar' && cuenta.idMetodoPagoSolicitado === metodo.idMetodo,
              )
              const categoria = categoriasMetodoPagoMock.find(
                (item) => item.idCategoriaMetodoPago === metodo.idCategoriaMetodoPago,
              )
              return (metodo.activo && Boolean(categoria?.activo)) || solicitado
            },
          ),
        ),
      }))
    },
    abrirCorte(fondoInicial) {
      return conRetraso(() => {
        if (corte) throw new ErrorServicio('estado_invalido', 'Ya iniciaste caja: cierra el corte actual antes de iniciar otro.', 409)
        if (!Number.isFinite(fondoInicial) || fondoInicial < 0) {
          throw new ErrorServicio('estado_invalido', 'El fondo inicial debe ser un importe de 0 o más.', 422)
        }
        corte = { idCorte: siguienteCorte++, inicio: new Date(), fondoInicial, cobros: 0, desglose: [] }
        pagosDelCorte = []
        ventasDelCorte = 0
        return structuredClone(corte)
      })
    },
    cerrarCorte(efectivoContado) {
      return conRetraso(() => {
        if (!corte) throw new ErrorServicio('estado_invalido', 'No has iniciado caja.', 409)
        if (!Number.isFinite(efectivoContado) || efectivoContado < 0) {
          throw new ErrorServicio('estado_invalido', 'El efectivo contado debe ser un importe de 0 o más.', 422)
        }
        const filas = desglose()
        const efectivo = pagosDelCorte
          .filter((pago) => metodosPagoMock.find((metodo) => metodo.idMetodo === pago.idMetodo)?.esEfectivo)
          .reduce((suma, pago) => suma + centavos(pago.monto), 0) / 100
        // Lo que se devolvió en efectivo sale de la caja: baja el efectivo esperado.
        const devueltoEfectivo = filas
          .filter((fila) => metodosPagoMock.find((metodo) => metodo.nombre === fila.metodo)?.esEfectivo)
          .reduce((suma, fila) => suma + centavos(fila.devuelto ?? 0), 0)
        const esperado = (centavos(corte.fondoInicial) + centavos(efectivo) - devueltoEfectivo) / 100
        const cerrado: CorteDetalle = {
          idCorte: corte.idCorte,
          cajeroNombre: 'Marta Solís',
          inicio: corte.inicio,
          fin: new Date(),
          fondoInicial: corte.fondoInicial,
          cobros: ventasDelCorte,
          totalVentas: filas.reduce((suma, fila) => suma + centavos(fila.monto), 0) / 100,
          totalDevuelto: filas.reduce((suma, fila) => suma + centavos(fila.devuelto ?? 0), 0) / 100,
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
        if (!corte) throw new ErrorServicio('estado_invalido', 'Inicia caja antes de cobrar.', 409)
        const cuenta = baseDatos.cuentas.find((item) => item.idCuenta === idCuenta)
        if (!cuenta || cuenta.estado !== 'por_pagar') {
          throw new ErrorServicio('estado_invalido', 'Solo se pueden cobrar cuentas solicitadas por el mesero.', 409)
        }
        const pedidos = baseDatos.pedidos.filter((pedido) => pedido.idCuenta === idCuenta)
        const pendientes = pedidos.filter((pedido) => !['entregado', 'cancelado'].includes(pedido.estado))
        if (pendientes.length) throw new ErrorServicio('estado_invalido', 'Hay pedidos que aún no se han entregado.', 409)
        if (cuenta.idMetodoPagoSolicitado !== null && !pagos.some((pago) => pago.idMetodo === cuenta.idMetodoPagoSolicitado)) {
          throw new ErrorServicio('estado_invalido', 'Incluye el método de pago que eligió el mesero para esta cuenta.', 422)
        }
        const metodosAplicados = pagos.map((pago) => metodosPagoMock.find((metodo) => metodo.idMetodo === pago.idMetodo))
        if (metodosAplicados.some((metodo) => {
          if (!metodo) return true
          const categoria = categoriasMetodoPagoMock.find((item) => item.idCategoriaMetodoPago === metodo.idCategoriaMetodoPago)
          const esSolicitado = metodo.idMetodo === cuenta.idMetodoPagoSolicitado
          return (!metodo.activo || !categoria?.activo) && !esSolicitado
        })) {
          throw new ErrorServicio('estado_invalido', 'Hay un método de pago inactivo o inexistente.', 422)
        }
        if (cuenta.tipoPagoSolicitado && !metodosAplicados.some((metodo) => metodo?.tipo === cuenta.tipoPagoSolicitado)) {
          throw new ErrorServicio('estado_invalido', 'El método cobrado no coincide con la categoría solicitada.', 422)
        }
        const total = pedidos.filter((pedido) => pedido.estado !== 'cancelado').reduce((suma, pedido) => suma + pedido.total, 0)
        const aplicado = pagos.reduce((suma, pago) => suma + Math.round(pago.monto * 100), 0)
        if (total <= 0 || aplicado !== Math.round(total * 100)) {
          throw new ErrorServicio('estado_invalido', 'La suma de los pagos debe cubrir exactamente el total de la cuenta.', 422)
        }
        const cambio = Math.round(pagos.reduce((suma, pago) => suma + (pago.montoRecibido - pago.monto), 0) * 100) / 100
        if (pagos.some((pago, i) => (pago.montoRecibido > pago.monto) && !metodosAplicados[i]?.esEfectivo)) {
          throw new ErrorServicio('estado_invalido', 'Solo se puede recibir un importe mayor al aplicado en pagos en efectivo.', 422)
        }
        const idVenta = siguienteVenta++
        const venta: VentaCaja = {
          idVenta,
          fechaHora: new Date(),
          total,
          idCuenta,
          mesaNumero: cuenta.idMesa,
          cambio,
          pagos: pagos.map((pago) => ({
            metodo: metodosPagoMock.find((metodo) => metodo.idMetodo === pago.idMetodo)?.nombre ?? 'Desconocido',
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
        registrarVentaMock({
          idVenta,
          idCuenta,
          fechaHora: venta.fechaHora,
          total,
          cajero: usuarioActual()?.nombre ?? 'Cajero',
          meseros: [...new Set(pedidos.map((pedido) => pedido.nombreMesero))].join(', '),
          mesaNumero: venta.mesaNumero,
          seccion: mesa?.zona ?? null,
          canal: null,
          referencia: null,
          lineas: pedidos
            .filter((pedido) => pedido.estado !== 'cancelado')
            .flatMap((pedido) => pedido.detalle)
            .map((linea, i) => ({
              idDetalle: idVenta * 1000 + i + 1,
              idProducto: linea.idProducto,
              producto: linea.nombreProducto,
              presentacion: null,
              cantidad: linea.cantidad,
              precioUnitario: linea.precioUnitario,
              indicaciones: linea.indicaciones || null,
            })),
          pagos: venta.pagos.map((pago, i) => ({
            idMetodo: pagos[i]!.idMetodo,
            metodo: pago.metodo,
            esEfectivo: metodosAplicados[i]?.esEfectivo ?? false,
            monto: pago.monto,
            montoRecibido: pago.montoRecibido,
            cambio: pago.cambio,
          })),
        })
        corte.cobros += 1
        ventasDelCorte += 1
        pagosDelCorte.push(...pagos.map((pago) => ({ idMetodo: pago.idMetodo, monto: pago.monto })))
        return venta
      })
    },
    reporteVentas(desde, hasta) {
      return conRetraso(() => {
        if (desde > hasta) throw new ErrorServicio('estado_invalido', 'La fecha inicial no puede ser posterior a la final.', 422)
        const reporte = reporteVentasMock(desde, hasta)
        const devueltas = devolucionesAprobadasEntre(desde, hasta)
        reporte.resumen.devoluciones = devueltas.cantidad
        reporte.resumen.devuelto = devueltas.total
        reporte.resumen.neto = (centavos(reporte.resumen.total) - centavos(devueltas.total)) / 100
        return reporte
      })
    },
    ...crearTicketsMock(() => corte?.idCorte ?? null),
  }
}
