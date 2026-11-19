// Reportes del gerente que no son de ventas: reservaciones e inasistencias (RF-RES) y mermas (migración 035).

/** Conteos por estado de reservación. `vencidas` = el grupo no llegó dentro de la tolerancia (inasistencia). */
export interface ConteoReservaciones {
  total: number
  llegaron: number
  vencidas: number
  canceladas: number
}

/** GET /reservaciones/reporte?desde&hasta (solo gerente): las reservaciones cuya fecha cae en el periodo. */
export interface ReporteReservaciones {
  /** AAAA-MM-DD */
  desde: string
  /** AAAA-MM-DD */
  hasta: string
  resumen: ConteoReservaciones & {
    /** Pendientes o confirmadas: todavía no llegan ni vencen. */
    porLlegar: number
    personas: number
    personasLlegaron: number
    personasVencidas: number
  }
  /** Solo los días con reservaciones, en orden. */
  porDia: Array<ConteoReservaciones & { dia: string }>
  /** Hora de la reservación (0 a 23), solo las horas con reservaciones. */
  porHora: Array<ConteoReservaciones & { hora: number }>
  /** 0 = lunes ... 6 = domingo. */
  porDiaSemana: Array<ConteoReservaciones & { diaSemana: number }>
  /** Sección que pidió el cliente; sin preferencia = «Cualquiera». */
  porSeccion: Array<ConteoReservaciones & { seccion: string }>
  /** Clientes con 2 o más inasistencias en el periodo (hasta 10), para confirmarles antes de apartar mesa. */
  clientesConInasistencias: Array<{ idCliente: number; nombre: string; telefono: string | null; reservaciones: number; inasistencias: number }>
}

export type MotivoMerma = 'caducado' | 'danado' | 'preparacion' | 'otro'

export const MOTIVOS_MERMA: readonly MotivoMerma[] = ['caducado', 'danado', 'preparacion', 'otro']

export const ETIQUETA_MOTIVO_MERMA: Record<MotivoMerma, string> = {
  caducado: 'Caducó',
  danado: 'Se dañó o se cayó',
  preparacion: 'Error de preparación',
  otro: 'Otro motivo',
}

/** Una merma registrada. `valor` = cantidad × precio de venta de ese momento (el sistema no maneja costos). */
export interface Merma {
  idMerma: number
  fechaHora: Date
  idProducto: number
  producto: string
  presentacion: string | null
  cantidad: number
  motivo: MotivoMerma
  nota: string | null
  valor: number
  /** `true` si se descontó del inventario (el producto controla existencia). */
  descuentaInventario: boolean
  registradoPor: string
}

export interface NuevaMerma {
  idProducto: number
  cantidad: number
  motivo: MotivoMerma
  nota?: string
}

/** GET /catalogo/mermas/reporte?desde&hasta (solo gerente). */
export interface ReporteMermas {
  desde: string
  hasta: string
  resumen: { registros: number; unidades: number; valor: number }
  porProducto: Array<{ idProducto: number; producto: string; presentacion: string | null; categoria: string; registros: number; unidades: number; valor: number }>
  porMotivo: Array<{ motivo: MotivoMerma; registros: number; unidades: number; valor: number }>
  porDia: Array<{ dia: string; unidades: number; valor: number }>
  /** Lo que un cliente devolvió y no volvió al inventario (se tiró): también es producto perdido, aunque no se registre como merma. */
  devolucionesSinReponer: { devoluciones: number; unidades: number; valor: number }
  /** Detalle, de la más reciente a la más antigua (hasta 500). */
  mermas: Merma[]
  mermasTruncadas: boolean
}
