import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { servicios } from '../services'
import type {
  CambioReservacion,
  Cliente,
  MesaSalon,
  NuevaReservacion,
  NuevoCliente,
  Reservacion,
  ResultadoAsignacion,
} from '../types'
import { aDiaISO, filtrarReservaciones, type FiltroReservaciones } from '../utils/reservaciones'
import { useSalonStore } from './salon'

/** Convierte un valor de la URL (?estado=) en un filtro válido; si no lo es, `todas`. */
export function filtroReservacionesDesdeConsulta(valor: unknown): FiltroReservaciones {
  const validos: readonly string[] = ['pendiente', 'confirmada', 'llego', 'cancelada', 'vencida']
  return typeof valor === 'string' && validos.includes(valor) ? (valor as FiltroReservaciones) : 'todas'
}

export const useReservacionesStore = defineStore('reservaciones', () => {
  /** Día que se está viendo («AAAA-MM-DD», hora local). */
  const dia = ref(aDiaISO(new Date()))
  const reservaciones = ref<Reservacion[]>([])
  /** Mesas, para ofrecer una al crear/editar la reservación y al registrar la llegada. */
  const mesas = ref<MesaSalon[]>([])
  const cargando = ref(false)
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  const ultimaActualizacion = ref<number | null>(null)
  const filtro = ref<FiltroReservaciones>('todas')
  const busqueda = ref('')

  let enCurso: Promise<void> | null = null
  /** Día cuya respuesta se espera: una respuesta de un día anterior (el usuario ya cambió) se descarta. */
  let diaPedido = dia.value

  const visibles = computed(() => filtrarReservaciones(reservaciones.value, filtro.value, busqueda.value))

  const contadores = computed(() => {
    const por = (estado: string) => reservaciones.value.filter((r) => r.estado === estado).length
    return {
      todas: reservaciones.value.length,
      pendiente: por('pendiente'),
      confirmada: por('confirmada'),
      llego: por('llego'),
      cancelada: por('cancelada'),
      vencida: por('vencida'),
    }
  })

  async function ejecutarCarga(): Promise<void> {
    const primeraCarga = ultimaActualizacion.value === null
    cargando.value = primeraCarga && reservaciones.value.length === 0
    actualizando.value = true
    diaPedido = dia.value
    try {
      const [r, m] = await Promise.allSettled([servicios.hostess.listarReservaciones(diaPedido), servicios.hostess.listarMesas()])
      // Si mientras tanto se cambió de día, esta respuesta ya no corresponde: la carga siguiente la reemplaza.
      if (diaPedido !== dia.value) return
      if (m.status === 'fulfilled') mesas.value = m.value
      if (r.status === 'fulfilled') {
        reservaciones.value = r.value
        ultimaActualizacion.value = Date.now()
        error.value = null
      } else {
        // Se conservan las reservaciones anteriores (si las hay) y se informa el error.
        error.value = r.reason instanceof Error ? r.reason.message : 'No se pudieron cargar las reservaciones.'
      }
    } finally {
      cargando.value = false
      actualizando.value = false
    }
  }

  /** Carga o actualiza la lista. Si ya hay una petición en curso, la reutiliza (sin encimar). */
  function cargar(): Promise<void> {
    enCurso ??= ejecutarCarga().finally(() => {
      enCurso = null
    })
    return enCurso
  }

  /** Los datos cambiaron: recarga YA, esperando a que termine una carga en curso. */
  async function invalidar(): Promise<void> {
    if (enCurso) await enCurso
    await cargar()
  }

  /** Cambia el día que se ve y recarga. Vacía la lista para no mostrar las reservaciones de otro día. */
  async function cambiarDia(nuevo: string): Promise<void> {
    if (nuevo === dia.value) return
    dia.value = nuevo
    reservaciones.value = []
    ultimaActualizacion.value = null
    error.value = null
    await invalidar()
  }

  /**
   * Tras cambiar reservaciones o mesas, el Salón (H1) también queda desactualizado: se recarga si ya tenía datos
   * (si no, se carga solo al abrir esa pantalla).
   */
  async function refrescarTodo(): Promise<void> {
    const salon = useSalonStore()
    await Promise.allSettled([invalidar(), salon.ultimaActualizacion !== null ? salon.invalidar() : Promise.resolve()])
  }

  // Las acciones propagan los errores del servicio al diálogo (que decide el mensaje y si se puede reintentar con la
  // misma clave). Aunque fallen, se recarga para mostrar lo que sí cambió en el servidor.

  async function buscarClientes(q: string): Promise<Cliente[]> {
    return servicios.hostess.buscarClientes(q)
  }

  async function crearCliente(cliente: NuevoCliente, clave: string): Promise<Cliente> {
    return servicios.hostess.crearCliente(cliente, clave)
  }

  async function crear(reservacion: NuevaReservacion, clave: string): Promise<Reservacion> {
    try {
      return await servicios.hostess.crearReservacion(reservacion, clave)
    } finally {
      await refrescarTodo()
    }
  }

  async function actualizar(id: number, cambio: CambioReservacion, clave: string): Promise<Reservacion> {
    try {
      return await servicios.hostess.actualizarReservacion(id, cambio, clave)
    } finally {
      await refrescarTodo()
    }
  }

  async function registrarLlegada(id: number, idMesa: number | null, clave: string): Promise<ResultadoAsignacion> {
    try {
      return await servicios.hostess.registrarLlegada(id, idMesa, clave)
    } finally {
      await refrescarTodo()
    }
  }

  return {
    dia,
    reservaciones,
    mesas,
    cargando,
    actualizando,
    error,
    ultimaActualizacion,
    filtro,
    busqueda,
    visibles,
    contadores,
    cargar,
    invalidar,
    cambiarDia,
    buscarClientes,
    crearCliente,
    crear,
    actualizar,
    registrarLlegada,
  }
})
