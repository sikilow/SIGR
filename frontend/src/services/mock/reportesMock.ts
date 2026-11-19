// Reportes del gerente en el modo demo: reservaciones e inasistencias, y mermas. Igual que el reporte de ventas de la demo,
// no hay historial real: los días ANTERIORES a hoy se generan de forma determinista (el mismo día siempre da lo mismo) y se
// les suman las reservaciones/mermas reales de esta sesión.
import type { EstadoReservacion, Merma, MotivoMerma, ReporteMermas, ReporteReservaciones } from '../../types'
import { aDia, deDia, diasDelRango } from '../../utils/periodos'
import { ErrorServicio } from '../errores'
import type { ReportesService } from '../interfaces'
import { descontarExistenciaMock } from './adminMock'
import { usuarioActual } from './authMock'
import { baseDatos } from './baseDatos'
import { devolucionesSinReponerEntre } from './ticketsMock'
import { conRetraso, conRetrasoIdempotente } from './utiles'

const MAX_DIAS = 731
const centavos = (monto: number): number => Math.round(monto * 100)

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

function validarRango(desde: string, hasta: string): void {
  if (desde > hasta) throw new ErrorServicio('estado_invalido', 'La fecha inicial no puede ser posterior a la final.', 422)
  if (diasDelRango(desde, hasta) > MAX_DIAS) throw new ErrorServicio('estado_invalido', 'El periodo no puede ser mayor a dos años. Elige un rango más corto.', 422)
}

// ---------------------------------------------------------------------------------------------------------------
// Reservaciones
// ---------------------------------------------------------------------------------------------------------------

interface ReservacionDemo {
  fecha: Date
  estado: EstadoReservacion
  personas: number
  seccion: string | null
  idCliente: number
  nombre: string
  telefono: string | null
}

function reservacionesDemoDelDia(dia: string): ReservacionDemo[] {
  const azar = aleatorio(Number(dia.replaceAll('-', '')) + 7)
  const clientes = baseDatos.clientes
  if (!clientes.length) return []
  const secciones = [null, null, 'Terraza', 'Salón']
  const finDeSemana = [5, 6].includes(deDia(dia).getDay())
  const cuantas = Math.floor(azar() * 4) + (finDeSemana ? 4 : 2)
  const lista: ReservacionDemo[] = []
  for (let i = 0; i < cuantas; i++) {
    const cliente = clientes[Math.floor(azar() * clientes.length)]!
    const fecha = deDia(dia)
    fecha.setHours(13 + Math.floor(azar() * 9), azar() < 0.5 ? 0 : 30, 0, 0)
    const sorteo = azar()
    // Los viernes y sábados hay un poco más de inasistencias.
    const estado: EstadoReservacion = sorteo < (finDeSemana ? 0.62 : 0.72) ? 'llego' : sorteo < (finDeSemana ? 0.82 : 0.86) ? 'vencida' : 'cancelada'
    lista.push({
      fecha,
      estado,
      personas: Math.floor(azar() * 7) + 2,
      seccion: secciones[Math.floor(azar() * secciones.length)] ?? null,
      idCliente: cliente.idCliente,
      nombre: cliente.nombre,
      telefono: cliente.telefono ?? null,
    })
  }
  return lista
}

