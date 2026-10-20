<script setup lang="ts">
// Salón: primera pantalla de la hostess. Muestra el estado de las mesas y, a un lado (tablet horizontal) o debajo
// (tablet vertical), las próximas reservaciones y la lista de espera. Solo lectura, salvo «Asignar mesa».
// La hostess NO ve pedidos ni cuentas. Solo usa el store del salón (que usa services/index.ts): no sabe si los
// datos vienen del mock o de la API.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import FiltrosSalon from '../../components/hostess/FiltrosSalon.vue'
import HojaAccionesSalon from '../../components/hostess/HojaAccionesSalon.vue'
import MesaSalonCard from '../../components/hostess/MesaSalonCard.vue'
import PanelEspera from '../../components/hostess/PanelEspera.vue'
import PanelReservaciones from '../../components/hostess/PanelReservaciones.vue'
import ResumenSalon from '../../components/hostess/ResumenSalon.vue'
import { usePolling } from '../../composables/usePolling'
import { filtroSalonDesdeConsulta, useSalonStore, type FiltroSalon } from '../../stores/salon'
import type { MesaSalon, Reservacion } from '../../types'

const store = useSalonStore()
const route = useRoute()
const router = useRouter()

// ---------- Filtro sincronizado con la URL (?estado=...) ----------
watch(
  () => route.query.estado,
  (valor) => {
    store.filtro = filtroSalonDesdeConsulta(valor)
  },
  { immediate: true },
)

function cambiarFiltro(filtro: FiltroSalon) {
  const consulta = { ...route.query }
  if (filtro === 'todas') delete consulta.estado
  else consulta.estado = filtro
  void router.replace({ query: consulta })
}

const MENSAJE_VACIO: Record<FiltroSalon, string> = {
  todas: 'No hay mesas registradas',
  libre: 'No hay mesas libres',
  ocupada: 'No hay mesas ocupadas',
  reservada: 'No hay mesas reservadas',
}

// ---------- Actualización automática ----------
const { iniciar, ejecutarAhora } = usePolling(() => store.cargar())

// Reloj que hace avanzar el «tiempo de espera» sin pedir nada al servidor.
const ahora = ref(Date.now())
let reloj: ReturnType<typeof setInterval> | undefined

// Título de la pantalla: recibe el foco cuando la tarjeta que abrió la hoja ya no existe (p. ej. el filtro la oculta).
const titulo = ref<HTMLElement | null>(null)

// ---------- Hoja de acciones ----------
const mesaSeleccionadaId = ref<number | null>(null)
// Se deriva de las mesas vivas: si la mesa cambia mientras la hoja está abierta, se actualiza.
const mesaSeleccionada = computed<MesaSalon | null>(
  () => store.mesas.find((m) => m.idMesa === mesaSeleccionadaId.value) ?? null,
)

/** Reservación vigente de cada mesa reservada (la más próxima), para mostrarla en la tarjeta. */
const reservacionPorMesa = computed(() => {
  const mapa = new Map<number, Reservacion>()
  for (const r of store.proximasReservaciones) {
    if (r.idMesa !== null && !mapa.has(r.idMesa)) mapa.set(r.idMesa, r)
  }
  return mapa
})

// Mesa a la que se le acaba de asignar un grupo: se resalta un momento. Se detecta por el cambio de estado.
const resaltadas = ref<number[]>([])
let temporizadorResaltado: ReturnType<typeof setTimeout> | undefined
watch(
  () => store.mesas,
  (nuevas, anteriores) => {
    if (anteriores.length === 0) return
    const antes = new Map(anteriores.map((m) => [m.idMesa, m.estado]))
    const cambiadas = nuevas.filter((m) => antes.has(m.idMesa) && antes.get(m.idMesa) !== m.estado).map((m) => m.idMesa)
    if (cambiadas.length === 0) return
    resaltadas.value = cambiadas
    clearTimeout(temporizadorResaltado)
    temporizadorResaltado = setTimeout(() => (resaltadas.value = []), 6000)
  },
)

onMounted(() => {
  reloj = setInterval(() => (ahora.value = Date.now()), 30_000)
  iniciar()
})

