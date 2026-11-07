<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import { usePolling } from '../../composables/usePolling'
import { useAnunciosStore } from '../../stores/anuncios'
import { useCocinaStore } from '../../stores/cocina'
import type { Pedido } from '../../types'
import { formatearHora } from '../../utils/formato'

const store = useCocinaStore()
const anuncios = useAnunciosStore()
const erroresAccion = ref('')
const procesando = ref<number[]>([])
const ahora = ref(Date.now())
let reloj: ReturnType<typeof setInterval> | undefined

const pedidosNuevos = computed(() => store.pedidos.filter((pedido) => pedido.estado === 'pendiente' || pedido.estado === 'enviado'))
const pedidosEnPreparacion = computed(() => store.pedidos.filter((pedido) => pedido.estado === 'en_preparacion'))
const polling = usePolling(() => store.cargar())

/** Minutos transcurridos desde que se envió el pedido. */
function minutos(pedido: Pedido): number {
  return Math.max(0, Math.floor((ahora.value - pedido.fechaHora.getTime()) / 60_000))
}

/** Urgencia visual: normal hasta 9 min, atención hasta 19 y urgente de 20 en adelante. */
function urgencia(pedido: Pedido): 'normal' | 'atencion' | 'urgente' {
  const m = minutos(pedido)
  return m >= 20 ? 'urgente' : m >= 10 ? 'atencion' : 'normal'
}

function textoMinutos(pedido: Pedido): string {
  const m = minutos(pedido)
  if (m < 1) return 'Hace un momento'
  return m === 1 ? 'Hace 1 min' : `Hace ${m} min`
}

function estaProcesando(idPedido: number): boolean {
  return procesando.value.includes(idPedido)
}

async function avanzar(pedido: Pedido, estado: 'en_preparacion' | 'listo') {
  if (estaProcesando(pedido.idPedido)) return
  erroresAccion.value = ''
  procesando.value = [...procesando.value, pedido.idPedido]
  try {
    const actualizado = await store.cambiarEstado(pedido.idPedido, estado)
    void anuncios.anunciar(
      estado === 'listo'
        ? `Pedido #${actualizado.idPedido}, mesa ${actualizado.mesaNumero}: listo para entregar`
        : `Pedido #${actualizado.idPedido}: en preparación`,
    )
  } catch (e) {
    erroresAccion.value = e instanceof Error ? e.message : 'No se pudo actualizar el pedido.'
    await store.invalidar()
  } finally {
    procesando.value = procesando.value.filter((id) => id !== pedido.idPedido)
  }
}

onMounted(() => {
  polling.iniciar()
  reloj = setInterval(() => (ahora.value = Date.now()), 30_000)
})

onUnmounted(() => {
  if (reloj) clearInterval(reloj)
})
</script>

