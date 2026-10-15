// Claves de idempotencia (cabecera `Idempotency-Key`, CAMBIO PROPUESTO EN F5).
// Regla: una clave por INTENCIÓN del usuario. Los reintentos de esa misma intención reutilizan la
// clave (el servidor devuelve el resultado anterior en vez de repetir la acción); una intención
// nueva genera una clave nueva.
import { ErrorServicio } from '../services/errores'

/** UUID v4. `crypto.randomUUID` solo existe en contextos seguros (https/localhost): hay respaldo. */
export function generarUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * ¿Conviene reintentar con la MISMA clave? Solo cuando el resultado es desconocido (la acción pudo
 * aplicarse aunque no llegó la respuesta): sin conexión o error inesperado del servidor.
 * Un rechazo claro del servidor (estado_invalido, requiere_gerente…) cierra la intención.
 */
export function esFalloReintentable(error: unknown): boolean {
  return error instanceof ErrorServicio && (error.codigo === 'red' || error.codigo === 'desconocido')
}

/**
 * Guarda la clave de la intención en curso. `para(firma)` devuelve siempre la misma clave mientras la
 * `firma` (qué se quiere hacer y con qué datos) no cambie; si cambia, es otra intención y se genera una
 * nueva. `soltar()` cierra la intención (éxito o rechazo definitivo).
 */
export function crearClaveIdempotencia() {
  let firmaActual: string | null = null
  let claveActual = ''

  return {
    para(firma: string): string {
      if (firma !== firmaActual) {
        firmaActual = firma
        claveActual = generarUuid()
      }
      return claveActual
    },
    soltar(): void {
      firmaActual = null
      claveActual = ''
    },
  }
}
