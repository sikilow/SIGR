import type { CajaService } from '../interfaces'
import type { CuentaDto } from './mappers'
import { aCuenta } from './mappers'
import { parseFechaMySQL } from './conversion'
import { solicitar } from './cliente'
import type {
  CorteCaja,
  CorteDetalle,
  CorteResumen,
  Devolucion,
  EstadoCaja,
  EstadoDevolucion,
  EstadoDevolucionVenta,
  ReferenciaFiscal,
  ReporteVentas,
  VentaCaja,
  VentaDetalle,
  VentaListado,
} from '../../types'

interface CorteDto {
  id_corte: number | string
  inicio: string
  fondo_inicial: number | string
  cobros: number | string
  /** Solo en GET /caja/estado (sin efectivo); al abrir el corte aún no hay ventas. */
  desglose?: Array<{ metodo: string; cobros: number | string; monto: number | string; devuelto?: number | string }>
}

type Importe = number | string

interface CorteResumenDto {
  id_corte: number | string
  cajero_nombre: string
  inicio: string
  fin: string
  fondo_inicial: Importe
  cobros: number | string
  total_ventas: Importe
  /** Ausente en una API anterior a la migración 034. */
  total_devuelto?: Importe
  efectivo_esperado: Importe | null
  efectivo_contado: Importe | null
  diferencia: Importe | null
  total_reportado: Importe | null
}

interface CorteDetalleDto extends CorteResumenDto {
  efectivo_esperado: Importe
  desglose: Array<{ metodo: string; cobros: number | string; monto: Importe; devuelto?: Importe }>
}

interface EstadoDto {
  corte: CorteDto | null
  cuentas: Array<{
    cuenta: CuentaDto
    mesa_numero: number | string
    mesero_nombre?: string | null
    pedidos_sin_entregar: Array<{ id_pedido: number | string; estado: string }>
  }>
  metodos_pago: Array<{
    id_metodo: number | string
    nombre: string
    id_categoria_metodo_pago: number | string
    categoria: string
    tipo: 'fisico' | 'digital'
    es_efectivo: boolean | number
  }>
}

interface VentaDto {
  id_venta: number | string
  fecha_hora: string
  total: number | string
  id_cuenta: number | string
  mesa_numero: number | string
  cambio: number | string
  pagos: Array<{
    metodo: string
    monto: number | string
    monto_recibido: number | string
    cambio: number | string
  }>
}

function aCorte(dto: CorteDto): CorteCaja {
  return {
    idCorte: Number(dto.id_corte),
    inicio: parseFechaMySQL(dto.inicio, 'corte.inicio'),
    fondoInicial: Number(dto.fondo_inicial),
    cobros: Number(dto.cobros),
    desglose: (dto.desglose ?? []).map((m) => ({ metodo: m.metodo, cobros: Number(m.cobros), monto: Number(m.monto) })),
  }
}

const numeroONulo = (valor: Importe | null): number | null => (valor === null ? null : Number(valor))

function aCorteResumen(dto: CorteResumenDto): CorteResumen {
  return {
    idCorte: Number(dto.id_corte),
    cajeroNombre: dto.cajero_nombre,
    inicio: parseFechaMySQL(dto.inicio, 'corte.inicio'),
    fin: parseFechaMySQL(dto.fin, 'corte.fin'),
    fondoInicial: Number(dto.fondo_inicial),
    cobros: Number(dto.cobros),
    totalVentas: Number(dto.total_ventas),
    totalDevuelto: Number(dto.total_devuelto ?? 0),
    efectivoEsperado: numeroONulo(dto.efectivo_esperado),
    efectivoContado: numeroONulo(dto.efectivo_contado),
    diferencia: numeroONulo(dto.diferencia),
    totalReportado: numeroONulo(dto.total_reportado),
  }
}

function aCorteDetalle(dto: CorteDetalleDto): CorteDetalle {
  return {
    ...aCorteResumen(dto),
    efectivoEsperado: Number(dto.efectivo_esperado),
    desglose: dto.desglose.map((fila) => ({
      metodo: fila.metodo,
      cobros: Number(fila.cobros),
      monto: Number(fila.monto),
      devuelto: Number(fila.devuelto ?? 0),
    })),
  }
}

