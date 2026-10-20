import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { servicios } from '../services'
import type { EstadoMesa, GrupoAsignacion, ListaEspera, MesaSalon, Reservacion, ResultadoAsignacion } from '../types'

/** Filtros del Salón. La hostess NO tiene «Pedido listo»: no ve pedidos. */
export type FiltroSalon = 'todas' | Exclude<EstadoMesa, 'desconocido'>

export const FILTROS_SALON: readonly FiltroSalon[] = ['todas', 'libre', 'ocupada', 'reservada']

/** Alias de URL: `?estado=disponible` (nombre anterior de «libre») se sigue aceptando. */
const ALIAS_FILTRO_URL: Record<string, FiltroSalon> = { disponible: 'libre' }

/** Convierte un valor de la URL (?estado=) en un filtro válido; si no lo es, `todas`. */
export function filtroSalonDesdeConsulta(valor: unknown): FiltroSalon {
  if (typeof valor === 'string' && valor in ALIAS_FILTRO_URL) return ALIAS_FILTRO_URL[valor]!
  return FILTROS_SALON.find((f) => f === valor) ?? 'todas'
}

export const useSalonStore = defineStore('salon', () => {
  const mesas = ref<MesaSalon[]>([])
  const reservaciones = ref<Reservacion[]>([])
  const espera = ref<ListaEspera[]>([])
  /** `true` solo mientras llega la PRIMERA carga (sin datos que mostrar todavía). */
  const cargando = ref(false)
  /** `true` durante cualquier petición, incluida la actualización automática. */
  const actualizando = ref(false)
  /** Error al cargar las mesas (lo esencial de la pantalla). */
  const error = ref<string | null>(null)
  /** Error al cargar reservaciones o lista de espera (el salón sigue funcionando sin ellas). */
  const errorLateral = ref<string | null>(null)
  /** Marca de tiempo (ms) de la última carga exitosa de las mesas. */
  const ultimaActualizacion = ref<number | null>(null)
  const filtro = ref<FiltroSalon>('todas')

  let enCurso: Promise<void> | null = null

  const contadores = computed(() => ({
    todas: mesas.value.length,
    libre: mesas.value.filter((m) => m.estado === 'libre').length,
    ocupada: mesas.value.filter((m) => m.estado === 'ocupada').length,
    reservada: mesas.value.filter((m) => m.estado === 'reservada').length,
  }))

  const mesasFiltradas = computed(() =>
    filtro.value === 'todas' ? mesas.value : mesas.value.filter((m) => m.estado === filtro.value),
  )

  /** «Próximas reservaciones»: las que aún no llegan ni se cancelaron, por hora. */
  const proximasReservaciones = computed(() =>
    reservaciones.value
      .filter((r) => r.estado === 'pendiente' || r.estado === 'confirmada')
      .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime()),
  )

  /** «En espera»: los grupos que siguen esperando mesa, el que lleva más tiempo primero. */
  const enEspera = computed(() =>
    espera.value.filter((e) => e.estado === 'esperando').sort((a, b) => a.registradoEn.getTime() - b.registradoEn.getTime()),
  )

  function mensajeDe(e: unknown, respaldo: string): string {
    return e instanceof Error ? e.message : respaldo
  }

  async function ejecutarCarga(): Promise<void> {
    const primeraCarga = ultimaActualizacion.value === null
    cargando.value = primeraCarga && mesas.value.length === 0
    actualizando.value = true
    try {
      const [m, r, e] = await Promise.allSettled([
        servicios.hostess.listarMesas(),
        servicios.hostess.listarReservaciones(),
        servicios.hostess.listarEspera(),
      ])
      // Se conservan los datos anteriores de lo que falle y se informa el error.
      if (m.status === 'fulfilled') {
        mesas.value = m.value
        ultimaActualizacion.value = Date.now()
        error.value = null
      } else {
        error.value = mensajeDe(m.reason, 'No se pudieron cargar las mesas.')
      }
      if (r.status === 'fulfilled') reservaciones.value = r.value
      if (e.status === 'fulfilled') espera.value = e.value
      const fallo = r.status === 'rejected' ? r.reason : e.status === 'rejected' ? e.reason : null
      errorLateral.value = fallo ? mensajeDe(fallo, 'No se pudieron cargar las reservaciones y la lista de espera.') : null
    } finally {
      cargando.value = false
      actualizando.value = false
    }
  }

  /** Carga o actualiza el salón. Si ya hay una petición en curso, la reutiliza (sin encimar). */
  function cargar(): Promise<void> {
    enCurso ??= ejecutarCarga().finally(() => {
      enCurso = null
    })
    return enCurso
  }

  /** Los datos cambiaron en el servidor: recarga YA, esperando a que termine una carga en curso. */
  async function invalidar(): Promise<void> {
    if (enCurso) await enCurso
    await cargar()
  }

  /**
   * Asigna la mesa al grupo y recarga el salón. Los errores del servicio se propagan al diálogo (que decide el
   * mensaje y si se puede reintentar con la misma clave); aunque falle, se recarga para mostrar lo que sí cambió.
   */
  async function asignar(idMesa: number, grupo: GrupoAsignacion, claveIdempotencia: string): Promise<ResultadoAsignacion> {
    try {
      return await servicios.hostess.asignarMesa(idMesa, grupo, claveIdempotencia)
    } finally {
      await invalidar()
    }
  }

  return {
    mesas,
    reservaciones,
    espera,
    cargando,
    actualizando,
    error,
    errorLateral,
    ultimaActualizacion,
    filtro,
    contadores,
    mesasFiltradas,
    proximasReservaciones,
    enEspera,
    cargar,
    invalidar,
    asignar,
  }
})
