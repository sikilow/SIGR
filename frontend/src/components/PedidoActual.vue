<script setup lang="ts">
// Pedido en armado: líneas con cantidad, indicaciones y quitar, más el total ESTIMADO
// (el total real lo calcula el servidor). No guarda estado del carrito: solo emite cambios.
import { computed, nextTick, ref } from 'vue'
import { formatearMoneda } from '../utils/formato'
import { MAX_INDICACIONES, subtotalDe, topeCantidad, type LineaCarrito } from '../utils/carrito'
import InsigniaEstado from './InsigniaEstado.vue'

/** Atajos que solo rellenan el texto de indicaciones (no son datos del modelo). */
const SUGERENCIAS = ['Sin cebolla', 'Extra queso', 'Sin picante']

const props = defineProps<{
  mesaNumero: number
  lineas: LineaCarrito[]
  total: number
  /** Ids de los productos del pedido que ahora están agotados (se marcan en su línea). */
  agotados: number[]
  /** Existencia por producto (idProducto → unidades); solo los que la controlan. Topa las cantidades. */
  existencias?: Record<number, number>
  /** Número del pedido que se está editando; `null` si es un pedido nuevo. */
  editandoId: number | null
}>()

const emit = defineEmits<{
  cambiarCantidad: [idProducto: number, delta: number]
  quitar: [idProducto: number]
  indicaciones: [idProducto: number, texto: string]
  sugerencia: [idProducto: number, sugerencia: string]
  revisar: []
}>()

const titulo = ref<HTMLElement | null>(null)
const botonCancelarQuitar = ref<HTMLElement[]>([])
const confirmandoQuitar = ref<number | null>(null)
const indicacionesAbiertas = ref<Set<number>>(new Set())

const vacio = computed(() => props.lineas.length === 0)
const motivoVacio = 'Agrega al menos un producto para revisar el pedido.'

/** Unidades en existencia; `undefined` = no controla existencia (se prepara al momento). */
const existenciaDe = (linea: LineaCarrito): number | undefined => props.existencias?.[linea.idProducto]
/** Tope de la línea: lo que hay en existencia (si la controla) o el máximo general. */
const topeDe = (linea: LineaCarrito): number => topeCantidad(existenciaDe(linea))
const topeAlcanzado = (linea: LineaCarrito): boolean => linea.cantidad >= topeDe(linea)
/** La línea pide más de lo que hay (la existencia bajó después de agregarla). */
const excedeExistencia = (linea: LineaCarrito): boolean => {
  const existencia = existenciaDe(linea)
  return existencia !== undefined && linea.cantidad > existencia
}
const estaAgotado = (linea: LineaCarrito): boolean => props.agotados.includes(linea.idProducto)

function alternarIndicaciones(idProducto: number) {
  const abiertas = new Set(indicacionesAbiertas.value)
  if (abiertas.has(idProducto)) abiertas.delete(idProducto)
  else abiertas.add(idProducto)
  indicacionesAbiertas.value = abiertas
}

const indicacionesVisibles = (linea: LineaCarrito): boolean =>
  indicacionesAbiertas.value.has(linea.idProducto)

async function pedirConfirmacion(idProducto: number) {
  confirmandoQuitar.value = idProducto
  await nextTick()
  // El foco cae en la opción segura ("Conservar").
  botonCancelarQuitar.value[0]?.focus()
}

function confirmarQuitar(idProducto: number) {
  confirmandoQuitar.value = null
  emit('quitar', idProducto)
  // La línea desaparece: el foco pasa al título del pedido para no perderse.
  void nextTick(() => titulo.value?.focus())
}

function aumentar(linea: LineaCarrito) {
  if (!topeAlcanzado(linea)) emit('cambiarCantidad', linea.idProducto, 1)
}

function disminuir(linea: LineaCarrito) {
  if (linea.cantidad > 1) emit('cambiarCantidad', linea.idProducto, -1)
}

function revisar() {
  if (!vacio.value) emit('revisar')
}

defineExpose({ enfocarTitulo: () => titulo.value?.focus() })
</script>

