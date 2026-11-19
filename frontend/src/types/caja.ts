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
  /**
   * Cobros del turno por método de pago que NO es efectivo (con cobros, de mayor a menor). El efectivo no se envía:
   * el cajero lo cuenta a ciegas al cerrar el corte.
   */
  desglose: CobroPorMetodo[]
}

export interface CobroPorMetodo {
  metodo: string
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

// ---------- Reporte e historial de ventas (RF-VEN-003 y RF-VEN-004) ----------

/** Una venta cobrada, para el historial del reporte. */
export interface VentaReporte {
  idVenta: number
  idCuenta: number
  fechaHora: Date
  total: number
  mesaNumero: number
  /** mesa.zona; `null` si la mesa no tiene sección. */
  seccion: string | null
  /** canal_pedido.nombre en pedidos para llevar; `null` en el salón. */
  canal: string | null
  cajero: string
  /** Meseros que tomaron pedidos de la cuenta, separados por coma. */
  meseros: string
  pagos: Array<{ metodo: string; monto: number }>
}

/** GET /caja/reportes/ventas: totales y desgloses del periodo [desde, hasta] (fechas del cobro). */
export interface ReporteVentas {
  /** AAAA-MM-DD */
  desde: string
  /** AAAA-MM-DD */
  hasta: string
  resumen: { ventas: number; total: number }
  /** Solo los días con ventas, en orden. */
  porDia: Array<{ dia: string; ventas: number; total: number }>
  /** Hora del cobro (0 a 23), solo las horas con ventas. */
  porHora: Array<{ hora: number; ventas: number; total: number }>
  porMetodo: Array<{ metodo: string; pagos: number; total: number }>
  /** Importe de los productos que pidió cada mesero (sin pedidos cancelados). */
  porMesero: Array<{ mesero: string; cuentas: number; total: number }>
  porProducto: Array<{ producto: string; presentacion: string; categoria: string; cantidad: number; total: number }>
  porCategoria: Array<{ categoria: string; cantidad: number; total: number }>
  porSeccion: Array<{ seccion: string; ventas: number; total: number }>
  /** Historial, de la más reciente a la más antigua. */
  ventas: VentaReporte[]
  /** `true` si el periodo tiene más ventas de las que caben en el historial (los totales sí cuentan todas). */
  ventasTruncadas: boolean
}
