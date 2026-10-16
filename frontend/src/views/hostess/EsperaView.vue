<script setup lang="ts">
// Lista de espera: grupos ordenados por llegada (el que lleva más tiempo, arriba), con contadores, filtro por estado y
// búsqueda por nombre o teléfono. Tocar un grupo abre sus acciones (asignar mesa o quitar de la lista); «Agregar a la
// lista» abre el formulario. Solo usa el store de espera (que usa services/index.ts): no sabe si los datos vienen del
// mock o de la API.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import DialogoEspera from '../../components/hostess/DialogoEspera.vue'
import EsperaCard from '../../components/hostess/EsperaCard.vue'
import FiltrosEspera from '../../components/hostess/FiltrosEspera.vue'
import ResumenEspera from '../../components/hostess/ResumenEspera.vue'
import { usePolling } from '../../composables/usePolling'
import { filtroEsperaDesdeConsulta, useEsperaStore } from '../../stores/espera'
import type { ListaEspera } from '../../types'
import type { FiltroEspera } from '../../utils/espera'

const store = useEsperaStore()
const route = useRoute()
const router = useRouter()

// ---------- Filtro sincronizado con la URL (?estado=...) ----------
watch(
  () => route.query.estado,
  (valor) => {
    store.filtro = filtroEsperaDesdeConsulta(valor)
  },
  { immediate: true },
)

function cambiarFiltro(filtro: FiltroEspera) {
  const consulta = { ...route.query }
  // «Esperando» es el filtro por defecto: no hace falta ponerlo en la URL.
  if (filtro === 'esperando') delete consulta.estado
  else consulta.estado = filtro
  void router.replace({ query: consulta })
}

const MENSAJE_VACIO: Record<FiltroEspera, string> = {
  todas: 'No hay grupos en la lista hoy',
  esperando: 'Nadie está esperando mesa',
  asignada: 'Todavía no se ha sentado a nadie de la lista',
  cancelada: 'Nadie se ha ido de la lista',
}

// ---------- Actualización automática ----------
const { iniciar, ejecutarAhora } = usePolling(() => store.cargar())

// Reloj que hace avanzar «hace 25 min» sin pedir nada al servidor.
let reloj: ReturnType<typeof setInterval> | undefined

// ---------- Búsqueda ----------
const hayBusqueda = computed(() => store.busqueda.trim() !== '')

/** Texto para la región aria-live: cuántos grupos se ven tras filtrar o buscar. */
const anuncioLista = computed(() => {
  if (store.cargando) return ''
  const n = store.visibles.length
  return `${n} ${n === 1 ? 'grupo' : 'grupos'}`
})

// Título de la pantalla: recibe el foco cuando la tarjeta que abrió el diálogo ya no existe (p. ej. el grupo se asignó).
const titulo = ref<HTMLElement | null>(null)

// ---------- Diálogo de un grupo ----------
const dialogo = ref<{ modo: 'acciones' | 'nueva'; id: number | null } | null>(null)
// Se deriva de la lista viva: si el grupo cambia mientras el diálogo está abierto, se actualiza.
const grupoAbierto = computed<ListaEspera | null>(() =>
  dialogo.value?.id != null ? (store.grupos.find((e) => e.idEspera === dialogo.value!.id) ?? null) : null,
)
/** Memoria del último grupo abierto: el diálogo no se vacía a mitad de una acción si la lista cambia. */
const ultimoAbierto = ref<ListaEspera | null>(null)
watch(grupoAbierto, (e) => {
  if (e) ultimoAbierto.value = e
})

function abrir(e: ListaEspera) {
  ultimoAbierto.value = e
  dialogo.value = { modo: 'acciones', id: e.idEspera }
}

function nueva() {
  ultimoAbierto.value = null
  dialogo.value = { modo: 'nueva', id: null }
}

// Grupo recién agregado: se resalta un momento.
const resaltada = ref<number | null>(null)
let temporizadorResaltado: ReturnType<typeof setTimeout> | undefined

