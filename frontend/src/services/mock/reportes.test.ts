import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aDia } from '../../utils/periodos'
import { crearCatalogoMock } from './adminMock'
import { crearReportesMock } from './reportesMock'

async function esperar<T>(promesa: Promise<T>): Promise<T> {
  const resultado = promesa.then(
    (valor) => ({ ok: true as const, valor }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  await vi.advanceTimersByTimeAsync(400)
  const r = await resultado
  if (!r.ok) throw r.error
  return r.valor
}

const mensajeDe = async (p: Promise<unknown>): Promise<string> => {
  try {
    await esperar(p)
  } catch (e) {
    return (e as Error).message
  }
  return 'sin error'
}

beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 10, 19, 12, 0, 0) }))
afterEach(() => vi.useRealTimers())

describe('reporte de reservaciones (demo)', () => {
  it('cuenta cada estado y todos los desgloses suman el total', async () => {
    const reportes = crearReportesMock()
    const r = await esperar(reportes.reporteReservaciones('2026-10-01', '2026-10-31'))
    const { resumen } = r
    expect(resumen.total).toBeGreaterThan(0)
    expect(resumen.llegaron + resumen.vencidas + resumen.canceladas + resumen.porLlegar).toBe(resumen.total)
    for (const desglose of [r.porDia, r.porHora, r.porDiaSemana, r.porSeccion]) {
      expect(desglose.reduce((s, f) => s + f.total, 0)).toBe(resumen.total)
    }
    expect(resumen.personasLlegaron + resumen.personasVencidas).toBeLessThanOrEqual(resumen.personas)
    // Los días de la semana van de 0 (lunes) a 6 (domingo)
    expect(r.porDiaSemana.every((f) => f.diaSemana >= 0 && f.diaSemana <= 6)).toBe(true)
    // Los clientes señalados tienen 2 o más inasistencias
    expect(r.clientesConInasistencias.every((c) => c.inasistencias >= 2)).toBe(true)
  })

  it('es determinista: el mismo periodo da lo mismo', async () => {
    const reportes = crearReportesMock()
    const a = await esperar(reportes.reporteReservaciones('2026-09-01', '2026-09-30'))
    const b = await esperar(reportes.reporteReservaciones('2026-09-01', '2026-09-30'))
    expect(b).toEqual(a)
  })

  it('valida el rango', async () => {
    const reportes = crearReportesMock()
    expect(await mensajeDe(reportes.reporteReservaciones('2026-10-31', '2026-10-01'))).toContain('no puede ser posterior')
    expect(await mensajeDe(reportes.reporteReservaciones('2020-01-01', '2026-12-31'))).toContain('dos años')
  })
})

describe('mermas (demo)', () => {
  it('registra una merma, baja el inventario y aparece en el reporte', async () => {
    const reportes = crearReportesMock()
    const catalogo = crearCatalogoMock()
    const productos = await esperar(catalogo.listarProductos())
    const controlado = productos.find((p) => p.controlaExistencia && p.existencia >= 3)!
    const hoy = aDia(new Date())

    const antes = await esperar(reportes.reporteMermas(hoy, hoy))
    const merma = await esperar(reportes.registrarMerma({ idProducto: controlado.idProducto, cantidad: 2, motivo: 'caducado', nota: 'Lote vencido' }))
    expect(merma).toMatchObject({ cantidad: 2, motivo: 'caducado', nota: 'Lote vencido', descuentaInventario: true, valor: controlado.precio * 2 })

    const despues = (await esperar(catalogo.listarProductos())).find((p) => p.idProducto === controlado.idProducto)!
    expect(despues.existencia).toBe(controlado.existencia - 2)

    const r = await esperar(reportes.reporteMermas(hoy, hoy))
    expect(r.resumen.registros).toBe(antes.resumen.registros + 1)
    expect(r.resumen.unidades).toBe(antes.resumen.unidades + 2)
    expect(r.porMotivo.find((m) => m.motivo === 'caducado')?.unidades).toBeGreaterThanOrEqual(2)
    expect(r.porProducto.reduce((s, p) => s + p.unidades, 0)).toBe(r.resumen.unidades)
    expect(r.mermas[0]).toMatchObject({ producto: controlado.nombre, cantidad: 2 })
  })

  it('no deja pasar de lo que hay, ni cantidades inválidas, ni productos inexistentes', async () => {
    const reportes = crearReportesMock()
    const productos = await esperar(crearCatalogoMock().listarProductos())
    const controlado = productos.find((p) => p.controlaExistencia && p.existencia > 0)!
    expect(await mensajeDe(reportes.registrarMerma({ idProducto: controlado.idProducto, cantidad: controlado.existencia + 1, motivo: 'danado' }))).toContain('Solo quedan')
    expect(await mensajeDe(reportes.registrarMerma({ idProducto: controlado.idProducto, cantidad: 0, motivo: 'danado' }))).toContain('número entero')
    expect(await mensajeDe(reportes.registrarMerma({ idProducto: 999999, cantidad: 1, motivo: 'otro' }))).toContain('no existe')
  })

  it('un producto que se prepara al momento solo deja el registro', async () => {
    const reportes = crearReportesMock()
    const productos = await esperar(crearCatalogoMock().listarProductos())
    const libre = productos.find((p) => !p.controlaExistencia)!
    const merma = await esperar(reportes.registrarMerma({ idProducto: libre.idProducto, cantidad: 4, motivo: 'preparacion' }))
    expect(merma.descuentaInventario).toBe(false)
  })

  it('el mismo reintento (misma clave) no duplica la merma ni el descuento', async () => {
    const reportes = crearReportesMock()
    const catalogo = crearCatalogoMock()
    const controlado = (await esperar(catalogo.listarProductos())).find((p) => p.controlaExistencia && p.existencia >= 5)!
    const m1 = await esperar(reportes.registrarMerma({ idProducto: controlado.idProducto, cantidad: 1, motivo: 'otro' }, 'clave-1'))
    const m2 = await esperar(reportes.registrarMerma({ idProducto: controlado.idProducto, cantidad: 1, motivo: 'otro' }, 'clave-1'))
    expect(m2.idMerma).toBe(m1.idMerma)
    const despues = (await esperar(catalogo.listarProductos())).find((p) => p.idProducto === controlado.idProducto)!
    expect(despues.existencia).toBe(controlado.existencia - 1)
  })
})
