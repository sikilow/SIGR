<script setup lang="ts">
// Mis pedidos (/mesero/pedidos y /mesero/pedidos/:pedidoId). Con 1024 px o más, lista a la izquierda y
// detalle a la derecha; con menos, el detalle es una pantalla aparte ("Volver a pedidos").
// Los filtros viven en la URL: ?estado=registrado|enviado|en_preparacion|listo|entregado|cancelado
// (sin valor = "Activos") y ?mesa=:mesaId.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import PedidoDetalle from '../../components/PedidoDetalle.vue'
import { useCompacto } from '../../composables/useCompacto'
import { usePolling } from '../../composables/usePolling'
import { useAnunciosStore } from '../../stores/anuncios'
import { useMesasStore } from '../../stores/mesas'
import { usePedidosStore } from '../../stores/pedidos'
import { ETIQUETA_ESTADO_PEDIDO } from '../../types'
import { formatearHora, formatearMoneda, formatearProductos } from '../../utils/formato'
import { FILTROS_LISTA_PEDIDOS, filtroListaDesdeConsulta, type FiltroListaPedidos } from '../../utils/reglas'

const route = useRoute()
const router = useRouter()
const store = usePedidosStore()
const mesas = useMesasStore()
const anuncios = useAnunciosStore()
// Lista + detalle solo con 64em (1024 px) o más; con menos, o con el texto muy agrandado, el detalle es otra pantalla
const compacto = useCompacto('(max-width: 63.9375em), (max-height: 37.5em)')

const ETIQUETA_FILTRO: Record<FiltroListaPedidos, string> = {
  activos: 'Activos',
  registrado: 'Registrado',
  enviado: 'Enviado',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

const MENSAJE_VACIO: Record<FiltroListaPedidos, string> = {
  activos: 'No hay pedidos activos',
  registrado: 'No hay pedidos registrados',
  enviado: 'No hay pedidos enviados',
  en_preparacion: 'No hay pedidos en preparación',
  listo: 'No hay pedidos listos',
  entregado: 'No hay pedidos entregados',
  cancelado: 'No hay pedidos cancelados',
}

/** Entero positivo o `null`. */
function entero(valor: unknown): number | null {
  return typeof valor === 'string' && /^[1-9]\d*$/.test(valor) ? Number(valor) : null
}

const pedidoId = computed(() => entero(route.params.pedidoId))
const mesaFiltroId = computed(() => entero(route.query.mesa))

// ---------- Filtros sincronizados con la URL ----------
watch(
  () => route.query.estado,
  (valor) => {
    store.filtro = filtroListaDesdeConsulta(valor)
  },
  { immediate: true },
)

const listo = ref(false) // `true` una vez montada la pantalla (antes no hay nada que recargar)

watch(
  mesaFiltroId,
  (id) => {
    const cambio = store.mesaId !== id
    store.filtrarPorMesa(id)
    if (cambio && listo.value) void store.cargar()
  },
  { immediate: true },
)

watch(pedidoId, (id) => store.seleccionar(id), { immediate: true })

function consultaCon(cambios: Record<string, string | undefined>) {
  const consulta = { ...route.query }
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined) delete consulta[clave]
    else consulta[clave] = valor
  }
  return consulta
}

function cambiarFiltro(filtro: FiltroListaPedidos) {
  void router.replace({ query: consultaCon({ estado: filtro === 'activos' ? undefined : filtro }) })
}

function quitarFiltroMesa() {
  void router.replace({ query: consultaCon({ mesa: undefined }) })
}

const numeroMesaFiltro = computed(() => {
  if (mesaFiltroId.value === null) return null
  return (
    mesas.mesas.find((m) => m.id === mesaFiltroId.value)?.numero ??
    store.pedidos.find((p) => p.mesaId === mesaFiltroId.value)?.mesaNumero ??
    mesaFiltroId.value
  )
})

// ---------- Actualización automática ----------
const polling = usePolling(() => Promise.all([store.cargar(), mesas.cargar()]))

// ---------- Aviso y resaltado de pedidos que pasan a "listo" ----------
const resaltados = ref<number[]>([])
let temporizadorResaltado: ReturnType<typeof setTimeout> | undefined

watch(
  () => store.nuevosListos,
  (ids) => {
    if (ids.length === 0) return
    resaltados.value = [...ids]
    clearTimeout(temporizadorResaltado)
    temporizadorResaltado = setTimeout(() => (resaltados.value = []), 6000)
  },
)

watch(
  () => store.anuncio,
  (texto) => {
    if (texto) void anuncios.anunciar(texto)
  },
)

// ---------- Detalle ----------
const detalle = ref<InstanceType<typeof PedidoDetalle> | null>(null)
const tituloLista = ref<HTMLElement | null>(null)

const cuentaPorPagar = computed(() => {
  const mesaId = store.seleccionado?.mesaId
  return mesaId !== undefined && mesas.mesas.find((m) => m.id === mesaId)?.estadoCuenta === 'por_pagar'
})

