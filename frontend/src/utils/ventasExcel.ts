// Excel del reporte de ventas (Gerente → Cortes y ventas → Reporte de ventas). Una hoja por sección del reporte, con
// encabezados en negritas, filtros, primera fila fija y formato de moneda y fecha. El usuario elige qué hojas incluir.
import type ExcelJS from 'exceljs'
import type { ReporteVentas } from '../types'
import { descargarLibro } from './corteExcel'
import { type Agrupacion, serieDeVentas } from './periodos'

const formatoMoneda = '"$"#,##0.00;[Red]-"$"#,##0.00'
const formatoPorcentaje = '0.0%'

/** Hojas que se pueden incluir. `resumen` siempre va. */
export type HojaVentas = 'periodo' | 'metodos' | 'meseros' | 'productos' | 'categorias' | 'secciones' | 'horas' | 'ventas'

export const HOJAS_VENTAS: ReadonlyArray<{ hoja: HojaVentas; texto: string }> = [
  { hoja: 'periodo', texto: 'Ventas en el tiempo' },
  { hoja: 'metodos', texto: 'Métodos de pago' },
  { hoja: 'meseros', texto: 'Meseros' },
  { hoja: 'productos', texto: 'Productos' },
  { hoja: 'categorias', texto: 'Categorías' },
  { hoja: 'secciones', texto: 'Secciones' },
  { hoja: 'horas', texto: 'Horas' },
  { hoja: 'ventas', texto: 'Historial de ventas (detalle)' },
]

export interface OpcionesExcelVentas {
  /** Nombre del periodo: «Noviembre 2026». */
  etiqueta: string
  agrupacion: Agrupacion
  hojas: ReadonlySet<HojaVentas>
}

const NOMBRE_AGRUPACION: Record<Agrupacion, string> = { dia: 'Día', semana: 'Semana (desde el lunes)', mes: 'Mes' }

function encabezar(hoja: ExcelJS.Worksheet, conFiltro = true): void {
  const fila = hoja.getRow(1)
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34443D' } }
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  if (conFiltro && hoja.rowCount > 1) hoja.autoFilter = { from: 'A1', to: `${hoja.getColumn(hoja.columnCount).letter}1` }
}

function moneda(hoja: ExcelJS.Worksheet, ...columnas: number[]): void {
  for (const c of columnas) hoja.getColumn(c).numFmt = formatoMoneda
}

/** Participación de cada fila en el total (0 a 1). */
const parte = (monto: number, total: number) => (total > 0 ? monto / total : 0)

