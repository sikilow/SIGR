<script setup lang="ts">
// Mis pedidos (/mesero/pedidos[?mesa=:mesaId]): consulta los pedidos del mesero y permite
// editar, enviar a cocina o cancelar. "Eliminar" un pedido = cancelarlo con un motivo: el
// registro se conserva (historial y cuenta), por eso no se borra de la base de datos.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DialogoModal from '../../components/DialogoModal.vue'
import type { TonoEstado } from '../../components/IconoEstado.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { usePolling } from '../../composables/usePolling'
import { ErrorServicio, servicios } from '../../services'
import { useMesasStore } from '../../stores/mesas'
import {
  ETIQUETA_ESTADO_PEDIDO,
  ETIQUETA_MOTIVO,
  type EstadoPedido,
  type MotivoCancelacion,
  type Pedido,
} from '../../types'
import { formatearHora, formatearMoneda } from '../../utils/formato'
import { esPedidoActivo, meseroPuedeCancelar, mensajeCancelacionBloqueada } from '../../utils/reglas'

const route = useRoute()
const mesasStore = useMesasStore()

type Filtro = 'activos' | 'todos'
const filtro = ref<Filtro>('activos')
const pedidos = ref<Pedido[]>([])
const cargando = ref(true)
const error = ref('')
const anuncio = ref('')

/** ?mesa=5 limita la lista a una mesa (viene de "Pedidos de la mesa"). */
const mesaFiltroId = computed<number | null>(() => {
  const valor = route.query.mesa
  return typeof valor === 'string' && /^[1-9]\d*$/.test(valor) ? Number(valor) : null
})

const numeroMesa = (mesaId: number): number => mesasStore.mesas.find((m) => m.id === mesaId)?.numero ?? mesaId

const visibles = computed(() => (filtro.value === 'activos' ? pedidos.value.filter((p) => esPedidoActivo(p.estado)) : pedidos.value))

// Tono (ícono + color) de la insignia; el texto siempre acompaña al color.
const TONO: Record<EstadoPedido, TonoEstado> = {
  registrado: 'carrito',
  enviado: 'cuenta',
  en_preparacion: 'reservada',
  listo: 'listo',
  entregado: 'libre',
  cancelado: 'agotado',
  pagado: 'libre',
}

// ---------- Carga (con actualización automática) ----------
async function cargar() {
  try {
    pedidos.value = await servicios.pedidos.listar(mesaFiltroId.value !== null ? { mesaId: mesaFiltroId.value } : {})
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar los pedidos.'
  } finally {
    cargando.value = false
  }
}

const { iniciar, ejecutarAhora } = usePolling(cargar)
onMounted(() => {
  void mesasStore.cargar() // para mostrar el número de mesa
  iniciar()
})

// ---------- Enviar a cocina ----------
const enviandoId = ref<number | null>(null)
const errorAccion = ref('')

async function enviar(pedido: Pedido) {
  errorAccion.value = ''
  enviandoId.value = pedido.id
  try {
    await servicios.pedidos.enviar(pedido.id)
    anuncio.value = `Pedido ${pedido.id} enviado a cocina.`
    await ejecutarAhora()
    void mesasStore.cargar()
  } catch (e) {
    errorAccion.value =
      e instanceof ErrorServicio && e.codigo === 'producto_agotado'
        ? 'No se pudo enviar: hay productos agotados. Edita el pedido para quitarlos.'
        : e instanceof Error
          ? e.message
          : 'No se pudo enviar el pedido.'
  } finally {
    enviandoId.value = null
  }
}

// ---------- Cancelar ----------
const MOTIVOS = Object.keys(ETIQUETA_MOTIVO) as MotivoCancelacion[]
const pedidoACancelar = ref<Pedido | null>(null)
const motivo = ref<MotivoCancelacion | null>(null)
const cancelando = ref(false)
const errorCancelar = ref('')

function abrirCancelar(pedido: Pedido) {
  pedidoACancelar.value = pedido
  motivo.value = null
  errorCancelar.value = ''
}

function cerrarCancelar() {
  if (!cancelando.value) pedidoACancelar.value = null
}

async function confirmarCancelar() {
  const pedido = pedidoACancelar.value
  if (!pedido || motivo.value === null || cancelando.value) return
  cancelando.value = true
  errorCancelar.value = ''
  try {
    await servicios.pedidos.cancelar(pedido.id, motivo.value)
    pedidoACancelar.value = null
    anuncio.value = `Pedido ${pedido.id} cancelado.`
    await ejecutarAhora()
    void mesasStore.cargar()
  } catch (e) {
    errorCancelar.value = e instanceof Error ? e.message : 'No se pudo cancelar el pedido.'
  } finally {
    cancelando.value = false
  }
}

/** Texto junto a la acción de cancelar cuando no está disponible (no aplica a cancelado/pagado). */
function avisoCancelacion(estado: EstadoPedido): string | null {
  return estado === 'cancelado' || estado === 'pagado' ? null : mensajeCancelacionBloqueada(estado)
}
</script>