<template>
  <section class="pedido" aria-labelledby="pedido-titulo">
    <header class="pedido__cabecera">
      <h2 id="pedido-titulo" ref="titulo" tabindex="-1">Mesa {{ mesaNumero }}</h2>
      <InsigniaEstado v-if="editandoId !== null" tono="carrito" :texto="`Editando pedido #${editandoId}`" />
    </header>

    <p v-if="vacio" class="pedido__vacio">Aún no hay productos. Toca un producto del menú para agregarlo.</p>

    <ul v-else class="pedido__lineas">
      <li v-for="linea in lineas" :key="linea.idProducto" class="linea">
        <div class="linea__fila">
          <div class="linea__datos">
            <strong>{{ linea.nombre }}</strong>
            <span class="linea__precio numero">{{ formatearMoneda(linea.precioUnitario) }} c/u</span>
            <span v-if="existenciaDe(linea) !== undefined" class="linea__precio numero">Quedan {{ existenciaDe(linea) }}</span>
          </div>
          <strong class="numero linea__subtotal">{{ formatearMoneda(subtotalDe(linea)) }}</strong>
        </div>

        <InsigniaEstado v-if="estaAgotado(linea)" class="linea__agotado" tono="agotado" texto="Agotado: quítalo para continuar" />
        <InsigniaEstado
          v-else-if="excedeExistencia(linea)"
          class="linea__agotado"
          tono="agotado"
          :texto="`Solo quedan ${existenciaDe(linea)}: reduce la cantidad`"
        />

        <!-- Confirmación breve para quitar -->
        <div v-if="confirmandoQuitar === linea.idProducto" class="linea__confirmar" role="group" :aria-label="`Quitar ${linea.nombre}`">
          <p>¿Quitar «{{ linea.nombre }}» del pedido?</p>
          <div class="linea__confirmar-botones">
            <button ref="botonCancelarQuitar" type="button" class="btn btn--secundario" @click="confirmandoQuitar = null">
              Conservar
            </button>
            <button type="button" class="btn btn--peligro" @click="confirmarQuitar(linea.idProducto)">Quitar</button>
          </div>
        </div>

        <div v-else class="linea__controles">
          <div class="cantidad" role="group" :aria-label="`Cantidad de ${linea.nombre}`">
            <button
              type="button"
              class="cantidad__boton"
              :aria-label="`Disminuir cantidad de ${linea.nombre}`"
              :aria-disabled="linea.cantidad <= 1 ? 'true' : undefined"
              @click="disminuir(linea)"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12" /></svg>
            </button>
            <span class="cantidad__valor numero" aria-live="off">{{ linea.cantidad }}</span>
            <button
              type="button"
              class="cantidad__boton"
              :aria-label="topeAlcanzado(linea) ? `Aumentar cantidad de ${linea.nombre} (máximo ${topeDe(linea)})` : `Aumentar cantidad de ${linea.nombre}`"
              :aria-disabled="topeAlcanzado(linea) ? 'true' : undefined"
              @click="aumentar(linea)"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
            </button>
          </div>

          <button type="button" class="btn btn--secundario linea__quitar" :aria-label="`Quitar ${linea.nombre}`" @click="pedirConfirmacion(linea.idProducto)">
            Quitar
          </button>
          <button
            type="button"
            class="btn btn--secundario linea__observar"
            :aria-expanded="indicacionesVisibles(linea)"
            :aria-controls="`obs-${linea.idProducto}`"
            @click="alternarIndicaciones(linea.idProducto)"
          >
            Observaciones
          </button>
        </div>

        <p v-if="linea.indicaciones && !indicacionesVisibles(linea)" class="linea__nota">Nota: {{ linea.indicaciones }}</p>

        <div v-if="indicacionesVisibles(linea)" :id="`obs-${linea.idProducto}`" class="linea__indicaciones">
          <div class="campo">
            <label :for="`obs-texto-${linea.idProducto}`">Observaciones de {{ linea.nombre }}</label>
            <input
              :id="`obs-texto-${linea.idProducto}`"
              type="text"
              :value="linea.indicaciones"
              :maxlength="MAX_INDICACIONES"
              autocomplete="off"
              placeholder="Opcional"
              @input="emit('indicaciones', linea.idProducto, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <p class="linea__contador numero">{{ linea.indicaciones.length }}/{{ MAX_INDICACIONES }}</p>
          <div class="linea__sugerencias" role="group" :aria-label="`Sugerencias para ${linea.nombre}`">
            <button
              v-for="sugerencia in SUGERENCIAS"
              :key="sugerencia"
              type="button"
              class="chip"
              @click="emit('sugerencia', linea.idProducto, sugerencia)"
            >
              {{ sugerencia }}
            </button>
          </div>
        </div>
      </li>
    </ul>

    <footer class="pedido__pie">
      <p class="pedido__total">
        <span>Total estimado</span>
        <strong class="numero">{{ formatearMoneda(total) }}</strong>
      </p>
      <button
        type="button"
        class="btn btn--grande pedido__revisar"
        :aria-disabled="vacio ? 'true' : undefined"
        :aria-describedby="vacio ? 'pedido-motivo-vacio' : undefined"
        @click="revisar"
      >
        {{ editandoId !== null ? 'Revisar cambios' : 'Revisar pedido' }}
      </button>
      <p v-if="vacio" id="pedido-motivo-vacio" class="pedido__motivo">{{ motivoVacio }}</p>
    </footer>
  </section>
