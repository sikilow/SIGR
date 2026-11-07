// Reglas PURAS de la pantalla Pedidos del gerente (/gerente/pedidos): qué puede hacer el gerente con cada pedido
// y cómo se filtra la lista. La API valida lo mismo (backend/src/controllers/pedidos.ts → cancelarPedido): estas
// funciones solo deciden qué muestra la interfaz, nunca sustituyen la validación del servidor.
//
// `pendiente` (catálogo de la BD) se trata igual que `enviado` (ver `estadoParaReglas`).
import { estadoParaReglas, type EstadoPedido, type Pedido } from '../types'
import { esPedidoActivo } from './reglas'
import { aDiaISO } from './reservaciones'

// ---------- Cancelar como gerente (RF-PED-002) ----------

/** El gerente cancela en estos estados. En preparación SOLO él puede (el mesero recibe `requiere_gerente`). */
const ESTADOS_CANCELABLES_POR_GERENTE: readonly EstadoPedido[] = ['registrado', 'enviado', 'en_preparacion']

export function gerentePuedeCancelarEstado(estado: EstadoPedido): boolean {
  return ESTADOS_CANCELABLES_POR_GERENTE.includes(estadoParaReglas(estado))
}

/**
 * Por qué el gerente puede (o no) cancelar un pedido:
 *  - `permitida`: registrado, enviado o en preparación, con la cuenta sin solicitar.
 *  - `cuenta_por_pagar`: el estado lo permitiría, pero la cuenta ya pidió el pago (la API responde 409).
 *  - `estado_final`: listo, entregado, pagado, cancelado o un estado desconocido.
 */
export type PermisoCancelarGerente = 'permitida' | 'cuenta_por_pagar' | 'estado_final'

export function permisoCancelarGerente(estado: EstadoPedido, cuentaPorPagar = false): PermisoCancelarGerente {
  if (!gerentePuedeCancelarEstado(estado)) return 'estado_final'
  return cuentaPorPagar ? 'cuenta_por_pagar' : 'permitida'
}

const MOTIVO_ESTADO_FINAL: Partial<Record<EstadoPedido, string>> = {
  listo: 'Ya está listo para entregar: no se puede cancelar.',
  entregado: 'Ya se entregó en la mesa: no se puede cancelar.',
  pagado: 'Ya se cobró: no se puede cancelar.',
  cancelado: 'Este pedido ya está cancelado.',
}

/** Texto visible junto al botón «Cancelar pedido» bloqueado (con aria-disabled); `null` si se puede cancelar. */
export function motivoNoCancelableGerente(estado: EstadoPedido, cuentaPorPagar = false): string | null {
  const permiso = permisoCancelarGerente(estado, cuentaPorPagar)
  if (permiso === 'permitida') return null
  if (permiso === 'cuenta_por_pagar') return 'La cuenta ya fue solicitada: no se pueden cancelar pedidos.'
  return MOTIVO_ESTADO_FINAL[estado] ?? 'El estado de este pedido no permite cancelarlo.'
}

/** Aviso adicional cuando la cancelación es la excepción que solo autoriza el gerente (cocina ya empezó). */
export function avisoCancelacionGerente(estado: EstadoPedido): string | null {
  return estadoParaReglas(estado) === 'en_preparacion'
    ? 'Cocina ya lo está preparando. Al cancelarlo, la existencia de los productos vuelve al inventario.'
    : null
}

// ---------- Filtros de la lista (RF-PED-003 y RF-PED-005) ----------

/** Filtro por estado. `activos` = todo menos cancelado y pagado (igual que en «Pedidos del salón» del mesero). */
export type FiltroEstadoGerente =
  | 'todos'
  | 'activos'
  | 'registrado'
  | 'enviado'
  | 'en_preparacion'
  | 'listo'
  | 'entregado'
  | 'pagado'
  | 'cancelado'

export const FILTROS_ESTADO_GERENTE: readonly FiltroEstadoGerente[] = [
  'todos',
  'activos',
  'registrado',
  'enviado',
  'en_preparacion',
  'listo',
  'entregado',
  'pagado',
  'cancelado',
]

export const ETIQUETA_FILTRO_ESTADO_GERENTE: Record<FiltroEstadoGerente, string> = {
  todos: 'Todos',
  activos: 'Activos',
  registrado: 'Registrado',
  enviado: 'Enviado',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  pagado: 'Pagado',
  cancelado: 'Cancelado',
}

export function coincideEstadoGerente(estado: EstadoPedido, filtro: FiltroEstadoGerente): boolean {
  if (filtro === 'todos') return true
  if (filtro === 'activos') return esPedidoActivo(estado)
  return estadoParaReglas(estado) === filtro
}

export interface FiltrosPedidosGerente {
  /** Día `AAAA-MM-DD` (hora local) o `null` = todos los días. La API no filtra por fecha: se filtra aquí. */
  dia: string | null
  estado: FiltroEstadoGerente
  /** `null` = todas las mesas. */
  idMesa: number | null
  /** `null` = todos los meseros. */
  idMesero: number | null
  /** Número de pedido («12» o «#12»). */
  busqueda: string
}

