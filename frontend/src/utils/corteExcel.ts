import type ExcelJS from 'exceljs'
import type { CorteCaja } from '../types'

const formatoMoneda = '"$"#,##0.00;[Red]-"$"#,##0.00'
const formatosMetodo = ['Efectivo', 'Tarjeta', 'Transferencia']

export async function crearLibroCorte(corte: CorteCaja): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const workbook = new ExcelJSRuntime.Workbook()
  workbook.creator = 'SIGR'
  workbook.created = new Date()

  const resumen = workbook.addWorksheet('Corte')
  resumen.columns = [
    { header: 'Dato', key: 'dato', width: 30 },
    { header: 'Valor', key: 'valor', width: 32 },
  ]
  resumen.addRows([
    ['Número de corte', corte.idCorte],
    ['Tipo', corte.tipoCierre === 'parcial' ? 'Parcial' : 'Final'],
    ['Cajero', corte.cajeroNombre],
    ['Usuario cajero', corte.idCajero],
    ['Inicio', corte.inicio],
    ['Cierre', corte.fin],
    ['Fondo inicial', corte.efectivoInicial],
    ['Ventas cobradas', corte.totalVentas],
    ['Efectivo esperado', corte.efectivoEsperado],
    ['Efectivo contado', corte.efectivoContado],
    ['Diferencia de efectivo', corte.diferenciaEfectivo],
  ])
  resumen.getColumn(2).numFmt = formatoMoneda
  for (const index of [5, 6]) resumen.getCell(index, 2).numFmt = 'dd/mm/yyyy hh:mm'
  resumen.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  resumen.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34443D' } }
  resumen.addRow([])
  resumen.addRow(['Método de pago', 'Cantidad de pagos', 'Total'])
  resumen.getRow(14).font = { bold: true }
  for (const metodo of corte.metodosPago) {
    resumen.addRow([metodo.nombre, metodo.cantidadPagos, metodo.monto])
    resumen.getCell(resumen.rowCount, 3).numFmt = formatoMoneda
  }

  const metodos = [...new Set([...formatosMetodo, ...corte.metodosPago.map((metodo) => metodo.nombre)])]
  const cuentas = workbook.addWorksheet('Cuentas cobradas')
  cuentas.columns = [
    { header: 'Venta', key: 'venta', width: 12 },
    { header: 'Cuenta', key: 'cuenta', width: 12 },
    { header: 'Mesa', key: 'mesa', width: 10 },
    { header: 'Fecha y hora', key: 'fecha', width: 22 },
    { header: 'Cajero', key: 'cajero', width: 24 },
    { header: 'Mesero(s)', key: 'mesero', width: 28 },
    { header: 'Total', key: 'total', width: 16 },
    ...metodos.map((metodo) => ({ header: metodo, key: `metodo_${metodo}`, width: 16 })),
  ]
  cuentas.addRows(
    corte.ventas.map((venta) => {
      const pagosPorMetodo = new Map<string, number>()
      for (const pago of venta.pagos) {
        pagosPorMetodo.set(pago.metodo, (pagosPorMetodo.get(pago.metodo) ?? 0) + pago.monto)
      }
      return {
        venta: venta.idVenta,
        cuenta: venta.idCuenta,
        mesa: venta.mesaNumero,
        fecha: venta.fechaHora,
        cajero: venta.cajeroNombre,
        mesero: venta.meseroNombre,
        total: venta.total,
        ...Object.fromEntries(metodos.map((metodo) => [`metodo_${metodo}`, pagosPorMetodo.get(metodo) ?? 0])),
      }
    }),
  )
  cuentas.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cuentas.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34443D' } }
  cuentas.getColumn(4).numFmt = 'dd/mm/yyyy hh:mm'
  for (let column = 7; column <= cuentas.columnCount; column += 1) {
    cuentas.getColumn(column).numFmt = formatoMoneda
  }
  cuentas.autoFilter = { from: 'A1', to: `${cuentas.getColumn(cuentas.columnCount).letter}1` }
  cuentas.views = [{ state: 'frozen', ySplit: 1 }]

  return workbook
}

export async function descargarCorteExcel(corte: CorteCaja): Promise<void> {
  const workbook = await crearLibroCorte(corte)
  const contenido = await workbook.xlsx.writeBuffer()
  const archivo = new Blob([new Uint8Array(contenido)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(archivo)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `corte-caja-${corte.idCorte}-${corte.inicio.toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}