// Periodos del reporte de ventas: día, semana, mes, trimestre, semestre, año o un rango personalizado. Funciones puras
// con fechas locales AAAA-MM-DD (las mismas que usan los campos de fecha y la API).

export type TipoPeriodo = 'dia' | 'semana' | 'mes' | 'trimestre' | 'semestre' | 'anio' | 'personalizado'

export interface Periodo {
  tipo: TipoPeriodo
  /** AAAA-MM-DD, incluido. */
  desde: string
  /** AAAA-MM-DD, incluido. */
  hasta: string
}

/** Botones de periodo, en el orden en que se muestran. */
export const TIPOS_PERIODO: ReadonlyArray<{ tipo: TipoPeriodo; texto: string }> = [
  { tipo: 'dia', texto: 'Día' },
  { tipo: 'semana', texto: 'Semana' },
  { tipo: 'mes', texto: 'Mes' },
  { tipo: 'trimestre', texto: 'Trimestre' },
  { tipo: 'semestre', texto: 'Semestre' },
  { tipo: 'anio', texto: 'Año' },
  { tipo: 'personalizado', texto: 'Personalizado' },
]

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Fecha local → AAAA-MM-DD. */
export function aDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

/** AAAA-MM-DD → fecha local a medianoche. */
export function deDia(dia: string): Date {
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number]
  return new Date(anio, mes - 1, d)
}

function sumarDias(dia: string, dias: number): string {
  const fecha = deDia(dia)
  fecha.setDate(fecha.getDate() + dias)
  return aDia(fecha)
}

/** Días del rango, contando ambos extremos. */
export function diasDelRango(desde: string, hasta: string): number {
  return Math.round((deDia(hasta).getTime() - deDia(desde).getTime()) / 86_400_000) + 1
}

/** Lunes de la semana de `fecha` (la semana va de lunes a domingo). */
function lunesDe(fecha: Date): Date {
  const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
  return lunes
}

/** Periodo del tipo indicado que contiene `fecha`. `personalizado` empieza con los últimos 30 días. */
export function periodoQueContiene(tipo: TipoPeriodo, fecha: Date): Periodo {
  const anio = fecha.getFullYear()
  const mes = fecha.getMonth()
  switch (tipo) {
    case 'dia':
      return { tipo, desde: aDia(fecha), hasta: aDia(fecha) }
    case 'semana': {
      const lunes = lunesDe(fecha)
      return { tipo, desde: aDia(lunes), hasta: sumarDias(aDia(lunes), 6) }
    }
    case 'mes':
      return { tipo, desde: aDia(new Date(anio, mes, 1)), hasta: aDia(new Date(anio, mes + 1, 0)) }
    case 'trimestre': {
      const inicio = Math.floor(mes / 3) * 3
      return { tipo, desde: aDia(new Date(anio, inicio, 1)), hasta: aDia(new Date(anio, inicio + 3, 0)) }
    }
    case 'semestre': {
      const inicio = mes < 6 ? 0 : 6
      return { tipo, desde: aDia(new Date(anio, inicio, 1)), hasta: aDia(new Date(anio, inicio + 6, 0)) }
    }
    case 'anio':
      return { tipo, desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
    case 'personalizado':
      return { tipo, desde: sumarDias(aDia(fecha), -29), hasta: aDia(fecha) }
  }
}

/** El periodo anterior (`pasos` = -1) o siguiente (`+1`) del mismo tipo. Un rango personalizado se recorre por su largo. */
export function moverPeriodo(periodo: Periodo, pasos: number): Periodo {
  const inicio = deDia(periodo.desde)
  switch (periodo.tipo) {
    case 'dia':
      return periodoQueContiene('dia', new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + pasos))
    case 'semana':
      return periodoQueContiene('semana', new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7 * pasos))
    case 'mes':
      return periodoQueContiene('mes', new Date(inicio.getFullYear(), inicio.getMonth() + pasos, 1))
    case 'trimestre':
      return periodoQueContiene('trimestre', new Date(inicio.getFullYear(), inicio.getMonth() + 3 * pasos, 1))
    case 'semestre':
      return periodoQueContiene('semestre', new Date(inicio.getFullYear(), inicio.getMonth() + 6 * pasos, 1))
    case 'anio':
      return periodoQueContiene('anio', new Date(inicio.getFullYear() + pasos, 0, 1))
    case 'personalizado': {
      const largo = diasDelRango(periodo.desde, periodo.hasta)
      return { tipo: 'personalizado', desde: sumarDias(periodo.desde, largo * pasos), hasta: sumarDias(periodo.hasta, largo * pasos) }
    }
  }
}

