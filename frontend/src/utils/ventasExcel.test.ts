import { describe, expect, it } from 'vitest'
import type { ReporteVentas } from '../types'
import { crearLibroVentas, HOJAS_VENTAS, nombreArchivoVentas } from './ventasExcel'

const reporte: ReporteVentas = {
  desde: '2026-11-01',
  hasta: '2026-11-30',
  resumen: { ventas: 2, total: 500, devoluciones: 0, devuelto: 0, neto: 500 },
  porDia: [{ dia: '2026-11-02', ventas: 2, total: 500 }],
  porHora: [{ hora: 14, ventas: 2, total: 500 }],
  porMetodo: [
    { metodo: 'Efectivo', pagos: 1, total: 300 },
    { metodo: 'Tarjeta', pagos: 1, total: 200 },
  ],
  porMesero: [{ mesero: 'Ana Torres', cuentas: 2, total: 500 }],
  porProducto: [{ producto: 'Enchiladas', presentacion: '', categoria: 'Platos fuertes', cantidad: 4, total: 500 }],
  porCategoria: [{ categoria: 'Platos fuertes', cantidad: 4, total: 500 }],
  porSeccion: [{ seccion: 'Terraza', ventas: 2, total: 500 }],
  ventas: [
    {
      idVenta: 8,
      idCuenta: 12,
      fechaHora: new Date(2026, 10, 2, 14, 5),
      total: 300,
      mesaNumero: 4,
      seccion: 'Terraza',
      canal: null,
      cajero: 'Marta Solís',
      meseros: 'Ana Torres',
      pagos: [{ metodo: 'Efectivo', monto: 300 }],
    },
  ],
  ventasTruncadas: false,
}

describe('Excel del reporte de ventas', () => {
  it('incluye el resumen y las hojas elegidas', async () => {
    const todas = new Set(HOJAS_VENTAS.map((h) => h.hoja))
    const libro = await crearLibroVentas(reporte, { etiqueta: 'Noviembre 2026', agrupacion: 'dia', hojas: todas })
    expect(libro.worksheets.map((h) => h.name)).toEqual([
      'Resumen',
      'Ventas en el tiempo',
      'Métodos de pago',
      'Meseros',
      'Productos',
      'Categorías',
      'Secciones',
      'Horas',
      'Historial de ventas',
    ])
    const resumen = libro.getWorksheet('Resumen')!
    expect(resumen.getCell(2, 2).value).toBe('Noviembre 2026')
    expect(resumen.getCell(5, 2).value).toBe(500)
    expect(resumen.getCell(7, 2).value).toBe(250)
    // Por día: los 30 días de noviembre, con cero en los días sin ventas.
    expect(libro.getWorksheet('Ventas en el tiempo')!.rowCount).toBe(31)
    const metodos = libro.getWorksheet('Métodos de pago')!
    expect(metodos.getCell(2, 4).value).toBeCloseTo(0.6)
    const historial = libro.getWorksheet('Historial de ventas')!
    expect(historial.getRow(1).values).toContain('Efectivo')
    expect(historial.getCell(2, 6).value).toBe('Salón')
  })

  it('sin hojas elegidas solo va el resumen', async () => {
    const libro = await crearLibroVentas(reporte, { etiqueta: 'Noviembre 2026', agrupacion: 'dia', hojas: new Set() })
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Resumen'])
  })

  it('nombre de archivo con el rango', () => {
    expect(nombreArchivoVentas(reporte)).toBe('ventas-2026-11-01-a-2026-11-30.xlsx')
    expect(nombreArchivoVentas({ desde: '2026-11-17', hasta: '2026-11-17' })).toBe('ventas-2026-11-17.xlsx')
  })
})
