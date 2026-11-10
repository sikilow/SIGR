import type { CajaService } from '../interfaces'
import type { CuentaDto } from './mappers'
import { aCuenta } from './mappers'
import { parseFechaMySQL } from './conversion'
import { solicitar } from './cliente'
import type { CorteCaja, CorteDetalle, CorteResumen, EstadoCaja, VentaCaja } from '../../types'

interface CorteDto {
  id_corte: number | string
  inicio: string
  fondo_inicial: number | string
  cobros: number | string
}

type Importe = number | string

interface CorteResumenDto {
  id_corte: number | string
  cajero_nombre: string
  inicio: string
  fin: string
  fondo_inicial: Importe
  cobros: number | string
  total_ventas: Importe
  efectivo_esperado: Importe | null
  efectivo_contado: Importe | null
  diferencia: Importe | null
  total_reportado: Importe | null
}

interface CorteDetalleDto extends CorteResumenDto {
  efectivo_esperado: Importe
  desglose: Array<{ metodo: string; cobros: number | string; monto: Importe }>
}

interface EstadoDto {
  corte: CorteDto | null
  cuentas: Array<{
    cuenta: CuentaDto
    mesa_numero: number | string
    mesero_nombre?: string | null
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
    fondoInicial: Number(dto.fondo_inicial),
    cobros: Number(dto.cobros),
  }
}

const numeroONulo = (valor: Importe | null): number | null => (valor === null ? null : Number(valor))

function aCorteResumen(dto: CorteResumenDto): CorteResumen {
  return {
    idCorte: Number(dto.id_corte),
    cajeroNombre: dto.cajero_nombre,
    inicio: parseFechaMySQL(dto.inicio, 'corte.inicio'),
    fin: parseFechaMySQL(dto.fin, 'corte.fin'),
    fondoInicial: Number(dto.fondo_inicial),
    cobros: Number(dto.cobros),
    totalVentas: Number(dto.total_ventas),
    efectivoEsperado: numeroONulo(dto.efectivo_esperado),
    efectivoContado: numeroONulo(dto.efectivo_contado),
    diferencia: numeroONulo(dto.diferencia),
    totalReportado: numeroONulo(dto.total_reportado),
  }
}

function aCorteDetalle(dto: CorteDetalleDto): CorteDetalle {
  return {
    ...aCorteResumen(dto),
    efectivoEsperado: Number(dto.efectivo_esperado),
    desglose: dto.desglose.map((fila) => ({ metodo: fila.metodo, cobros: Number(fila.cobros), monto: Number(fila.monto) })),
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
          meseroNombre: item.mesero_nombre ?? '',
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
    async abrirCorte(fondoInicial) {
      return aCorte(await solicitar<CorteDto>('POST', '/caja/cortes', { cuerpo: { fondo_inicial: fondoInicial } }))
    },
    async cerrarCorte(efectivoContado) {
      return aCorteDetalle(
        await solicitar<CorteDetalleDto>('POST', '/caja/cortes/cerrar', {
          cuerpo: { efectivo_contado: efectivoContado },
        }),
      )
    },
    async listarCortes(filtro = {}) {
      const dto = await solicitar<CorteResumenDto[]>('GET', '/caja/cortes', {
        consulta: { desde: filtro.desde, hasta: filtro.hasta },
      })
      return dto.map(aCorteResumen)
    },
    async obtenerCorte(idCorte) {
      return aCorteDetalle(await solicitar<CorteDetalleDto>('GET', `/caja/cortes/${idCorte}`))
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
