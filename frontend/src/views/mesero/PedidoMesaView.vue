<script setup lang="ts">
// Pedido de mesa (/mesero/mesas/:idMesa/pedido[?editar=:idPedido]).
// Arma un pedido (menú + carrito), lo revisa, lo registra y lo envía a cocina; o edita un
// pedido registrado. Solo usa services/index.ts (a través de las tarjetas y del store).
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import ConfirmacionPedido from '../../components/ConfirmacionPedido.vue'
import DialogoModal from '../../components/DialogoModal.vue'
import MenuProductos from '../../components/MenuProductos.vue'
import PedidoActual from '../../components/PedidoActual.vue'
import RevisionPedido, { type ResultadoPedido } from '../../components/RevisionPedido.vue'
import { useCompacto } from '../../composables/useCompacto'
import { ErrorServicio, servicios } from '../../services'
import { useMesasStore } from '../../stores/mesas'
import { usePedidoBorradorStore } from '../../stores/pedidoBorrador'
import { ETIQUETA_ESTADO_PEDIDO, type CategoriaMenu, type Mesa, type Pedido, type Producto } from '../../types'
import {
  agregarProducto,
  agregarSugerencia,
  cambiarCantidad,
  cantidadDe,
  carritosIguales,
  establecerIndicaciones,
  lineasDesdeDetalle,
  MAX_CANTIDAD,
  quitarLinea,
  topeCantidad,
  totalEstimado,
  totalUnidades,
  type LineaCarrito,
} from '../../utils/carrito'
import { formatearMoneda } from '../../utils/formato'
import { motivoPedidoBloqueado, puedeEditarOEnviar } from '../../utils/reglas'

type Fase = 'cargando' | 'error' | 'editor' | 'confirmacion'

const route = useRoute()
const router = useRouter()
const mesasStore = useMesasStore()
const borrador = usePedidoBorradorStore()
const compacto = useCompacto()

// ---------- Estado de la pantalla ----------
const fase = ref<Fase>('cargando')
const errorCarga = ref('')
const mesa = ref<Mesa | null>(null)
const categorias = ref<CategoriaMenu[]>([])
const pedidoEditando = ref<Pedido | null>(null)
const lineasEdicion = ref<LineaCarrito[]>([])
const lineasOriginales = ref<LineaCarrito[]>([])
const pedidoConfirmado = ref<Pedido | null>(null)
const resultadoConfirmado = ref<ResultadoPedido>('registrado')
const anuncio = ref('')
/** Evita pedir confirmación al salir cuando la salida la provoca la propia pantalla. */
const salidaLibre = ref(false)

// ---------- Parámetros de la ruta (se validan) ----------
/** Entero positivo o `null`. */
function entero(valor: unknown): number | null {
  return typeof valor === 'string' && /^[1-9]\d*$/.test(valor) ? Number(valor) : null
}

const idMesa = computed(() => entero(route.params.idMesa))

// ---------- Carrito: borrador por mesa (pedido nuevo) o copia local (edición) ----------
const editando = computed(() => pedidoEditando.value !== null)
const lineas = computed<LineaCarrito[]>(() =>
  editando.value ? lineasEdicion.value : borrador.lineasDe(idMesa.value ?? -1),
)
const total = computed(() => totalEstimado(lineas.value))

function establecer(nuevas: LineaCarrito[]) {
  if (editando.value) lineasEdicion.value = nuevas
  else if (idMesa.value !== null) borrador.establecer(idMesa.value, nuevas)
}

/** Productos del pedido que, según el menú actual, ya están agotados. */
const agotados = computed<number[]>(() => {
  const agotadosDelMenu = new Set(
    categorias.value.flatMap((c) => c.productos).filter((p) => !p.disponible).map((p) => p.idProducto),
  )
  return lineas.value.filter((l) => agotadosDelMenu.has(l.idProducto)).map((l) => l.idProducto)
})
const cantidades = computed<Record<number, number>>(() =>
  Object.fromEntries(lineas.value.map((l) => [l.idProducto, l.cantidad])),
)
/** Existencia por producto (solo los que la controlan): topa las cantidades del pedido. */
const existencias = computed<Record<number, number>>(() =>
  Object.fromEntries(
    categorias.value.flatMap((c) => c.productos).flatMap((p) => (p.existencia === undefined ? [] : [[p.idProducto, p.existencia] as const])),
  ),
)

const hayCambiosSinGuardar = computed(() =>
  editando.value ? !carritosIguales(lineasEdicion.value, lineasOriginales.value) : lineas.value.length > 0,
)

/** Actualiza la región aria-live con lo que cambió y el total. */
function anunciar(texto: string) {
  anuncio.value = texto
}

const textoTotal = (lista: LineaCarrito[]) => `Total: ${formatearMoneda(totalEstimado(lista))}`

