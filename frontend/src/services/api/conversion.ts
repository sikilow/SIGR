// Conversión de valores que llegan de la API (PHP/PDO + MySQL). PDO puede devolver INT, DECIMAL y BOOLEAN
// como texto ("12", "120.00", "1") y los DATETIME sin zona horaria ("2026-10-15 16:34:00"): estos helpers
// los llevan a los tipos del frontend. Solo los usa `mappers.ts`.
import {
  ESTADO_DESCONOCIDO,
  ESTADOS_CUENTA,
  ESTADOS_ESPERA,
  ESTADOS_MESA,
  ESTADOS_PEDIDO_BD,
  ESTADOS_RESERVACION,
  ESTADOS_SIN_EQUIVALENTE_EN_BD,
  ROLES,
  type EstadoCuenta,
  type EstadoEspera,
  type EstadoMesa,
  type EstadoPedido,
  type EstadoReservacion,
  type Rol,
} from '../../types'
import { ErrorServicio } from '../errores'

/** Respuesta de la API que no cumple el contrato (un número que no es número, una fecha imposible…). */
function respuestaInvalida(campo: string, valor: unknown): ErrorServicio {
  return new ErrorServicio('desconocido', `Respuesta inválida de la API: «${campo}» no puede ser ${JSON.stringify(valor)}.`)
}

/** INT o DECIMAL de la BD → number. Acepta `12`, `"12"` y `"120.00"`. Cualquier otra cosa es un error de contrato. */
export function aNumero(valor: unknown, campo = 'número'): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim() !== '') {
    const numero = Number(valor)
    if (Number.isFinite(numero)) return numero
  }
  throw respuestaInvalida(campo, valor)
}

/** Como `aNumero`, pero `null`/`undefined` (columna NULL) → `null`. */
export function aNumeroONulo(valor: unknown, campo = 'número'): number | null {
  return valor === null || valor === undefined ? null : aNumero(valor, campo)
}

/**
 * BOOLEAN de la BD → boolean. Acepta `true`/`false`, `1`/`0` y `"1"`/`"0"` (también `"true"`/`"false"`).
 * `null`/`undefined` cuenta como `false` (p. ej. un producto sin marcar se trata como agotado).
 */
export function aBooleano(valor: unknown, campo = 'booleano'): boolean {
  if (valor === null || valor === undefined) return false
  if (valor === true || valor === 1 || valor === '1' || valor === 'true') return true
  if (valor === false || valor === 0 || valor === '0' || valor === 'false' || valor === '') return false
  throw respuestaInvalida(campo, valor)
}

/** Texto de la BD (puede ser NULL) → string; `null` queda como cadena vacía. */
export function aTexto(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor)
}

/**
 * mesa.zona («sección» del salón, texto libre) → texto recortado o `null`. Vacía, solo espacios, `null` o ausente
 * (p. ej. la respuesta de asignar mesa no la envía) cuentan como «sin sección».
 */
export function aZona(valor: unknown): string | null {
  const texto = aTexto(valor).trim()
  return texto === '' ? null : texto
}

const FECHA_MYSQL = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/

/**
 * DATETIME de MySQL ("2026-10-15 16:34:00", sin zona horaria) → Date interpretada como HORA LOCAL.
 * Nunca se usa `new Date(cadena)` con ese formato: JavaScript lo leería como UTC o según el navegador.
 * Una cadena con zona (`...Z`, `...-06:00`) sí la lleva el propio formato ISO, así que se respeta.
 */
export function parseFechaMySQL(texto: unknown, campo = 'fecha'): Date {
  if (typeof texto !== 'string') throw respuestaInvalida(campo, texto)
  const cadena = texto.trim()
  const m = FECHA_MYSQL.exec(cadena)
  if (m) {
    const [anio, mes, dia, hora, minuto, segundo] = m.slice(1).map(Number) as [number, number, number, number, number, number]
    const fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo)
    // Rechaza fechas imposibles que JavaScript "corregiría" ("2026-02-31", "0000-00-00 00:00:00").
    const coincide =
      fecha.getFullYear() === anio &&
      fecha.getMonth() === mes - 1 &&
      fecha.getDate() === dia &&
      fecha.getHours() === hora &&
      fecha.getMinutes() === minuto
    if (!coincide) throw respuestaInvalida(campo, texto)
    return fecha
  }
  // ISO 8601 con zona horaria explícita (Z o ±hh:mm).
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(cadena)) {
    const fecha = new Date(cadena)
    if (!Number.isNaN(fecha.getTime())) return fecha
  }
  throw respuestaInvalida(campo, texto)
}

