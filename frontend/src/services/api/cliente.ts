// Cliente fetch tipado hacia VITE_API_URL.
// PROVISIONAL: se asume sesión por cookie de PHP (`credentials: 'include'`). Si el equipo
// de API decide usar token, el único cambio es agregar aquí el encabezado Authorization.
import { ErrorServicio, type CodigoError } from '../errores'
import { aDisponibilidad, type DisponibilidadDto } from './mappers'

const URL_BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/+$/, '')

type Metodo = 'GET' | 'POST' | 'PATCH'
type ValorConsulta = string | number | undefined

interface Opciones {
  /** Cuerpo JSON (ya en el formato de la API, p. ej. snake_case). */
  cuerpo?: unknown
  /** Parámetros de consulta; los `undefined` se omiten. */
  consulta?: Record<string, ValorConsulta>
}

/** Forma tolerante del cuerpo de error: el formato real está por acordar con el equipo de API. */
interface CuerpoError {
  codigo?: string
  mensaje?: string
  message?: string
  error?: string
  /** CAMBIO PROPUESTO EN F4: en errores `producto_agotado`, los productos agotados. */
  productos?: DisponibilidadDto[]
}

const CODIGOS_CONOCIDOS: readonly CodigoError[] = [
  'no_autenticado',
  'credenciales_invalidas',
  'sin_permiso',
  'requiere_gerente',
  'no_encontrado',
  'estado_invalido',
  'producto_agotado',
  'mesa_no_disponible',
]

function codigoPorEstadoHttp(estado: number): CodigoError {
  if (estado === 401) return 'no_autenticado'
  if (estado === 403) return 'sin_permiso'
  if (estado === 404) return 'no_encontrado'
  if (estado === 409 || estado === 422) return 'estado_invalido'
  return 'desconocido'
}

function aErrorServicio(estado: number, cuerpo: CuerpoError | null): ErrorServicio {
  const codigo = CODIGOS_CONOCIDOS.find((c) => c === cuerpo?.codigo) ?? codigoPorEstadoHttp(estado)
  const mensaje = cuerpo?.mensaje ?? cuerpo?.message ?? cuerpo?.error ?? `Error ${estado} de la API.`
  return new ErrorServicio(codigo, mensaje, estado, cuerpo?.productos?.map(aDisponibilidad))
}

function construirUrl(ruta: string, consulta?: Record<string, ValorConsulta>): string {
  const parametros = new URLSearchParams()
  for (const [clave, valor] of Object.entries(consulta ?? {})) {
    if (valor !== undefined) parametros.set(clave, String(valor))
  }
  const texto = parametros.toString()
  return `${URL_BASE}${ruta}${texto ? `?${texto}` : ''}`
}

/** Hace la petición y devuelve el JSON tipado como `T` (o `undefined` si no hay cuerpo). */
export async function solicitar<T>(metodo: Metodo, ruta: string, opciones: Opciones = {}): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(construirUrl(ruta, opciones.consulta), {
      method: metodo,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    })
  } catch {
    throw new ErrorServicio('red', 'No se pudo conectar con el servidor.')
  }

  const texto = await respuesta.text()
  let json: unknown = null
  if (texto) {
    try {
      json = JSON.parse(texto)
    } catch {
      json = null
    }
  }

  if (!respuesta.ok) {
    throw aErrorServicio(respuesta.status, json as CuerpoError | null)
  }
  return json as T
}
