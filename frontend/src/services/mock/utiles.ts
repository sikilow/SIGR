// Utilidades compartidas por los servicios simulados.

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
