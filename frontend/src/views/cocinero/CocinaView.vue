<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const pedidosNuevos = computed(() => store.pedidos.filter((pedido) => pedido.estado === 'pendiente' || pedido.estado === 'enviado'))
const pedidosEnPreparacion = computed(() => store.pedidos.filter((pedido) => pedido.estado === 'en_preparacion'))
const polling = usePolling(() => store.cargar())

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

onMounted(() => polling.iniciar())
</script>

<template>
  <section class="cocina" :aria-busy="store.cargando">
    <header class="cocina__encabezado">
      <div>
        <h2>Cola de cocina</h2>
        <p>Los pedidos más antiguos aparecen primero. Al marcarlos listos, el mesero podrá verlos para entregar.</p>
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
      <button type="button" class="btn" @click="erroresAccion = ''">Cerrar</button>
    </div>

    <div v-if="store.cargando && store.ultimaActualizacion === null" class="carga" aria-busy="true">
      <p role="status">Cargando pedidos de cocina…</p>
    </div>
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
      <section class="columna" aria-labelledby="nuevos-titulo">
        <header class="columna__encabezado">
          <h3 id="nuevos-titulo">Nuevos</h3>
          <span class="columna__contador">{{ pedidosNuevos.length }}</span>
        </header>
        <p v-if="pedidosNuevos.length === 0" class="columna__vacia">No hay pedidos nuevos.</p>
        <ul v-else class="lista">
          <li v-for="pedido in pedidosNuevos" :key="pedido.idPedido">
            <article class="pedido tarjeta">
              <header class="pedido__encabezado">
                <div>
                  <h4>Pedido #{{ pedido.idPedido }}</h4>
                  <p>Mesa {{ pedido.mesaNumero }} · {{ formatearHora(pedido.fechaHora) }}</p>
                </div>
                <InsigniaEstado :tono="pedido.estado" texto="Nuevo" />
              </header>
              <ul class="productos" :aria-label="`Productos del pedido ${pedido.idPedido}`">
                <li v-for="linea in pedido.detalle" :key="linea.idProducto">
                  <strong class="numero">{{ linea.cantidad }}×</strong>
                  <span>
                    {{ linea.nombreProducto }}
                    <small v-if="linea.indicaciones" class="nota">Nota: {{ linea.indicaciones }}</small>
                  </span>
                </li>
              </ul>
              <button
                type="button"
                class="btn pedido__accion"
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
          <h3 id="preparacion-titulo">En preparación</h3>
          <span class="columna__contador">{{ pedidosEnPreparacion.length }}</span>
        </header>
        <p v-if="pedidosEnPreparacion.length === 0" class="columna__vacia">No hay pedidos en preparación.</p>
        <ul v-else class="lista">
          <li v-for="pedido in pedidosEnPreparacion" :key="pedido.idPedido">
            <article class="pedido tarjeta">
              <header class="pedido__encabezado">
                <div>
                  <h4>Pedido #{{ pedido.idPedido }}</h4>
                  <p>Mesa {{ pedido.mesaNumero }} · {{ formatearHora(pedido.fechaHora) }}</p>
                </div>
                <InsigniaEstado :tono="pedido.estado" texto="En preparación" />
              </header>
              <ul class="productos" :aria-label="`Productos del pedido ${pedido.idPedido}`">
                <li v-for="linea in pedido.detalle" :key="linea.idProducto">
                  <strong class="numero">{{ linea.cantidad }}×</strong>
                  <span>
                    {{ linea.nombreProducto }}
                    <small v-if="linea.indicaciones" class="nota">Nota: {{ linea.indicaciones }}</small>
                  </span>
                </li>
              </ul>
              <button
                type="button"
                class="btn pedido__accion"
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
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  max-width: 90rem;
  margin-inline: auto;
}

.cocina__encabezado,
.pedido__encabezado,
.columna__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.cocina__encabezado h2,
.columna__encabezado h3,
.pedido h4 {
  margin: 0;
}

.cocina__encabezado p,
.pedido__encabezado p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
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
  border-radius: var(--radio);
  background: var(--color-bg);
}

.columna--preparacion {
  border-top: 4px solid var(--color-preparacion);
}

.columna__contador {
  display: grid;
  place-items: center;
  min-width: var(--tactil-min);
  min-height: var(--tactil-min);
  border-radius: 50%;
  background: var(--color-surface);
  font-weight: 700;
}

.columna__vacia {
  margin-bottom: 0;
  color: var(--color-muted);
}

.lista,
.productos {
  display: grid;
  gap: var(--espacio-3);
  margin: var(--espacio-4) 0 0;
  padding: 0;
  list-style: none;
}

.pedido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  padding: var(--espacio-4);
}

.productos {
  margin: 0;
}

.productos li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--espacio-2);
}

.nota {
  display: block;
  margin-top: var(--espacio-1);
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.pedido__accion {
  width: 100%;
}

.aviso,
.vacio,
.carga {
  padding: var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.aviso {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.aviso p,
.vacio p {
  margin: 0;
}

.aviso--error {
  border-color: var(--color-error);
  color: var(--color-error);
}

.vacio {
  display: grid;
  justify-items: center;
  gap: var(--espacio-2);
  text-align: center;
}

.vacio h3 {
  margin: 0;
}

@media (max-width: 52em) {
  .columnas {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
