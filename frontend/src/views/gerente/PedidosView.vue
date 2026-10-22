<script setup lang="ts">
// Pedidos (/gerente/pedidos y /gerente/pedidos/:idPedido): el gerente supervisa TODOS los pedidos del salón,
// consulta el historial (RF-PED-003 y RF-PED-005) y cancela como excepción, incluso en preparación (RF-PED-002).
// GET /api/pedidos no pagina ni filtra por fecha: los filtros (día, estado, mesa, mesero y número) se aplican aquí
// con utils/reglasGerente.ts. Los filtros van en una barra compacta arriba; debajo, con 1024 px o más, lista a la
// izquierda y detalle a la derecha; con menos, el detalle es una pantalla aparte ("Volver a pedidos").
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import PedidoDetalle from '../../components/PedidoDetalle.vue'
import SelectorDia from '../../components/hostess/SelectorDia.vue'
import { useCompacto } from '../../composables/useCompacto'
import { usePolling } from '../../composables/usePolling'
import { usePedidosGerenteStore } from '../../stores/pedidosGerente'
import { ETIQUETA_ESTADO_CUENTA, ETIQUETA_ESTADO_PEDIDO, type Pedido } from '../../types'
import { formatearFechaHoraCorta, formatearMoneda, formatearPedidos, formatearProductos } from '../../utils/formato'
import {
  contarPorEstado,
  ETIQUETA_FILTRO_ESTADO_GERENTE,
  filtrarPedidosGerente,
  FILTROS_ESTADO_GERENTE,
  filtrosIniciales,
  hayFiltrosExtra,
  normalizarBusquedaPedido,
  opcionesMeseros,
  opcionesMesas,
  PEDIDOS_POR_BLOQUE,
  textoMostrando,
  unidadesDePedido,
  type FiltrosPedidosGerente,
} from '../../utils/reglasGerente'
import { aDiaISO } from '../../utils/reservaciones'

const route = useRoute()
const store = usePedidosGerenteStore()
// Lista + detalle solo con 64em (1024 px) o más; con menos, o con el texto muy agrandado, el detalle es otra pantalla
const compacto = useCompacto('(max-width: 63.9375em), (max-height: 37.5em)')

/** Entero positivo o `null`. */
function entero(valor: unknown): number | null {
  return typeof valor === 'string' && /^[1-9]\d*$/.test(valor) ? Number(valor) : null
}

const idPedido = computed(() => entero(route.params.idPedido))
watch(idPedido, (id) => store.seleccionar(id), { immediate: true })

// ---------- Filtros ----------
// Viven en la pantalla (no en la URL): abrir un pedido no los pierde porque la vista es la misma.
const filtros = ref<FiltrosPedidosGerente>(filtrosIniciales())
/** Último día elegido: se recuerda al pasar a «Todos los días» y volver. */
const diaElegido = ref(filtros.value.dia ?? aDiaISO(new Date()))

const porDia = computed(() => filtros.value.dia !== null)
function verPorDia() {
  filtros.value.dia = diaElegido.value
}
function verTodosLosDias() {
  filtros.value.dia = null
}
function cambiarDia(dia: string) {
  diaElegido.value = dia
  filtros.value.dia = dia
}

function quitarFiltros() {
  filtros.value = { ...filtrosIniciales(), dia: filtros.value.dia }
}

const busquedaInvalida = computed(() => normalizarBusquedaPedido(filtros.value.busqueda) === null)

const mesas = computed(() => opcionesMesas(store.pedidos))
const meseros = computed(() => opcionesMeseros(store.pedidos))
const filtrados = computed(() => filtrarPedidosGerente(store.pedidos, filtros.value))
const conteo = computed(() => contarPorEstado(store.pedidos, filtros.value))

// ---------- Recorte de la lista (el endpoint no pagina) ----------
const limite = ref(PEDIDOS_POR_BLOQUE)
watch(filtros, () => (limite.value = PEDIDOS_POR_BLOQUE), { deep: true })

const visibles = computed(() => filtrados.value.slice(0, limite.value))
const hayMas = computed(() => filtrados.value.length > visibles.value.length)
const mostrando = computed(
  () => textoMostrando(visibles.value.length, store.pedidos.length) ?? formatearPedidos(store.pedidos.length),
)

async function mostrarMas() {
  const primero = visibles.value.length
  limite.value += PEDIDOS_POR_BLOQUE
  // El foco pasa al primer pedido nuevo: así el teclado sigue donde se quedó la lectura.
  await nextTick()
  const id = filtrados.value[primero]?.idPedido
  if (id !== undefined) document.querySelector<HTMLElement>(`[data-id-pedido="${id}"]`)?.focus()
}

