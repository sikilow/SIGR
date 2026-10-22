import type { CajaService } from '../interfaces'
import type { CuentaDto } from './mappers'
import { aCuenta } from './mappers'
import { parseFechaMySQL } from './conversion'
import { solicitar } from './cliente'
import type { CorteCaja, EstadoCaja, VentaCaja } from '../../types'

interface CorteDto {
  id_corte: number | string
  inicio: string
  total_ventas: number | string
  fin?: string
  total_reportado?: number | string
  diferencia?: number | string
}

interface EstadoDto {
  corte: CorteDto | null
  cuentas: Array<{
    cuenta: CuentaDto
    mesa_numero: number | string
    pedidos_sin_entregar: Array<{ id_pedido: number | string; estado: string }>
  }>
  metodos_pago: Array<{ id_metodo: number | string; nombre: string }>
}

interface VentaDto {
  id_venta: number | string
  fecha_hora: string
  total: number | string
  id_cuenta: number | string
  mesa_numero: number | string
  cambio: number | string
  pagos: Array<{
    metodo: string
    monto: number | string
    monto_recibido: number | string
    cambio: number | string
  }>
}

function aCorte(dto: CorteDto): CorteCaja {
  return {
    idCorte: Number(dto.id_corte),
    inicio: parseFechaMySQL(dto.inicio, 'corte.inicio'),
    totalVentas: Number(dto.total_ventas),
    ...(dto.fin ? { fin: parseFechaMySQL(dto.fin, 'corte.fin') } : {}),
    ...(dto.total_reportado !== undefined ? { totalReportado: Number(dto.total_reportado) } : {}),
    ...(dto.diferencia !== undefined ? { diferencia: Number(dto.diferencia) } : {}),
  }
}

function aVenta(dto: VentaDto): VentaCaja {
  return {
    idVenta: Number(dto.id_venta),
    fechaHora: parseFechaMySQL(dto.fecha_hora, 'venta.fecha_hora'),
    total: Number(dto.total),
    idCuenta: Number(dto.id_cuenta),
    mesaNumero: Number(dto.mesa_numero),
    cambio: Number(dto.cambio),
    pagos: dto.pagos.map((pago) => ({
      metodo: pago.metodo,
      monto: Number(pago.monto),
      montoRecibido: Number(pago.monto_recibido),
      cambio: Number(pago.cambio),
    })),
  }
}

export function crearCajaApi(): CajaService {
  return {
    async obtenerEstado(): Promise<EstadoCaja> {
      const dto = await solicitar<EstadoDto>('GET', '/caja/estado')
      return {
        corte: dto.corte ? aCorte(dto.corte) : null,
        cuentas: dto.cuentas.map((item) => ({
          cuenta: aCuenta(item.cuenta),
          mesaNumero: Number(item.mesa_numero),
          pedidosSinEntregar: item.pedidos_sin_entregar.map((pedido) => ({
            idPedido: Number(pedido.id_pedido),
            estado: pedido.estado,
          })),
        })),
        metodosPago: dto.metodos_pago.map((metodo) => ({
          idMetodo: Number(metodo.id_metodo),
          nombre: metodo.nombre,
        })),
      }
    },
    async abrirCorte() {
      return aCorte(await solicitar<CorteDto>('POST', '/caja/cortes', { cuerpo: {} }))
    },
    async cerrarCorte(totalReportado) {
      return aCorte(
        await solicitar<CorteDto>('POST', '/caja/cortes/cerrar', {
          cuerpo: { total_reportado: totalReportado },
        }),
      )
    },
    async cobrar(idCuenta, pagos, claveIdempotencia) {
      const dto = await solicitar<{ venta: VentaDto }>('POST', `/caja/cuentas/${idCuenta}/cobrar`, {
        cuerpo: {
          pagos: pagos.map((pago) => ({
            id_metodo: pago.idMetodo,
            monto: pago.monto,
            monto_recibido: pago.montoRecibido,
          })),
        },
        claveIdempotencia,
      })
      return aVenta(dto.venta)
    },
  }
}
