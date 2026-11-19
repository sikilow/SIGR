// Tickets pasados, reimpresión, devoluciones y referencia fiscal en el modo demo (migración 034). Responde como la API:
// el cajero SOLICITA una devolución y el gerente la autoriza (o la registra ya aprobada); el efectivo devuelto sale del
// corte abierto del cajero que la pidió; la referencia fiscal solo la ve y la guarda el gerente.
//
// El mock no tiene historial real de cobros: las ventas de días anteriores son las de ejemplo del reporte (deterministas);
// las que se cobran en esta sesión se registran aquí desde `cajaMock.cobrar`.
import type {
  DatosReferenciaFiscal,
  Devolucion,
  EstadoDevolucionVenta,
  FiltroDevoluciones,
  FiltroVentas,
  ReferenciaFiscal,
  VentaDetalle,
  VentaListado,
} from '../../types'
import { validarSolicitudDevolucion } from '../../utils/devoluciones'
import { aDia, deDia } from '../../utils/periodos'
import { ErrorServicio } from '../errores'
import type { CajaService } from '../interfaces'
import { reponerExistenciaMock } from './adminMock'
import { usuarioActual } from './authMock'
import { metodosPagoMock } from './metodosPago'
import { ventasDemoDelDia } from './reporteVentasMock'
import { conRetraso, conRetrasoIdempotente } from './utiles'

export interface VentaBase {
  idVenta: number
  idCuenta: number
  fechaHora: Date
  total: number
  cajero: string
  meseros: string
  mesaNumero: number
  seccion: string | null
  canal: string | null
  referencia: string | null
  lineas: Array<{
    idDetalle: number
    idProducto: number
    producto: string
    presentacion: string | null
    cantidad: number
    precioUnitario: number
    indicaciones: string | null
  }>
  pagos: Array<{ idMetodo: number; metodo: string; esEfectivo: boolean; monto: number; montoRecibido: number; cambio: number }>
}

const centavos = (monto: number): number => Math.round(monto * 100)
const suma = (valores: number[]): number => valores.reduce((s, v) => s + centavos(v), 0) / 100

const ventasSesion = new Map<number, VentaBase>()
const cacheDemo = new Map<string, VentaBase[]>()
const devoluciones: Devolucion[] = []
/** Rol de quien pidió cada devolución: si fue un cajero, el efectivo sale de su corte. */
const rolSolicitante = new Map<number, string>()
const reimpresiones = new Map<number, { n: number; ultima: Date }>()
const fiscales = new Map<number, ReferenciaFiscal>()
let siguienteDevolucion = 1

/** Registra una venta cobrada en esta sesión (la llama `cajaMock.cobrar`). */
export function registrarVentaMock(venta: VentaBase): void {
  ventasSesion.set(venta.idVenta, venta)
}

function ventasDemo(dia: string): VentaBase[] {
  let lista = cacheDemo.get(dia)
  if (!lista) {
    lista = ventasDemoDelDia(dia).map((v) => ({
      idVenta: v.idVenta,
      idCuenta: v.idCuenta,
      fechaHora: v.fechaHora,
      total: v.total,
      cajero: v.cajero,
      meseros: v.meseros,
      mesaNumero: v.mesaNumero,
      seccion: v.seccion,
      canal: v.canal,
      referencia: null,
      lineas: v.lineas.map((l, i) => ({
        idDetalle: v.idVenta * 100 + i + 1,
        idProducto: l.idProducto,
        producto: l.producto,
        presentacion: l.presentacion || null,
        cantidad: l.cantidad,
        precioUnitario: l.importe / l.cantidad,
        indicaciones: null,
      })),
      pagos: v.pagos.map((p) => {
        const metodo = metodosPagoMock.find((m) => m.nombre === p.metodo)
        return { idMetodo: metodo?.idMetodo ?? 0, metodo: p.metodo, esEfectivo: metodo?.esEfectivo ?? false, monto: p.monto, montoRecibido: p.monto, cambio: 0 }
      }),
    }))
    cacheDemo.set(dia, lista)
  }
  return lista
}

