<script setup lang="ts">
// Panel de mesas: pantalla de inicio del mesero. Solo usa el store de mesas
// (que a su vez usa services/index.ts); no sabe si los datos vienen del mock o de la API.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FiltrosMesas from '../../components/FiltrosMesas.vue'
import HojaAccionesMesa from '../../components/HojaAccionesMesa.vue'
import MesaCard from '../../components/MesaCard.vue'
import ResumenMesas from '../../components/ResumenMesas.vue'
import { usePolling } from '../../composables/usePolling'
import { filtroDesdeConsulta, useMesasStore, type FiltroMesas } from '../../stores/mesas'
import type { Mesa } from '../../types'

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

function cambiarFiltro(filtro: FiltroMesas) {
  const consulta = { ...route.query }
  if (filtro === 'todas') delete consulta.estado
  else consulta.estado = filtro
  void router.replace({ query: consulta })
}

const MENSAJE_VACIO: Record<FiltroMesas, string> = {
  todas: 'No hay mesas registradas',
  libre: 'No hay mesas libres',
  ocupada: 'No hay mesas ocupadas',
  reservada: 'No hay mesas reservadas',
  listo: 'No hay pedidos listos por servir',
}

// ---------- Actualización automática ----------
const { iniciar, ejecutarAhora } = usePolling(() => store.cargar())

const ahora = ref(Date.now())
let relojAhora: ReturnType<typeof setInterval> | undefined

const textoActualizado = computed(() => {
  if (store.ultimaActualizacion === null) return ''
  const segundos = Math.max(0, Math.floor((ahora.value - store.ultimaActualizacion) / 1000))
  return segundos < 60 ? `Actualizado hace ${segundos} s` : `Actualizado hace ${Math.floor(segundos / 60)} min`
})

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
  () => store.mesas.find((m) => m.id === mesaSeleccionadaId.value) ?? null,
)

onMounted(() => {
  relojAhora = setInterval(() => (ahora.value = Date.now()), 1000)
  iniciar()
})

onBeforeUnmount(() => {
  store.descartarAviso()
  clearInterval(relojAhora)
  clearTimeout(temporizadorResaltado)
})
</script>

<template>
  <section class="panel" :aria-busy="store.cargando">
    <header class="panel__encabezado">
      <h2>Panel de mesas</h2>
      <div class="panel__actualizacion">
        <span class="panel__hace">{{ textoActualizado }}</span>
        <button type="button" class="btn btn--secundario" :disabled="store.actualizando" @click="ejecutarAhora()">
          <svg
            class="panel__icono-actualizar"
            :class="{ 'panel__icono-actualizar--girando': store.actualizando }"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
          </svg>
          {{ store.actualizando ? 'Actualizando…' : 'Actualizar' }}
        </button>
      </div>
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
      <FiltrosMesas :model-value="store.filtro" @update:model-value="cambiarFiltro" />
    </template>

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
      <h3>{{ MENSAJE_VACIO[store.filtro] }}</h3>
      <button v-if="store.filtro !== 'todas'" type="button" class="btn btn--secundario" @click="cambiarFiltro('todas')">
        Ver todas las mesas
      </button>
    </div>

    <!-- Cuadrícula de mesas -->
    <ul v-else class="cuadricula" aria-label="Mesas">
      <li v-for="mesa in store.mesasFiltradas" :key="mesa.id">
        <MesaCard :mesa="mesa" :resaltada="resaltadas.includes(mesa.id)" @seleccionar="mesaSeleccionadaId = $event.id" />
      </li>
    </ul>

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
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.panel__actualizacion {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
}

.panel__hace {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.panel__icono-actualizar--girando {
  animation: girar 1s linear infinite;
}

@keyframes girar {
  to {
    transform: rotate(360deg);
  }
}

.cuadricula {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
  min-height: 150px;
  border-radius: var(--radio);
  background: linear-gradient(90deg, var(--color-border) 25%, var(--color-surface) 50%, var(--color-border) 75%);
  background-size: 200% 100%;
  animation: brillo 1.4s ease-in-out infinite;
}

@keyframes brillo {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

.vacio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--espacio-3);
  padding: var(--espacio-10) var(--espacio-4);
  border: 2px dashed var(--color-muted);
  border-radius: var(--radio);
  text-align: center;
}

.vacio p {
  margin: 0;
  color: var(--color-muted);
}

.aviso {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-error);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.aviso p {
  flex: 1;
  margin: 0;
  color: var(--color-error);
  font-weight: 600;
}

/* Aviso informativo: color de marca + ícono (no solo color) */
.aviso--info {
  border-color: var(--color-primary);
  color: var(--color-primary-dark);
}

.aviso--info p {
  color: var(--color-text);
}

@media (prefers-reduced-motion: reduce) {
  .panel__icono-actualizar--girando,
  .esqueleto {
    animation: none;
  }
}
</style>
