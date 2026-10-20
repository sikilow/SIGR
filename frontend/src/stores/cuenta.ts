import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { servicios } from '../services'
import type { Cuenta, Pedido } from '../types'
import { estaSinEntregar, sumaAlTotal } from '../utils/reglas'

/** Cuenta activa de la mesa consultada (`/mesero/mesas/:idMesa/cuenta`). */
export const useCuentaStore = defineStore('cuenta', () => {
  /** Mesa cuya cuenta se consulta; hace las veces de "filtro" de este store. */
  const idMesa = ref<number | null>(null)
  /** `null` mientras no hay datos o cuando la mesa no tiene cuenta activa (ver `cargada`). */
  const cuenta = ref<Cuenta | null>(null)
  /** `true` cuando ya llegó al menos una respuesta de esta mesa (distingue "sin cuenta" de "sin cargar"). */
  const cargada = ref(false)
  /** `true` solo mientras llega la PRIMERA carga de esta mesa. */
  const cargando = ref(false)
  /** `true` durante cualquier petición, incluida la actualización automática. */
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  /** Marca de tiempo (ms) de la última carga exitosa. */
  const ultimaActualizacion = ref<number | null>(null)

  let enCurso: Promise<void> | null = null

  const pedidos = computed<Pedido[]>(() => [...(cuenta.value?.pedidos ?? [])].sort((a, b) => a.idPedido - b.idPedido))
  const pedidosCancelados = computed(() => pedidos.value.filter((p) => !sumaAlTotal(p)))
  /** Pedidos vigentes (no cancelados): son los que suman al total. */
  const pedidosVigentes = computed(() => pedidos.value.filter(sumaAlTotal))
  /** Vigentes que aún no se entregan (avisos al solicitar la cuenta). */
  const pedidosSinEntregar = computed(() => pedidosVigentes.value.filter((p) => estaSinEntregar(p.estado)))

  async function ejecutarCarga(idMesaConsultada: number): Promise<void> {
    cargando.value = !cargada.value
    actualizando.value = true
    try {
      const recibida = await servicios.cuentas.obtenerPorMesa(idMesaConsultada)
      // Si mientras tanto se cambió de mesa, esta respuesta ya no corresponde.
      if (idMesa.value !== idMesaConsultada) return
      cuenta.value = recibida
      cargada.value = true
      ultimaActualizacion.value = Date.now()
      error.value = null
    } catch (e) {
      // Se conserva la cuenta anterior (si la hay) y se informa el error.
      if (idMesa.value === idMesaConsultada) error.value = e instanceof Error ? e.message : 'No se pudo cargar la cuenta.'
    } finally {
      cargando.value = false
      actualizando.value = false
    }
  }

  /** Carga o actualiza la cuenta de la mesa. Reutiliza la petición en curso; otra mesa descarta los datos previos. */
  function cargar(idMesaConsultada: number): Promise<void> {
    if (idMesa.value !== idMesaConsultada) {
      idMesa.value = idMesaConsultada
      cuenta.value = null
      cargada.value = false
      error.value = null
      ultimaActualizacion.value = null
      enCurso = null
    }
    enCurso ??= ejecutarCarga(idMesaConsultada).finally(() => {
      enCurso = null
    })
    return enCurso
  }

  /** Los datos cambiaron en el servidor: recarga YA la cuenta consultada (si hay una). */
  async function invalidar(): Promise<void> {
    if (idMesa.value === null || !cargada.value) return
    if (enCurso) await enCurso
    await cargar(idMesa.value)
  }

  return {
    idMesa,
    cuenta,
    cargada,
    cargando,
    actualizando,
    error,
    ultimaActualizacion,
    pedidos,
    pedidosCancelados,
    pedidosVigentes,
    pedidosSinEntregar,
    cargar,
    invalidar,
  }
})