function reporteReservacionesDemo(desde: string, hasta: string, hoy = new Date()): ReporteReservaciones {
  const dehoy = aDia(hoy)
  const todas: ReservacionDemo[] = []
  for (let f = deDia(desde); aDia(f) <= hasta; f.setDate(f.getDate() + 1)) {
    if (aDia(f) < dehoy) todas.push(...reservacionesDemoDelDia(aDia(f)))
  }
  // Las reales de esta sesión (hoy o próximas) que caen en el periodo.
  for (const r of baseDatos.reservaciones) {
    const dia = aDia(r.fechaHora)
    if (dia < desde || dia > hasta) continue
    const cliente = baseDatos.clientes.find((c) => c.idCliente === r.idCliente)
    todas.push({ fecha: r.fechaHora, estado: r.estado, personas: r.personas, seccion: r.preferencias?.zona ?? null, idCliente: r.idCliente, nombre: cliente?.nombre ?? 'Cliente', telefono: cliente?.telefono ?? null })
  }

  const vacio = () => ({ total: 0, llegaron: 0, vencidas: 0, canceladas: 0 })
  const sumar = (c: ReturnType<typeof vacio>, estado: EstadoReservacion) => {
    c.total += 1
    if (estado === 'llego') c.llegaron += 1
    else if (estado === 'vencida') c.vencidas += 1
    else if (estado === 'cancelada') c.canceladas += 1
  }
  const agrupar = <K extends string | number>(clave: (r: ReservacionDemo) => K) => {
    const mapa = new Map<K, ReturnType<typeof vacio>>()
    for (const r of todas) {
      const c = mapa.get(clave(r)) ?? vacio()
      sumar(c, r.estado)
      mapa.set(clave(r), c)
    }
    return mapa
  }

  const resumen = vacio()
  let porLlegar = 0
  let personas = 0
  let personasLlegaron = 0
  let personasVencidas = 0
  for (const r of todas) {
    sumar(resumen, r.estado)
    personas += r.personas
    if (r.estado === 'llego') personasLlegaron += r.personas
    if (r.estado === 'vencida') personasVencidas += r.personas
    if (r.estado === 'pendiente' || r.estado === 'confirmada') porLlegar += 1
  }

  const porCliente = new Map<number, { nombre: string; telefono: string | null; reservaciones: number; inasistencias: number }>()
  for (const r of todas) {
    const c = porCliente.get(r.idCliente) ?? { nombre: r.nombre, telefono: r.telefono, reservaciones: 0, inasistencias: 0 }
    c.reservaciones += 1
    if (r.estado === 'vencida') c.inasistencias += 1
    porCliente.set(r.idCliente, c)
  }

  return {
    desde,
    hasta,
    resumen: { ...resumen, porLlegar, personas, personasLlegaron, personasVencidas },
    porDia: [...agrupar((r) => aDia(r.fecha))].map(([dia, c]) => ({ dia, ...c })).sort((a, b) => a.dia.localeCompare(b.dia)),
    porHora: [...agrupar((r) => r.fecha.getHours())].map(([hora, c]) => ({ hora, ...c })).sort((a, b) => a.hora - b.hora),
    // getDay(): 0 = domingo; la API usa 0 = lunes.
    porDiaSemana: [...agrupar((r) => (r.fecha.getDay() + 6) % 7)].map(([diaSemana, c]) => ({ diaSemana, ...c })).sort((a, b) => a.diaSemana - b.diaSemana),
    porSeccion: [...agrupar((r) => r.seccion ?? 'Cualquiera')].map(([seccion, c]) => ({ seccion, ...c })).sort((a, b) => b.total - a.total || a.seccion.localeCompare(b.seccion)),
    clientesConInasistencias: [...porCliente]
      .filter(([, c]) => c.inasistencias >= 2)
      .map(([idCliente, c]) => ({ idCliente, nombre: c.nombre, telefono: c.telefono ? `+52 ${c.telefono}` : null, reservaciones: c.reservaciones, inasistencias: c.inasistencias }))
      .sort((a, b) => b.inasistencias - a.inasistencias || b.reservaciones - a.reservaciones || a.nombre.localeCompare(b.nombre))
      .slice(0, 10),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Mermas
// ---------------------------------------------------------------------------------------------------------------

/** Mermas registradas en esta sesión. */
const registradas: Merma[] = []
let siguienteMerma = 1
const MOTIVOS_DEMO: MotivoMerma[] = ['caducado', 'caducado', 'danado', 'preparacion', 'otro']

/** Productos que controlan existencia (los que suelen caducar o dañarse): flan, refrescos, cervezas… */
function productosDemo() {
  return baseDatos.categorias.flatMap((c) => c.productos.map((p) => ({ ...p, categoria: c.nombre })))
}

function mermasDemoDelDia(dia: string): Merma[] {
  const azar = aleatorio(Number(dia.replaceAll('-', '')) + 13)
  if (azar() > 0.45) return []
  const productos = productosDemo()
  if (!productos.length) return []
  const p = productos[Math.floor(azar() * productos.length)]!
  const fecha = deDia(dia)
  fecha.setHours(10 + Math.floor(azar() * 12), Math.floor(azar() * 60), 0, 0)
  const cantidad = Math.floor(azar() * 3) + 1
  return [
    {
      idMerma: -Number(dia.replaceAll('-', '')),
      fechaHora: fecha,
      idProducto: p.idProducto,
      producto: p.nombre,
      presentacion: p.presentacion || null,
      cantidad,
      motivo: MOTIVOS_DEMO[Math.floor(azar() * MOTIVOS_DEMO.length)]!,
      nota: null,
      valor: centavos(p.precio * cantidad) / 100,
      descuentaInventario: false,
      registradoPor: 'Luis Ramírez',
    },
  ]
}

function reporteMermasDemo(desde: string, hasta: string, hoy = new Date()): ReporteMermas {
  const dehoy = aDia(hoy)
  const todas: Merma[] = []
  for (let f = deDia(desde); aDia(f) <= hasta; f.setDate(f.getDate() + 1)) {
    if (aDia(f) < dehoy) todas.push(...mermasDemoDelDia(aDia(f)))
  }
  for (const m of registradas) if (aDia(m.fechaHora) >= desde && aDia(m.fechaHora) <= hasta) todas.push(m)
  todas.sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || b.idMerma - a.idMerma)

  const categoriaDe = (idProducto: number) => productosDemo().find((p) => p.idProducto === idProducto)?.categoria ?? ''
  const sumaPor = <K extends string | number>(clave: (m: Merma) => K) => {
    const mapa = new Map<K, { registros: number; unidades: number; centavos: number }>()
    for (const m of todas) {
      const g = mapa.get(clave(m)) ?? { registros: 0, unidades: 0, centavos: 0 }
      g.registros += 1
      g.unidades += m.cantidad
      g.centavos += centavos(m.valor)
      mapa.set(clave(m), g)
    }
    return mapa
  }

  const porProducto = [...sumaPor((m) => m.idProducto)].map(([idProducto, g]) => {
    const m = todas.find((x) => x.idProducto === idProducto)!
    return { idProducto, producto: m.producto, presentacion: m.presentacion, categoria: categoriaDe(idProducto), registros: g.registros, unidades: g.unidades, valor: g.centavos / 100 }
  }).sort((a, b) => b.valor - a.valor || b.unidades - a.unidades)

  return {
    desde,
    hasta,
    resumen: { registros: todas.length, unidades: todas.reduce((s, m) => s + m.cantidad, 0), valor: todas.reduce((s, m) => s + centavos(m.valor), 0) / 100 },
    porProducto,
    porMotivo: [...sumaPor((m) => m.motivo)].map(([motivo, g]) => ({ motivo, registros: g.registros, unidades: g.unidades, valor: g.centavos / 100 })).sort((a, b) => b.valor - a.valor),
    porDia: [...sumaPor((m) => aDia(m.fechaHora))].map(([dia, g]) => ({ dia, unidades: g.unidades, valor: g.centavos / 100 })).sort((a, b) => a.dia.localeCompare(b.dia)),
    // Las devoluciones aprobadas de esta sesión sin «reponer al inventario» (la demo no tiene historial de otras).
    devolucionesSinReponer: devolucionesSinReponerEntre(desde, hasta),
    mermas: todas.slice(0, 500),
    mermasTruncadas: todas.length > 500,
  }
}

export function crearReportesMock(): ReportesService {
  return {
    reporteReservaciones(desde, hasta) {
      return conRetraso(() => {
        validarRango(desde, hasta)
        return reporteReservacionesDemo(desde, hasta)
      })
    },

    registrarMerma(merma, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        if (!Number.isInteger(merma.cantidad) || merma.cantidad < 1) throw new ErrorServicio('estado_invalido', 'La cantidad debe ser un número entero de 1 o más.', 422)
        const producto = productosDemo().find((p) => p.idProducto === merma.idProducto)
        // `descontarExistenciaMock` revisa que exista, que no esté eliminado y que alcance.
        const descuenta = descontarExistenciaMock(merma.idProducto, merma.cantidad)
        const nueva: Merma = {
          idMerma: siguienteMerma++,
          fechaHora: new Date(),
          idProducto: merma.idProducto,
          producto: producto?.nombre ?? 'Producto',
          presentacion: producto?.presentacion || null,
          cantidad: merma.cantidad,
          motivo: merma.motivo,
          nota: merma.nota?.trim() || null,
          valor: centavos((producto?.precio ?? 0) * merma.cantidad) / 100,
          descuentaInventario: descuenta,
          registradoPor: usuarioActual()?.nombre ?? 'Luis Ramírez',
        }
        registradas.unshift(nueva)
        return nueva
      })
    },

    reporteMermas(desde, hasta) {
      return conRetraso(() => {
        validarRango(desde, hasta)
        return reporteMermasDemo(desde, hasta)
      })
    },
  }
}
