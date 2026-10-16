// FUENTE DE VERDAD de los estados del frontend. Los valores salen del esquema MySQL del equipo de BD
// (ver docs/equivalencias-bd.md). Los nombres de la BD se normalizan a código: minúsculas, sin acentos
// y con guion bajo en lugar de espacios ('En preparacion' -> 'en_preparacion').

/** Código que recibe cualquier estado que la API envíe y que no esté en estas listas. */
export const ESTADO_DESCONOCIDO = 'desconocido' as const

// ---------- Mesa: mesa.estado (VARCHAR, texto libre, default 'disponible') ----------

export const ESTADOS_MESA = ['disponible', 'ocupada', 'reservada'] as const
export type EstadoMesa = (typeof ESTADOS_MESA)[number] | typeof ESTADO_DESCONOCIDO
/** SIN CONFIRMAR en la BD: `mesa.estado` es texto libre y aún no se fijan sus valores (ver el contrato). */
export const ESTADOS_MESA_SIN_CONFIRMAR: readonly EstadoMesa[] = ['reservada']

// ---------- Cuenta: cuenta.estado (VARCHAR, texto libre, default 'abierta') ----------

export const ESTADOS_CUENTA = ['abierta', 'por_pagar', 'cerrada'] as const
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number] | typeof ESTADO_DESCONOCIDO
/** SIN CONFIRMAR en la BD: solo `abierta` es el valor por defecto; `por_pagar` y `cerrada` están por acordar. */
export const ESTADOS_CUENTA_SIN_CONFIRMAR: readonly EstadoCuenta[] = ['por_pagar', 'cerrada']

/** Estados de una cuenta activa (la que una mesa puede tener a lo sumo una). */
export type EstadoCuentaActiva = Exclude<EstadoCuenta, 'cerrada'>

// ---------- Pedido: estado_pedido.nombre (catálogo) ----------

/** Catálogo `estado_pedido` ('Pendiente', 'En preparacion', 'Listo', 'Entregado', 'Cancelado') ya normalizado. */
export const ESTADOS_PEDIDO_BD = ['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'] as const

/**
 * Estados que la interfaz conoce pero que el catálogo `estado_pedido` NO tiene: `registrado` (pedido
 * capturado y aún editable), `enviado` (enviado a cocina) y `pagado`. Se conservan para no cambiar el
 * comportamiento de la interfaz. Mientras la BD no los incluya (o se decida que registrar y enviar sean un
 * solo paso), `pendiente` se trata EXACTAMENTE igual que `enviado` (ver `estadoParaReglas`).
 * No agregar aquí equivalencias nuevas sin acordarlas con el equipo de BD.
 */
export const ESTADOS_SIN_EQUIVALENTE_EN_BD = ['registrado', 'enviado', 'pagado'] as const

export type EstadoPedido =
  | (typeof ESTADOS_PEDIDO_BD)[number]
  | (typeof ESTADOS_SIN_EQUIVALENTE_EN_BD)[number]
  | typeof ESTADO_DESCONOCIDO

/** Estados de la BD que, mientras falten los de `ESTADOS_SIN_EQUIVALENTE_EN_BD`, se comportan como otro. */
const EQUIVALENCIA_PROVISIONAL: Partial<Record<EstadoPedido, EstadoPedido>> = { pendiente: 'enviado' }

/** Estado con el que las reglas y los indicadores de avance deciden (`pendiente` cuenta como `enviado`). */
export function estadoParaReglas(estado: EstadoPedido): EstadoPedido {
  return EQUIVALENCIA_PROVISIONAL[estado] ?? estado
}