<template>
  <section class="cocina pagina" :aria-busy="store.cargando">
    <header class="pagina__encabezado">
      <div>
        <p class="sobretitulo">Estación de cocina</p>
        <h2>Cola de cocina</h2>
        <p>Los pedidos más antiguos aparecen primero. Al marcarlos listos, el mesero podrá entregarlos.</p>
      </div>
      <IndicadorActualizacion
        :ultima="store.ultimaActualizacion"
        :actualizando="store.actualizando"
        @actualizar="polling.ejecutarAhora()"
      />
    </header>

    <div v-if="store.error && store.pedidos.length > 0" class="aviso aviso--error" role="alert">
      <p>No se pudo actualizar la cola. Se muestran los últimos pedidos recibidos. {{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="polling.ejecutarAhora()">Reintentar</button>
    </div>

    <div v-if="erroresAccion" class="aviso aviso--error" role="alert">
      <p>{{ erroresAccion }}</p>
      <button type="button" class="btn btn--secundario" @click="erroresAccion = ''">Cerrar</button>
    </div>

    <template v-if="store.cargando && store.ultimaActualizacion === null">
      <div class="esqueletos" aria-hidden="true">
        <div v-for="n in 4" :key="n" class="esqueleto" />
      </div>
      <p class="solo-lectores" role="status">Cargando pedidos de cocina…</p>
    </template>
    <div v-else-if="store.error && store.ultimaActualizacion === null" class="vacio" role="alert">
      <h3>No se pudo cargar la cola</h3>
      <p>{{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="polling.ejecutarAhora()">Reintentar</button>
    </div>
    <div v-else-if="store.pedidos.length === 0" class="vacio">
      <h3>No hay pedidos pendientes</h3>
      <p>Los pedidos enviados desde el salón aparecerán aquí.</p>
    </div>
    <div v-else class="columnas">
      <section class="columna columna--nuevos" aria-labelledby="nuevos-titulo">
        <header class="columna__encabezado">
          <div>
            <p class="columna__sobretitulo">Por iniciar</p>
            <h3 id="nuevos-titulo">Nuevos</h3>
          </div>
          <span class="columna__contador numero">{{ pedidosNuevos.length }}</span>
        </header>
        <p v-if="pedidosNuevos.length === 0" class="columna__vacia">No hay pedidos nuevos.</p>
        <ul v-else class="lista">
          <li v-for="pedido in pedidosNuevos" :key="pedido.idPedido">
            <article class="pedido tarjeta" :class="`pedido--${urgencia(pedido)}`">
              <header class="pedido__encabezado">
                <div>
                  <h4 class="pedido__numero">Pedido #{{ pedido.idPedido }}</h4>
                  <p class="pedido__meta">Mesa {{ pedido.mesaNumero }} · {{ formatearHora(pedido.fechaHora) }}</p>
                </div>
                <div class="pedido__tiempo">
                  <span class="pedido__reloj numero">{{ textoMinutos(pedido) }}</span>
                  <InsigniaEstado :tono="pedido.estado" texto="Nuevo" />
                </div>
              </header>
              <ul class="productos" :aria-label="`Productos del pedido ${pedido.idPedido}`">
                <li v-for="linea in pedido.detalle" :key="linea.idProducto">
                  <strong class="productos__cantidad numero">{{ linea.cantidad }}×</strong>
                  <span class="productos__texto">
                    {{ linea.nombreProducto }}
                    <small v-if="linea.indicaciones" class="nota">Nota: {{ linea.indicaciones }}</small>
                  </span>
                </li>
              </ul>
              <button
                type="button"
                class="btn btn--grande pedido__accion"
                :disabled="estaProcesando(pedido.idPedido)"
                @click="avanzar(pedido, 'en_preparacion')"
              >
                {{ estaProcesando(pedido.idPedido) ? 'Actualizando…' : 'Iniciar preparación' }}
              </button>
            </article>
          </li>
        </ul>
      </section>

      <section class="columna columna--preparacion" aria-labelledby="preparacion-titulo">
        <header class="columna__encabezado">
          <div>
            <p class="columna__sobretitulo">En fuego</p>
            <h3 id="preparacion-titulo">En preparación</h3>
          </div>
          <span class="columna__contador numero">{{ pedidosEnPreparacion.length }}</span>
        </header>
        <p v-if="pedidosEnPreparacion.length === 0" class="columna__vacia">No hay pedidos en preparación.</p>
        <ul v-else class="lista">
          <li v-for="pedido in pedidosEnPreparacion" :key="pedido.idPedido">
            <article class="pedido tarjeta" :class="`pedido--${urgencia(pedido)}`">
              <header class="pedido__encabezado">
                <div>
                  <h4 class="pedido__numero">Pedido #{{ pedido.idPedido }}</h4>
                  <p class="pedido__meta">Mesa {{ pedido.mesaNumero }} · {{ formatearHora(pedido.fechaHora) }}</p>
                </div>
                <div class="pedido__tiempo">
                  <span class="pedido__reloj numero">{{ textoMinutos(pedido) }}</span>
                  <InsigniaEstado :tono="pedido.estado" texto="En preparación" />
                </div>
              </header>
              <ul class="productos" :aria-label="`Productos del pedido ${pedido.idPedido}`">
                <li v-for="linea in pedido.detalle" :key="linea.idProducto">
                  <strong class="productos__cantidad numero">{{ linea.cantidad }}×</strong>
                  <span class="productos__texto">
                    {{ linea.nombreProducto }}
                    <small v-if="linea.indicaciones" class="nota">Nota: {{ linea.indicaciones }}</small>
                  </span>
                </li>
              </ul>
              <button
                type="button"
                class="btn btn--grande pedido__accion"
                :disabled="estaProcesando(pedido.idPedido)"
                @click="avanzar(pedido, 'listo')"
              >
                {{ estaProcesando(pedido.idPedido) ? 'Actualizando…' : 'Marcar listo' }}
              </button>
            </article>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.cocina {
  max-width: 96rem;
}

.cocina h2 {
  font-size: clamp(1.75rem, 1.2rem + 2vw, 2.6rem);
}

.pagina__encabezado {
  align-items: center;
}

.columnas {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--espacio-5);
}

.columna {
  min-width: 0;
  padding: var(--espacio-4);
  border: 1px solid var(--color-border);
  border-top: 6px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-bg);
}

.columna--nuevos {
  border-top-color: var(--color-enviado);
}

.columna--preparacion {
  border-top-color: var(--color-preparacion);
}

.columna__encabezado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
  margin-bottom: var(--espacio-3);
}

.columna__sobretitulo {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.columna__encabezado h3 {
  font-size: var(--texto-xl);
}

.columna__contador {
  display: grid;
  flex: none;
  place-items: center;
  min-width: 52px;
  min-height: 52px;
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: var(--sombra);
  font-size: var(--texto-xl);
  font-weight: 700;
}

.columna__vacia {
  margin: 0;
  padding: var(--espacio-6) var(--espacio-3);
  border: 2px dashed var(--color-border);
  border-radius: var(--radio);
  color: var(--color-muted);
  text-align: center;
}

.lista {
  display: grid;
  gap: var(--espacio-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pedido {
  --urgencia: var(--color-borde-fuerte);

  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  padding: var(--espacio-4);
  border-left: 6px solid var(--urgencia);
}

.pedido--atencion {
  --urgencia: var(--color-advertencia);
}

.pedido--urgente {
  --urgencia: var(--color-peligro);
}

.pedido__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.pedido__numero {
  margin: 0;
  font-size: var(--texto-xl);
  font-weight: 700;
}

.pedido__meta {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.pedido__tiempo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--espacio-1);
}

.pedido__reloj {
  font-size: var(--texto-lg);
  font-weight: 700;
  line-height: 1.1;
}

.pedido--atencion .pedido__reloj {
  color: var(--color-advertencia-texto);
}

.pedido--urgente .pedido__reloj {
  color: var(--color-peligro-texto);
}

.productos {
  display: grid;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.productos li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--espacio-3);
  padding-bottom: var(--espacio-2);
  border-bottom: 1px solid var(--color-border);
}

.productos li:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.productos__cantidad {
  min-width: 2.4rem;
  color: var(--color-primary-dark);
  font-size: var(--texto-xl);
  line-height: 1.1;
}

.productos__texto {
  font-size: var(--texto-lg);
  font-weight: 600;
  line-height: 1.3;
}

.nota {
  display: block;
  margin-top: var(--espacio-1);
  padding: var(--espacio-1) var(--espacio-2);
  border-radius: var(--radio-sm);
  background: var(--color-advertencia-fondo);
  color: var(--color-advertencia-texto);
  font-size: var(--texto-sm);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.pedido__accion {
  width: 100%;
}

.esqueletos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--espacio-4);
}

.esqueletos .esqueleto {
  min-height: 240px;
}

@media (max-width: 52em) {
  .columnas {
    grid-template-columns: minmax(0, 1fr);
  }

  .esqueletos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
