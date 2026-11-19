import { defineStore } from 'pinia'
import { ref } from 'vue'
import { servicios } from '../services'
import type { Mesa } from '../types'

/**
 * Pedidos para llevar abiertos (Hostess → Para llevar): las mesas virtuales de «Para llevar» que están ocupadas, con su
 * canal (Didi, Rappi…) y su referencia. La hostess los abre y los asigna a una mesa virtual; el mesero les toma el pedido.
 */
export const useParaLlevarStore = defineStore('paraLlevar', () => {
  const pedidos = ref<Mesa[]>([])
  /** `true` solo mientras llega la PRIMERA carga. */
  const cargando = ref(false)
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  const ultimaActualizacion = ref<number | null>(null)

  let enCurso: Promise<void> | null = null

  async function ejecutarCarga(): Promise<void> {
    cargando.value = ultimaActualizacion.value === null && pedidos.value.length === 0
    actualizando.value = true
    try {
      const mesas = await servicios.mesas.listar()
      pedidos.value = mesas.filter((m) => m.esParaLlevar === true && m.estado !== 'libre')
      ultimaActualizacion.value = Date.now()
      error.value = null
    } catch (e) {
      // Se conservan los pedidos anteriores y se informa el error.
      error.value = e instanceof Error ? e.message : 'No se pudieron cargar los pedidos para llevar.'
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

  /** Libera un pedido que se abrió por error (solo si aún no tiene productos) y recarga la lista. */
  async function liberar(idMesa: number): Promise<void> {
    try {
      await servicios.mesas.liberarParaLlevar(idMesa)
    } finally {
      await invalidar()
    }
  }

  return { pedidos, cargando, actualizando, error, ultimaActualizacion, cargar, invalidar, liberar }
})
