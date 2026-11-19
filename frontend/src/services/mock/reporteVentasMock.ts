// Reporte de ventas del modo demo. No hay historial real de cobros en el mock, así que se generan ventas de ejemplo
// para cada día del rango (hasta hoy) con el menú, las mesas y los meseros del mock. Son DETERMINISTAS: el mismo día
// siempre da las mismas ventas, para que cambiar de periodo y volver muestre lo mismo. Después se agregan igual que la
// API (por día, hora, método, mesero, producto, categoría y sección).
import type { ReporteVentas, VentaReporte } from '../../types'
import { aDia, deDia } from '../../utils/periodos'
import { baseDatos } from './baseDatos'
import { metodosPagoMock } from './metodosPago'

export interface LineaMock {
  idProducto: number
  producto: string
  presentacion: string
  categoria: string
  cantidad: number
  importe: number
  mesero: string
}

/** Generador pseudoaleatorio con semilla (mulberry32): mismo día → mismos números. */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const centavos = (monto: number) => Math.round(monto * 100)

/** Las ventas de ejemplo de un día (con sus líneas). El primer id de venta del día es `AAAAMMDD00`. */
export function ventasDemoDelDia(dia: string): Array<VentaReporte & { lineas: LineaMock[] }> {
  const primerId = Number(dia.replaceAll('-', '')) * 100
  const azar = aleatorio(Number(dia.replaceAll('-', '')))
  const elegir = <T>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)]!
  const productos = baseDatos.categorias.flatMap((c) => c.productos.map((p) => ({ ...p, categoria: c.nombre })))
  const mesas = baseDatos.mesas.filter((m) => m.activa)
  const meseros = baseDatos.usuarios.filter((u) => u.rol === 'mesero').map((u) => u.nombre)
  const cajero = baseDatos.usuarios.find((u) => u.rol === 'cajero')?.nombre ?? 'Cajero'
  if (!productos.length || !mesas.length || !meseros.length) return []

  // Fines de semana se vende más.
  const finDeSemana = [0, 5, 6].includes(deDia(dia).getDay())
  const cuantas = Math.floor(azar() * 6) + (finDeSemana ? 9 : 5)
  const ventas: Array<VentaReporte & { lineas: LineaMock[] }> = []
  for (let i = 0; i < cuantas; i++) {
    const mesa = elegir(mesas)
    const mesero = elegir(meseros)
    const lineas: LineaMock[] = []
    const renglones = Math.floor(azar() * 4) + 1
    for (let r = 0; r < renglones; r++) {
      const producto = elegir(productos)
      const cantidad = Math.floor(azar() * 3) + 1
      lineas.push({
        idProducto: producto.idProducto,
        producto: producto.nombre,
        presentacion: producto.presentacion ?? '',
        categoria: producto.categoria,
        cantidad,
        importe: centavos(producto.precio * cantidad) / 100,
        mesero,
      })
    }
    const total = lineas.reduce((s, l) => s + centavos(l.importe), 0) / 100
    const hora = 13 + Math.floor(azar() * 10)
    const fecha = deDia(dia)
    fecha.setHours(hora, Math.floor(azar() * 60), 0, 0)
    const sorteo = azar()
    const metodo = sorteo < 0.5 ? metodosPagoMock[0]! : sorteo < 0.85 ? metodosPagoMock[1]! : metodosPagoMock[2]!
    ventas.push({
      idVenta: primerId + i,
      idCuenta: primerId + i,
      fechaHora: fecha,
      total,
      mesaNumero: mesa.numero,
      seccion: mesa.zona,
      canal: mesa.zona === 'Para llevar' ? 'Mostrador' : null,
      cajero,
      meseros: mesero,
      pagos: [{ metodo: metodo.nombre, monto: total }],
      lineas,
    })
  }
  return ventas
}