// ---------- Actualización automática ----------
const polling = usePolling(() => store.cargar())

// ---------- Detalle ----------
const detalle = ref<InstanceType<typeof PedidoDetalle> | null>(null)
const tituloLista = ref<HTMLElement | null>(null)

const seleccionado = computed<Pedido | null>(
  () => store.pedidos.find((p) => p.idPedido === idPedido.value) ?? store.seleccionadoExtra,
)
const cuentaPorPagar = computed(() => store.cuentaDelPedido?.estado === 'por_pagar')

const mostrarLista = computed(() => !compacto.value || idPedido.value === null)
const mostrarDetalle = computed(() => !compacto.value || idPedido.value !== null)

// En pantalla compacta, abrir un pedido es cambiar de pantalla: el foco pasa al detalle; al volver, a su fila.
let enfocarDetalle = false

function intentarEnfocarDetalle() {
  if (enfocarDetalle && detalle.value) {
    detalle.value.enfocar()
    enfocarDetalle = false
  }
}

watch(idPedido, async (nuevo, anterior) => {
  if (!compacto.value) return
  await nextTick()
  if (nuevo !== null) {
    enfocarDetalle = true
    intentarEnfocarDetalle()
  } else if (anterior !== null) {
    const fila = document.querySelector<HTMLElement>(`[data-id-pedido="${anterior}"]`)
    ;(fila ?? tituloLista.value)?.focus({ preventScroll: false })
  }
})
watch(detalle, intentarEnfocarDetalle)

// Con dos paneles, el detalle conserva su scroll al cambiar de pedido: el nuevo se abriría a la mitad (sin su
// encabezado ni su estado). Se vuelve arriba en cada cambio.
const panelDetalle = ref<HTMLElement | null>(null)
watch(idPedido, async () => {
  if (compacto.value) return
  await nextTick()
  panelDetalle.value?.scrollTo({ top: 0 })
})

const enlaceVolver = { name: 'gerente-pedidos' as const }
const enlaceAPedido = (id: number) => ({ name: 'gerente-pedidos' as const, params: { idPedido: id } })

onMounted(() => polling.iniciar())
</script>