/** Filtros al entrar: hoy, todos los estados, todas las mesas y todos los meseros. */
export function filtrosIniciales(hoy: Date = new Date()): FiltrosPedidosGerente {
  return { dia: aDiaISO(hoy), estado: 'todos', idMesa: null, idMesero: null, busqueda: '' }
}

/**
 * «#12», « 12 » → "12"; vacío → "" (sin filtro). Cualquier otra cosa (letras, «12a») → `null`: no hay número de
 * pedido que coincida, así que la lista queda vacía en vez de ignorar lo escrito.
 */
export function normalizarBusquedaPedido(texto: string): string | null {
  const limpio = texto.trim().replace(/^#\s*/, '')
  if (limpio === '') return ''
  return /^\d+$/.test(limpio) ? String(Number(limpio)) : null
}

/** El número de pedido EMPIEZA con lo buscado: «1» encuentra #1, #10, #12…; «12» encuentra #12, #120… */
export function coincideBusquedaPedido(idPedido: number, texto: string): boolean {
  const busqueda = normalizarBusquedaPedido(texto)
  if (busqueda === null) return false
  return busqueda === '' || String(idPedido).startsWith(busqueda)
}

/** Más recientes primero; a la misma hora, el número de pedido mayor primero. */
export function ordenarRecientes(pedidos: readonly Pedido[]): Pedido[] {
  return [...pedidos].sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || b.idPedido - a.idPedido)
}

/** Todos los filtros menos el de estado (sirve para contar cuántos hay de cada estado). */
function coincideSinEstado(p: Pedido, f: FiltrosPedidosGerente): boolean {
  if (f.dia !== null && aDiaISO(p.fechaHora) !== f.dia) return false
  if (f.idMesa !== null && p.idMesa !== f.idMesa) return false
  if (f.idMesero !== null && p.idMesero !== f.idMesero) return false
  return coincideBusquedaPedido(p.idPedido, f.busqueda)
}

/** Aplica todos los filtros y ordena (más recientes primero). */
export function filtrarPedidosGerente(pedidos: readonly Pedido[], f: FiltrosPedidosGerente): Pedido[] {
  return ordenarRecientes(pedidos.filter((p) => coincideSinEstado(p, f) && coincideEstadoGerente(p.estado, f.estado)))
}

/** Cuántos pedidos habría con cada filtro de estado, respetando día, mesa, mesero y búsqueda. */
export function contarPorEstado(pedidos: readonly Pedido[], f: FiltrosPedidosGerente): Record<FiltroEstadoGerente, number> {
  const base = pedidos.filter((p) => coincideSinEstado(p, f))
  return Object.fromEntries(
    FILTROS_ESTADO_GERENTE.map((filtro) => [filtro, base.filter((p) => coincideEstadoGerente(p.estado, filtro)).length]),
  ) as Record<FiltroEstadoGerente, number>
}

/** Mesas que aparecen en los pedidos (incluye mesas ya no disponibles: el historial las conserva). */
export function opcionesMesas(pedidos: readonly Pedido[]): Array<{ idMesa: number; numero: number }> {
  const mapa = new Map(pedidos.map((p) => [p.idMesa, p.mesaNumero]))
  return [...mapa].map(([idMesa, numero]) => ({ idMesa, numero })).sort((a, b) => a.numero - b.numero)
}

/** Meseros que aparecen en los pedidos, por nombre. */
export function opcionesMeseros(pedidos: readonly Pedido[]): Array<{ idMesero: number; nombre: string }> {
  const mapa = new Map(pedidos.map((p) => [p.idMesero, p.nombreMesero]))
  return [...mapa].map(([idMesero, nombre]) => ({ idMesero, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** ¿Hay algún filtro distinto de los iniciales (hoy y todos)? Sirve para ofrecer «Quitar filtros». */
export function hayFiltrosExtra(f: FiltrosPedidosGerente): boolean {
  return f.estado !== 'todos' || f.idMesa !== null || f.idMesero !== null || f.busqueda.trim() !== ''
}

/** Unidades de producto del pedido (suma de cantidades, no de líneas). */
export function unidadesDePedido(pedido: Pick<Pedido, 'detalle'>): number {
  return pedido.detalle.reduce((suma, d) => suma + d.cantidad, 0)
}

/** Cuántas filas se pintan a la vez; «Mostrar más» agrega otro bloque (el endpoint no pagina). */
export const PEDIDOS_POR_BLOQUE = 50

/** «Mostrando 8 de 23 pedidos» cuando la lista visible es menor que todo lo recibido; `null` si se ve todo. */
export function textoMostrando(visibles: number, total: number): string | null {
  if (visibles >= total) return null
  return `Mostrando ${visibles} de ${total} ${total === 1 ? 'pedido' : 'pedidos'}`
}
