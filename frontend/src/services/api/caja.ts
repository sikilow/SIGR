import type { CajaService } from '../interfaces'
import type { CuentaDto } from './mappers'
import { aCuenta } from './mappers'
import { parseFechaMySQL } from './conversion'
import { solicitar } from './cliente'
import type { CorteCaja, EstadoCaja, TipoCierreCaja, VentaCaja } from '../../types'

interface CorteDto {
  id_corte: number | string
  id_cajero: number | string
  cajero_nombre: string
  inicio: string
  efectivo_inicial: number | string
  total_ventas: number | string
  efectivo_esperado: number | string
  efectivo_contado: number | string | null
  diferencia_efectivo: number | string | null
  tipo_cierre: TipoCierreCaja | null
  metodos_pago: Array<{ id_metodo: number | string; nombre: string; cantidad_pagos: number | string; monto: number | string }>
  ventas: Array<{
    id_venta: number | string
    id_cuenta: number | string
    mesa_numero: number | string
    fecha_hora: string
    total: number | string
    cajero_nombre: string
    mesero_nombre: string
    pagos: Array<{ metodo: string; monto: number | string; monto_recibido: number | string; cambio: number | string }>
  }>
  fin: string | null
  total_reportado?: number | string | null
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
    idCajero: Number(dto.id_cajero),
    cajeroNombre: dto.cajero_nombre,
    inicio: parseFechaMySQL(dto.inicio, 'corte.inicio'),
    efectivoInicial: Number(dto.efectivo_inicial),
    totalVentas: Number(dto.total_ventas),
    efectivoEsperado: Number(dto.efectivo_esperado),
    efectivoContado: dto.efectivo_contado === null ? null : Number(dto.efectivo_contado),
    diferenciaEfectivo: dto.diferencia_efectivo === null ? null : Number(dto.diferencia_efectivo),
    tipoCierre: dto.tipo_cierre,
    metodosPago: dto.metodos_pago.map((metodo) => ({
      idMetodo: Number(metodo.id_metodo),
      nombre: metodo.nombre,
      cantidadPagos: Number(metodo.cantidad_pagos),
      monto: Number(metodo.monto),
    })),
    ventas: dto.ventas.map((venta) => ({
      idVenta: Number(venta.id_venta),
      idCuenta: Number(venta.id_cuenta),
      mesaNumero: Number(venta.mesa_numero),
      fechaHora: parseFechaMySQL(venta.fecha_hora, 'venta.fecha_hora'),
      total: Number(venta.total),
      cajeroNombre: venta.cajero_nombre,
      meseroNombre: venta.mesero_nombre,
      pagos: venta.pagos.map((pago) => ({
        metodo: pago.metodo,
        monto: Number(pago.monto),
        montoRecibido: Number(pago.monto_recibido),
        cambio: Number(pago.cambio),
      })),
    })),
    fin: dto.fin ? parseFechaMySQL(dto.fin, 'corte.fin') : null,
    ...(dto.total_reportado !== undefined && dto.total_reportado !== null
      ? { totalReportado: Number(dto.total_reportado) }
      : {}),
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
    async abrirCorte(efectivoInicial) {
      return aCorte(await solicitar<CorteDto>('POST', '/caja/cortes', { cuerpo: { efectivo_inicial: efectivoInicial } }))
    },
    async cerrarCorte(efectivoContado, tipoCierre) {
      return aCorte(
        await solicitar<CorteDto>('POST', '/caja/cortes/cerrar', {
          cuerpo: { efectivo_contado: efectivoContado, tipo_cierre: tipoCierre },
        }),
      )
    },
    async cobrar(idCuenta, pagos, claveIdempotencia, confirmarCambioMetodo = false) {
      const dto = await solicitar<{ venta: VentaDto }>('POST', `/caja/cuentas/${idCuenta}/cobrar`, {
        cuerpo: {
          pagos: pagos.map((pago) => ({
            id_metodo: pago.idMetodo,
            monto: pago.monto,
            monto_recibido: pago.montoRecibido,
          })),
          confirmar_cambio_metodo: confirmarCambioMetodo,
        },
        claveIdempotencia,
      })
      return aVenta(dto.venta)
    },
  }
}