export async function crearLibroVentas(reporte: ReporteVentas, opciones: OpcionesExcelVentas): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const libro = new ExcelJSRuntime.Workbook()
  libro.creator = 'SIGR'
  libro.created = new Date()
  const total = reporte.resumen.total
  const incluye = (h: HojaVentas) => opciones.hojas.has(h)

  // ---------- Resumen ----------
  const resumen = libro.addWorksheet('Resumen')
  resumen.columns = [
    { header: 'Dato', key: 'dato', width: 30 },
    { header: 'Valor', key: 'valor', width: 34 },
  ]
  const ticket = reporte.resumen.ventas > 0 ? Math.round((total / reporte.resumen.ventas) * 100) / 100 : 0
  const masVendido = reporte.porProducto[0]
  resumen.addRows([
    ['Periodo', opciones.etiqueta],
    ['Desde', reporte.desde],
    ['Hasta', reporte.hasta],
    ['Total vendido', total],
    ['Cuentas cobradas', reporte.resumen.ventas],
    ['Ticket promedio', ticket],
    ['Producto que más vendió', masVendido ? `${masVendido.producto}${masVendido.presentacion ? ` (${masVendido.presentacion})` : ''}` : '—'],
    ['Generado', new Date()],
  ])
  for (const fila of [5, 7]) resumen.getCell(fila, 2).numFmt = formatoMoneda
  resumen.getCell(9, 2).numFmt = 'dd/mm/yyyy hh:mm'
  resumen.getCell(6, 2).numFmt = '0'
  encabezar(resumen, false)

  // ---------- Ventas en el tiempo ----------
  if (incluye('periodo')) {
    const hoja = libro.addWorksheet('Ventas en el tiempo')
    hoja.columns = [
      { header: NOMBRE_AGRUPACION[opciones.agrupacion], key: 'periodo', width: 22 },
      { header: 'Desde', key: 'desde', width: 14 },
      { header: 'Cuentas cobradas', key: 'ventas', width: 18 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Ticket promedio', key: 'ticket', width: 16 },
    ]
    for (const p of serieDeVentas(reporte.porDia, reporte.desde, reporte.hasta, opciones.agrupacion)) {
      hoja.addRow({ periodo: p.etiqueta, desde: p.clave, ventas: p.ventas, total: p.total, ticket: p.ventas ? p.total / p.ventas : 0 })
    }
    moneda(hoja, 4, 5)
    encabezar(hoja)
  }

  // ---------- Métodos de pago ----------
  if (incluye('metodos')) {
    const hoja = libro.addWorksheet('Métodos de pago')
    hoja.columns = [
      { header: 'Método', key: 'metodo', width: 22 },
      { header: 'Pagos', key: 'pagos', width: 10 },
      { header: 'Total', key: 'total', width: 16 },
      { header: '% del total', key: 'parte', width: 12 },
    ]
    for (const m of reporte.porMetodo) hoja.addRow({ ...m, parte: parte(m.total, total) })
    moneda(hoja, 3)
    hoja.getColumn(4).numFmt = formatoPorcentaje
    encabezar(hoja)
  }

  // ---------- Meseros ----------
  if (incluye('meseros')) {
    const hoja = libro.addWorksheet('Meseros')
    hoja.columns = [
      { header: 'Mesero', key: 'mesero', width: 26 },
      { header: 'Cuentas atendidas', key: 'cuentas', width: 18 },
      { header: 'Vendido', key: 'total', width: 16 },
      { header: '% del total', key: 'parte', width: 12 },
    ]
    for (const m of reporte.porMesero) hoja.addRow({ ...m, parte: parte(m.total, total) })
    moneda(hoja, 3)
    hoja.getColumn(4).numFmt = formatoPorcentaje
    encabezar(hoja)
  }

  // ---------- Productos ----------
  if (incluye('productos')) {
    const hoja = libro.addWorksheet('Productos')
    hoja.columns = [
      { header: '#', key: 'lugar', width: 6 },
      { header: 'Producto', key: 'producto', width: 28 },
      { header: 'Presentación', key: 'presentacion', width: 20 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Vendido', key: 'total', width: 16 },
      { header: '% del total', key: 'parte', width: 12 },
    ]
    reporte.porProducto.forEach((p, i) => hoja.addRow({ lugar: i + 1, ...p, parte: parte(p.total, total) }))
    moneda(hoja, 6)
    hoja.getColumn(7).numFmt = formatoPorcentaje
    encabezar(hoja)
  }

  // ---------- Categorías ----------
  if (incluye('categorias')) {
    const hoja = libro.addWorksheet('Categorías')
    hoja.columns = [
      { header: 'Categoría', key: 'categoria', width: 22 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Vendido', key: 'total', width: 16 },
      { header: '% del total', key: 'parte', width: 12 },
    ]
    for (const c of reporte.porCategoria) hoja.addRow({ ...c, parte: parte(c.total, total) })
    moneda(hoja, 3)
    hoja.getColumn(4).numFmt = formatoPorcentaje
    encabezar(hoja)
  }

  // ---------- Secciones ----------
  if (incluye('secciones')) {
    const hoja = libro.addWorksheet('Secciones')
    hoja.columns = [
      { header: 'Sección', key: 'seccion', width: 22 },
      { header: 'Cuentas cobradas', key: 'ventas', width: 18 },
      { header: 'Total', key: 'total', width: 16 },
      { header: '% del total', key: 'parte', width: 12 },
    ]
    for (const s of reporte.porSeccion) hoja.addRow({ ...s, parte: parte(s.total, total) })
    moneda(hoja, 3)
    hoja.getColumn(4).numFmt = formatoPorcentaje
    encabezar(hoja)
  }

  // ---------- Horas ----------
  if (incluye('horas')) {
    const hoja = libro.addWorksheet('Horas')
    hoja.columns = [
      { header: 'Hora', key: 'hora', width: 14 },
      { header: 'Cuentas cobradas', key: 'ventas', width: 18 },
      { header: 'Total', key: 'total', width: 16 },
    ]
    for (const h of reporte.porHora) {
      hoja.addRow({ hora: `${String(h.hora).padStart(2, '0')}:00–${String(h.hora).padStart(2, '0')}:59`, ventas: h.ventas, total: h.total })
    }
    moneda(hoja, 3)
    encabezar(hoja)
  }

  // ---------- Historial (detalle) ----------
  if (incluye('ventas')) {
    const metodos = [...new Set(reporte.ventas.flatMap((v) => v.pagos.map((p) => p.metodo)))].sort()
    const hoja = libro.addWorksheet('Historial de ventas')
    hoja.columns = [
      { header: 'Venta', key: 'venta', width: 10 },
      { header: 'Cuenta', key: 'cuenta', width: 10 },
      { header: 'Fecha y hora', key: 'fecha', width: 20 },
      { header: 'Mesa', key: 'mesa', width: 8 },
      { header: 'Sección', key: 'seccion', width: 16 },
      { header: 'Canal', key: 'canal', width: 14 },
      { header: 'Mesero(s)', key: 'meseros', width: 26 },
      { header: 'Cajero', key: 'cajero', width: 22 },
      { header: 'Total', key: 'total', width: 14 },
      ...metodos.map((m) => ({ header: m, key: `m_${m}`, width: 14 })),
    ]
    for (const v of reporte.ventas) {
      const porMetodo = new Map<string, number>()
      for (const p of v.pagos) porMetodo.set(p.metodo, (porMetodo.get(p.metodo) ?? 0) + p.monto)
      hoja.addRow({
        venta: v.idVenta,
        cuenta: v.idCuenta,
        fecha: v.fechaHora,
        mesa: v.mesaNumero,
        seccion: v.seccion ?? '',
        canal: v.canal ?? 'Salón',
        meseros: v.meseros,
        cajero: v.cajero,
        total: v.total,
        ...Object.fromEntries(metodos.map((m) => [`m_${m}`, porMetodo.get(m) ?? 0])),
      })
    }
    hoja.getColumn(3).numFmt = 'dd/mm/yyyy hh:mm'
    for (let c = 9; c <= hoja.columnCount; c++) hoja.getColumn(c).numFmt = formatoMoneda
    encabezar(hoja)
    if (reporte.ventasTruncadas) {
      hoja.addRow([])
      hoja.addRow([`El periodo tiene ${reporte.resumen.ventas} ventas; aquí se listan las ${reporte.ventas.length} más recientes. Las demás hojas sí cuentan todas.`])
    }
  }

  return libro
}

/** Nombre de archivo: «ventas-2026-11-01-a-2026-11-30.xlsx». */
export function nombreArchivoVentas(reporte: Pick<ReporteVentas, 'desde' | 'hasta'>): string {
  return reporte.desde === reporte.hasta ? `ventas-${reporte.desde}.xlsx` : `ventas-${reporte.desde}-a-${reporte.hasta}.xlsx`
}

export async function descargarVentasExcel(reporte: ReporteVentas, opciones: OpcionesExcelVentas): Promise<void> {
  await descargarLibro(await crearLibroVentas(reporte, opciones), nombreArchivoVentas(reporte))
}
