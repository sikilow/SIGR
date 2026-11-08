import type { Cuenta } from './cuenta'

export interface MetodoPago {
  idMetodo: number
  nombre: string
}

export interface MetodoPagoAdmin extends MetodoPago {
  activo: boolean
}

export interface PedidoPendienteCaja {
  idPedido: number
  estado: string
}

export interface CuentaCaja {
  cuenta: Cuenta
  mesaNumero: number
  /** Nombres de los meseros que atendieron la cuenta (pedido.id_mesero). */
  meseroNombre: string
  pedidosSinEntregar: PedidoPendienteCaja[]
}

export interface CorteCaja {
  idCorte: number
  idCajero: number
  cajeroNombre: string
  inicio: Date
  efectivoInicial: number
  totalVentas: number
  efectivoEsperado: number
  metodosPago: ResumenMetodoCaja[]
  ventas: VentaCajaReporte[]
  fin: Date | null
  tipoCierre: 'parcial' | 'final' | null
  efectivoContado: number | null
  diferenciaEfectivo: number | null
  totalReportado?: number
  diferencia?: number
}

export interface ResumenMetodoCaja {
  idMetodo: number
  nombre: string
  cantidadPagos: number
  monto: number
}

export interface VentaCajaReporte {
  idVenta: number
  idCuenta: number
  mesaNumero: number
  fechaHora: Date
  total: number
  cajeroNombre: string
  meseroNombre: string
  pagos: PagoCajaTicket[]
}

export type TipoCierreCaja = 'parcial' | 'final'

export interface PagoCajaEntrada {
  idMetodo: number
  monto: number
  montoRecibido: number
}

export interface PagoCajaTicket {
  metodo: string
  monto: number
  montoRecibido: number
  cambio: number
}

export interface VentaCaja {
  idVenta: number
  fechaHora: Date
  total: number
  idCuenta: number
  mesaNumero: number
  pagos: PagoCajaTicket[]
  cambio: number
}

export interface EstadoCaja {
  corte: CorteCaja | null
  cuentas: CuentaCaja[]
  metodosPago: MetodoPago[]
}
