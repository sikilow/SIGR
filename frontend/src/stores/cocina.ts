import { defineStore } from 'pinia'
import { ref } from 'vue'
import { servicios } from '../services'
import type { Pedido } from '../types'

function porAntiguedad(a: Pedido, b: Pedido): number {
  return a.fechaHora.getTime() - b.fechaHora.getTime() || a.idPedido - b.idPedido
}

export const useCocinaStore = defineStore('cocina', () => {
  const pedidos = ref<Pedido[]>([])
  const cargando = ref(false)
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  const ultimaActualizacion = ref<number | null>(null)
  let enCurso: Promise<void> | null = null

  async function ejecutarCarga(): Promise<void> {
    cargando.value = ultimaActualizacion.value === null
    actualizando.value = true
    try {
      const [nuevos, enPreparacion] = await Promise.all([
        servicios.pedidos.listar({ estado: 'pendiente' }),
        servicios.pedidos.listar({ estado: 'en_preparacion' }),
      ])
      pedidos.value = [...nuevos, ...enPreparacion].sort(porAntiguedad)
      ultimaActualizacion.value = Date.now()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'No se pudieron cargar los pedidos de cocina.'
    } finally {
      cargando.value = false
      actualizando.value = false
    }
  }

  function cargar(): Promise<void> {
    enCurso ??= ejecutarCarga().finally(() => {
      enCurso = null
    })
    return enCurso
  }

  async function invalidar(): Promise<void> {
    if (enCurso) await enCurso
    await cargar()
  }

  async function cambiarEstado(idPedido: number, estado: 'en_preparacion' | 'listo'): Promise<Pedido> {
    const actualizado = await servicios.pedidos.cambiarEstadoCocina(idPedido, estado)
    pedidos.value = pedidos.value
      .map((pedido) => (pedido.idPedido === idPedido ? actualizado : pedido))
      .filter((pedido) => pedido.estado === 'pendiente' || pedido.estado === 'enviado' || pedido.estado === 'en_preparacion')
      .sort(porAntiguedad)
    await invalidar()
    return actualizado
  }

  return { pedidos, cargando, actualizando, error, ultimaActualizacion, cargar, invalidar, cambiarEstado }
})
