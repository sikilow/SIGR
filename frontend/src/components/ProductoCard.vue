<script setup lang="ts">
// Tarjeta de producto del menú. El cuerpo agrega 1 unidad; los controles −/+ ajustan la cantidad.
// Lo que se prepara al momento no lleva existencia; lo que la controla muestra su disponibilidad y
// no deja agregar más de lo que hay. Un producto agotado queda aria-disabled (sigue enfocable) y
// explica el motivo con texto.
import { computed } from 'vue'
import type { Producto } from '../types'
import { formatearMoneda } from '../utils/formato'
import InsigniaEstado from './InsigniaEstado.vue'

const props = defineProps<{
  producto: Producto
  /** Unidades de este producto que ya lleva el pedido. */
  enPedido: number
}>()

const emit = defineEmits<{ agregar: [producto: Producto]; quitar: [producto: Producto] }>()

const agotado = computed(() => !props.producto.disponible)
/** Unidades que todavía se pueden agregar; `null` = no controla existencia (sin tope). */
const quedan = computed(() => (props.producto.existencia === undefined ? null : props.producto.existencia - props.enPedido))
/** Disponible, pero el pedido ya lleva todo lo que hay en existencia. */
const sinMas = computed(() => !agotado.value && quedan.value !== null && quedan.value <= 0)
const bloqueado = computed(() => agotado.value || sinMas.value)
const idMotivo = computed(() => `producto-motivo-${props.producto.idProducto}`)

/** Estado de existencia: agotado, stock bajo o disponible. */
const estadoExistencia = computed<{ tono: 'producto_agotado' | 'producto_stock_bajo' | 'producto_disponible'; texto: string }>(() => {
  if (agotado.value) return { tono: 'producto_agotado', texto: 'Agotado' }
  const existencia = props.producto.existencia
  if (existencia === undefined) return { tono: 'producto_disponible', texto: 'Disponible' }
  const minimo = props.producto.stockMinimo ?? 5
  if (existencia <= minimo) return { tono: 'producto_stock_bajo', texto: `Stock bajo · quedan ${existencia}` }
  return { tono: 'producto_disponible', texto: `Disponible · quedan ${existencia}` }
})

const motivo = computed(() =>
  agotado.value ? 'No se puede agregar: producto agotado.' : `Ya agregaste todo lo que hay (${props.producto.existencia}).`,
)

function agregar() {
  if (!bloqueado.value) emit('agregar', props.producto)
}

function quitar() {
  if (props.enPedido > 0) emit('quitar', props.producto)
}
</script>

<template>
  <article
    class="producto"
    :class="{ 'producto--bloqueado': bloqueado, 'producto--en-pedido': enPedido > 0, 'producto--agotado': agotado }"
  >
    <button
      type="button"
      class="producto__cuerpo"
      :aria-disabled="bloqueado ? 'true' : undefined"
      :aria-describedby="bloqueado || enPedido > 0 ? idMotivo : undefined"
      @click="agregar"
    >
      <span class="producto__fila">
        <span class="producto__nombre">{{ producto.nombre }}</span>
        <span class="producto__precio numero">{{ formatearMoneda(producto.precio) }}</span>
      </span>

      <span v-if="producto.presentacion" class="producto__presentacion">{{ producto.presentacion }}</span>
      <span v-if="producto.descripcion" class="producto__descripcion">{{ producto.descripcion }}</span>

      <span class="producto__etiquetas">
        <InsigniaEstado :tono="estadoExistencia.tono" :texto="estadoExistencia.texto" />
        <InsigniaEstado v-if="enPedido > 0" tono="carrito" :texto="`En pedido: ${enPedido}`" />
      </span>

      <span v-if="bloqueado || sinMas" :id="idMotivo" class="producto__motivo">
        {{ motivo }}
      </span>
    </button>

    <div class="producto__controles">
      <button
        type="button"
        class="producto__paso"
        :disabled="enPedido === 0"
        :aria-label="`Quitar una unidad de ${producto.nombre}`"
        @click="quitar"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span class="producto__cantidad numero" aria-live="polite">{{ enPedido }}</span>
      <button
        type="button"
        class="producto__paso producto__paso--mas"
        :disabled="bloqueado"
        :aria-label="`Agregar una unidad de ${producto.nombre}`"
        @click="agregar"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  </article>
