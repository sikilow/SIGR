import type { Cuenta } from './cuenta'

export interface MetodoPago {
  idMetodo: number
  nombre: string
}

export interface PedidoPendienteCaja {
  idPedido: number
  estado: string
}

export interface CuentaCaja {
  cuenta: Cuenta
  mesaNumero: number
  pedidosSinEntregar: PedidoPendienteCaja[]
}

export interface CorteCaja {
  idCorte: number
  inicio: Date
  totalVentas: number
  fin?: Date
  totalReportado?: number
  diferencia?: number
}

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
