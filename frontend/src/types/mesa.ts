// Tipo `Mesa` (tabla `mesa`). Ver docs/equivalencias-bd.md.
import type { TipoPago } from './cuenta'
import type { EstadoCuentaActiva, EstadoMesa } from './estados'

/** Característica de mesa del catálogo que administra Gerencia (caracteristica_mesa, migración 023). */
export interface CaracteristicaMesa {
  idCaracteristica: number
  nombre: string
}

export interface Mesa {
  /** mesa.id_mesa */
  idMesa: number
  /** mesa.numero: número visible en el salón (puede diferir del id). */
  numero: number
  /** mesa.capacidad (siempre mayor que 0). */
  capacidad: number
  /** mesa.estado (texto libre en la BD). */
  estado: EstadoMesa
  /** mesa.zona: sección del salón (recortada); null se tolera para respuestas antiguas. */
  zona: string | null
  /** Características activas de la mesa («Planta baja», «Junto a la ventana»…), por nombre. */
  caracteristicas: CaracteristicaMesa[]
  /** Mesa virtual de la sección «Para llevar» (seccion.es_para_llevar): no se sienta ni se reserva. */
  esParaLlevar?: boolean

  // --- Campos CALCULADOS por la API (no son columnas de `mesa`) ---
  /** Estado de la cuenta activa de la mesa; `null` si no hay cuenta activa. */
  estadoCuenta: EstadoCuentaActiva | null
  /** Pedidos de la cuenta activa que no están cancelados ni pagados. */
  pedidosActivos: number
  /** Total acumulado de la cuenta activa (sin pedidos cancelados), en MXN. */
  totalCuenta: number
  /** Cantidad de pedidos en estado `listo` (cocina terminó; falta servirlos). */
  pedidosListos: number

  /** cuenta.tipo_pago_solicitado de la cuenta activa (columna de `cuenta`, no de `mesa`). `null` si no se solicitó o la API no lo envía. */
  tipoPagoSolicitado: TipoPago | null
  /** Canal del pedido para llevar de la cuenta activa (calculado); solo en mesas virtuales ocupadas. */
  canal?: string | null
  /** cuenta.referencia: nombre o folio para entregar el pedido para llevar. */
  referencia?: string | null
}

/** Canal de un pedido para llevar (`canal_pedido`): mostrador, teléfono, plataformas… Lo administra Gerencia. */
export interface CanalPedido {
  /** canal_pedido.id_canal */
  idCanal: number
  nombre: string
  activo: boolean
  /** Cuándo se eliminó; `null` = vigente (migración 029). Solo lo ve el gerente en «Eliminados». */
  eliminadoEn?: Date | null
}

/** Resultado de abrir un pedido para llevar: la mesa virtual ocupada y su cuenta. */
export interface AperturaParaLlevar {
  idMesa: number
  numero: number
  idCuenta: number
  idCanal: number
  canal: string
  referencia: string | null
}