<template>
  <section class="pedidos" aria-labelledby="pedidos-titulo">
    <header class="pedidos__cabecera">
      <h2 id="pedidos-titulo">
        {{ mesaFiltroId !== null ? `Pedidos de la mesa ${numeroMesa(mesaFiltroId)}` : 'Mis pedidos' }}
      </h2>
      <RouterLink v-if="mesaFiltroId !== null" class="btn btn--secundario" :to="{ name: 'mesero-pedidos' }">
        Ver todos mis pedidos
      </RouterLink>
    </header>

    <div class="pedidos__filtros" role="group" aria-label="Filtrar pedidos">
      <button type="button" class="chip" :class="{ 'chip--activo': filtro === 'activos' }" :aria-pressed="filtro === 'activos'" @click="filtro = 'activos'">
        Activos
      </button>
      <button type="button" class="chip" :class="{ 'chip--activo': filtro === 'todos' }" :aria-pressed="filtro === 'todos'" @click="filtro = 'todos'">
        Todos
      </button>
    </div>

    <p class="solo-lectores" role="status" aria-live="polite">{{ anuncio }}</p>
    <p v-if="error" class="texto-error" role="alert">{{ error }}</p>
    <p v-if="errorAccion" class="texto-error" role="alert">{{ errorAccion }}</p>

    <p v-if="cargando" class="pedidos__vacio">Cargando pedidos…</p>
    <p v-else-if="visibles.length === 0 && !error" class="pedidos__vacio">
      {{ filtro === 'activos' ? 'No tienes pedidos activos.' : 'Todavía no hay pedidos.' }}
    </p>

    <ul v-else class="pedidos__lista">
      <li v-for="pedido in visibles" :key="pedido.id" class="tarjeta pedido">
        <div class="pedido__cabecera">
          <h3>Pedido #{{ pedido.id }} · Mesa {{ numeroMesa(pedido.mesaId) }}</h3>
          <InsigniaEstado :tono="TONO[pedido.estado]" :texto="ETIQUETA_ESTADO_PEDIDO[pedido.estado]" />
        </div>
        <p class="pedido__meta">Registrado a las {{ formatearHora(pedido.creadoEn) }}</p>

        <ul class="pedido__lineas">
          <li v-for="linea in pedido.detalle" :key="linea.productoId">
            <span>
              {{ linea.cantidad }} × {{ linea.nombreProducto }}
              <small v-if="linea.observaciones" class="pedido__obs">({{ linea.observaciones }})</small>
            </span>
            <span class="numero">{{ formatearMoneda(linea.cantidad * linea.precioUnitario) }}</span>
          </li>
        </ul>

        <p class="pedido__total">
          Total <strong class="numero">{{ formatearMoneda(pedido.total) }}</strong>
        </p>
        <p v-if="pedido.motivoCancelacion" class="pedido__meta">Motivo: {{ ETIQUETA_MOTIVO[pedido.motivoCancelacion] }}</p>

        <div class="pedido__acciones">
          <template v-if="pedido.estado === 'registrado'">
            <RouterLink
              class="btn btn--secundario"
              :to="{ name: 'mesero-pedido-mesa', params: { mesaId: pedido.mesaId }, query: { editar: pedido.id } }"
            >
              Editar
            </RouterLink>
            <button type="button" class="btn" :disabled="enviandoId === pedido.id" @click="enviar(pedido)">
              {{ enviandoId === pedido.id ? 'Enviando…' : 'Enviar a cocina' }}
            </button>
          </template>
          <button v-if="meseroPuedeCancelar(pedido.estado)" type="button" class="btn btn--peligro" @click="abrirCancelar(pedido)">
            Cancelar pedido
          </button>
          <p v-else-if="avisoCancelacion(pedido.estado)" class="pedido__meta">{{ avisoCancelacion(pedido.estado) }}</p>
        </div>
      </li>
    </ul>

    <DialogoModal :abierto="pedidoACancelar !== null" etiqueta-id="cancelar-titulo" :cerrable="!cancelando" @cerrar="cerrarCancelar">
      <form v-if="pedidoACancelar" class="cancelar" @submit.prevent="confirmarCancelar">
        <h2 id="cancelar-titulo">¿Cancelar el pedido #{{ pedidoACancelar.id }}?</h2>
        <p class="pedido__meta">El pedido no se borra: queda registrado como cancelado y deja de sumar a la cuenta.</p>

        <fieldset class="cancelar__motivos">
          <legend>Motivo de la cancelación</legend>
          <label v-for="opcion in MOTIVOS" :key="opcion" class="cancelar__opcion">
            <input v-model="motivo" type="radio" name="motivo" :value="opcion" />
            {{ ETIQUETA_MOTIVO[opcion] }}
          </label>
        </fieldset>

        <p v-if="errorCancelar" class="texto-error" role="alert">{{ errorCancelar }}</p>

        <div class="cancelar__acciones">
          <button type="button" class="btn btn--secundario" :disabled="cancelando" @click="cerrarCancelar">Volver</button>
          <button type="submit" class="btn btn--peligro" :disabled="motivo === null || cancelando">
            {{ cancelando ? 'Cancelando…' : 'Cancelar pedido' }}
          </button>
        </div>
      </form>
    </DialogoModal>
  </section>
</template>

<style scoped>
.pedidos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.pedidos__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--espacio-3);
}

.pedidos__filtros {
  display: flex;
  gap: var(--espacio-2);
}

.pedidos__vacio {
  margin: 0;
  color: var(--color-muted);
}

.pedidos__lista {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--espacio-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pedido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  padding: var(--espacio-5);
}

.pedido__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.pedido__cabecera h3 {
  font-size: var(--texto-lg);
}

.pedido__meta {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.pedido__lineas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pedido__lineas li {
  display: flex;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.pedido__obs {
  color: var(--color-muted);
}

.pedido__total {
  display: flex;
  justify-content: space-between;
  margin: 0;
  padding-top: var(--espacio-2);
  border-top: 1px solid var(--color-border);
}

.pedido__acciones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-3);
}

.cancelar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.cancelar__motivos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  border: none;
}

.cancelar__motivos legend {
  margin-bottom: var(--espacio-2);
  font-weight: 700;
}

.cancelar__opcion {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio-sm);
  cursor: pointer;
}

.cancelar__opcion input {
  width: 22px;
  height: 22px;
  accent-color: var(--color-primary-dark);
}

.cancelar__acciones {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--espacio-3);
}
</style>