</template>

<style scoped>
.pedido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-height: 0;
  height: 100%;
}

.pedido__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2);
}

.pedido__cabecera h2:focus {
  outline: none;
}

.pedido__cabecera h2:focus-visible {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 4px;
}

.pedido__vacio {
  margin: 0;
  padding: var(--espacio-6) var(--espacio-3);
  border: 2px dashed var(--color-muted);
  border-radius: var(--radio);
  text-align: center;
}

.pedido__lineas {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-height: 0;
  margin: 0;
  padding: 0 var(--espacio-1) var(--espacio-1) 0;
  overflow-y: auto;
  list-style: none;
}

.linea {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  padding: var(--espacio-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.linea__fila {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--espacio-2);
}

.linea__datos {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.linea__precio {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.linea__controles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2);
}

.cantidad {
  display: inline-flex;
  align-items: center;
  gap: var(--espacio-1);
}

.cantidad__boton {
  display: inline-grid;
  place-items: center;
  width: var(--tactil-min);
  height: var(--tactil-min);
  border: 2px solid var(--color-primary-dark);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-primary-dark);
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 150ms ease-out;
}

.cantidad__boton:active:not([aria-disabled='true']) {
  background: var(--color-border);
}

.cantidad__boton[aria-disabled='true'] {
  border-color: var(--color-deshabilitado-borde);
  background: var(--color-deshabilitado-fondo);
  color: var(--color-deshabilitado-texto);
  cursor: not-allowed;
}

.cantidad__valor {
  min-width: 36px;
  text-align: center;
  font-size: var(--texto-lg);
  font-weight: 700;
}

.linea__controles {
  justify-content: space-between;
}

.linea__quitar {
  padding: 0 var(--espacio-4);
}

.linea__observar {
  flex: 1 1 100%;
}

.linea__agotado {
  align-self: flex-start;
}

.linea__nota {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  overflow-wrap: anywhere;
}

.linea__indicaciones {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
}

.linea__indicaciones .campo {
  font-size: var(--texto-sm);
}

.linea__contador {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  text-align: right;
}

.linea__sugerencias {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.linea__confirmar {
  padding: var(--espacio-3);
  border: 2px solid var(--color-error);
  border-radius: var(--radio-sm);
}

.linea__confirmar p {
  margin: 0 0 var(--espacio-2);
  font-weight: 600;
}

.linea__confirmar-botones {
  display: flex;
  gap: var(--espacio-2);
}

.linea__confirmar-botones .btn {
  flex: 1;
}

.pedido__pie {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  padding-top: var(--espacio-3);
  border-top: 2px solid var(--color-border);
}

.pedido__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  font-size: var(--texto-lg);
}

.pedido__total strong {
  font-size: var(--texto-xl);
}

.pedido__revisar {
  width: 100%;
}

.pedido__motivo {
  margin: 0;
  color: var(--color-text);
  font-size: var(--texto-sm);
}
</style>
