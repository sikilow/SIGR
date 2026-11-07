<script setup lang="ts">
// Reservaciones: lista de un día (hoy por defecto) con filtros por estado y búsqueda por nombre o teléfono. Tocar una
// reservación abre sus acciones (confirmar, registrar llegada, editar, cancelar); «Nueva reservación» abre el
// formulario. Solo usa el store de reservaciones (que usa services/index.ts): no sabe si los datos vienen del mock o
// de la API.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import DialogoReservacion from '../../components/hostess/DialogoReservacion.vue'
import FiltrosReservaciones from '../../components/hostess/FiltrosReservaciones.vue'
import ReservacionCard from '../../components/hostess/ReservacionCard.vue'
import SelectorDia from '../../components/hostess/SelectorDia.vue'
import { usePolling } from '../../composables/usePolling'
import { filtroReservacionesDesdeConsulta, useReservacionesStore } from '../../stores/reservaciones'
import type { Reservacion } from '../../types'
import { aDiaISO, combinarFechaHora, type FiltroReservaciones } from '../../utils/reservaciones'

const store = useReservacionesStore()
const route = useRoute()
const router = useRouter()

// ---------- Filtro sincronizado con la URL (?estado=...) ----------
watch(
  () => route.query.estado,
  (valor) => {
    store.filtro = filtroReservacionesDesdeConsulta(valor)
  },
  { immediate: true },
)

function cambiarFiltro(filtro: FiltroReservaciones) {
  const consulta = { ...route.query }
  if (filtro === 'todas') delete consulta.estado
  else consulta.estado = filtro
  void router.replace({ query: consulta })
}

const MENSAJE_VACIO: Record<FiltroReservaciones, string> = {
  todas: 'No hay reservaciones este día',
  pendiente: 'No hay reservaciones pendientes',
  confirmada: 'No hay reservaciones confirmadas',
  llego: 'Todavía no llega ninguna reservación',
  cancelada: 'No hay reservaciones canceladas',
  vencida: 'No hay reservaciones vencidas',
}

// ---------- Actualización automática ----------
const { iniciar, ejecutarAhora } = usePolling(() => store.cargar())

// ---------- Día ----------
const hoy = computed(() => aDiaISO(new Date()))
const tituloDia = computed(() => {
  const fecha = combinarFechaHora(store.dia, '12:00')
  if (!fecha) return ''
  const texto = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  return store.dia === hoy.value ? `Hoy · ${texto}` : texto
})

// ---------- Búsqueda ----------
const hayBusqueda = computed(() => store.busqueda.trim() !== '')

/** Texto para la región aria-live: cuántas reservaciones se ven tras filtrar o buscar. */
const anuncioLista = computed(() => {
  if (store.cargando) return ''
  const n = store.visibles.length
  return `${n} ${n === 1 ? 'reservación' : 'reservaciones'}`
})

// Título de la pantalla: recibe el foco cuando la tarjeta que abrió el diálogo ya no existe (p. ej. el filtro la oculta).
const titulo = ref<HTMLElement | null>(null)

// ---------- Diálogo de una reservación ----------
const dialogo = ref<{ modo: 'acciones' | 'nueva'; id: number | null } | null>(null)
// Se deriva de la lista viva: si la reservación cambia mientras el diálogo está abierto, se actualiza.
const reservacionAbierta = computed<Reservacion | null>(() =>
  dialogo.value?.id != null ? (store.reservaciones.find((r) => r.idReservacion === dialogo.value!.id) ?? null) : null,
)
/** Memoria de la última reservación abierta: el diálogo no se vacía a mitad de una acción si la lista cambia de día. */
const ultimaAbierta = ref<Reservacion | null>(null)
watch(reservacionAbierta, (r) => {
  if (r) ultimaAbierta.value = r
})

function abrir(r: Reservacion) {
  ultimaAbierta.value = r
  dialogo.value = { modo: 'acciones', id: r.idReservacion }
}

function nueva() {
  ultimaAbierta.value = null
  dialogo.value = { modo: 'nueva', id: null }
}

// Reservación recién creada o editada: se resalta un momento.
const resaltada = ref<number | null>(null)
let temporizadorResaltado: ReturnType<typeof setTimeout> | undefined

/** Tras guardar, la lista va al día de la reservación (si es otro) y la resalta. */
async function alGuardar(r: Reservacion) {
  const dia = aDiaISO(r.fechaHora)
  if (dia !== store.dia) await store.cambiarDia(dia)
  resaltada.value = r.idReservacion
  clearTimeout(temporizadorResaltado)
  temporizadorResaltado = setTimeout(() => (resaltada.value = null), 6000)
  await nextTick()
}

onMounted(iniciar)
onBeforeUnmount(() => {
  // Al salir se borra la búsqueda: al volver no debe haber un texto olvidado ocultando reservaciones.
  store.busqueda = ''
  clearTimeout(temporizadorResaltado)
})
</script>