onBeforeUnmount(() => {
  clearInterval(reloj)
  clearTimeout(temporizadorResaltado)
})
</script>

<template>
  <section class="salon" :aria-busy="store.cargando">
    <div class="salon__mesas">
      <header class="salon__encabezado">
        <h2 ref="titulo" tabindex="-1">Salón</h2>
        <IndicadorActualizacion :ultima="store.ultimaActualizacion" :actualizando="store.actualizando" @actualizar="ejecutarAhora()" />
      </header>

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
        <ResumenSalon
          :libres="store.contadores.libre"
          :ocupadas="store.contadores.ocupada"
          :reservadas="store.contadores.reservada"
        />
        <FiltrosSalon :model-value="store.filtro" @update:model-value="cambiarFiltro" />
      </template>

      <!-- Carga inicial: esqueleto con la forma de las tarjetas -->
      <div v-if="store.cargando" class="cuadricula" aria-hidden="true">
        <div v-for="n in 8" :key="n" class="esqueleto" />
      </div>
      <p v-if="store.cargando" class="solo-lectores" role="status">Cargando mesas…</p>

      <!-- Error sin datos previos -->
      <div v-else-if="store.error && store.mesas.length === 0" class="vacio" role="alert">
        <h3>No se pudieron cargar las mesas</h3>
        <p>{{ store.error }}</p>
        <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
      </div>

      <!-- Vacío (por filtro) -->
      <div v-else-if="store.mesasFiltradas.length === 0" class="vacio">
        <h3>{{ MENSAJE_VACIO[store.filtro] }}</h3>
        <button v-if="store.filtro !== 'todas'" type="button" class="btn btn--secundario" @click="cambiarFiltro('todas')">
          Ver todas las mesas
        </button>
      </div>

      <!-- Cuadrícula de mesas -->
      <ul v-else class="cuadricula" aria-label="Mesas">
        <li v-for="mesa in store.mesasFiltradas" :key="mesa.idMesa">
          <MesaSalonCard
            :mesa="mesa"
            :reservacion="reservacionPorMesa.get(mesa.idMesa) ?? null"
            :resaltada="resaltadas.includes(mesa.idMesa)"
            @seleccionar="mesaSeleccionadaId = $event.idMesa"
          />
        </li>
      </ul>
    </div>

    <!-- Panel lateral (tablet horizontal) o inferior (tablet vertical): un solo bloque, lo reubica el CSS -->
    <aside class="salon__lateral" aria-label="Reservaciones y lista de espera">
      <div v-if="store.errorLateral" class="aviso aviso--error" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <p>{{ store.errorLateral }}</p>
      </div>
      <PanelReservaciones :reservaciones="store.proximasReservaciones" :error="!!store.errorLateral" />
      <PanelEspera :espera="store.enEspera" :ahora="ahora" :error="!!store.errorLateral" />
    </aside>

    <HojaAccionesSalon
      :mesa="mesaSeleccionada"
      :reservaciones="store.reservaciones"
      :espera="store.espera"
      :ahora="ahora"
      :foco-alternativo="titulo"
      @cerrar="mesaSeleccionadaId = null"
    />
  </section>
</template>

<style scoped>
.salon {
  display: grid;
  /* minmax(0, 1fr): ningún hijo ensancha la página (sin scroll horizontal) */
  grid-template-columns: minmax(0, 1fr) 20rem;
  align-items: start;
  gap: var(--espacio-6);
}

.salon__mesas,
.salon__lateral {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  min-width: 0;
}

.salon__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.cuadricula {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: var(--espacio-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Las tarjetas de una misma fila igualan su altura */
.cuadricula > li {
  display: flex;
}

.esqueleto {
  min-height: 132px;
}

/* Tablet vertical (o poca altura): el panel pasa debajo de las mesas, en dos columnas si caben */
@media (max-width: 53.75em) {
  .salon {
    grid-template-columns: minmax(0, 1fr);
  }

  .salon__lateral {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    align-items: start;
  }

  .salon__lateral > .aviso {
    grid-column: 1 / -1;
  }
}
</style>