const mostrarLista = computed(() => !compacto.value || pedidoId.value === null)
const mostrarDetalle = computed(() => !compacto.value || pedidoId.value !== null)

// En pantalla compacta, abrir un pedido es cambiar de pantalla: el foco pasa al detalle; al volver, a su fila.
let enfocarDetalle = false

function intentarEnfocarDetalle() {
  if (enfocarDetalle && detalle.value) {
    detalle.value.enfocar()
    enfocarDetalle = false
  }
}

watch(pedidoId, async (nuevo, anterior) => {
  if (!compacto.value) return
  await nextTick()
  if (nuevo !== null) {
    enfocarDetalle = true
    intentarEnfocarDetalle()
  } else if (anterior !== null) {
    const fila = document.querySelector<HTMLElement>(`[data-pedido-id="${anterior}"]`)
    ;(fila ?? tituloLista.value)?.focus({ preventScroll: false })
  }
})
watch(detalle, intentarEnfocarDetalle)

const enlaceVolver = computed(() => ({ name: 'mesero-pedidos' as const, query: route.query }))

function enlaceAPedido(id: number) {
  return { name: 'mesero-pedidos' as const, params: { pedidoId: id }, query: route.query }
}

onMounted(() => {
  listo.value = true
  store.reiniciarSeguimiento()
  polling.iniciar()
})
</script>