function aVenta(dto: VentaDto): VentaCaja {
  return {
    idVenta: Number(dto.id_venta),
    fechaHora: parseFechaMySQL(dto.fecha_hora, 'venta.fecha_hora'),
    total: Number(dto.total),
    idCuenta: Number(dto.id_cuenta),
    mesaNumero: Number(dto.mesa_numero),
    cambio: Number(dto.cambio),
    pagos: dto.pagos.map((pago) => ({
      metodo: pago.metodo,
      monto: Number(pago.monto),
      montoRecibido: Number(pago.monto_recibido),
      cambio: Number(pago.cambio),
    })),
  }
}

type Numero = number | string

/** Respuesta de GET /caja/reportes/ventas (snake_case, como la base). */
export interface ReporteVentasDto {
  desde: string
  hasta: string
  resumen: { ventas: Numero; total: Numero; devoluciones?: Numero; devuelto?: Numero; neto?: Numero }
  por_dia: Array<{ dia: string; ventas: Numero; total: Numero }>
  por_hora: Array<{ hora: Numero; ventas: Numero; total: Numero }>
  por_metodo: Array<{ metodo: string; pagos: Numero; total: Numero }>
  por_mesero: Array<{ mesero: string; cuentas: Numero; total: Numero }>
  por_producto: Array<{ producto: string; presentacion: string | null; categoria: string; cantidad: Numero; total: Numero }>
  por_categoria: Array<{ categoria: string; cantidad: Numero; total: Numero }>
  por_seccion: Array<{ seccion: string; ventas: Numero; total: Numero }>
  ventas: Array<{
    id_venta: Numero
    id_cuenta: Numero
    fecha_hora: string
    total: Numero
    mesa_numero: Numero
    seccion: string | null
    canal: string | null
    cajero: string
    meseros: string | null
    pagos: Array<{ metodo: string; monto: Numero }>
  }>
  ventas_truncadas: boolean
}

export function aReporteVentas(dto: ReporteVentasDto): ReporteVentas {
  return {
    desde: dto.desde,
    hasta: dto.hasta,
    resumen: {
      ventas: Number(dto.resumen.ventas),
      total: Number(dto.resumen.total),
      devoluciones: Number(dto.resumen.devoluciones ?? 0),
      devuelto: Number(dto.resumen.devuelto ?? 0),
      neto: Number(dto.resumen.neto ?? dto.resumen.total),
    },
    porDia: dto.por_dia.map((f) => ({ dia: f.dia, ventas: Number(f.ventas), total: Number(f.total) })),
    porHora: dto.por_hora.map((f) => ({ hora: Number(f.hora), ventas: Number(f.ventas), total: Number(f.total) })),
    porMetodo: dto.por_metodo.map((f) => ({ metodo: f.metodo, pagos: Number(f.pagos), total: Number(f.total) })),
    porMesero: dto.por_mesero.map((f) => ({ mesero: f.mesero, cuentas: Number(f.cuentas), total: Number(f.total) })),
    porProducto: dto.por_producto.map((f) => ({
      producto: f.producto,
      presentacion: f.presentacion ?? '',
      categoria: f.categoria,
      cantidad: Number(f.cantidad),
      total: Number(f.total),
    })),
    porCategoria: dto.por_categoria.map((f) => ({ categoria: f.categoria, cantidad: Number(f.cantidad), total: Number(f.total) })),
    porSeccion: dto.por_seccion.map((f) => ({ seccion: f.seccion, ventas: Number(f.ventas), total: Number(f.total) })),
    ventas: dto.ventas.map((v) => ({
      idVenta: Number(v.id_venta),
      idCuenta: Number(v.id_cuenta),
      fechaHora: parseFechaMySQL(v.fecha_hora, 'venta.fecha_hora'),
      total: Number(v.total),
      mesaNumero: Number(v.mesa_numero),
      seccion: v.seccion,
      canal: v.canal,
      cajero: v.cajero,
      meseros: v.meseros ?? '',
      pagos: v.pagos.map((p) => ({ metodo: p.metodo, monto: Number(p.monto) })),
    })),
    ventasTruncadas: Boolean(dto.ventas_truncadas),
  }
}

// ---------- Tickets pasados y devoluciones (migración 034) ----------

