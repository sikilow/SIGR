import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { servicios } from '../services'
import type { EstadoMesa, Mesa } from '../types'

export type FiltroMesas = 'todas' | Exclude<EstadoMesa, 'desconocido'> | 'listo'

export const FILTROS_MESAS: readonly FiltroMesas[] = ['todas', 'disponible', 'ocupada', 'reservada', 'listo']

/** Alias de URL: `?estado=libre` (nombre anterior de «disponible») se sigue aceptando. */
const ALIAS_FILTRO_URL: Record<string, FiltroMesas> = { libre: 'disponible' }

/** Convierte un valor de la URL (?estado=) en un filtro válido; si no lo es, `todas`. */
export function filtroDesdeConsulta(valor: unknown): FiltroMesas {
  if (typeof valor === 'string' && valor in ALIAS_FILTRO_URL) return ALIAS_FILTRO_URL[valor]!
  return FILTROS_MESAS.find((f) => f === valor) ?? 'todas'
}

export const useMesasStore = defineStore('mesas', () => {
  const mesas = ref<Mesa[]>([])
  /** `true` solo mientras llega la PRIMERA carga (sin datos que mostrar todavía). */
  const cargando = ref(false)
  /** `true` durante cualquier petición, incluida la actualización automática. */
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  /** Marca de tiempo (ms) de la última carga exitosa. */
  const ultimaActualizacion = ref<number | null>(null)
  const filtro = ref<FiltroMesas>('todas')
  /** Ids de las mesas que pasaron a "pedido listo" en la última actualización. */
  const nuevasListas = ref<number[]>([])
  /** Texto para la región aria-live; queda vacío en la actualización siguiente. */
  const anuncio = ref('')
  /** Aviso para el mesero al volver al panel (p. ej. "La mesa 7 no está ocupada"). */
  const aviso = ref('')

  let enCurso: Promise<void> | null = null

  const contadores = computed(() => ({
    todas: mesas.value.length,
    disponible: mesas.value.filter((m) => m.estado === 'disponible').length,
    ocupada: mesas.value.filter((m) => m.estado === 'ocupada').length,
    reservada: mesas.value.filter((m) => m.estado === 'reservada').length,
    listo: mesas.value.filter((m) => m.pedidosListos > 0).length,
    /** Total de pedidos listos por servir (puede haber varios en una misma mesa). */
    pedidosListos: mesas.value.reduce((suma, m) => suma + m.pedidosListos, 0),
  }))

  const mesasFiltradas = computed(() => {
    switch (filtro.value) {
      case 'todas':
        return mesas.value
      case 'listo':
        return mesas.value.filter((m) => m.pedidosListos > 0)
      default:
        return mesas.value.filter((m) => m.estado === filtro.value)
    }
  })

  /** Detecta mesas cuyo número de pedidos listos aumentó respecto a la carga anterior. */
  function detectarNuevasListas(anteriores: Mesa[], actuales: Mesa[]): Mesa[] {
    const previos = new Map(anteriores.map((m) => [m.idMesa, m.pedidosListos]))
    return actuales.filter((m) => m.pedidosListos > (previos.get(m.idMesa) ?? m.pedidosListos))
  }

  async function ejecutarCarga(): Promise<void> {
    const primeraCarga = ultimaActualizacion.value === null
    cargando.value = primeraCarga && mesas.value.length === 0
    actualizando.value = true
    try {
      const recibidas = await servicios.mesas.listar()
      const nuevas = primeraCarga ? [] : detectarNuevasListas(mesas.value, recibidas)
      mesas.value = recibidas
      nuevasListas.value = nuevas.map((m) => m.idMesa)
      anuncio.value = nuevas.map((m) => `Mesa ${m.numero}: pedido listo`).join('. ')
      ultimaActualizacion.value = Date.now()
      error.value = null
    } catch (e) {
      // Se conservan las mesas anteriores (si las hay) y se informa el error.
      error.value = e instanceof Error ? e.message : 'No se pudieron cargar las mesas.'
    } finally {
      cargando.value = false
      actualizando.value = false
    }
  }

  /** Carga o actualiza las mesas. Si ya hay una petición en curso, la reutiliza (sin encimar). */
  function cargar(): Promise<void> {
    enCurso ??= ejecutarCarga().finally(() => {
      enCurso = null
    })
    return enCurso
  }

  /**
   * Los datos cambiaron en el servidor (p. ej. se solicitó la cuenta): recarga YA, esperando a que
   * termine cualquier carga en curso para no quedarse con una respuesta anterior al cambio.
   */
  async function invalidar(): Promise<void> {
    if (ultimaActualizacion.value === null && mesas.value.length === 0) return
    if (enCurso) await enCurso
    await cargar()
  }

  function mostrarAviso(texto: string) {
    aviso.value = texto
  }

  function descartarAviso() {
    aviso.value = ''
  }

  return {
    mesas,
    cargando,
    actualizando,
    error,
    ultimaActualizacion,
    filtro,
    nuevasListas,
    anuncio,
    aviso,
    mostrarAviso,
    descartarAviso,
    contadores,
    mesasFiltradas,
    cargar,
    invalidar,
  }
})