<template>
  <section class="pedidos" :class="{ 'pedidos--dos-paneles': !compacto }" :aria-busy="store.cargando" aria-labelledby="pedidos-titulo">
    <header v-if="mostrarLista || !compacto" class="pedidos__encabezado">
      <h2 id="pedidos-titulo" ref="tituloLista" tabindex="-1">Pedidos del salón</h2>
      <IndicadorActualizacion :ultima="store.ultimaActualizacion" :actualizando="store.actualizando" @actualizar="polling.ejecutarAhora()" />
    </header>

    <!-- Error con datos previos: se conservan los pedidos y se ofrece reintentar -->
    <div v-if="store.error && store.pedidos.length > 0" class="aviso aviso--error" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>No se pudo actualizar. Se muestran los últimos datos recibidos. {{ store.error }}</p>
      <button type="button" class="btn" :aria-disabled="store.actualizando ? 'true' : undefined" @click="!store.actualizando && polling.ejecutarAhora()">
        Reintentar
      </button>
    </div>

    <!-- ============ Filtros (barra compacta: la lista y el detalle conservan casi toda la altura) ============ -->
    <div v-if="mostrarLista" class="filtros" role="search" aria-label="Filtrar pedidos">
      <div class="filtros__fila">
        <!-- Periodo: un día (hoy por defecto) o todo lo que devolvió la API -->
        <div class="filtros__grupo" role="group" aria-label="Periodo">
          <button type="button" class="chip" :class="{ 'chip--activo': porDia }" :aria-pressed="porDia" @click="verPorDia">Por día</button>
          <button type="button" class="chip" :class="{ 'chip--activo': !porDia }" :aria-pressed="!porDia" @click="verTodosLosDias">
            Todos los días
          </button>
        </div>
        <SelectorDia v-if="filtros.dia !== null" :model-value="filtros.dia" etiqueta="Día de los pedidos" @update:model-value="cambiarDia" />
      </div>

      <div class="filtros__campos">
        <div class="campo">
          <label for="pedido-buscar">Número de pedido</label>
          <input
            id="pedido-buscar"
            v-model="filtros.busqueda"
            type="search"
            inputmode="numeric"
            placeholder="Ej. 12"
            autocomplete="off"
            :aria-invalid="busquedaInvalida ? 'true' : undefined"
            :aria-describedby="busquedaInvalida ? 'pedido-buscar-error' : undefined"
          />
          <p v-if="busquedaInvalida" id="pedido-buscar-error" class="texto-error filtros__error">Escribe solo el número, por ejemplo 12 o #12.</p>
        </div>
        <div class="campo">
          <label for="pedido-estado">Estado</label>
          <!-- Cada opción lleva su conteo (respeta día, mesa, mesero y número) -->
          <select id="pedido-estado" v-model="filtros.estado">
            <option v-for="f in FILTROS_ESTADO_GERENTE" :key="f" :value="f">{{ ETIQUETA_FILTRO_ESTADO_GERENTE[f] }} ({{ conteo[f] }})</option>
          </select>
        </div>
        <div class="campo">
          <label for="pedido-mesa">Mesa</label>
          <select id="pedido-mesa" v-model="filtros.idMesa">
            <option :value="null">Todas las mesas</option>
            <option v-for="m in mesas" :key="m.idMesa" :value="m.idMesa">Mesa {{ m.numero }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="pedido-mesero">Mesero</label>
          <select id="pedido-mesero" v-model="filtros.idMesero">
            <option :value="null">Todos los meseros</option>
            <option v-for="m in meseros" :key="m.idMesero" :value="m.idMesero">{{ m.nombre }}</option>
          </select>
        </div>
      </div>

      <div class="filtros__resumen">
        <!-- Se anuncia al cambiar (filtros o datos nuevos), sin mover el foco -->
        <p class="filtros__mostrando" role="status" aria-live="polite">{{ store.cargando ? '' : mostrando }}</p>
        <button v-if="hayFiltrosExtra(filtros)" type="button" class="btn btn--secundario" @click="quitarFiltros">Quitar filtros</button>
      </div>
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
          <button type="button" class="btn" :aria-disabled="store.actualizando ? 'true' : undefined" @click="!store.actualizando && polling.ejecutarAhora()">
            Reintentar
          </button>
        </div>

        <!-- Vacío (por filtros) -->
        <div v-else-if="filtrados.length === 0" class="vacio">
          <h3>{{ hayFiltrosExtra(filtros) ? 'Ningún pedido coincide con los filtros' : porDia ? 'No hay pedidos en este día' : 'Todavía no hay pedidos' }}</h3>
          <div class="vacio__acciones">
            <button v-if="hayFiltrosExtra(filtros)" type="button" class="btn btn--secundario" @click="quitarFiltros">Quitar filtros</button>
            <button v-if="porDia" type="button" class="btn btn--secundario" @click="verTodosLosDias">Ver todos los días</button>
          </div>
        </div>

        <!-- Filas -->
        <template v-else>
          <ul class="filas" aria-label="Pedidos">
            <li v-for="p in visibles" :key="p.idPedido">
              <RouterLink class="fila" :class="{ 'fila--listo': p.estado === 'listo' }" :to="enlaceAPedido(p.idPedido)" :data-id-pedido="p.idPedido">
                <span class="fila__cabecera">
                  <strong class="numero">#{{ p.idPedido }}</strong>
                  <span>Mesa {{ p.mesaNumero }}</span>
                  <span class="fila__hora numero">{{ formatearFechaHoraCorta(p.fechaHora) }}</span>
                </span>
                <span class="fila__mesero">Mesero: {{ p.nombreMesero }}</span>
                <span class="fila__pie">
                  <InsigniaEstado :tono="p.estado" :texto="ETIQUETA_ESTADO_PEDIDO[p.estado]" />
                  <span class="fila__datos">
                    {{ formatearProductos(unidadesDePedido(p)) }} ·
                    <strong class="numero" :class="{ 'fila__total--cancelado': p.estado === 'cancelado' }">{{ formatearMoneda(p.total) }}</strong>
                  </span>
                </span>
              </RouterLink>
            </li>
          </ul>
          <button v-if="hayMas" type="button" class="btn btn--secundario lista__mas" @click="mostrarMas">
            Mostrar {{ Math.min(PEDIDOS_POR_BLOQUE, filtrados.length - visibles.length) }} más
          </button>
        </template>
      </section>

      <!-- ============ Detalle ============ -->
      <section v-if="mostrarDetalle" ref="panelDetalle" class="detalle-panel" aria-label="Detalle del pedido">
        <RouterLink v-if="compacto" class="enlace-volver" :to="enlaceVolver">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
          Volver a pedidos
        </RouterLink>

        <div v-if="idPedido === null" class="vacio">
          <h3>Selecciona un pedido</h3>
          <p>Toca un pedido de la lista para ver su detalle, su cuenta y si se puede cancelar.</p>
        </div>

        <template v-else-if="seleccionado">
          <PedidoDetalle ref="detalle" :pedido="seleccionado" :cuenta-por-pagar="cuentaPorPagar" modo="gerente" />

          <!-- Cuenta del pedido (GET /api/mesas/:id/cuenta: solo existe mientras la cuenta está activa) -->
          <section class="cuenta" aria-labelledby="cuenta-titulo">
            <h3 id="cuenta-titulo">Cuenta de la mesa {{ seleccionado.mesaNumero }}</h3>
            <p v-if="!store.cuentaCargada" class="cuenta__nota">Consultando la cuenta…</p>
            <template v-else-if="store.cuentaDelPedido">
              <p class="cuenta__fila">
                <span class="numero">Cuenta #{{ store.cuentaDelPedido.idCuenta }}</span>
                <InsigniaEstado
                  :tono="store.cuentaDelPedido.estado === 'por_pagar' ? 'cuenta' : 'cuenta_abierta'"
                  :texto="ETIQUETA_ESTADO_CUENTA[store.cuentaDelPedido.estado]"
                />
              </p>
              <p class="cuenta__fila">
                <span>{{ formatearPedidos(store.cuentaDelPedido.pedidos.length) }} (los cancelados no suman)</span>
                <strong class="numero cuenta__total">{{ formatearMoneda(store.cuentaDelPedido.total) }}</strong>
              </p>
            </template>
            <p v-else class="cuenta__nota">
              La cuenta de este pedido ya no está activa (se cobró o la mesa abrió otra). La API solo consulta cuentas activas.
            </p>
          </section>
        </template>

        <div v-else-if="store.seleccionadoNoEncontrado" class="vacio" role="alert">
          <h3>El pedido #{{ idPedido }} no existe</h3>
          <RouterLink class="btn" :to="enlaceVolver">Ver todos los pedidos</RouterLink>
        </div>

        <div v-else-if="store.error" class="vacio" role="alert">
          <h3>No se pudo cargar el pedido #{{ idPedido }}</h3>
          <p>{{ store.error }}</p>
          <button type="button" class="btn" :aria-disabled="store.actualizando ? 'true' : undefined" @click="!store.actualizando && polling.ejecutarAhora()">
            Reintentar
          </button>
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

.paneles {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--espacio-4);
}

