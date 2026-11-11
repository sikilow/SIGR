/** Mensaje cuando el backend no contesta (apagado, reiniciándose o sin conexión con la base de datos). */
export const MENSAJE_SIN_SERVIDOR = 'El servidor no responde. Inténtalo de nuevo en un momento.'

type CuerpoApi = { mensaje?: string }

/**
 * Lee el cuerpo JSON de una respuesta del backend sin romperse: si viene vacío o no es JSON
 * (p. ej. el 502 que da el proxy de Vite con el backend apagado) devuelve un objeto vacío.
 */
export async function leerCuerpo<T extends object = Record<string, unknown>>(respuesta: Response): Promise<Partial<T> & CuerpoApi> {
  const texto = await respuesta.text()
  if (!texto) return {}
  try {
    const valor: unknown = JSON.parse(texto)
    return typeof valor === 'object' && valor !== null ? (valor as Partial<T> & CuerpoApi) : {}
  } catch {
    return {}
  }
}

/** Mensaje para la persona cuando la respuesta no fue exitosa: el del backend, o uno que explique la falla. */
export function mensajeDeError(respuesta: Response, cuerpo: CuerpoApi, porDefecto: string): string {
  if (typeof cuerpo.mensaje === 'string' && cuerpo.mensaje.trim()) return cuerpo.mensaje
  if (respuesta.status === 502 || respuesta.status === 503 || respuesta.status === 504) return MENSAJE_SIN_SERVIDOR
  return porDefecto
}