interface VentaListadoDto {
  id_venta: Numero
  fecha_hora: string
  total: Numero
  mesa_numero: Numero
  seccion: string | null
  canal: string | null
  cajero: string
  metodos: string
  devuelto: Numero
  estado_devolucion: EstadoDevolucionVenta
  devoluciones_pendientes: Numero
  con_referencia_fiscal?: boolean
}

interface DevolucionDto {
  id_devolucion: Numero
  id_venta: Numero
  mesa_numero: Numero
  total_venta: Numero
  estado: EstadoDevolucion
  motivo: string
  total: Numero
  reponer_inventario: boolean | number
  solicitado_en: string
  solicitante: string
  resuelto_en: string | null
  resolutor: string | null
  nota_resolucion: string | null
  id_corte: Numero | null
  lineas: Array<{ id_detalle: Numero; producto: string; presentacion: string | null; cantidad: Numero; importe: Numero }>
  pagos: Array<{ id_metodo: Numero; metodo: string; es_efectivo: boolean | number; monto: Numero }>
}

interface ReferenciaFiscalDto {
  referencia_contador: string
  rfc: string | null
  razon_social: string | null
  regimen_fiscal: string | null
  codigo_postal: string | null
  correo: string | null
  notas: string | null
  registrado_por: string
  actualizado_en: string
}

interface VentaDetalleDto {
  id_venta: Numero
  id_cuenta: Numero
  fecha_hora: string
  total: Numero
  cajero: string
  meseros: string
  mesa_numero: Numero
  seccion: string | null
  canal: string | null
  referencia: string | null
  lineas: Array<{
    id_detalle: Numero
    producto: string
    presentacion: string | null
    cantidad: Numero
    precio_unitario: Numero
    importe: Numero
    indicaciones: string | null
    devuelta: Numero
    pendiente: Numero
  }>
  pagos: Array<{
    id_metodo: Numero
    metodo: string
    es_efectivo: boolean | number
    monto: Numero
    monto_recibido: Numero
    cambio: Numero
    devuelto: Numero
    pendiente: Numero
  }>
  devoluciones: DevolucionDto[]
  devuelto: Numero
  estado_devolucion: EstadoDevolucionVenta
  reimpresiones: Numero
  ultima_reimpresion: string | null
  referencia_fiscal?: ReferenciaFiscalDto | null
}

export function aVentaListado(dto: VentaListadoDto): VentaListado {
  return {
    idVenta: Number(dto.id_venta),
    fechaHora: parseFechaMySQL(dto.fecha_hora, 'venta.fecha_hora'),
    total: Number(dto.total),
    mesaNumero: Number(dto.mesa_numero),
    seccion: dto.seccion,
    canal: dto.canal,
    cajero: dto.cajero,
    metodos: dto.metodos,
    devuelto: Number(dto.devuelto),
    estadoDevolucion: dto.estado_devolucion,
    devolucionesPendientes: Number(dto.devoluciones_pendientes),
    ...(dto.con_referencia_fiscal === undefined ? {} : { conReferenciaFiscal: Boolean(dto.con_referencia_fiscal) }),
  }
}

export function aDevolucion(dto: DevolucionDto): Devolucion {
  return {
    idDevolucion: Number(dto.id_devolucion),
    idVenta: Number(dto.id_venta),
    mesaNumero: Number(dto.mesa_numero),
    totalVenta: Number(dto.total_venta),
    estado: dto.estado,
    motivo: dto.motivo,
    total: Number(dto.total),
    reponerInventario: Boolean(dto.reponer_inventario),
    solicitadoEn: parseFechaMySQL(dto.solicitado_en, 'devolucion.solicitado_en'),
    solicitante: dto.solicitante,
    resueltoEn: dto.resuelto_en ? parseFechaMySQL(dto.resuelto_en, 'devolucion.resuelto_en') : null,
    resolutor: dto.resolutor,
    notaResolucion: dto.nota_resolucion,
    idCorte: dto.id_corte === null ? null : Number(dto.id_corte),
    lineas: dto.lineas.map((l) => ({
      idDetalle: Number(l.id_detalle),
      producto: l.producto,
      presentacion: l.presentacion,
      cantidad: Number(l.cantidad),
      importe: Number(l.importe),
    })),
    pagos: dto.pagos.map((p) => ({ idMetodo: Number(p.id_metodo), metodo: p.metodo, esEfectivo: Boolean(p.es_efectivo), monto: Number(p.monto) })),
  }
}