/** Suma por clave en centavos y devuelve las filas ordenadas por importe (mayor primero). */
function agrupar<T extends string | number>(
  entradas: Array<{ clave: T; cantidad: number; importe: number }>,
): Array<{ clave: T; cantidad: number; total: number }> {
  const mapa = new Map<T, { cantidad: number; centavos: number }>()
  for (const e of entradas) {
    const g = mapa.get(e.clave) ?? { cantidad: 0, centavos: 0 }
    g.cantidad += e.cantidad
    g.centavos += centavos(e.importe)
    mapa.set(e.clave, g)
  }
  return [...mapa.entries()]
    .map(([clave, g]) => ({ clave, cantidad: g.cantidad, total: g.centavos / 100 }))
    .sort((a, b) => b.total - a.total)
}

export function reporteVentasMock(desde: string, hasta: string, hoy = new Date()): ReporteVentas {
  const ultimo = hasta < aDia(hoy) ? hasta : aDia(hoy)
  const ventas: Array<VentaReporte & { lineas: LineaMock[] }> = []
  for (let f = deDia(desde); aDia(f) <= ultimo; f.setDate(f.getDate() + 1)) {
    ventas.push(...ventasDemoDelDia(aDia(f)))
  }
  // Solo lo ya cobrado: el día de hoy, hasta la hora actual.
  const cobradas = ventas.filter((v) => v.fechaHora.getTime() <= hoy.getTime())
  const lineas = cobradas.flatMap((v) => v.lineas.map((l) => ({ ...l, idVenta: v.idVenta })))

  const porDia = agrupar(cobradas.map((v) => ({ clave: aDia(v.fechaHora), cantidad: 1, importe: v.total })))
    .map((g) => ({ dia: g.clave, ventas: g.cantidad, total: g.total }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
  const porHora = agrupar(cobradas.map((v) => ({ clave: v.fechaHora.getHours(), cantidad: 1, importe: v.total })))
    .map((g) => ({ hora: g.clave, ventas: g.cantidad, total: g.total }))
    .sort((a, b) => a.hora - b.hora)
  const porMetodo = agrupar(cobradas.flatMap((v) => v.pagos.map((p) => ({ clave: p.metodo, cantidad: 1, importe: p.monto }))))
    .map((g) => ({ metodo: g.clave, pagos: g.cantidad, total: g.total }))
  const cuentasPorMesero = new Map<string, Set<number>>()
  for (const l of lineas) cuentasPorMesero.set(l.mesero, (cuentasPorMesero.get(l.mesero) ?? new Set()).add(l.idVenta))
  const porMesero = agrupar(lineas.map((l) => ({ clave: l.mesero, cantidad: 0, importe: l.importe })))
    .map((g) => ({ mesero: g.clave, cuentas: cuentasPorMesero.get(g.clave)?.size ?? 0, total: g.total }))
  const porProducto = agrupar(lineas.map((l) => ({ clave: `${l.categoria}\u0000${l.producto}\u0000${l.presentacion}`, cantidad: l.cantidad, importe: l.importe })))
    .map((g) => {
      const [categoria, producto, presentacion] = g.clave.split('\u0000') as [string, string, string]
      return { producto, presentacion, categoria, cantidad: g.cantidad, total: g.total }
    })
  const porCategoria = agrupar(lineas.map((l) => ({ clave: l.categoria, cantidad: l.cantidad, importe: l.importe })))
    .map((g) => ({ categoria: g.clave, cantidad: g.cantidad, total: g.total }))
  const porSeccion = agrupar(cobradas.map((v) => ({ clave: v.seccion ?? 'Sin sección', cantidad: 1, importe: v.total })))
    .map((g) => ({ seccion: g.clave, ventas: g.cantidad, total: g.total }))

  return {
    desde,
    hasta,
    // Las devoluciones las agrega la demo de la caja (cajaMock), que es quien las registra.
    resumen: {
      ventas: cobradas.length,
      total: cobradas.reduce((s, v) => s + centavos(v.total), 0) / 100,
      devoluciones: 0,
      devuelto: 0,
      neto: cobradas.reduce((s, v) => s + centavos(v.total), 0) / 100,
    },
    porDia,
    porHora,
    porMetodo,
    porMesero,
    porProducto,
    porCategoria,
    porSeccion,
    ventas: cobradas
      .map(({ lineas: _lineas, ...venta }) => venta)
      .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime()),
    ventasTruncadas: false,
  }
}
