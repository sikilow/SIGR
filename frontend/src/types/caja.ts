import type { Cuenta } from './cuenta'

export interface MetodoPago {
  idMetodo: number
  nombre: string
  idCategoriaMetodoPago: number
  categoria: string
  tipo: 'fisico' | 'digital'
  esEfectivo: boolean
}

export interface MetodoPagoAdmin extends MetodoPago {
  activo: boolean
}

export interface CategoriaMetodoPagoAdmin {
  idCategoriaMetodoPago: number
  nombre: string
  tipo: 'fisico' | 'digital'
  activo: boolean
  metodos: MetodoPagoAdmin[]
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

/** Corte abierto del cajero. No incluye totales: el efectivo se cuenta sin conocer lo esperado. */
export interface CorteCaja {
  idCorte: number
  inicio: Date
  fondoInicial: number
  cobros: number
}

export interface CobroPorMetodo {
  metodo: string
  esEfectivo: boolean
  cobros: number
  monto: number
}

/** Corte cerrado, como aparece en el historial. */
export interface CorteResumen {
  idCorte: number
  cajeroNombre: string
  inicio: Date
  fin: Date
  fondoInicial: number
  cobros: number
  totalVentas: number
  /** Fondo inicial + cobros en efectivo. Null en cortes anteriores a la migración 015 (solo en el historial). */
  efectivoEsperado: number | null
  /** Null en cortes anteriores a la migración 015, que no contaban efectivo. */
  efectivoContado: number | null
  /** Contado − esperado: negativo es faltante y positivo, sobrante. */
  diferencia: number | null
  /** Solo cortes anteriores a la 015: total de ventas que reportó el cajero. */
  totalReportado: number | null
}

export interface CorteDetalle extends CorteResumen {
  efectivoEsperado: number
  desglose: CobroPorMetodo[]
}

export interface FiltroCortes {
  /** AAAA-MM-DD */
  desde?: string
  /** AAAA-MM-DD */
  hasta?: string
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
