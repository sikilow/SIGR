// Utilidades compartidas por los servicios simulados.
import { ErrorServicio } from '../errores'

/** Retraso simulado de red, en milisegundos. */
export const RETRASO_MS = 300

/** Resuelve con una copia del valor tras el retraso, para no filtrar referencias a la "base de datos". */
export function conRetraso<T>(calcular: () => T): Promise<T> {
  return new Promise((resolver, rechazar) => {
    setTimeout(() => {
      try {
        resolver(structuredClone(calcular()))
      } catch (error) {
        rechazar(error)
      }
    }, RETRASO_MS)
  })
}

/**
 * Fallos simulados para probar la interfaz (solo mock). Se activan desde la consola del navegador:
 *   sessionStorage.setItem('sigr.mock.fallarEnvio', '1')   // el próximo "enviar" falla 1 vez
 * Devuelve `true` (y descuenta un fallo pendiente) si toca fallar.
 */
export function consumirFalloSimulado(clave: string): boolean {
  try {
    const pendientes = Number(sessionStorage.getItem(clave) ?? 0)
    if (!(pendientes > 0)) return false
    sessionStorage.setItem(clave, String(pendientes - 1))
    return true
  } catch {
    return false
  }
}

/** Resultados ya entregados por clave de idempotencia (solo mock; se reinicia al recargar). */
const resultadosPorClave = new Map<string, unknown>()

/**
 * Como `conRetraso`, pero respeta `Idempotency-Key` (CAMBIO PROPUESTO EN F5): si la clave ya se usó,
 * devuelve el resultado anterior en vez de repetir la acción. Solo se guardan los éxitos; un error
 * (p. ej. `estado_invalido`) no consume la clave.
 *
 * Fallo simulado de "respuesta perdida" (la acción SÍ se aplica, pero el cliente no se entera):
 *   sessionStorage.setItem('sigr.mock.perderRespuesta', '1')   // la próxima acción responde "red" 1 vez
 * Sirve para comprobar que reintentar con la misma clave no duplica nada.
 */
export function conRetrasoIdempotente<T>(clave: string | undefined, accion: () => T): Promise<T> {
  return conRetraso(() => {
    let resultado: T
    if (clave !== undefined && resultadosPorClave.has(clave)) {
      resultado = structuredClone(resultadosPorClave.get(clave) as T)
    } else {
      resultado = accion()
      if (clave !== undefined) resultadosPorClave.set(clave, structuredClone(resultado))
    }
    if (consumirFalloSimulado('sigr.mock.perderRespuesta')) {
      throw new ErrorServicio('red', 'Se perdió la respuesta del servidor (fallo simulado).')
    }
    return resultado
  })
}
