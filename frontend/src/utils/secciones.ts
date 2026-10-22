// Secciones del salón (`mesa.zona`, texto libre) en el Panel del mesero y el Salón de la hostess (RF-MES-007).
// Funciones puras: los stores las usan para filtrar y agrupar, y las vistas para los textos.
import type { EstadoMesa } from '../types'

/** Lo mínimo que se necesita de una mesa para agruparla (sirve para `Mesa` y para `MesaSalon`). */
export interface MesaConSeccion {
  idMesa: number
  numero: number
  estado: EstadoMesa
  zona: string | null
}

export const ETIQUETA_SIN_SECCION = 'Sin sección'

/**
 * Filtro de sección. Una sección real nunca es vacía (los mappers la recortan y la vacía pasa a `null`), así que
 * `''` sirve para «todas» sin chocar con ningún nombre.
 */
export const TODAS_LAS_SECCIONES = ''

/** Clave (y valor de `?seccion=`) del grupo de mesas sin sección. Solo chocaría con una sección llamada así. */
export const CLAVE_SIN_SECCION = 'sin-seccion'

export interface OpcionSeccion {
  /** Nombre exacto de la sección o `CLAVE_SIN_SECCION`. */
  clave: string
  /** Texto visible: el nombre o «Sin sección». */
  nombre: string
}

export interface GrupoSeccion<T> extends OpcionSeccion {
  /** Mesas visibles del grupo (ya filtradas), ordenadas por número. */
  mesas: T[]
  /** Mesas libres de la sección, sin importar los filtros (contexto para el encabezado). */
  libres: number
  /** Total de mesas de la sección, sin importar los filtros. */
  total: number
}

export function claveSeccion(zona: string | null): string {
  return zona ?? CLAVE_SIN_SECCION
}

export function nombreSeccion(zona: string | null): string {
  return zona ?? ETIQUETA_SIN_SECCION
}

/** Orden alfabético en español (sin distinguir mayúsculas ni acentos; «Mesa 2» antes que «Mesa 10») y «Sin sección» al final. */
export function compararSecciones(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }) || a.localeCompare(b, 'es')
}

/** Secciones distintas de las mesas, ordenadas; «Sin sección» al final si alguna mesa no tiene. */
export function seccionesDe(mesas: readonly MesaConSeccion[]): OpcionSeccion[] {
  const zonas = [...new Set(mesas.map((m) => m.zona))].sort(compararSecciones)
  return zonas.map((z) => ({ clave: claveSeccion(z), nombre: nombreSeccion(z) }))
}

/** Hay más de una sección (contando «Sin sección»). Si no, la pantalla se ve como siempre: sin encabezados ni select. */
export function hayVariasSecciones(mesas: readonly MesaConSeccion[]): boolean {
  return new Set(mesas.map((m) => m.zona)).size > 1
}

/** Convierte un valor de la URL (?seccion=) en un filtro; ausente, vacío o no texto = todas. */
export function seccionDesdeConsulta(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : TODAS_LAS_SECCIONES
}

/**
 * El filtro que de verdad se aplica: «todas» si hay una sola sección (el select ni se muestra) o si la sección pedida
 * ya no existe (p. ej. el gerente la renombró o la URL es vieja), para no dejar la pantalla vacía sin explicación.
 */
export function seccionEfectiva(filtro: string, mesas: readonly MesaConSeccion[]): string {
  if (filtro === TODAS_LAS_SECCIONES || !hayVariasSecciones(mesas)) return TODAS_LAS_SECCIONES
  return mesas.some((m) => claveSeccion(m.zona) === filtro) ? filtro : TODAS_LAS_SECCIONES
}

export function filtrarPorSeccion<T extends MesaConSeccion>(mesas: readonly T[], filtro: string): T[] {
  return filtro === TODAS_LAS_SECCIONES ? [...mesas] : mesas.filter((m) => claveSeccion(m.zona) === filtro)
}

/**
 * Agrupa las mesas visibles por sección. Los conteos del encabezado salen de `todas` (todas las mesas de la sección,
 * sin filtros), para que «2 libres de 6 mesas» no cambie al filtrar por estado. Un grupo sin mesas visibles no aparece.
 */
export function agruparPorSeccion<T extends MesaConSeccion>(visibles: readonly T[], todas: readonly MesaConSeccion[]): GrupoSeccion<T>[] {
  const porZona = new Map<string | null, T[]>()
  for (const m of visibles) {
    const lista = porZona.get(m.zona)
    if (lista) lista.push(m)
    else porZona.set(m.zona, [m])
  }
  return [...porZona.keys()].sort(compararSecciones).map((zona) => {
    const deLaSeccion = todas.filter((m) => m.zona === zona)
    return {
      clave: claveSeccion(zona),
      nombre: nombreSeccion(zona),
      mesas: [...porZona.get(zona)!].sort((a, b) => a.numero - b.numero),
      libres: deLaSeccion.filter((m) => m.estado === 'libre').length,
      total: deLaSeccion.length,
    }
  })
}

/** «2 libres de 6 mesas», «1 libre de 1 mesa». */
export function formatearLibresDe(libres: number, total: number): string {
  return `${libres} ${libres === 1 ? 'libre' : 'libres'} de ${total} ${total === 1 ? 'mesa' : 'mesas'}`
}

/** Complemento para «No hay mesas libres…»: « en Terraza», « sin sección» o nada si son todas. */
export function sufijoSeccion(filtro: string): string {
  if (filtro === TODAS_LAS_SECCIONES) return ''
  return filtro === CLAVE_SIN_SECCION ? ' sin sección' : ` en ${filtro}`
}

/**
 * Texto para la región aria-live al cambiar un filtro: «Filtro: libres, sección Terraza. 3 mesas.»
 * `estado` es la etiqueta del filtro de estado en minúsculas o `null` si son todas.
 */
export function describirFiltroMesas(cantidad: number, estado: string | null, seccion: string): string {
  const partes: string[] = []
  if (estado) partes.push(estado)
  if (seccion === CLAVE_SIN_SECCION) partes.push('sin sección')
  else if (seccion !== TODAS_LAS_SECCIONES) partes.push(`sección ${seccion}`)
  const filtro = partes.length > 0 ? `Filtro: ${partes.join(', ')}.` : 'Todas las mesas.'
  const total = cantidad === 0 ? 'Ninguna mesa' : cantidad === 1 ? '1 mesa' : `${cantidad} mesas`
  return `${filtro} ${total}.`
}