/** Date → DATETIME de MySQL en HORA LOCAL ("2026-10-16 20:30:00"): lo contrario de `parseFechaMySQL`. */
export function aFechaMySQL(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ` +
    `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`
  )
}

/** Como `parseFechaMySQL`, pero `null`/`undefined` (columna NULL) → `null`. */
export function parseFechaMySQLONula(texto: unknown, campo = 'fecha'): Date | null {
  return texto === null || texto === undefined ? null : parseFechaMySQL(texto, campo)
}

// ---------- Estados y roles ----------

/** 'En preparacion' → 'en_preparacion': minúsculas, sin acentos, espacios y guiones a guion bajo. */
export function normalizarCodigo(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function advertirDesconocido(tipo: string, original: unknown): void {
  console.warn(`[SIGR] ${tipo} desconocido recibido de la API: ${JSON.stringify(original)}. Se mostrará como «${ESTADO_DESCONOCIDO}».`)
}

function buscarCodigo<T extends string>(validos: readonly T[], original: unknown): T | null {
  const codigo = normalizarCodigo(original)
  return validos.find((v) => v === codigo) ?? null
}

/**
 * `mesa.estado` → código. El CHECK de database/init.sql admite `libre`, `ocupada` y `reservada`. Por tolerancia
 * (datos o versiones anteriores) `disponible` / `Disponible` también se entienden como `libre`. Un valor fuera de esas
 * listas da `desconocido` (y una advertencia).
 */
export function aEstadoMesa(original: unknown): EstadoMesa {
  if (normalizarCodigo(original) === 'disponible') return 'libre'
  const estado = buscarCodigo(ESTADOS_MESA, original)
  if (estado) return estado
  advertirDesconocido('Estado de mesa', original)
  return ESTADO_DESCONOCIDO
}

/** `cuenta.estado` → código. Un valor fuera de la lista da `desconocido` (y una advertencia en consola). */
export function aEstadoCuenta(original: unknown): EstadoCuenta {
  const estado = buscarCodigo(ESTADOS_CUENTA, original)
  if (estado) return estado
  advertirDesconocido('Estado de cuenta', original)
  return ESTADO_DESCONOCIDO
}

const ESTADOS_PEDIDO_CONOCIDOS: readonly EstadoPedido[] = [...ESTADOS_PEDIDO_BD, ...ESTADOS_SIN_EQUIVALENTE_EN_BD]

/** `estado_pedido.nombre` → código. Un valor fuera del catálogo da `desconocido` (y una advertencia en consola). */
export function aEstadoPedido(original: unknown): EstadoPedido {
  const estado = buscarCodigo(ESTADOS_PEDIDO_CONOCIDOS, original)
  if (estado) return estado
  advertirDesconocido('Estado de pedido', original)
  return ESTADO_DESCONOCIDO
}

/** `rol.nombre` ('Mesero') → código ('mesero'). Un rol que no se reconoce da `null` (y una advertencia en consola). */
export function aRol(original: unknown): Rol | null {
  const rol = buscarCodigo(ROLES, original)
  if (rol) return rol
  advertirDesconocido('Rol', original)
  return null
}

/**
 * `reservacion.estado` (texto libre, valores SIN CONFIRMAR) → código. Tolera mayúsculas, acentos y espacios
 * ('Llegó' → 'llego'). Un valor fuera de la lista da `desconocido` (y UNA advertencia en consola).
 */
export function aEstadoReservacion(original: unknown): EstadoReservacion {
  const estado = buscarCodigo(ESTADOS_RESERVACION, original)
  if (estado) return estado
  advertirDesconocido('Estado de reservación', original)
  return ESTADO_DESCONOCIDO
}

/** `lista_espera.estado` (texto libre, valores SIN CONFIRMAR) → código. Igual de tolerante que `aEstadoReservacion`. */
export function aEstadoEspera(original: unknown): EstadoEspera {
  const estado = buscarCodigo(ESTADOS_ESPERA, original)
  if (estado) return estado
  advertirDesconocido('Estado de lista de espera', original)
  return ESTADO_DESCONOCIDO
}