export function aReferenciaFiscal(dto: ReferenciaFiscalDto): ReferenciaFiscal {
  return {
    referenciaContador: dto.referencia_contador,
    rfc: dto.rfc,
    razonSocial: dto.razon_social,
    regimenFiscal: dto.regimen_fiscal,
    codigoPostal: dto.codigo_postal,
    correo: dto.correo,
    notas: dto.notas,
    registradoPor: dto.registrado_por,
    actualizadoEn: parseFechaMySQL(dto.actualizado_en, 'venta_fiscal.actualizado_en'),
  }
}

export function aVentaDetalle(dto: VentaDetalleDto): VentaDetalle {
  return {
    idVenta: Number(dto.id_venta),
    idCuenta: Number(dto.id_cuenta),
    fechaHora: parseFechaMySQL(dto.fecha_hora, 'venta.fecha_hora'),
    total: Number(dto.total),
    cajero: dto.cajero,
    meseros: dto.meseros,
    mesaNumero: Number(dto.mesa_numero),
    seccion: dto.seccion,
    canal: dto.canal,
    referencia: dto.referencia,
    lineas: dto.lineas.map((l) => ({
      idDetalle: Number(l.id_detalle),
      producto: l.producto,
      presentacion: l.presentacion,
      cantidad: Number(l.cantidad),
      precioUnitario: Number(l.precio_unitario),
      importe: Number(l.importe),
      indicaciones: l.indicaciones,
      devuelta: Number(l.devuelta),
      pendiente: Number(l.pendiente),
    })),
    pagos: dto.pagos.map((p) => ({
      idMetodo: Number(p.id_metodo),
      metodo: p.metodo,
      esEfectivo: Boolean(p.es_efectivo),
      monto: Number(p.monto),
      montoRecibido: Number(p.monto_recibido),
      cambio: Number(p.cambio),
      devuelto: Number(p.devuelto),
      pendiente: Number(p.pendiente),
    })),
    devoluciones: dto.devoluciones.map(aDevolucion),
    devuelto: Number(dto.devuelto),
    estadoDevolucion: dto.estado_devolucion,
    reimpresiones: Number(dto.reimpresiones),
    ultimaReimpresion: dto.ultima_reimpresion ? parseFechaMySQL(dto.ultima_reimpresion, 'venta_reimpresion.creado_en') : null,
    ...(dto.referencia_fiscal === undefined ? {} : { referenciaFiscal: dto.referencia_fiscal ? aReferenciaFiscal(dto.referencia_fiscal) : null }),
  }
}