<template>
  <section class="pantalla" :aria-busy="store.cargando">
    <header class="pantalla__encabezado">
      <h2 ref="titulo" tabindex="-1">Reservaciones</h2>
      <IndicadorActualizacion :ultima="store.ultimaActualizacion" :actualizando="store.actualizando" @actualizar="ejecutarAhora()" />
    </header>

    <div class="barra-herramientas">
      <SelectorDia :model-value="store.dia" @update:model-value="store.cambiarDia($event)" />
      <button type="button" class="btn barra-herramientas__nueva" aria-haspopup="dialog" @click="nueva">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Nueva reservación
      </button>
    </div>

    <p class="pantalla__dia">{{ tituloDia }}</p>

    <div v-if="store.contadores.vencida > 0" class="aviso" role="status">
      <p>Hay {{ store.contadores.vencida }} reservación(es) vencida(s); se liberó su mesa cuando tenía una asignada.</p>
      <button type="button" class="btn btn--secundario" @click="cambiarFiltro('vencida')">Ver vencidas</button>
    </div>

    <!-- Error con datos previos: se conservan las reservaciones y se ofrece reintentar -->
    <div v-if="store.error && store.reservaciones.length > 0" class="aviso aviso--error" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>No se pudo actualizar. Se muestran los últimos datos recibidos. {{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>

    <template v-if="store.reservaciones.length > 0 || hayBusqueda || store.filtro !== 'todas'">
      <label class="campo busqueda" for="buscar-reservacion">
        Buscar por nombre o teléfono
        <input
          id="buscar-reservacion"
          v-model="store.busqueda"
          type="search"
          inputmode="search"
          autocomplete="off"
          enterkeyhint="search"
          @keydown.enter.prevent
        />
      </label>
      <FiltrosReservaciones :model-value="store.filtro" :contadores="store.contadores" @update:model-value="cambiarFiltro" />
    </template>

    <!-- Región en vivo única: cuántas reservaciones hay tras filtrar o buscar -->
    <p class="solo-lectores" role="status" aria-live="polite">{{ anuncioLista }}</p>

    <!-- Carga inicial: esqueleto con la forma de las tarjetas -->
    <div v-if="store.cargando" class="lista" aria-hidden="true">
      <div v-for="n in 4" :key="n" class="esqueleto" />
    </div>
    <p v-if="store.cargando" class="solo-lectores" role="status">Cargando reservaciones…</p>

    <!-- Error sin datos previos -->
    <div v-else-if="store.error && store.reservaciones.length === 0" class="vacio" role="alert">
      <h3>No se pudieron cargar las reservaciones</h3>
      <p>{{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>

    <!-- Vacío (día sin reservaciones, filtro o búsqueda sin resultados) -->
    <div v-else-if="store.visibles.length === 0" class="vacio">
      <h3>{{ hayBusqueda ? `Ninguna reservación coincide con «${store.busqueda.trim()}»` : MENSAJE_VACIO[store.filtro] }}</h3>
      <div class="fila-botones vacio__acciones">
        <button v-if="hayBusqueda" type="button" class="btn btn--secundario" @click="store.busqueda = ''">Borrar la búsqueda</button>
        <button v-if="store.filtro !== 'todas'" type="button" class="btn btn--secundario" @click="cambiarFiltro('todas')">Ver todas</button>
        <button v-if="!hayBusqueda && store.filtro === 'todas'" type="button" class="btn" @click="nueva">Nueva reservación</button>
      </div>
    </div>

    <!-- Lista del día -->
    <ul v-else class="lista" aria-label="Reservaciones del día">
      <li v-for="r in store.visibles" :key="r.idReservacion">
        <ReservacionCard :reservacion="r" :resaltada="resaltada === r.idReservacion" @seleccionar="abrir" />
      </li>
    </ul>

    <DialogoReservacion
      :abierto="dialogo !== null"
      :reservacion="reservacionAbierta ?? (dialogo?.id != null ? ultimaAbierta : null)"
      :modo="dialogo?.modo ?? 'acciones'"
      :dia-inicial="store.dia"
      :foco-alternativo="titulo"
      @cerrar="dialogo = null"
      @guardada="alGuardar"
    />
  </section>
</template>

<style scoped>
.pantalla {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  max-width: 64rem;
}

.pantalla__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.barra-herramientas {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.pantalla__dia {
  margin: 0;
  font-size: var(--texto-lg);
  font-weight: 700;
}

/* Solo la primera letra en mayúscula: «Hoy · Viernes, 16 de octubre» */
.pantalla__dia::first-letter {
  text-transform: uppercase;
}

.busqueda {
  max-width: 28rem;
}

.lista {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.esqueleto {
  min-height: 72px;
}

.vacio__acciones {
  justify-content: center;
}
</style>
