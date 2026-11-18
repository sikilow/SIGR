import { describe, expect, it } from 'vitest'
import { aReporteVentas } from '../api/caja'
import { reporteVentasMock } from './reporteVentasMock'

const centavos = (n: number) => Math.round(n * 100)
const suma = (lista: Array<{ total: number }>) => lista.reduce((s, f) => s + centavos(f.total), 0)

describe('reporte de ventas del modo demo', () => {
  const hoy = new Date(2026, 10, 17, 23, 59)
  const reporte = reporteVentasMock('2026-11-01', '2026-11-30', hoy)

  it('no inventa ventas de días que no han llegado', () => {
    expect(reporte.porDia.every((d) => d.dia <= '2026-11-17')).toBe(true)
    expect(reporte.resumen.ventas).toBeGreaterThan(0)
  })

  it('todos los desgloses cuadran con el total', () => {
    const total = centavos(reporte.resumen.total)
    expect(suma(reporte.porDia)).toBe(total)
    expect(suma(reporte.porMetodo)).toBe(total)
    expect(suma(reporte.porMesero)).toBe(total)
    expect(suma(reporte.porProducto)).toBe(total)
    expect(suma(reporte.porCategoria)).toBe(total)
    expect(suma(reporte.porSeccion)).toBe(total)
    expect(suma(reporte.ventas)).toBe(total)
    expect(reporte.ventas).toHaveLength(reporte.resumen.ventas)
  })

  it('es determinista: el mismo periodo da lo mismo', () => {
    expect(reporteVentasMock('2026-11-01', '2026-11-30', hoy).resumen).toEqual(reporte.resumen)
  })

  it('el historial va de la venta más reciente a la más antigua', () => {
    const tiempos = reporte.ventas.map((v) => v.fechaHora.getTime())
    expect([...tiempos].sort((a, b) => b - a)).toEqual(tiempos)
  })
})

describe('aReporteVentas (respuesta de la API)', () => {
  it('convierte números en texto y fechas de MySQL', () => {
    const r = aReporteVentas({
      desde: '2026-11-01',
      hasta: '2026-11-30',
      resumen: { ventas: '2', total: '500.50' },
      por_dia: [{ dia: '2026-11-02', ventas: '2', total: '500.50' }],
      por_hora: [{ hora: '14', ventas: 2, total: 500.5 }],
      por_metodo: [{ metodo: 'Efectivo', pagos: '2', total: '500.50' }],
      por_mesero: [{ mesero: 'Ana', cuentas: 2, total: 500.5 }],
      por_producto: [{ producto: 'Café', presentacion: null, categoria: 'Bebidas', cantidad: '3', total: '90' }],
      por_categoria: [{ categoria: 'Bebidas', cantidad: 3, total: 90 }],
      por_seccion: [{ seccion: 'General', ventas: 2, total: 500.5 }],
      ventas: [
        {
          id_venta: '7',
          id_cuenta: 9,
          fecha_hora: '2026-11-02 14:05:00',
          total: '500.50',
          mesa_numero: '3',
          seccion: 'General',
          canal: null,
          cajero: 'Marta',
          meseros: null,
          pagos: [{ metodo: 'Efectivo', monto: '500.50' }],
        },
      ],
      ventas_truncadas: false,
    })
    expect(r.resumen).toEqual({ ventas: 2, total: 500.5 })
    expect(r.porProducto[0]).toMatchObject({ presentacion: '', cantidad: 3, total: 90 })
    expect(r.ventas[0]).toMatchObject({ idVenta: 7, mesaNumero: 3, meseros: '', pagos: [{ metodo: 'Efectivo', monto: 500.5 }] })
    expect(r.ventas[0]!.fechaHora).toEqual(new Date(2026, 10, 2, 14, 5))
  })
})
