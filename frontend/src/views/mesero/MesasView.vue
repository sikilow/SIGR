<script setup lang="ts">
// Panel de mesas: pantalla de inicio del mesero. Solo usa el store de mesas
// (que a su vez usa services/index.ts); no sabe si los datos vienen del mock o de la API.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FiltroSeccion from '../../components/FiltroSeccion.vue'
import FiltrosMesas from '../../components/FiltrosMesas.vue'
import GruposMesas from '../../components/GruposMesas.vue'
import HojaAccionesMesa from '../../components/HojaAccionesMesa.vue'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import MesaCard from '../../components/MesaCard.vue'
import ResumenMesas from '../../components/ResumenMesas.vue'
import { usePolling } from '../../composables/usePolling'
import { filtroDesdeConsulta, useMesasStore, type FiltroMesas } from '../../stores/mesas'
import type { Mesa } from '../../types'
import { TODAS_LAS_SECCIONES, describirFiltroMesas, seccionDesdeConsulta, sufijoSeccion } from '../../utils/secciones'

const store = useMesasStore()
const route = useRoute()
const router = useRouter()

// ---------- Filtro sincronizado con la URL (?estado=...) ----------
watch(
  () => route.query.estado,
  (valor) => {
    store.filtro = filtroDesdeConsulta(valor)
  },
  { immediate: true },
)

// ---------- Filtro de sección sincronizado con la URL (?seccion=..., RF-MES-007) ----------
watch(
  () => route.query.seccion,
  (valor) => {
    store.seccion = seccionDesdeConsulta(valor)
  },
  { immediate: true },
)

/** Cambia la URL (sin agregar historial) y anuncia el resultado a los lectores de pantalla. */
async function aplicarConsulta(cambios: { estado?: FiltroMesas; seccion?: string }) {
  const consulta = { ...route.query }
  if (cambios.estado !== undefined) {
    if (cambios.estado === 'todas') delete consulta.estado
    else consulta.estado = cambios.estado
  }
  if (cambios.seccion !== undefined) {
    if (cambios.seccion === TODAS_LAS_SECCIONES) delete consulta.seccion
    else consulta.seccion = cambios.seccion
  }
  await router.replace({ query: consulta })
  await nextTick()
  anuncioFiltro.value = describirFiltroMesas(store.mesasFiltradas.length, ANUNCIO_ESTADO[store.filtro], store.seccionActiva)
}

function cambiarFiltro(filtro: FiltroMesas) {
  void aplicarConsulta({ estado: filtro })
}

function cambiarSeccion(seccion: string) {
  void aplicarConsulta({ seccion })
}

function verTodas() {
  void aplicarConsulta({ estado: 'todas', seccion: TODAS_LAS_SECCIONES })
}

/** Región aria-live: se llena solo cuando el mesero cambia un filtro (no con la actualización automática). */
const anuncioFiltro = ref('')

const ANUNCIO_ESTADO: Record<FiltroMesas, string | null> = {
  todas: null,
  libre: 'libres',
  ocupada: 'ocupadas',
  reservada: 'reservadas',
  listo: 'con pedido listo',
}

const MENSAJE_VACIO: Record<FiltroMesas, string> = {
  todas: 'No hay mesas registradas',
  libre: 'No hay mesas libres',
  ocupada: 'No hay mesas ocupadas',
  reservada: 'No hay mesas reservadas',
  listo: 'No hay pedidos listos por servir',
}

const hayFiltros = computed(() => store.filtro !== 'todas' || store.seccionActiva !== TODAS_LAS_SECCIONES)

// ---------- Actualización automática ----------
const { iniciar, ejecutarAhora } = usePolling(() => store.cargar())

// ---------- Resaltado de mesas que pasan a "pedido listo" ----------
const resaltadas = ref<number[]>([])
let temporizadorResaltado: ReturnType<typeof setTimeout> | undefined

watch(
  () => store.nuevasListas,
  (ids) => {
    if (ids.length === 0) return
    resaltadas.value = [...ids]
    clearTimeout(temporizadorResaltado)
    temporizadorResaltado = setTimeout(() => (resaltadas.value = []), 6000)
  },
)

// ---------- Hoja de acciones ----------
const mesaSeleccionadaId = ref<number | null>(null)
// Se deriva de las mesas vivas: si la mesa cambia mientras la hoja está abierta, se actualiza.
const mesaSeleccionada = computed<Mesa | null>(
  () => store.mesas.find((m) => m.idMesa === mesaSeleccionadaId.value) ?? null,
)

