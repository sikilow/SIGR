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
  /** Cuándo se eliminó; `null` = vigente (migración 029). Solo lo ve el gerente en «Eliminados». */
  eliminadoEn?: Date | null
}

export interface CategoriaMetodoPagoAdmin {
  idCategoriaMetodoPago: number
  nombre: string
  tipo: 'fisico' | 'digital'
  activo: boolean
  /** Cuándo se eliminó; `null` = vigente (migración 029). Solo lo ve el gerente en «Eliminados». */
  eliminadoEn?: Date | null
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
  /** Lo devuelto con este método en devoluciones aprobadas que salieron de este corte (migración 034). */
  devuelto?: number
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
  /** Devoluciones aprobadas que salieron de este corte (migración 034). Baja el efectivo esperado si fueron en efectivo. */
  totalDevuelto: number
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
  resumen: {
    ventas: number
    total: number
    /** Devoluciones aprobadas en el periodo (por la fecha en que se aprobaron) y su importe. */
    devoluciones: number
    devuelto: number
    /** Ventas menos devoluciones. */
    neto: number
  }
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

// ---------- Tickets pasados, reimpresión y devoluciones (migración 034) ----------

export type EstadoDevolucion = 'pendiente' | 'aprobada' | 'rechazada'
export type EstadoDevolucionVenta = 'ninguna' | 'parcial' | 'total'

export const ETIQUETA_ESTADO_DEVOLUCION: Record<EstadoDevolucion, string> = {
  pendiente: 'Pendiente de autorizar',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

export const ETIQUETA_DEVOLUCION_VENTA: Record<EstadoDevolucionVenta, string> = {
  ninguna: 'Sin devoluciones',
  parcial: 'Devolución parcial',
  total: 'Devuelta por completo',
}

/** Una venta en la lista de tickets. */
export interface VentaListado {
  idVenta: number
  fechaHora: Date
  total: number
  mesaNumero: number
  seccion: string | null
  canal: string | null
  cajero: string
  /** Métodos de pago usados, separados por coma. */
  metodos: string
  /** Importe de las devoluciones aprobadas. */
  devuelto: number
  estadoDevolucion: EstadoDevolucionVenta
  devolucionesPendientes: number
  /** Solo lo ve el gerente. */
  conReferenciaFiscal?: boolean
}

export interface FiltroVentas {
  /** AAAA-MM-DD */
  desde?: string
  /** AAAA-MM-DD */
  hasta?: string
  /** Número de ticket o de mesa. */
  q?: string
}

export interface LineaVentaDetalle {
  idDetalle: number
  producto: string
  presentacion: string | null
  cantidad: number
  precioUnitario: number
  importe: number
  indicaciones: string | null
  /** Unidades de devoluciones aprobadas. */
  devuelta: number
  /** Unidades en devoluciones pendientes de autorizar (ya apartadas). */
  pendiente: number
}

export interface PagoVentaDetalle {
  idMetodo: number
  metodo: string
  esEfectivo: boolean
  monto: number
  montoRecibido: number
  cambio: number
  devuelto: number
  pendiente: number
}

export interface DevolucionLinea {
  idDetalle: number
  producto: string
  presentacion: string | null
  cantidad: number
  importe: number
}

export interface DevolucionPago {
  idMetodo: number
  metodo: string
  esEfectivo: boolean
  monto: number
}

export interface Devolucion {
  idDevolucion: number
  idVenta: number
  mesaNumero: number
  totalVenta: number
  estado: EstadoDevolucion
  motivo: string
  total: number
  reponerInventario: boolean
  solicitadoEn: Date
  solicitante: string
  resueltoEn: Date | null
  resolutor: string | null
  notaResolucion: string | null
  /** Corte del cajero del que salió el efectivo (solo aprobadas pedidas por un cajero). */
  idCorte: number | null
  lineas: DevolucionLinea[]
  pagos: DevolucionPago[]
}

/** Referencia para el contador y datos fiscales opcionales del cliente (no se emite factura). Solo el gerente. */
export interface ReferenciaFiscal {
  referenciaContador: string
  rfc: string | null
  razonSocial: string | null
  regimenFiscal: string | null
  codigoPostal: string | null
  correo: string | null
  notas: string | null
  registradoPor: string
  actualizadoEn: Date
}

export interface DatosReferenciaFiscal {
  referenciaContador: string
  rfc?: string
  razonSocial?: string
  regimenFiscal?: string
  codigoPostal?: string
  correo?: string
  notas?: string
}

/** El ticket completo de una venta, con lo que se puede devolver todavía. */
export interface VentaDetalle {
  idVenta: number
  idCuenta: number
  fechaHora: Date
  total: number
  cajero: string
  meseros: string
  mesaNumero: number
  seccion: string | null
  canal: string | null
  referencia: string | null
  lineas: LineaVentaDetalle[]
  pagos: PagoVentaDetalle[]
  devoluciones: Devolucion[]
  devuelto: number
  estadoDevolucion: EstadoDevolucionVenta
  reimpresiones: number
  ultimaReimpresion: Date | null
  /** Solo el gerente la recibe (`null` = sin referencia). */
  referenciaFiscal?: ReferenciaFiscal | null
}

export interface SolicitudDevolucion {
  lineas: Array<{ idDetalle: number; cantidad: number }>
  /** Cómo se devuelve el dinero: con métodos que se usaron en la venta. */
  pagos: Array<{ idMetodo: number; monto: number }>
  motivo: string
  reponerInventario: boolean
}

export interface FiltroDevoluciones {
  estado?: EstadoDevolucion | 'todas'
  desde?: string
  hasta?: string
}