export function crearCajaApi(): CajaService {
  return {
    async obtenerEstado(): Promise<EstadoCaja> {
      const dto = await solicitar<EstadoDto>('GET', '/caja/estado')
      return {
        corte: dto.corte ? aCorte(dto.corte) : null,
        cuentas: dto.cuentas.map((item) => ({
          cuenta: aCuenta(item.cuenta),
          mesaNumero: Number(item.mesa_numero),
          meseroNombre: item.mesero_nombre ?? '',
          pedidosSinEntregar: item.pedidos_sin_entregar.map((pedido) => ({
            idPedido: Number(pedido.id_pedido),
            estado: pedido.estado,
          })),
        })),
        metodosPago: dto.metodos_pago.map((metodo) => ({
          idMetodo: Number(metodo.id_metodo),
          nombre: metodo.nombre,
          idCategoriaMetodoPago: Number(metodo.id_categoria_metodo_pago),
          categoria: metodo.categoria,
          tipo: metodo.tipo,
          esEfectivo: Boolean(metodo.es_efectivo),
        })),
      }
    },
    async abrirCorte(fondoInicial) {
      return aCorte(await solicitar<CorteDto>('POST', '/caja/cortes', { cuerpo: { fondo_inicial: fondoInicial } }))
    },
    async cerrarCorte(efectivoContado) {
      return aCorteDetalle(
        await solicitar<CorteDetalleDto>('POST', '/caja/cortes/cerrar', {
          cuerpo: { efectivo_contado: efectivoContado },
        }),
      )
    },
    async listarCortes(filtro = {}) {
      const dto = await solicitar<CorteResumenDto[]>('GET', '/caja/cortes', {
        consulta: { desde: filtro.desde, hasta: filtro.hasta },
      })
      return dto.map(aCorteResumen)
    },
    async obtenerCorte(idCorte) {
      return aCorteDetalle(await solicitar<CorteDetalleDto>('GET', `/caja/cortes/${idCorte}`))
    },
    async cobrar(idCuenta, pagos, claveIdempotencia) {
      const dto = await solicitar<{ venta: VentaDto }>('POST', `/caja/cuentas/${idCuenta}/cobrar`, {
        cuerpo: {
          pagos: pagos.map((pago) => ({
            id_metodo: pago.idMetodo,
            monto: pago.monto,
            monto_recibido: pago.montoRecibido,
          })),
        },
        claveIdempotencia,
      })
      return aVenta(dto.venta)
    },
    async reporteVentas(desde, hasta) {
      return aReporteVentas(await solicitar<ReporteVentasDto>('GET', '/caja/reportes/ventas', { consulta: { desde, hasta } }))
    },
    async listarVentas(filtro = {}) {
      const dto = await solicitar<VentaListadoDto[]>('GET', '/caja/ventas', {
        consulta: { desde: filtro.desde, hasta: filtro.hasta, q: filtro.q || undefined },
      })
      return dto.map(aVentaListado)
    },
    async obtenerVenta(idVenta) {
      return aVentaDetalle(await solicitar<VentaDetalleDto>('GET', `/caja/ventas/${idVenta}`))
    },
    async registrarReimpresion(idVenta) {
      const dto = await solicitar<{ reimpresiones: Numero; ultima_reimpresion: string | null }>('POST', `/caja/ventas/${idVenta}/reimpresion`)
      return {
        reimpresiones: Number(dto.reimpresiones),
        ultimaReimpresion: dto.ultima_reimpresion ? parseFechaMySQL(dto.ultima_reimpresion, 'venta_reimpresion.creado_en') : null,
      }
    },
    async solicitarDevolucion(idVenta, solicitud, claveIdempotencia) {
      return aDevolucion(
        await solicitar<DevolucionDto>('POST', `/caja/ventas/${idVenta}/devoluciones`, {
          cuerpo: {
            lineas: solicitud.lineas.map((l) => ({ id_detalle: l.idDetalle, cantidad: l.cantidad })),
            pagos: solicitud.pagos.map((p) => ({ id_metodo: p.idMetodo, monto: p.monto })),
            motivo: solicitud.motivo,
            reponer_inventario: solicitud.reponerInventario,
          },
          claveIdempotencia,
        }),
      )
    },
    async listarDevoluciones(filtro = {}) {
      const dto = await solicitar<DevolucionDto[]>('GET', '/caja/devoluciones', {
        consulta: { estado: filtro.estado, desde: filtro.desde, hasta: filtro.hasta },
      })
      return dto.map(aDevolucion)
    },
    async aprobarDevolucion(idDevolucion, nota) {
      return aDevolucion(await solicitar<DevolucionDto>('POST', `/caja/devoluciones/${idDevolucion}/aprobar`, { cuerpo: nota ? { nota } : {} }))
    },
    async rechazarDevolucion(idDevolucion, nota) {
      return aDevolucion(await solicitar<DevolucionDto>('POST', `/caja/devoluciones/${idDevolucion}/rechazar`, { cuerpo: { nota } }))
    },
    async guardarReferenciaFiscal(idVenta, datos) {
      return aReferenciaFiscal(
        await solicitar<ReferenciaFiscalDto>('PUT', `/caja/ventas/${idVenta}/fiscal`, {
          cuerpo: {
            referencia_contador: datos.referenciaContador,
            rfc: datos.rfc,
            razon_social: datos.razonSocial,
            regimen_fiscal: datos.regimenFiscal,
            codigo_postal: datos.codigoPostal,
            correo: datos.correo,
            notas: datos.notas,
          },
        }),
      )
    },
    async quitarReferenciaFiscal(idVenta) {
      await solicitar<{ ok: boolean }>('DELETE', `/caja/ventas/${idVenta}/fiscal`)
    },
  }
}
