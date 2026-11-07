import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { Cuenta, Pedido } from '../types'

/**
 * Pedidos de TODO el salón para la pantalla Pedidos del gerente (/gerente/pedidos).
 * GET /api/pedidos no pagina ni filtra por fecha: se pide todo y la pantalla filtra por día, estado, mesa y mesero
 * (utils/reglasGerente.ts). Propuesta de paginación para el historial: docs/contrato-api-gerente.md (P-11).
 */
export const usePedidosGerenteStore = defineStore('pedidosGerente', () => {
  const pedidos = ref<Pedido[]>([])
  /** `true` solo mientras llega la PRIMERA carga (sin datos que mostrar todavía). */
  const cargando = ref(false)
  /** `true` durante cualquier petición, incluida la actualización automática. */
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  /** Marca de tiempo (ms) de la última carga exitosa. */
  const ultimaActualizacion = ref<number | null>(null)

  /** Pedido abierto en el detalle que no venía en la lista (p. ej. llegó por URL): se pide aparte. */
  const seleccionadoExtra = ref<Pedido | null>(null)
  const seleccionadoNoEncontrado = ref(false)

  /**
   * Cuenta del pedido seleccionado. GET /api/mesas/:id/cuenta solo devuelve la cuenta ACTIVA de la mesa: si ya se
   * cobró (o la mesa abrió otra), `cuentaDelPedido` queda en `null` y la pantalla lo explica.
   */
  const cuentaDelPedido = ref<Cuenta | null>(null)
  const cuentaCargada = ref(false)

  let enCurso: Promise<void> | null = null
  let idSeleccionado: number | null = null

  async function cargarSeleccionado(): Promise<void> {
    const id = idSeleccionado
    if (id === null) {
      seleccionadoExtra.value = null
      seleccionadoNoEncontrado.value = false
      cuentaDelPedido.value = null
      cuentaCargada.value = false
      return
    }
    let pedido = pedidos.value.find((p) => p.idPedido === id) ?? null
    try {
      if (!pedido) pedido = await servicios.pedidos.obtener(id)
      if (idSeleccionado !== id) return
      seleccionadoExtra.value = pedidos.value.some((p) => p.idPedido === id) ? null : pedido
      seleccionadoNoEncontrado.value = false
      const cuenta = await servicios.cuentas.obtenerPorMesa(pedido.idMesa)
      if (idSeleccionado !== id) return
      cuentaDelPedido.value = cuenta?.idCuenta === pedido.idCuenta ? cuenta : null
      cuentaCargada.value = true
    } catch (e) {
      if (idSeleccionado !== id) return
      if (e instanceof ErrorServicio && e.codigo === 'no_encontrado' && !pedido) {
        seleccionadoExtra.value = null
        seleccionadoNoEncontrado.value = true
        return
      }
      throw e
    }
  }

  async function ejecutarCarga(): Promise<void> {
    cargando.value = ultimaActualizacion.value === null && pedidos.value.length === 0
    actualizando.value = true
    try {
      pedidos.value = await servicios.pedidos.listar()
      ultimaActualizacion.value = Date.now()
      error.value = null
      await cargarSeleccionado()
    } catch (e) {
      // Se conservan los pedidos anteriores (si los hay) y se informa el error.
      error.value = e instanceof Error ? e.message : 'No se pudieron cargar los pedidos.'
    } finally {
      cargando.value = false
      actualizando.value = false
    }
  }

  /** Carga o actualiza. Si ya hay una petición en curso, la reutiliza (sin encimar). */
  function cargar(): Promise<void> {
    enCurso ??= ejecutarCarga().finally(() => {
      enCurso = null
    })
    return enCurso
  }

  /** Los datos cambiaron en el servidor (p. ej. se canceló un pedido): recarga YA, solo si la pantalla ya cargó. */
  async function invalidar(): Promise<void> {
    if (ultimaActualizacion.value === null) return
    if (enCurso) await enCurso
    await cargar()
  }

  /** Cambia el pedido del detalle; con la lista ya cargada, trae su cuenta (y el pedido si no está en la lista). */
  function seleccionar(idPedido: number | null): void {
    if (idSeleccionado === idPedido) return
    idSeleccionado = idPedido
    seleccionadoExtra.value = null
    seleccionadoNoEncontrado.value = false
    cuentaDelPedido.value = null
    cuentaCargada.value = false
    if (ultimaActualizacion.value !== null) {
      void cargarSeleccionado().catch((e: unknown) => {
        error.value = e instanceof Error ? e.message : 'No se pudo cargar el pedido.'
      })
    }
  }

  return {
    pedidos,
    cargando,
    actualizando,
    error,
    ultimaActualizacion,
    seleccionadoExtra,
    seleccionadoNoEncontrado,
    cuentaDelPedido,
    cuentaCargada,
    cargar,
    invalidar,
    seleccionar,
  }
})
