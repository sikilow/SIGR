import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { Pedido } from '../types'
import { coincideConFiltro, type FiltroListaPedidos } from '../utils/reglas'

/** Pedidos para "Mis pedidos": lista con filtro, pedido seleccionado y detección de "listo". */
export const usePedidosStore = defineStore('pedidos', () => {
  const pedidos = ref<Pedido[]>([])
  /** `true` solo mientras llega la PRIMERA carga (sin datos que mostrar todavía). */
  const cargando = ref(false)
  /** `true` durante cualquier petición, incluida la actualización automática. */
  const actualizando = ref(false)
  const error = ref<string | null>(null)
  /** Marca de tiempo (ms) de la última carga exitosa. */
  const ultimaActualizacion = ref<number | null>(null)
  const filtro = ref<FiltroListaPedidos>('activos')
  /** Si no es `null`, solo se piden los pedidos de esa mesa (`?mesa=` en la URL). */
  const idMesa = ref<number | null>(null)

  /** Ids de los pedidos que pasaron a "listo" en la última actualización (para resaltarlos). */
  const nuevosListos = ref<number[]>([])
  /** Texto para anunciar ("Pedido #8, mesa 5: listo"); vacío si no hubo cambios. */
  const anuncio = ref('')

  /** Pedido abierto en el detalle (`/mesero/pedidos/:idPedido`). */
  const idPedidoSeleccionado = ref<number | null>(null)
  /** Pedido seleccionado que no está en la lista (otro filtro u otra mesa): se pide por separado. */
  const seleccionadoExtra = ref<Pedido | null>(null)
  /** El pedido seleccionado no existe (404). */
  const seleccionadoNoEncontrado = ref(false)

  /** Mientras sea `false`, la siguiente carga no anuncia "listo" (evita avisos de cambios viejos). */
  let lineaBase = false
  let enCurso: Promise<void> | null = null

  const seleccionado = computed<Pedido | null>(
    () => pedidos.value.find((p) => p.idPedido === idPedidoSeleccionado.value) ?? seleccionadoExtra.value,
  )

  /** Primero los listos (hay que servirlos) y luego los más recientes. */
  const ordenados = computed(() =>
    pedidos.value
      .filter((p) => coincideConFiltro(p.estado, filtro.value))
      .sort((a, b) => Number(b.estado === 'listo') - Number(a.estado === 'listo') || b.fechaHora.getTime() - a.fechaHora.getTime()),
  )

  /** Pedidos listos, para anunciarlos: compara con la carga anterior. */
  function detectarNuevosListos(anteriores: Pedido[], actuales: Pedido[]): Pedido[] {
    const previos = new Map(anteriores.map((p) => [p.idPedido, p.estado]))
    return actuales.filter((p) => p.estado === 'listo' && previos.has(p.idPedido) && previos.get(p.idPedido) !== 'listo')
  }

  async function cargarSeleccionado(): Promise<void> {
    const idPedido = idPedidoSeleccionado.value
    if (idPedido === null || pedidos.value.some((p) => p.idPedido === idPedido)) {
      seleccionadoExtra.value = null
      seleccionadoNoEncontrado.value = false
      return
    }
    try {
      const pedido = await servicios.pedidos.obtener(idPedido)
      if (idPedidoSeleccionado.value === idPedido) {
        seleccionadoExtra.value = pedido
        seleccionadoNoEncontrado.value = false
      }
    } catch (e) {
      if (idPedidoSeleccionado.value !== idPedido) return
      seleccionadoExtra.value = null
      seleccionadoNoEncontrado.value = e instanceof ErrorServicio && e.codigo === 'no_encontrado'
      if (!seleccionadoNoEncontrado.value) throw e
    }
  }

  async function ejecutarCarga(): Promise<void> {
    cargando.value = ultimaActualizacion.value === null && pedidos.value.length === 0
    actualizando.value = true
    const mesaPedida = idMesa.value
    try {
      const recibidos = await servicios.pedidos.listar({ idMesa: mesaPedida ?? undefined })
      // Si cambió la mesa filtrada mientras llegaba la respuesta, esa lista ya no corresponde.
      if (idMesa.value !== mesaPedida) return
      const nuevos = lineaBase ? detectarNuevosListos(pedidos.value, recibidos) : []
      pedidos.value = recibidos
      nuevosListos.value = nuevos.map((p) => p.idPedido)
      anuncio.value = nuevos.map((p) => `Pedido #${p.idPedido}, mesa ${p.mesaNumero}: listo`).join('. ')
      lineaBase = true
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

  /** Carga o actualiza los pedidos. Si ya hay una petición en curso, la reutiliza (sin encimar). */
  function cargar(): Promise<void> {
    enCurso ??= ejecutarCarga().finally(() => {
      enCurso = null
    })
    return enCurso
  }

  /** Los datos cambiaron en el servidor: recarga YA (tras cualquier carga en curso, que ya sería vieja). */
  async function invalidar(): Promise<void> {
    if (ultimaActualizacion.value === null) return
    if (enCurso) await enCurso
    await cargar()
  }

  /** Cambia la mesa filtrada; si es otra, descarta la lista anterior (era de otra mesa). */
  function filtrarPorMesa(idMesaFiltrada: number | null) {
    if (idMesa.value === idMesaFiltrada) return
    idMesa.value = idMesaFiltrada
    pedidos.value = []
    ultimaActualizacion.value = null
    lineaBase = false
    // La carga en curso (si hay) era de la otra mesa: la nueva no debe reutilizarla.
    enCurso = null
  }

  function seleccionar(idPedido: number | null) {
    if (idPedidoSeleccionado.value === idPedido) return
    idPedidoSeleccionado.value = idPedido
    seleccionadoExtra.value = null
    seleccionadoNoEncontrado.value = false
    // Con la lista ya cargada, un pedido que no está en ella se pide aparte (p. ej. "Ver detalle" desde la cuenta).
    if (idPedido !== null && ultimaActualizacion.value !== null) {
      void cargarSeleccionado().catch((e: unknown) => {
        error.value = e instanceof Error ? e.message : 'No se pudo cargar el pedido.'
      })
    }
  }

  /** Al volver a la pantalla: la próxima carga no anuncia cambios ocurridos mientras no se miraba. */
  function reiniciarSeguimiento() {
    lineaBase = false
    nuevosListos.value = []
    anuncio.value = ''
  }

  return {
    pedidos,
    cargando,
    actualizando,
    error,
    ultimaActualizacion,
    filtro,
    idMesa,
    nuevosListos,
    anuncio,
    idPedidoSeleccionado,
    seleccionado,
    seleccionadoNoEncontrado,
    ordenados,
    cargar,
    invalidar,
    filtrarPorMesa,
    seleccionar,
    reiniciarSeguimiento,
  }
})
