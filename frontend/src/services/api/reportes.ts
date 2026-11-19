// Reportes del gerente (reservaciones e inasistencias, mermas) contra la API real.
import type { ReportesService } from '../interfaces'
import type { Merma, MotivoMerma, ReporteMermas, ReporteReservaciones } from '../../types'
import { parseFechaMySQL } from './conversion'
import { solicitar } from './cliente'

type Numero = number | string

interface ConteoDto {
  total: Numero
  llegaron: Numero
  vencidas: Numero
  canceladas: Numero
}

export interface ReporteReservacionesDto {
  desde: string
  hasta: string
  resumen: ConteoDto & { por_llegar: Numero; personas: Numero; personas_llegaron: Numero; personas_vencidas: Numero }
  por_dia: Array<ConteoDto & { dia: string }>
  por_hora: Array<ConteoDto & { hora: Numero }>
  por_dia_semana: Array<ConteoDto & { dia_semana: Numero }>
  por_seccion: Array<ConteoDto & { seccion: string }>
  clientes_con_inasistencias: Array<{ id_cliente: Numero; nombre: string; telefono: string | null; reservaciones: Numero; inasistencias: Numero }>
}

const conteo = (c: ConteoDto) => ({ total: Number(c.total), llegaron: Number(c.llegaron), vencidas: Number(c.vencidas), canceladas: Number(c.canceladas) })

export function aReporteReservaciones(dto: ReporteReservacionesDto): ReporteReservaciones {
  return {
    desde: dto.desde,
    hasta: dto.hasta,
    resumen: {
      ...conteo(dto.resumen),
      porLlegar: Number(dto.resumen.por_llegar),
      personas: Number(dto.resumen.personas),
      personasLlegaron: Number(dto.resumen.personas_llegaron),
      personasVencidas: Number(dto.resumen.personas_vencidas),
    },
    porDia: dto.por_dia.map((f) => ({ dia: f.dia, ...conteo(f) })),
    porHora: dto.por_hora.map((f) => ({ hora: Number(f.hora), ...conteo(f) })),
    porDiaSemana: dto.por_dia_semana.map((f) => ({ diaSemana: Number(f.dia_semana), ...conteo(f) })),
    porSeccion: dto.por_seccion.map((f) => ({ seccion: f.seccion, ...conteo(f) })),
    clientesConInasistencias: dto.clientes_con_inasistencias.map((c) => ({
      idCliente: Number(c.id_cliente),
      nombre: c.nombre,
      telefono: c.telefono,
      reservaciones: Number(c.reservaciones),
      inasistencias: Number(c.inasistencias),
    })),
  }
}

interface MermaDto {
  id_merma: Numero
  fecha_hora: string
  id_producto: Numero
  producto: string
  presentacion: string | null
  cantidad: Numero
  motivo: MotivoMerma
  nota: string | null
  valor: Numero
  descuenta_inventario: boolean | number
  registrado_por: string
}

export interface ReporteMermasDto {
  desde: string
  hasta: string
  resumen: { registros: Numero; unidades: Numero; valor: Numero }
  por_producto: Array<{ id_producto: Numero; producto: string; presentacion: string | null; categoria: string; registros: Numero; unidades: Numero; valor: Numero }>
  por_motivo: Array<{ motivo: MotivoMerma; registros: Numero; unidades: Numero; valor: Numero }>
  por_dia: Array<{ dia: string; unidades: Numero; valor: Numero }>
  devoluciones_sin_reponer: { devoluciones: Numero; unidades: Numero; valor: Numero }
  mermas: MermaDto[]
  mermas_truncadas: boolean
}

export function aMerma(dto: MermaDto): Merma {
  return {
    idMerma: Number(dto.id_merma),
    fechaHora: parseFechaMySQL(dto.fecha_hora, 'merma.registrado_en'),
    idProducto: Number(dto.id_producto),
    producto: dto.producto,
    presentacion: dto.presentacion,
    cantidad: Number(dto.cantidad),
    motivo: dto.motivo,
    nota: dto.nota,
    valor: Number(dto.valor),
    descuentaInventario: Boolean(dto.descuenta_inventario),
    registradoPor: dto.registrado_por,
  }
}

export function aReporteMermas(dto: ReporteMermasDto): ReporteMermas {
  return {
    desde: dto.desde,
    hasta: dto.hasta,
    resumen: { registros: Number(dto.resumen.registros), unidades: Number(dto.resumen.unidades), valor: Number(dto.resumen.valor) },
    porProducto: dto.por_producto.map((f) => ({
      idProducto: Number(f.id_producto),
      producto: f.producto,
      presentacion: f.presentacion,
      categoria: f.categoria,
      registros: Number(f.registros),
      unidades: Number(f.unidades),
      valor: Number(f.valor),
    })),
    porMotivo: dto.por_motivo.map((f) => ({ motivo: f.motivo, registros: Number(f.registros), unidades: Number(f.unidades), valor: Number(f.valor) })),
    porDia: dto.por_dia.map((f) => ({ dia: f.dia, unidades: Number(f.unidades), valor: Number(f.valor) })),
    devolucionesSinReponer: {
      devoluciones: Number(dto.devoluciones_sin_reponer.devoluciones),
      unidades: Number(dto.devoluciones_sin_reponer.unidades),
      valor: Number(dto.devoluciones_sin_reponer.valor),
    },
    mermas: dto.mermas.map(aMerma),
    mermasTruncadas: Boolean(dto.mermas_truncadas),
  }
}

export function crearReportesApi(): ReportesService {
  return {
    async reporteReservaciones(desde, hasta) {
      return aReporteReservaciones(await solicitar<ReporteReservacionesDto>('GET', '/reservaciones/reporte', { consulta: { desde, hasta } }))
    },
    async registrarMerma(merma, claveIdempotencia) {
      return aMerma(
        await solicitar<MermaDto>('POST', '/catalogo/mermas', {
          cuerpo: { id_producto: merma.idProducto, cantidad: merma.cantidad, motivo: merma.motivo, nota: merma.nota?.trim() || undefined },
          claveIdempotencia,
        }),
      )
    },
    async reporteMermas(desde, hasta) {
      return aReporteMermas(await solicitar<ReporteMermasDto>('GET', '/catalogo/mermas/reporte', { consulta: { desde, hasta } }))
    },
  }
}