function buscarVenta(idVenta: number): VentaBase | null {
  const guardada = ventasSesion.get(idVenta)
  if (guardada) return guardada
  // Las de ejemplo llevan la fecha en el id: AAAAMMDD + número de la venta del día.
  const dia = String(Math.floor(idVenta / 100))
  if (!/^\d{8}$/.test(dia)) return null
  const iso = `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`
  if (Number.isNaN(deDia(iso).getTime())) return null
  return ventasDemo(iso).find((v) => v.idVenta === idVenta) ?? null
}

function estadoDevolucionVenta(total: number, devuelto: number): EstadoDevolucionVenta {
  if (devuelto <= 0) return 'ninguna'
  return centavos(devuelto) >= centavos(total) ? 'total' : 'parcial'
}

const aprobadasDe = (idVenta: number) => devoluciones.filter((d) => d.idVenta === idVenta && d.estado === 'aprobada')

function detalleDe(base: VentaBase, verFiscal: boolean): VentaDetalle {
  const deLaVenta = devoluciones.filter((d) => d.idVenta === base.idVenta)
  const unidades = (idDetalle: number, estado: Devolucion['estado']) =>
    deLaVenta.filter((d) => d.estado === estado).flatMap((d) => d.lineas).filter((l) => l.idDetalle === idDetalle).reduce((s, l) => s + l.cantidad, 0)
  const dinero = (idMetodo: number, estado: Devolucion['estado']) =>
    suma(deLaVenta.filter((d) => d.estado === estado).flatMap((d) => d.pagos).filter((p) => p.idMetodo === idMetodo).map((p) => p.monto))
  const devuelto = suma(aprobadasDe(base.idVenta).map((d) => d.total))
  const reimp = reimpresiones.get(base.idVenta)
  return {
    idVenta: base.idVenta,
    idCuenta: base.idCuenta,
    fechaHora: base.fechaHora,
    total: base.total,
    cajero: base.cajero,
    meseros: base.meseros,
    mesaNumero: base.mesaNumero,
    seccion: base.seccion,
    canal: base.canal,
    referencia: base.referencia,
    lineas: base.lineas.map((l) => ({
      idDetalle: l.idDetalle,
      producto: l.producto,
      presentacion: l.presentacion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      importe: centavos(l.precioUnitario) * l.cantidad / 100,
      indicaciones: l.indicaciones,
      devuelta: unidades(l.idDetalle, 'aprobada'),
      pendiente: unidades(l.idDetalle, 'pendiente'),
    })),
    pagos: base.pagos.map((p) => ({ ...p, devuelto: dinero(p.idMetodo, 'aprobada'), pendiente: dinero(p.idMetodo, 'pendiente') })),
    devoluciones: [...deLaVenta].sort((a, b) => b.solicitadoEn.getTime() - a.solicitadoEn.getTime() || b.idDevolucion - a.idDevolucion),
    devuelto,
    estadoDevolucion: estadoDevolucionVenta(base.total, devuelto),
    reimpresiones: reimp?.n ?? 0,
    ultimaReimpresion: reimp?.ultima ?? null,
    ...(verFiscal ? { referenciaFiscal: fiscales.get(base.idVenta) ?? null } : {}),
  }
}

function exigirGerente(): void {
  if (usuarioActual()?.rol !== 'gerente') throw new ErrorServicio('sin_permiso', 'Solo el gerente puede hacer esto.', 403)
}

/** Devoluciones aprobadas que salieron de un corte (para el cuadre y el desglose del corte). */
export function devolucionesDelCorte(idCorte: number): Devolucion[] {
  return devoluciones.filter((d) => d.estado === 'aprobada' && d.idCorte === idCorte)
}

/** Devoluciones aprobadas en un periodo (por la fecha en que se aprobaron), para el reporte de ventas. */
export function devolucionesAprobadasEntre(desde: string, hasta: string): { cantidad: number; total: number } {
  const lista = devoluciones.filter((d) => d.estado === 'aprobada' && d.resueltoEn && aDia(d.resueltoEn) >= desde && aDia(d.resueltoEn) <= hasta)
  return { cantidad: lista.length, total: suma(lista.map((d) => d.total)) }
}