function fechaCorta(dia: string, conAnio = true): string {
  const f = deDia(dia)
  return `${f.getDate()} ${MESES_CORTOS[f.getMonth()]}${conAnio ? ` ${f.getFullYear()}` : ''}`
}

/** Nombre del periodo para el encabezado y el Excel: «Noviembre 2026», «2.º semestre 2026», «2026»… */
export function etiquetaPeriodo(periodo: Periodo): string {
  const inicio = deDia(periodo.desde)
  const anio = inicio.getFullYear()
  switch (periodo.tipo) {
    case 'dia':
      return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(inicio)
    case 'semana':
      return `Semana del ${fechaCorta(periodo.desde, false)} al ${fechaCorta(periodo.hasta)}`
    case 'mes': {
      const nombre = MESES[inicio.getMonth()]!
      return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`
    }
    case 'trimestre': {
      const n = Math.floor(inicio.getMonth() / 3) + 1
      return `${n}.º trimestre ${anio} (${MESES_CORTOS[(n - 1) * 3]}–${MESES_CORTOS[(n - 1) * 3 + 2]})`
    }
    case 'semestre':
      return inicio.getMonth() < 6 ? `1.er semestre ${anio} (ene–jun)` : `2.º semestre ${anio} (jul–dic)`
    case 'anio':
      return String(anio)
    case 'personalizado':
      return periodo.desde === periodo.hasta ? fechaCorta(periodo.desde) : `Del ${fechaCorta(periodo.desde)} al ${fechaCorta(periodo.hasta)}`
  }
}

/** ¿El periodo ya empezó? (no se avanza a periodos que todavía no llegan). */
export function periodoEmpezado(periodo: Periodo, hoy: Date): boolean {
  return periodo.desde <= aDia(hoy)
}

// ---------- Serie de ventas en el tiempo ----------

export type Agrupacion = 'dia' | 'semana' | 'mes'

/** Cómo agrupar la gráfica según el largo del rango: hasta 45 días por día, hasta ~6 meses por semana, después por mes. */
export function agrupacionSugerida(desde: string, hasta: string): Agrupacion {
  const dias = diasDelRango(desde, hasta)
  if (dias <= 45) return 'dia'
  if (dias <= 190) return 'semana'
  return 'mes'
}

export interface PuntoSerie {
  /** Primer día del grupo (AAAA-MM-DD). */
  clave: string
  /** «17 nov», «Sem. 16 nov», «Nov 2026». */
  etiqueta: string
  ventas: number
  total: number
}

/**
 * Serie completa del rango agrupada por día, semana o mes, con CERO en los grupos sin ventas (una gráfica con huecos
 * escondería los días flojos). Los importes se suman en centavos para no acumular errores de redondeo.
 */
export function serieDeVentas(
  porDia: ReadonlyArray<{ dia: string; ventas: number; total: number }>,
  desde: string,
  hasta: string,
  agrupacion: Agrupacion,
): PuntoSerie[] {
  const claveDe = (dia: string): string => {
    if (agrupacion === 'dia') return dia
    if (agrupacion === 'semana') return aDia(lunesDe(deDia(dia)))
    return `${dia.slice(0, 7)}-01`
  }
  const grupos = new Map<string, { ventas: number; centavos: number }>()
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
    const clave = claveDe(dia)
    if (!grupos.has(clave)) grupos.set(clave, { ventas: 0, centavos: 0 })
  }
  for (const fila of porDia) {
    if (fila.dia < desde || fila.dia > hasta) continue
    const grupo = grupos.get(claveDe(fila.dia))
    if (!grupo) continue
    grupo.ventas += fila.ventas
    grupo.centavos += Math.round(fila.total * 100)
  }
  return [...grupos.entries()].map(([clave, g]) => {
    const f = deDia(clave)
    const etiqueta =
      agrupacion === 'dia'
        ? `${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`
        : agrupacion === 'semana'
          ? `Sem. ${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`
          : `${MESES_CORTOS[f.getMonth()]!.charAt(0).toUpperCase()}${MESES_CORTOS[f.getMonth()]!.slice(1)} ${f.getFullYear()}`
    return { clave, etiqueta, ventas: g.ventas, total: g.centavos / 100 }
  })
}