onMounted(iniciar)

onBeforeUnmount(() => {
  store.descartarAviso()
  clearTimeout(temporizadorResaltado)
})
</script>

<template>
  <section class="panel" :aria-busy="store.cargando">
    <header class="panel__encabezado">
      <h2>Panel de mesas</h2>
      <IndicadorActualizacion :ultima="store.ultimaActualizacion" :actualizando="store.actualizando" @actualizar="ejecutarAhora()" />
    </header>

    <!-- Aviso de otra pantalla (p. ej. "La mesa 7 no está ocupada"). Lo anuncia el layout (aria-live). -->
    <div v-if="store.aviso" class="aviso aviso--info">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8v.01" />
      </svg>
      <p>{{ store.aviso }}</p>
      <button type="button" class="btn btn--secundario" @click="store.descartarAviso()">Entendido</button>
    </div>

    <!-- Región en vivo única: anuncia las mesas que pasan a "pedido listo" -->
    <p class="solo-lectores" role="status" aria-live="polite">{{ store.anuncio }}</p>

    <!-- Error con datos previos: se conservan las mesas y se ofrece reintentar -->
    <div v-if="store.error && store.mesas.length > 0" class="aviso aviso--error" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>No se pudo actualizar. Se muestran los últimos datos recibidos. {{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>

    <template v-if="store.mesas.length > 0">
      <ResumenMesas
        :libres="store.contadores.libre"
        :ocupadas="store.contadores.ocupada"
        :reservadas="store.contadores.reservada"
        :pedidos-listos="store.contadores.pedidosListos"
      />
      <div class="panel__filtros">
        <FiltrosMesas :model-value="store.filtro" @update:model-value="cambiarFiltro" />
        <FiltroSeccion
          v-if="store.variasSecciones"
          id-campo="panel-seccion"
          :model-value="store.seccionActiva"
          :secciones="store.secciones"
          @update:model-value="cambiarSeccion"
        />
      </div>
    </template>

    <!-- Resultado de cambiar un filtro (estado o sección), sin mover el foco -->
    <p class="solo-lectores" role="status" aria-live="polite">{{ anuncioFiltro }}</p>

    <!-- Carga inicial: esqueleto con la forma de las tarjetas -->
    <div v-if="store.cargando" class="cuadricula" aria-hidden="true">
      <div v-for="n in 8" :key="n" class="esqueleto" />
    </div>
    <p v-if="store.cargando" class="solo-lectores">Cargando mesas…</p>

    <!-- Error sin datos previos -->
    <div v-else-if="store.error && store.mesas.length === 0" class="vacio" role="alert">
      <h3>No se pudieron cargar las mesas</h3>
      <p>{{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>

    <!-- Vacío (por filtro) -->
    <div v-else-if="store.mesasFiltradas.length === 0" class="vacio">
      <h3>{{ MENSAJE_VACIO[store.filtro] }}{{ sufijoSeccion(store.seccionActiva) }}</h3>
      <button v-if="hayFiltros" type="button" class="btn btn--secundario" @click="verTodas">
        Ver todas las mesas
      </button>
    </div>

    <!-- Cuadrícula de mesas: agrupada por sección si hay más de una (si no, una sola cuadrícula, como antes) -->
    <GruposMesas v-else :grupos="store.grupos" :agrupar="store.variasSecciones" id-base="panel-grupo" ancho-minimo="200px">
      <template #mesa="{ mesa }">
        <MesaCard
          :mesa="mesa"
          :resaltada="resaltadas.includes(mesa.idMesa)"
          :mostrar-seccion="store.variasSecciones"
          @seleccionar="mesaSeleccionadaId = $event.idMesa"
        />
      </template>
    </GruposMesas>

    <HojaAccionesMesa :mesa="mesaSeleccionada" @cerrar="mesaSeleccionadaId = null" />
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.panel__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
}

/* Chips de estado y select de sección en una fila; con poco ancho (tablet vertical, zoom) el select baja */
.panel__filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3) var(--espacio-4);
}

/* Esqueleto de la carga inicial (la cuadrícula real está en GruposMesas) */
.cuadricula {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
  gap: var(--espacio-4);
}

/* Las tarjetas de mesa son más altas que el esqueleto base */
.esqueleto {
  min-height: 150px;
}
</style>