</template>

<style scoped>
.producto {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  height: 100%;
  /* Las tarjetas angostas apilan nombre y precio para que ninguna cifra se recorte. */
  container-type: inline-size;
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: var(--sombra);
  overflow: hidden;
  transition:
    border-color var(--duracion-rapida) ease,
    box-shadow var(--duracion-rapida) ease;
}

.producto:hover {
  border-color: var(--color-borde-fuerte);
}

.producto--en-pedido {
  border-color: var(--color-primary);
}

.producto--agotado {
  background: var(--color-bg);
  box-shadow: none;
}

.producto__cuerpo {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--espacio-1);
  width: 100%;
  min-height: 120px;
  padding: var(--espacio-4) var(--espacio-4) var(--espacio-2);
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  touch-action: manipulation;
}

.producto__cuerpo[aria-disabled='true'] {
  cursor: not-allowed;
}

.producto__fila {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--espacio-3);
  width: 100%;
}

.producto__nombre {
  font-family: var(--fuente-titulo);
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.producto__precio {
  flex: none;
  color: var(--color-primary-dark);
  font-size: var(--texto-lg);
  font-weight: 700;
}

/* En tarjetas de 256 px o menos el precio pasa a su propia línea: "$95.00 MXN" no cabe
   junto a nombres largos y antes se recortaba contra el borde. */
@container (max-width: 16rem) {
  .producto__fila {
    flex-direction: column;
    gap: 2px;
  }

  .producto__precio {
    font-size: var(--texto-base);
  }
}

.producto__presentacion {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.producto__descripcion {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.producto__etiquetas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-1) var(--espacio-2);
  margin-top: var(--espacio-1);
}

.producto__motivo {
  margin-top: var(--espacio-1);
  color: var(--color-peligro-texto);
  font-size: var(--texto-sm);
  font-weight: 600;
  line-height: 1.35;
}

/* Controles − / cantidad / + : área separada del cuerpo para no anidar botones */
.producto__controles {
  display: grid;
  grid-template-columns: var(--tactil-min) 1fr var(--tactil-min);
  align-items: center;
  gap: var(--espacio-2);
  padding: var(--espacio-2) var(--espacio-3) var(--espacio-3);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-2);
}

.producto__paso {
  display: grid;
  place-items: center;
  width: var(--tactil-min);
  height: var(--tactil-min);
  padding: 0;
  border: 2px solid var(--color-borde-fuerte);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  color: var(--color-primary-dark);
  touch-action: manipulation;
  transition:
    background-color var(--duracion-rapida) ease,
    border-color var(--duracion-rapida) ease,
    transform var(--duracion-rapida) var(--curva-salida);
}

.producto__paso--mas {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.producto__paso:active:not(:disabled) {
  transform: scale(0.94);
}

@media (hover: hover) and (pointer: fine) {
  .producto__paso:hover:not(:disabled) {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
    color: var(--color-primary-dark);
  }

  .producto__paso--mas:hover:not(:disabled) {
    background: var(--color-primary-dark);
    color: var(--color-on-primary);
  }
}

.producto__paso:disabled {
  border-color: var(--color-deshabilitado-borde);
  background: var(--color-deshabilitado-fondo);
  color: var(--color-deshabilitado-texto);
  cursor: not-allowed;
}

.producto__cantidad {
  text-align: center;
  font-size: var(--texto-lg);
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .producto__paso:active:not(:disabled) {
    transform: none;
  }
}
</style>