<template>
  <section class="pedidos" :class="{ 'pedidos--dos-paneles': !compacto }" :aria-busy="store.cargando">
    <!-- Encabezado y filtros: se ocultan en la pantalla de detalle de las tablets verticales -->
    <template v-if="mostrarLista">
      <header class="pedidos__encabezado">
        <h2 ref="tituloLista" tabindex="-1">Mis pedidos</h2>
        <IndicadorActualizacion :ultima="store.ultimaActualizacion" :actualizando="store.actualizando" @actualizar="polling.ejecutarAhora()" />
      </header>

      <div class="filtros" role="group" aria-label="Filtrar pedidos">
        <button
          v-if="numeroMesaFiltro !== null"
          type="button"
          class="chip chip--activo filtros__mesa"
          :aria-label="`Quitar filtro de la mesa ${numeroMesaFiltro}`"
          @click="quitarFiltroMesa"
        >
          Mesa {{ numeroMesaFiltro }}
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <button
          v-for="f in FILTROS_LISTA_PEDIDOS"
          :key="f"
          type="button"
          class="chip"
          :class="{ 'chip--activo': store.filtro === f }"
          :aria-pressed="store.filtro === f"
          @click="cambiarFiltro(f)"
        >
          <svg v-if="store.filtro === f" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12 5 5 9-10" />
          </svg>
          {{ ETIQUETA_FILTRO[f] }}
        </button>
      </div>
    </template>

    <!-- Error con datos previos: se conservan los pedidos y se ofrece reintentar -->
    <div v-if="store.error && (store.pedidos.length > 0 || store.seleccionado)" class="aviso aviso--error" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>No se pudo actualizar. Se muestran los últimos datos recibidos. {{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="polling.ejecutarAhora()">Reintentar</button>
    </div>

    <div class="paneles">
      <!-- ============ Lista ============ -->
      <section v-if="mostrarLista" class="lista" aria-label="Lista de pedidos">
        <!-- Carga inicial -->
        <template v-if="store.cargando">
          <div class="esqueletos" aria-hidden="true">
            <div v-for="n in 5" :key="n" class="esqueleto" />
          </div>
          <p class="solo-lectores" role="status">Cargando pedidos…</p>
        </template>

        <!-- Error sin datos previos -->
        <div v-else-if="store.error && store.pedidos.length === 0" class="vacio" role="alert">
          <h3>No se pudieron cargar los pedidos</h3>
          <p>{{ store.error }}</p>
          <button type="button" class="btn" :disabled="store.actualizando" @click="polling.ejecutarAhora()">Reintentar</button>
        </div>

        <!-- Vacío (por filtro) -->
        <div v-else-if="store.ordenados.length === 0" class="vacio">
          <h3>
            {{ MENSAJE_VACIO[store.filtro] }}<template v-if="numeroMesaFiltro !== null"> en la mesa {{ numeroMesaFiltro }}</template>
          </h3>
          <div class="vacio__acciones">
            <button v-if="store.filtro !== 'activos'" type="button" class="btn btn--secundario" @click="cambiarFiltro('activos')">
              Ver pedidos activos
            </button>
            <button v-if="numeroMesaFiltro !== null" type="button" class="btn btn--secundario" @click="quitarFiltroMesa">
              Ver todas las mesas
            </button>
          </div>
        </div>

        <!-- Filas -->
        <ul v-else class="filas" aria-label="Pedidos">
          <li v-for="p in store.ordenados" :key="p.id">
            <RouterLink
              class="fila"
              :class="{ 'fila--resaltada': resaltados.includes(p.id), 'fila--listo': p.estado === 'listo' }"
              :to="enlaceAPedido(p.id)"
              :data-pedido-id="p.id"
            >
              <span class="fila__cabecera">
                <strong class="numero">#{{ p.id }}</strong>
                <span>Mesa {{ p.mesaNumero }}</span>
                <span class="fila__hora numero">{{ formatearHora(p.creadoEn) }}</span>
              </span>
              <InsigniaEstado :tono="p.estado" :texto="ETIQUETA_ESTADO_PEDIDO[p.estado]" />
              <span class="fila__datos">
                {{ formatearProductos(p.detalle.reduce((suma, d) => suma + d.cantidad, 0)) }} ·
                <strong class="numero" :class="{ 'fila__total--cancelado': p.estado === 'cancelado' }">{{ formatearMoneda(p.total) }}</strong>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- ============ Detalle ============ -->
      <section v-if="mostrarDetalle" class="detalle-panel" aria-label="Detalle del pedido">
        <RouterLink v-if="compacto" class="enlace-volver" :to="enlaceVolver">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
          Volver a pedidos
        </RouterLink>

        <div v-if="pedidoId === null" class="vacio">
          <h3>Selecciona un pedido</h3>
          <p>Toca un pedido de la lista para ver su detalle y sus acciones.</p>
        </div>

        <PedidoDetalle v-else-if="store.seleccionado" ref="detalle" :pedido="store.seleccionado" :cuenta-por-pagar="cuentaPorPagar" />

        <div v-else-if="store.seleccionadoNoEncontrado" class="vacio" role="alert">
          <h3>El pedido #{{ pedidoId }} no existe</h3>
          <RouterLink class="btn" :to="enlaceVolver">Ver mis pedidos</RouterLink>
        </div>

        <div v-else-if="store.error" class="vacio" role="alert">
          <h3>No se pudo cargar el pedido #{{ pedidoId }}</h3>
          <p>{{ store.error }}</p>
          <button type="button" class="btn" :disabled="store.actualizando" @click="polling.ejecutarAhora()">Reintentar</button>
        </div>

        <div v-else class="esqueletos" aria-hidden="true">
          <div class="esqueleto" />
          <div class="esqueleto" />
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.pedidos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-height: 100%;
}

/* Dos paneles: cada uno hace su propio scroll y la pantalla no crece más que la ventana */
.pedidos--dos-paneles {
  height: 100%;
  min-height: 0;
}

.pedidos__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.pedidos__encabezado h2:focus {
  outline: none;
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.filtros__mesa svg {
  flex: none;
}

.paneles {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--espacio-4);
}

.pedidos--dos-paneles .paneles {
  flex: 1;
  grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
  min-height: 0;
}

.pedidos--dos-paneles .lista,
.pedidos--dos-paneles .detalle-panel {
  min-height: 0;
  overflow-y: auto;
}

.pedidos--dos-paneles .lista {
  padding: var(--espacio-1);
}

.detalle-panel {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

/* En dos paneles el detalle es una tarjeta */
.pedidos--dos-paneles .detalle-panel {
  padding: var(--espacio-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: var(--sombra);
}

.esqueletos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.vacio__acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--espacio-3);
}

/* ---------- Filas ---------- */
.filas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.fila {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  min-height: 88px;
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-border);
  border-left-width: 8px;
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: var(--sombra);
  color: var(--color-text);
  text-decoration: none;
  touch-action: manipulation;
  transition: transform 100ms ease-out;
}

.fila:active {
  transform: scale(0.99);
}

/* Pedido listo: borde ámbar grueso (además de la insignia con texto) */
.fila--listo {
  border-color: var(--color-listo);
}

/* Seleccionado: fondo, borde de marca y texto en negrita (no solo color) */
.fila.router-link-exact-active {
  border-color: var(--color-primary-dark);
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-primary-dark);
}

.fila.router-link-exact-active .fila__cabecera {
  font-weight: 800;
}

.fila__cabecera {
  display: flex;
  align-items: baseline;
  gap: var(--espacio-3);
}

.fila__cabecera strong {
  font-size: var(--texto-lg);
}

.fila__hora {
  margin-left: auto;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.fila__datos {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.fila__datos strong {
  color: var(--color-text);
}

.fila__total--cancelado {
  text-decoration: line-through;
}

/* Resaltado de "pedido listo": anillo fijo + pulso solo si se permite animar */
.fila--resaltada {
  outline: 4px solid var(--color-listo);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .fila:active {
    transform: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .fila--resaltada {
    animation: pulso-listo 0.8s ease-out 2;
  }
}

@keyframes pulso-listo {
  0% {
    box-shadow: 0 0 0 0 rgb(217 119 6 / 60%);
  }

  100% {
    box-shadow: 0 0 0 16px rgb(217 119 6 / 0%);
  }
}
</style>