// ---------- Guardia de la pantalla ----------
/** Vuelve al panel con un aviso (se anuncia en una región aria-live del layout). */
async function volverConAviso(texto: string) {
  salidaLibre.value = true
  mesasStore.mostrarAviso(texto)
  await router.replace({ name: 'mesero-mesas' })
}

async function iniciar() {
  fase.value = 'cargando'
  errorCarga.value = ''
  pedidoConfirmado.value = null
  pedidoEditando.value = null
  salidaLibre.value = false

  const id = idMesa.value
  if (id === null) return volverConAviso('La mesa indicada no es válida.')
  let idEditar: number | null = null
  if (route.query.editar !== undefined) {
    idEditar = entero(route.query.editar)
    if (idEditar === null) return volverConAviso('El pedido indicado no es válido.')
  }

  try {
    await mesasStore.cargar()
    if (mesasStore.mesas.length === 0 && mesasStore.error) throw new Error(mesasStore.error)

    const encontrada = mesasStore.mesas.find((m) => m.idMesa === id)
    if (!encontrada) return volverConAviso(`La mesa ${id} no existe.`)
    const bloqueo = motivoPedidoBloqueado(encontrada)
    if (bloqueo) return volverConAviso(bloqueo)

    let pedido: Pedido | null = null
    if (idEditar !== null) {
      try {
        pedido = await servicios.pedidos.obtener(idEditar)
      } catch (e) {
        if (e instanceof ErrorServicio && e.codigo === 'no_encontrado') {
          return volverConAviso(`El pedido #${idEditar} no existe.`)
        }
        throw e
      }
      if (pedido.idMesa !== id) {
        return volverConAviso(`El pedido #${pedido.idPedido} no pertenece a la mesa ${encontrada.numero}.`)
      }
      if (!puedeEditarOEnviar(pedido.estado)) {
        const estado = ETIQUETA_ESTADO_PEDIDO[pedido.estado].toLowerCase()
        return volverConAviso(`El pedido #${pedido.idPedido} ya no se puede editar: está ${estado}.`)
      }
    }

    categorias.value = await servicios.menu.obtenerMenu()
    mesa.value = encontrada
    pedidoEditando.value = pedido
    lineasEdicion.value = pedido ? lineasDesdeDetalle(pedido.detalle) : []
    lineasOriginales.value = pedido ? lineasDesdeDetalle(pedido.detalle) : []
    fase.value = 'editor'
  } catch (e) {
    errorCarga.value = e instanceof Error ? e.message : 'No se pudo cargar la pantalla.'
    fase.value = 'error'
  }
}

// Carga inicial y recarga si cambia la mesa o el pedido a editar. Se ignora al salir hacia otra
// ruta (ahí los parámetros ya no existen y no hay nada que cargar).
watch(
  () => [route.params.idMesa, route.query.editar],
  () => {
    if (route.name === 'mesero-pedido-mesa') void iniciar()
  },
  { immediate: true },
)

// ---------- Acciones del carrito ----------
function agregar(producto: Producto) {
  const nuevas = agregarProducto(lineas.value, producto)
  if (nuevas === lineas.value) {
    if (!producto.disponible) anunciar(`${producto.nombre} está agotado.`)
    else if (producto.existencia !== undefined && cantidadDe(lineas.value, producto.idProducto) >= producto.existencia) {
      anunciar(`Ya agregaste todo lo que hay de ${producto.nombre}: solo quedan ${producto.existencia}.`)
    } else anunciar(`${producto.nombre}: máximo ${MAX_CANTIDAD} por pedido.`)
    return
  }
  establecer(nuevas)
  anunciar(`${producto.nombre}: ${cantidadDe(nuevas, producto.idProducto)}. ${textoTotal(nuevas)}`)
}

function cambiarCantidadLinea(idProducto: number, delta: number) {
  const nuevas = cambiarCantidad(lineas.value, idProducto, delta, topeCantidad(existencias.value[idProducto]))
  establecer(nuevas)
  const linea = nuevas.find((l) => l.idProducto === idProducto)
  if (linea) anunciar(`${linea.nombre}: ${linea.cantidad}. ${textoTotal(nuevas)}`)
}

function quitar(idProducto: number) {
  const nombre = lineas.value.find((l) => l.idProducto === idProducto)?.nombre ?? 'Producto'
  const nuevas = quitarLinea(lineas.value, idProducto)
  establecer(nuevas)
  anunciar(`${nombre} quitado. ${textoTotal(nuevas)}`)
}

function cambiarIndicaciones(idProducto: number, texto: string) {
  establecer(establecerIndicaciones(lineas.value, idProducto, texto))
}

function usarSugerencia(idProducto: number, sugerencia: string) {
  const actual = lineas.value.find((l) => l.idProducto === idProducto)?.indicaciones ?? ''
  establecer(establecerIndicaciones(lineas.value, idProducto, agregarSugerencia(actual, sugerencia)))
  anunciar(`Observación agregada: ${sugerencia}.`)
}