/** Lo devuelto por clientes que NO volvió al inventario (devoluciones aprobadas sin «reponer»), para el reporte de mermas. */
export function devolucionesSinReponerEntre(desde: string, hasta: string): { devoluciones: number; unidades: number; valor: number } {
  const lista = devoluciones.filter((d) => d.estado === 'aprobada' && !d.reponerInventario && d.resueltoEn && aDia(d.resueltoEn) >= desde && aDia(d.resueltoEn) <= hasta)
  return {
    devoluciones: lista.length,
    unidades: lista.reduce((s, d) => s + d.lineas.reduce((u, l) => u + l.cantidad, 0), 0),
    valor: suma(lista.map((d) => d.total)),
  }
}

type ServicioTickets = Pick<
  CajaService,
  | 'listarVentas'
  | 'obtenerVenta'
  | 'registrarReimpresion'
  | 'solicitarDevolucion'
  | 'listarDevoluciones'
  | 'aprobarDevolucion'
  | 'rechazarDevolucion'
  | 'guardarReferenciaFiscal'
  | 'quitarReferenciaFiscal'
>

/** `corteAbierto`: id del corte abierto del cajero (o `null`). */
export function crearTicketsMock(corteAbierto: () => number | null): ServicioTickets {
  /** Marca la devolución como aprobada: ubica el corte del que sale el efectivo y repone el inventario si se pidió. */
  function aplicar(d: Devolucion, quien: string, nota: string | null): void {
    const efectivo = d.pagos.some((p) => p.esEfectivo && p.monto > 0)
    let idCorte: number | null = null
    if (rolSolicitante.get(d.idDevolucion) === 'cajero') {
      idCorte = corteAbierto()
      if (idCorte === null && efectivo) {
        throw new ErrorServicio(
          'estado_invalido',
          `${d.solicitante} no tiene la caja iniciada: no puede entregar el efectivo de esta devolución. Pídele que inicie caja o cambia el método de devolución.`,
          409,
        )
      }
    }
    d.estado = 'aprobada'
    d.resolutor = quien
    d.resueltoEn = new Date()
    d.notaResolucion = nota
    d.idCorte = idCorte
    if (d.reponerInventario) {
      const base = buscarVenta(d.idVenta)
      for (const l of d.lineas) {
        const idProducto = base?.lineas.find((x) => x.idDetalle === l.idDetalle)?.idProducto
        if (idProducto !== undefined) reponerExistenciaMock(idProducto, l.cantidad)
      }
    }
  }

  function resolver(idDevolucion: number, accion: 'aprobar' | 'rechazar', nota?: string): Devolucion {
    exigirGerente()
    const d = devoluciones.find((x) => x.idDevolucion === idDevolucion)
    if (!d) throw new ErrorServicio('no_encontrado', 'La devolución no existe.', 404)
    const texto = nota?.trim() || null
    if (accion === 'rechazar' && !texto) throw new ErrorServicio('estado_invalido', 'Escribe por qué se rechaza la devolución.', 422)
    if (d.estado !== 'pendiente') throw new ErrorServicio('estado_invalido', `Esta devolución ya está ${d.estado}.`, 409)
    const quien = usuarioActual()?.nombre ?? 'Gerente'
    if (accion === 'aprobar') {
      aplicar(d, quien, texto)
    } else {
      d.estado = 'rechazada'
      d.resolutor = quien
      d.resueltoEn = new Date()
      d.notaResolucion = texto
    }
    return d
  }

  return {
    listarVentas(filtro: FiltroVentas = {}) {
      return conRetraso(() => {
        const hoy = new Date()
        let desde = filtro.desde
        const hasta = filtro.hasta
        if (desde && hasta && desde > hasta) throw new ErrorServicio('estado_invalido', 'La fecha inicial no puede ser posterior a la final.', 422)
        const q = filtro.q?.trim()
        if (q && !/^\d{1,10}$/.test(q)) throw new ErrorServicio('estado_invalido', 'Busca por número de ticket o de mesa (solo números).', 422)
        const hastaEfectivo = hasta ?? aDia(hoy)
        if (!desde) {
          const inicio = hasta ? deDia(hasta) : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
          inicio.setDate(inicio.getDate() - (hasta ? 91 : 6))
          desde = aDia(inicio)
        }
        if ((deDia(hastaEfectivo).getTime() - deDia(desde).getTime()) / 86_400_000 > 92) {
          throw new ErrorServicio('estado_invalido', 'El periodo no puede pasar de 92 días.', 422)
        }
        const ventas: VentaBase[] = []
        for (let f = deDia(desde); aDia(f) <= hastaEfectivo && aDia(f) <= aDia(hoy); f.setDate(f.getDate() + 1)) ventas.push(...ventasDemo(aDia(f)))
        for (const v of ventasSesion.values()) if (aDia(v.fechaHora) >= desde && aDia(v.fechaHora) <= hastaEfectivo) ventas.push(v)
        const verFiscal = usuarioActual()?.rol === 'gerente'
        return ventas
          .filter((v) => v.fechaHora.getTime() <= hoy.getTime())
          .filter((v) => !q || v.idVenta === Number(q) || v.mesaNumero === Number(q))
          .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || b.idVenta - a.idVenta)
          .slice(0, 200)
          .map((v): VentaListado => {
            const devuelto = suma(aprobadasDe(v.idVenta).map((d) => d.total))
            return {
              idVenta: v.idVenta,
              fechaHora: v.fechaHora,
              total: v.total,
              mesaNumero: v.mesaNumero,
              seccion: v.seccion,
              canal: v.canal,
              cajero: v.cajero,
              metodos: [...new Set(v.pagos.map((p) => p.metodo))].sort().join(', '),
              devuelto,
              estadoDevolucion: estadoDevolucionVenta(v.total, devuelto),
              devolucionesPendientes: devoluciones.filter((d) => d.idVenta === v.idVenta && d.estado === 'pendiente').length,
              ...(verFiscal ? { conReferenciaFiscal: fiscales.has(v.idVenta) } : {}),
            }
          })
      })
    },

    obtenerVenta(idVenta) {
      return conRetraso(() => {
        const base = buscarVenta(idVenta)
        if (!base) throw new ErrorServicio('no_encontrado', 'La venta no existe.', 404)
        return detalleDe(base, usuarioActual()?.rol === 'gerente')
      })
    },

    registrarReimpresion(idVenta) {
      return conRetraso(() => {
        if (!buscarVenta(idVenta)) throw new ErrorServicio('no_encontrado', 'La venta no existe.', 404)
        const actual = reimpresiones.get(idVenta)
        const nuevo = { n: (actual?.n ?? 0) + 1, ultima: new Date() }
        reimpresiones.set(idVenta, nuevo)
        return { reimpresiones: nuevo.n, ultimaReimpresion: nuevo.ultima }
      })
    },

    solicitarDevolucion(idVenta, solicitud, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const base = buscarVenta(idVenta)
        if (!base) throw new ErrorServicio('no_encontrado', 'La venta no existe.', 404)
        const usuario = usuarioActual()
        const detalle = detalleDe(base, false)
        const error = validarSolicitudDevolucion(detalle, solicitud)
        if (error) throw new ErrorServicio('estado_invalido', error, 422)

        const lineas = solicitud.lineas.map((s) => {
          const l = detalle.lineas.find((x) => x.idDetalle === s.idDetalle)!
          return { idDetalle: l.idDetalle, producto: l.producto, presentacion: l.presentacion, cantidad: s.cantidad, importe: (centavos(l.precioUnitario) * s.cantidad) / 100 }
        })
        const d: Devolucion = {
          idDevolucion: siguienteDevolucion,
          idVenta,
          mesaNumero: base.mesaNumero,
          totalVenta: base.total,
          estado: 'pendiente',
          motivo: solicitud.motivo.trim(),
          total: suma(lineas.map((l) => l.importe)),
          reponerInventario: solicitud.reponerInventario,
          solicitadoEn: new Date(),
          solicitante: usuario?.nombre ?? 'Cajero',
          resueltoEn: null,
          resolutor: null,
          notaResolucion: null,
          idCorte: null,
          lineas,
          pagos: solicitud.pagos.map((p) => {
            const pago = base.pagos.find((x) => x.idMetodo === p.idMetodo)!
            return { idMetodo: p.idMetodo, metodo: pago.metodo, esEfectivo: pago.esEfectivo, monto: p.monto }
          }),
        }
        rolSolicitante.set(d.idDevolucion, usuario?.rol ?? 'cajero')
        // El gerente la registra ya aprobada; si falla (p. ej. sin caja), no queda nada a medias.
        if (usuario?.rol === 'gerente') aplicar(d, usuario.nombre, null)
        siguienteDevolucion += 1
        devoluciones.push(d)
        return d
      })
    },

    listarDevoluciones(filtro: FiltroDevoluciones = {}) {
      return conRetraso(() => {
        if (filtro.desde && filtro.hasta && filtro.desde > filtro.hasta) {
          throw new ErrorServicio('estado_invalido', 'La fecha inicial no puede ser posterior a la final.', 422)
        }
        const usuario = usuarioActual()
        const estado = filtro.estado ?? 'todas'
        const hoy = new Date()
        const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30)
        return devoluciones
          .filter((d) => estado === 'todas' || d.estado === estado)
          .filter((d) => {
            if (d.estado === 'pendiente' || estado === 'pendiente') return true
            const dia = aDia(d.solicitadoEn)
            if (filtro.desde && dia < filtro.desde) return false
            if (filtro.hasta && dia > filtro.hasta) return false
            return filtro.desde || filtro.hasta ? true : d.solicitadoEn >= limite
          })
          .filter((d) => usuario?.rol !== 'cajero' || d.solicitante === usuario.nombre)
          .sort((a, b) => b.solicitadoEn.getTime() - a.solicitadoEn.getTime() || b.idDevolucion - a.idDevolucion)
      })
    },

    aprobarDevolucion(idDevolucion, nota) {
      return conRetraso(() => resolver(idDevolucion, 'aprobar', nota))
    },

    rechazarDevolucion(idDevolucion, nota) {
      return conRetraso(() => resolver(idDevolucion, 'rechazar', nota))
    },

    guardarReferenciaFiscal(idVenta, datos: DatosReferenciaFiscal) {
      return conRetraso(() => {
        exigirGerente()
        if (!buscarVenta(idVenta)) throw new ErrorServicio('no_encontrado', 'La venta no existe.', 404)
        const vacio = (t?: string): string | null => (t && t.trim() ? t.trim() : null)
        const referencia = datos.referenciaContador.trim()
        if (!referencia) throw new ErrorServicio('estado_invalido', 'Escribe la referencia para el contador.', 422)
        if (referencia.length > 60) throw new ErrorServicio('estado_invalido', 'La referencia admite máximo 60 caracteres.', 422)
        const rfc = vacio(datos.rfc)?.toUpperCase() ?? null
        if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) throw new ErrorServicio('estado_invalido', 'RFC no válido (12 o 13 caracteres).', 422)
        const cp = vacio(datos.codigoPostal)
        if (cp && !/^\d{5}$/.test(cp)) throw new ErrorServicio('estado_invalido', 'El código postal lleva 5 dígitos.', 422)
        const correo = vacio(datos.correo)?.toLowerCase() ?? null
        if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorServicio('estado_invalido', 'Escribe un correo válido.', 422)
        const guardada: ReferenciaFiscal = {
          referenciaContador: referencia,
          rfc,
          razonSocial: vacio(datos.razonSocial),
          regimenFiscal: vacio(datos.regimenFiscal),
          codigoPostal: cp,
          correo,
          notas: vacio(datos.notas),
          registradoPor: usuarioActual()?.nombre ?? 'Gerente',
          actualizadoEn: new Date(),
        }
        fiscales.set(idVenta, guardada)
        return guardada
      })
    },

    quitarReferenciaFiscal(idVenta) {
      return conRetraso(() => {
        exigirGerente()
        if (!fiscales.delete(idVenta)) throw new ErrorServicio('no_encontrado', 'Esa venta no tiene referencia fiscal.', 404)
      })
    },
  }
}
