import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { servicios } from '../services'
import type { CambioEspera, Cliente, ListaEspera, MesaSalon, NuevaEspera, NuevoCliente, ResultadoAsignacion } from '../types'
import { coincideBusqueda, ordenarEspera, resumirEspera, type FiltroEspera, FILTROS_ESPERA } from '../utils/espera'
import { useSalonStore } from './salon'

/** Convierte un valor de la URL (?estado=) en un filtro válido; si no lo es, `esperando` (lo que más se consulta). */
export function filtroEsperaDesdeConsulta(valor: unknown): FiltroEspera {
  return FILTROS_ESPERA.find((f) => f === valor) ?? 'esperando'
}

export const useEsperaStore = defineStore('espera', () => {
  /** Todos los grupos de hoy (cualquier estado) más los que siguen esperando. */
  const grupos = ref<ListaEspera[]>([])
  /** Mesas, para sugerir una al sentar a un grupo. */
  const mesas = ref<MesaSalon[]>([])
  const cargando = ref(false)
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  const ultimaActualizacion = ref<number | null>(null)
  const filtro = ref<FiltroEspera>('esperando')
  const busqueda = ref('')
  /** Hora de la última carga o del reloj de la pantalla (ms): los tiempos de espera se calculan contra ella. */
  const ahora = ref(Date.now())

  let enCurso: Promise<void> | null = null

  /** Se pone al día con el reloj (lo llama la pantalla cada cierto tiempo y con cada carga). */
  function tictac(): void {
    ahora.value = Date.now()
  }

  const ordenados = computed(() => ordenarEspera(grupos.value))

  const visibles = computed(() =>
    ordenados.value
      .filter((e) => (filtro.value === 'todas' ? true : e.estado === filtro.value))
      .filter((e) => coincideBusqueda(e.clienteNombre, e.clienteTelefono, busqueda.value)),
  )

  const resumen = computed(() => resumirEspera(grupos.value, new Date(ahora.value)))

  const contadores = computed(() => {
    const por = (estado: string) => grupos.value.filter((e) => e.estado === estado).length
    return { todas: grupos.value.length, esperando: por('esperando'), asignada: por('asignada'), cancelada: por('cancelada') }
  })

  async function ejecutarCarga(): Promise<void> {
    const primeraCarga = ultimaActualizacion.value === null
    cargando.value = primeraCarga && grupos.value.length === 0
    actualizando.value = true
    try {
      const [g, m] = await Promise.allSettled([servicios.hostess.listarEspera('todas'), servicios.hostess.listarMesas()])
      if (m.status === 'fulfilled') mesas.value = m.value
      if (g.status === 'fulfilled') {
        grupos.value = g.value
        ultimaActualizacion.value = Date.now()
        error.value = null
      } else {
        // Se conservan los grupos anteriores (si los hay) y se informa el error.
        error.value = g.reason instanceof Error ? g.reason.message : 'No se pudo cargar la lista de espera.'
      }
      tictac()
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

  /**
   * Tras cambiar la lista o las mesas, el Salón (H1) también queda desactualizado: se recarga si ya tenía datos
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

  async function agregar(espera: NuevaEspera, clave: string): Promise<ListaEspera> {
    try {
      return await servicios.hostess.crearEspera(espera, clave)
    } finally {
      await refrescarTodo()
    }
  }

  async function actualizar(id: number, cambio: CambioEspera, clave: string): Promise<ListaEspera> {
    try {
      return await servicios.hostess.actualizarEspera(id, cambio, clave)
    } finally {
      await refrescarTodo()
    }
  }

  /** Sienta a un grupo en una mesa: el mismo `POST /mesas/{id}/asignar` del Salón, con el grupo ya elegido. */
  async function asignar(idMesa: number, idEspera: number, clave: string): Promise<ResultadoAsignacion> {
    try {
      return await servicios.hostess.asignarMesa(idMesa, { tipo: 'espera', idEspera }, clave)
    } finally {
      await refrescarTodo()
    }
  }

  return {
    grupos,
    mesas,
    cargando,
    actualizando,
    error,
    ultimaActualizacion,
    filtro,
    busqueda,
    ahora,
    visibles,
    resumen,
    contadores,
    tictac,
    cargar,
    invalidar,
    buscarClientes,
    crearCliente,
    agregar,
    actualizar,
    asignar,
  }
})