// ---------- Diálogos: pedido (compacto) y revisión ----------
const pedidoAbierto = ref(false)
const revisionAbierta = ref(false)
const origenRevision = ref<HTMLElement | null>(null)
const botonVerPedido = ref<HTMLElement | null>(null)
const dialogoPedido = ref<InstanceType<typeof DialogoModal> | null>(null)
/** Copia del carrito al abrir la revisión: no cambia aunque el borrador se limpie al registrar. */
const lineasRevision = ref<LineaCarrito[]>([])

async function abrirRevision() {
  if (lineas.value.length === 0) return
  lineasRevision.value = lineas.value.map((l) => ({ ...l }))
  if (compacto.value) {
    // Desde el diálogo del pedido: se cierra primero y el foco regresa a "Ver pedido".
    origenRevision.value = botonVerPedido.value
    pedidoAbierto.value = false
    await new Promise((resolver) => setTimeout(resolver, 60))
  } else {
    origenRevision.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  revisionAbierta.value = true
}

/** El pedido ya existe en el servidor: se limpia el borrador y se refresca el panel. */
function alRegistrarse() {
  if (idMesa.value !== null && !editando.value) borrador.vaciar(idMesa.value)
  void mesasStore.cargar()
}

function alCompletarse(pedido: Pedido, resultado: ResultadoPedido) {
  revisionAbierta.value = false
  pedidoConfirmado.value = pedido
  resultadoConfirmado.value = resultado
  fase.value = 'confirmacion'
  // Quedan datos nuevos en el servidor (estado del pedido): el panel debe actualizarse.
  void mesasStore.cargar()
}

function nuevoPedido() {
  if (route.query.editar !== undefined) void router.replace({ query: {} }) // el watch recarga
  else void iniciar()
}

// ---------- Confirmación de salida con borrador ----------
const salidaAbierta = ref(false)
let resolverSalida: ((salir: boolean) => void) | null = null

function pedirConfirmacionSalida(): Promise<boolean> {
  return new Promise((resolver) => {
    resolverSalida = resolver
    salidaAbierta.value = true
  })
}

function responderSalida(salir: boolean) {
  salidaAbierta.value = false
  resolverSalida?.(salir)
  resolverSalida = null
}

async function confirmarSiHayCambios(): Promise<boolean> {
  if (salidaLibre.value || fase.value !== 'editor' || !hayCambiosSinGuardar.value) return true
  return pedirConfirmacionSalida()
}

onBeforeRouteLeave(confirmarSiHayCambios)
onBeforeRouteUpdate((a, b) =>
  a.params.idMesa === b.params.idMesa && a.query.editar === b.query.editar ? true : confirmarSiHayCambios(),
)
</script>

<template>
  <section class="pedido-mesa">
    <!-- Región en vivo única: cambios del pedido y total -->
    <p class="solo-lectores" role="status" aria-live="polite">{{ anuncio }}</p>

    <template v-if="fase === 'cargando'">
      <div class="esqueletos" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="esqueleto" />
      </div>
      <p class="solo-lectores" role="status">Cargando mesa y menú…</p>
    </template>

    <div v-else-if="fase === 'error'" class="vacio" role="alert">
      <h3>No se pudo abrir el pedido</h3>
      <p>{{ errorCarga }}</p>
      <div class="estado__acciones">
        <button type="button" class="btn" @click="iniciar">Reintentar</button>
        <RouterLink class="btn btn--secundario" :to="{ name: 'mesero-mesas' }">Volver al panel</RouterLink>
      </div>
    </div>

    <ConfirmacionPedido
      v-else-if="fase === 'confirmacion' && pedidoConfirmado && mesa"
      :pedido="pedidoConfirmado"
      :resultado="resultadoConfirmado"
      :mesa-numero="mesa.numero"
      @nuevo="nuevoPedido"
    />

    <div v-else-if="mesa" class="editor">
      <div class="editor__menu">
        <RouterLink class="enlace-volver" :to="{ name: 'mesero-mesas' }">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6" /></svg>
          Panel de mesas
        </RouterLink>
        <MenuProductos :categorias="categorias" :cantidades="cantidades" @agregar="agregar" />
      </div>

      <!-- Tablet horizontal: pedido en columna fija -->
      <aside v-if="!compacto" class="editor__pedido tarjeta" aria-label="Pedido actual">
        <PedidoActual
          :mesa-numero="mesa.numero"
          :lineas="lineas"
          :total="total"
          :agotados="agotados"
          :existencias="existencias"
          :editando-id="pedidoEditando?.idPedido ?? null"
          @cambiar-cantidad="cambiarCantidadLinea"
          @quitar="quitar"
          @indicaciones="cambiarIndicaciones"
          @sugerencia="usarSugerencia"
          @revisar="abrirRevision"
        />
      </aside>

      <!-- Tablet vertical: barra inferior con total y botón que abre el pedido en un diálogo -->
      <div v-else class="barra-pedido">
        <p class="barra-pedido__datos">
          <span>Mesa {{ mesa.numero }} · {{ totalUnidades(lineas) }} {{ totalUnidades(lineas) === 1 ? 'producto' : 'productos' }}</span>
          <strong class="numero">{{ formatearMoneda(total) }}</strong>
          <span class="barra-pedido__etiqueta">Total estimado</span>
        </p>
        <button ref="botonVerPedido" type="button" class="btn btn--grande" aria-haspopup="dialog" @click="pedidoAbierto = true">
          Ver pedido
        </button>
      </div>
    </div>

    <!-- Pedido en diálogo (solo modo compacto) -->
    <DialogoModal
      v-if="mesa"
      ref="dialogoPedido"
      :abierto="compacto && pedidoAbierto"
      etiqueta-id="pedido-titulo"
      variante="hoja"
      @cerrar="pedidoAbierto = false"
    >
      <div class="pedido-dialogo">
        <PedidoActual
          :mesa-numero="mesa.numero"
          :lineas="lineas"
          :total="total"
          :agotados="agotados"
          :existencias="existencias"
          :editando-id="pedidoEditando?.idPedido ?? null"
          @cambiar-cantidad="cambiarCantidadLinea"
          @quitar="quitar"
          @indicaciones="cambiarIndicaciones"
          @sugerencia="usarSugerencia"
          @revisar="abrirRevision"
        />
        <button type="button" class="btn btn--secundario btn--grande pedido-dialogo__cerrar" @click="dialogoPedido?.cerrar()">
          Seguir agregando
        </button>
      </div>
    </DialogoModal>

    <RevisionPedido
      v-if="mesa"
      :abierto="revisionAbierta"
      :id-mesa="mesa.idMesa"
      :mesa-numero="mesa.numero"
      :lineas="lineasRevision"
      :total="totalEstimado(lineasRevision)"
      :id-pedido="pedidoEditando?.idPedido ?? null"
      :origen-foco="origenRevision"
      @modificar="revisionAbierta = false"
      @registrado="alRegistrarse"
      @completado="alCompletarse"
    />

    <!-- Salir con productos sin registrar -->
    <DialogoModal :abierto="salidaAbierta" etiqueta-id="salida-titulo" variante="centro" @cerrar="responderSalida(false)">
      <div class="salida">
        <h2 id="salida-titulo">{{ editando ? 'Tienes cambios sin guardar' : 'Tienes un pedido sin registrar' }}</h2>
        <p>
          {{ editando ? '¿Salir sin guardar los cambios?' : '¿Salir y conservar el borrador?' }}
        </p>
        <div class="fila-botones">
          <button type="button" class="btn" autofocus @click="responderSalida(false)">Seguir editando</button>
          <button type="button" class="btn btn--secundario" @click="responderSalida(true)">
            {{ editando ? 'Salir sin guardar' : 'Salir y conservar borrador' }}
          </button>
        </div>
      </div>
    </DialogoModal>
  </section>
</template>

<style scoped>
.pedido-mesa {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.esqueletos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.estado__acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--espacio-3);
}