.pedidos--dos-paneles .paneles {
  flex: 1;
  grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
  min-height: 0;
}

.lista {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.pedidos--dos-paneles .lista,
.pedidos--dos-paneles .detalle-panel {
  min-height: 0;
  overflow-y: auto;
}

/* Espacio para que el anillo de foco de chips y filas no se recorte con el scroll del panel */
.pedidos--dos-paneles .lista {
  padding: var(--espacio-1);
}

/* ---------- Filtros ---------- */
.filtros {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
}

.filtros__fila {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2) var(--espacio-4);
}

.filtros__grupo {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

/* Cuatro campos en una fila con 1024 px; se acomodan en dos o una columna con menos espacio o zoom alto */
.filtros__campos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: var(--espacio-2) var(--espacio-3);
}

.campo select {
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-4);
  border: 2px solid var(--color-muted);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-weight: 400;
}

.campo input[type='search'] {
  min-height: var(--tactil-min);
}

.campo input[aria-invalid='true'] {
  border-color: var(--color-peligro);
}

.filtros__error {
  margin: 0;
  font-size: var(--texto-sm);
}

.filtros__resumen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-3);
}

.filtros__mostrando {
  margin: 0;
  color: var(--color-muted);
  font-weight: 600;
}

/* ---------- Detalle ---------- */
.detalle-panel {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

/* En dos paneles el detalle es una tarjeta */
.pedidos--dos-paneles .detalle-panel {
  padding: var(--espacio-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: var(--sombra);
}

.cuenta {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  padding-top: var(--espacio-4);
  border-top: 1px solid var(--color-border);
}

.cuenta h3 {
  margin: 0;
  font-size: var(--texto-lg);
}

.cuenta__fila {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-3);
  margin: 0;
}

.cuenta__total {
  font-size: var(--texto-lg);
}

.cuenta__nota {
  margin: 0;
  color: var(--color-muted);
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
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--espacio-1) var(--espacio-3);
}

.fila__cabecera strong {
  font-size: var(--texto-lg);
}

.fila__hora {
  margin-left: auto;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.fila__mesero {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  overflow-wrap: anywhere;
}

.fila__pie {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2);
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

.lista__mas {
  align-self: center;
}

@media (prefers-reduced-motion: reduce) {
  .fila {
    transition: none;
  }

  .fila:active {
    transform: none;
  }
}
</style>
