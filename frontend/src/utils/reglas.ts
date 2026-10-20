// Reglas de negocio PROVISIONALES que la interfaz necesita para habilitar o
// deshabilitar acciones. La API debe validar las mismas reglas del lado servidor.
//
// `pendiente` (catálogo de la BD) se trata EXACTAMENTE igual que `enviado` mientras la BD no tenga `enviado`:
// cancelable, no editable y visible para cocina. Por eso todas las reglas pasan por `estadoParaReglas`.
// Un estado `desconocido` no habilita ninguna acción.
import { estadoParaReglas, type EstadoPedido, type Mesa, type Pedido } from '../types'

/** El mesero solo puede cancelar pedidos en estos estados. */
const ESTADOS_CANCELABLES_POR_MESERO: readonly EstadoPedido[] = ['registrado', 'enviado']

export function meseroPuedeCancelar(estado: EstadoPedido): boolean {
  return ESTADOS_CANCELABLES_POR_MESERO.includes(estadoParaReglas(estado))
}

/** En preparación solo el gerente puede cancelar. */
export function cancelacionRequiereGerente(estado: EstadoPedido): boolean {
  return estado === 'en_preparacion'
}

/** Un pedido está "activo" mientras no esté cancelado ni pagado. */
export function esPedidoActivo(estado: EstadoPedido): boolean {
  return estado !== 'cancelado' && estado !== 'pagado'
}

/** Solo un pedido `registrado` se edita (PATCH) y se envía a cocina. */
export const puedeEditarOEnviar = (estado: EstadoPedido): boolean => estadoParaReglas(estado) === 'registrado'

/** Solo un pedido `listo` se marca como entregado. */
export const puedeEntregar = (estado: EstadoPedido): boolean => estado === 'listo'

/** Pedidos que aún no llegaron a la mesa: se avisa al solicitar la cuenta, sin bloquear. */
export function estaSinEntregar(estado: EstadoPedido): boolean {
  const efectivo = estadoParaReglas(estado)
  return efectivo === 'registrado' || efectivo === 'enviado' || efectivo === 'en_preparacion' || efectivo === 'listo'
}

/** Pedidos que cuentan en el total de la cuenta (todos menos los cancelados). */
export const sumaAlTotal = (pedido: Pick<Pedido, 'estado'>): boolean => pedido.estado !== 'cancelado'

/** Filtros de "Mis pedidos". `activos` = todo menos cancelado y pagado. */
export type FiltroListaPedidos = 'activos' | 'registrado' | 'enviado' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado'

export const FILTROS_LISTA_PEDIDOS: readonly FiltroListaPedidos[] = [
  'activos',
  'registrado',
  'enviado',
  'en_preparacion',
  'listo',
  'entregado',
  'cancelado',
]

export function coincideConFiltro(estado: EstadoPedido, filtro: FiltroListaPedidos): boolean {
  return filtro === 'activos' ? esPedidoActivo(estado) : estadoParaReglas(estado) === filtro
}

/** Convierte un valor de la URL (?estado=) en un filtro válido; si no lo es, `activos`. */
export function filtroListaDesdeConsulta(valor: unknown): FiltroListaPedidos {
  return FILTROS_LISTA_PEDIDOS.find((f) => f === valor) ?? 'activos'
}

/** Pasos del indicador de avance de un pedido (el cancelado se muestra aparte). */
export const PASOS_AVANCE: readonly EstadoPedido[] = ['registrado', 'enviado', 'en_preparacion', 'listo', 'entregado']

// ---------- Acciones que permite cada estado de pedido ----------

/** Por qué se puede (o no) cancelar un pedido desde la interfaz del mesero. */
export type PermisoCancelar = 'permitida' | 'requiere_gerente' | 'cuenta_por_pagar' | 'no_aplica'

export interface AccionesPedido {
  /** Editar el detalle (solo `registrado`); se bloquea si la cuenta ya se solicitó. */
  editar: 'permitida' | 'cuenta_por_pagar' | 'no_aplica'
  enviar: boolean
  cancelar: PermisoCancelar
  entregar: boolean
}

/**
 * Qué acciones muestra la interfaz para un pedido. SUPUESTO (pregunta abierta 15): con la cuenta
 * `por_pagar` no se edita ni se cancela. La API debe validar las mismas reglas.
 */
export function accionesDePedido(estado: EstadoPedido, cuentaPorPagar = false): AccionesPedido {
  let cancelar: PermisoCancelar = 'no_aplica'
  if (cancelacionRequiereGerente(estado)) cancelar = 'requiere_gerente'
  else if (meseroPuedeCancelar(estado)) cancelar = cuentaPorPagar ? 'cuenta_por_pagar' : 'permitida'

  let editar: AccionesPedido['editar'] = 'no_aplica'
  if (puedeEditarOEnviar(estado)) editar = cuentaPorPagar ? 'cuenta_por_pagar' : 'permitida'

  return { editar, enviar: puedeEditarOEnviar(estado), cancelar, entregar: puedeEntregar(estado) }
}

/** Texto visible junto a un botón de cancelar bloqueado; `null` si no está bloqueado. */
export function textoCancelarBloqueado(permiso: PermisoCancelar): string | null {
  if (permiso === 'requiere_gerente') return 'Requiere autorización del gerente'
  if (permiso === 'cuenta_por_pagar') return 'La cuenta ya fue solicitada: no se pueden cancelar pedidos.'
  return null
}

// ---------- Registrar pedidos según la mesa y su cuenta ----------

/**
 * Por qué NO se puede registrar un pedido en la mesa; `null` si se puede. Solo una mesa OCUPADA
 * recibe pedidos y la cuenta no debe estar ya solicitada (`por_pagar`).
 */
export function motivoPedidoBloqueado(mesa: Pick<Mesa, 'numero' | 'estado' | 'estadoCuenta'>): string | null {
  if (mesa.estado !== 'ocupada') return `La mesa ${mesa.numero} no está ocupada.`
  if (mesa.estadoCuenta === 'por_pagar') return `La cuenta de la mesa ${mesa.numero} ya fue solicitada.`
  return null
}

export const puedeRegistrarPedido = (mesa: Pick<Mesa, 'numero' | 'estado' | 'estadoCuenta'>): boolean =>
  motivoPedidoBloqueado(mesa) === null