.editor {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--espacio-4);
  min-height: 0;
}

.editor__menu {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  min-height: 0;
  overflow-y: auto;
  padding: var(--espacio-1);
}

.editor__pedido {
  min-height: 0;
  padding: var(--espacio-4);
  /* Con texto grande el panel puede no caber: que se desplace y no recorte el botón "Revisar pedido" */
  overflow-y: auto;
}

/* Barra inferior (tablet vertical) */
.barra-pedido {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
  margin: 0 calc(var(--espacio-6) * -1) calc(var(--espacio-6) * -1);
  padding: var(--espacio-3) var(--espacio-6);
  border-top: 2px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: 0 -4px 12px rgb(31 41 55 / 10%);
}

.barra-pedido__datos {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-size: var(--texto-sm);
}

.barra-pedido__datos strong {
  font-size: var(--texto-xl);
  line-height: 1.2;
  order: -1;
}

.barra-pedido__etiqueta {
  color: var(--color-muted);
}

.barra-pedido .btn {
  min-width: 160px;
}

@media (max-width: 53.75em), (max-height: 37.5em) {
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--espacio-2);
  }

  .editor__menu {
    flex: 1;
  }
}

.pedido-dialogo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  max-height: calc(85dvh - var(--espacio-12));
}

.pedido-dialogo :deep(.pedido) {
  min-height: 0;
}

.pedido-dialogo__cerrar {
  flex: none;
}

.salida {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.salida p {
  margin: 0;
}
</style>