/** Tras agregar, la lista pasa a «Esperando» (donde queda el grupo nuevo) y lo resalta. */
function alGuardar(e: ListaEspera) {
  if (store.filtro !== 'esperando' && store.filtro !== 'todas') cambiarFiltro('esperando')
  store.busqueda = ''
  resaltada.value = e.idEspera
  clearTimeout(temporizadorResaltado)
  temporizadorResaltado = setTimeout(() => (resaltada.value = null), 6000)
}

onMounted(() => {
  reloj = setInterval(() => store.tictac(), 30_000)
  iniciar()
})

onBeforeUnmount(() => {
  // Al salir se borra la búsqueda: al volver no debe haber un texto olvidado ocultando grupos.
  store.busqueda = ''
  clearInterval(reloj)
  clearTimeout(temporizadorResaltado)
})
</script>

<template>
  <section class="pantalla" :aria-busy="store.cargando">
    <header class="pantalla__encabezado">
      <h2 ref="titulo" tabindex="-1">Lista de espera</h2>
      <IndicadorActualizacion :ultima="store.ultimaActualizacion" :actualizando="store.actualizando" @actualizar="ejecutarAhora()" />
    </header>

    <div class="barra-herramientas">
      <ResumenEspera class="barra-herramientas__resumen" :resumen="store.resumen" />
      <button type="button" class="btn barra-herramientas__nueva" aria-haspopup="dialog" @click="nueva">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Agregar a la lista
      </button>
    </div>

    <!-- Error con datos previos: se conservan los grupos y se ofrece reintentar -->
    <div v-if="store.error && store.grupos.length > 0" class="aviso aviso--error" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>No se pudo actualizar. Se muestran los últimos datos recibidos. {{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>

    <template v-if="store.grupos.length > 0 || hayBusqueda">
      <label class="campo busqueda" for="buscar-espera">
        Buscar por nombre o teléfono
        <input
          id="buscar-espera"
          v-model="store.busqueda"
          type="search"
          inputmode="search"
          autocomplete="off"
          enterkeyhint="search"
          @keydown.enter.prevent
        />
      </label>
      <FiltrosEspera :model-value="store.filtro" :contadores="store.contadores" @update:model-value="cambiarFiltro" />
    </template>

    <!-- Región en vivo única: cuántos grupos hay tras filtrar o buscar -->
    <p class="solo-lectores" role="status" aria-live="polite">{{ anuncioLista }}</p>

    <!-- Carga inicial: esqueleto con la forma de las tarjetas -->
    <div v-if="store.cargando" class="lista" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="esqueleto" />
    </div>
    <p v-if="store.cargando" class="solo-lectores" role="status">Cargando la lista de espera…</p>

    <!-- Error sin datos previos -->
    <div v-else-if="store.error && store.grupos.length === 0" class="vacio" role="alert">
      <h3>No se pudo cargar la lista de espera</h3>
      <p>{{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>

    <!-- Vacío (nadie espera, filtro o búsqueda sin resultados) -->
    <div v-else-if="store.visibles.length === 0" class="vacio">
      <h3>{{ hayBusqueda ? `Ningún grupo coincide con «${store.busqueda.trim()}»` : MENSAJE_VACIO[store.filtro] }}</h3>
      <div class="fila-botones vacio__acciones">
        <button v-if="hayBusqueda" type="button" class="btn btn--secundario" @click="store.busqueda = ''">Borrar la búsqueda</button>
        <button v-if="store.filtro !== 'todas'" type="button" class="btn btn--secundario" @click="cambiarFiltro('todas')">Ver todos</button>
        <button v-if="!hayBusqueda && store.filtro === 'esperando'" type="button" class="btn" @click="nueva">Agregar a la lista</button>
      </div>
    </div>

    <!-- Lista, del que lleva más tiempo al más reciente -->
    <ul v-else class="lista" aria-label="Grupos de la lista de espera">
      <li v-for="e in store.visibles" :key="e.idEspera">
        <EsperaCard :espera="e" :ahora="store.ahora" :resaltada="resaltada === e.idEspera" @seleccionar="abrir" />
      </li>
    </ul>

    <DialogoEspera
      :abierto="dialogo !== null"
      :espera="grupoAbierto ?? (dialogo?.id != null ? ultimoAbierto : null)"
      :modo="dialogo?.modo ?? 'acciones'"
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

.barra-herramientas__resumen {
  flex: 1 1 28rem;
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
