<script setup lang="ts">
// Tarjeta de producto del menú. Tocarla agrega 1 unidad. Lo que se prepara al momento no lleva existencia;
// lo que la controla muestra "Quedan N" y no deja agregar más de lo que hay. Un producto agotado (o ya
// agregado por completo) queda aria-disabled (sigue enfocable) y explica el motivo con texto.
import { computed } from 'vue'
import type { Producto } from '../types'
import { formatearMoneda } from '../utils/formato'
import InsigniaEstado from './InsigniaEstado.vue'

const props = defineProps<{
  producto: Producto
  /** Unidades de este producto que ya lleva el pedido. */
  enPedido: number
}>()

const emit = defineEmits<{ agregar: [producto: Producto] }>()

const agotado = computed(() => !props.producto.disponible)
/** Unidades que todavía se pueden agregar; `null` = no controla existencia (sin tope). */
const quedan = computed(() => (props.producto.existencia === undefined ? null : props.producto.existencia - props.enPedido))
/** Disponible, pero el pedido ya lleva todo lo que hay en existencia. */
const sinMas = computed(() => !agotado.value && quedan.value !== null && quedan.value <= 0)
const bloqueado = computed(() => agotado.value || sinMas.value)
const hayEtiquetas = computed(() => agotado.value || props.enPedido > 0 || props.producto.existencia !== undefined)
const idMotivo = computed(() => `producto-motivo-${props.producto.idProducto}`)

function alTocar() {
  if (!bloqueado.value) emit('agregar', props.producto)
}
</script>

<template>
  <button
    type="button"
    class="producto"
    :class="{ 'producto--bloqueado': bloqueado, 'producto--en-pedido': enPedido > 0 }"
    :aria-disabled="bloqueado ? 'true' : undefined"
    :aria-describedby="bloqueado ? idMotivo : undefined"
    @click="alTocar"
  >
    <span class="producto__nombre">{{ producto.nombre }}</span>
    <span v-if="producto.presentacion" class="producto__presentacion">{{ producto.presentacion }}</span>
    <span class="producto__precio numero">{{ formatearMoneda(producto.precio) }}</span>

    <span v-if="hayEtiquetas" class="producto__etiquetas">
      <InsigniaEstado v-if="agotado" tono="agotado" texto="Agotado" />
      <InsigniaEstado v-else-if="producto.existencia !== undefined" tono="registrado" :texto="`Quedan ${producto.existencia}`" />
      <InsigniaEstado v-if="enPedido > 0" tono="carrito" :texto="`En pedido: ${enPedido}`" />
    </span>

    <span v-if="bloqueado" :id="idMotivo" class="producto__motivo">{{
      agotado ? 'No se puede agregar: producto agotado.' : `Ya agregaste todo lo que hay (${producto.existencia}).`
    }}</span>
  </button>
</template>

<style scoped>
.producto {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--espacio-2);
  width: 100%;
  min-height: 120px;
  padding: var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: var(--sombra);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    transform 100ms ease-out,
    box-shadow 150ms ease-out;
}

.producto:active:not(.producto--bloqueado) {
  transform: scale(0.97);
  box-shadow: none;
}

/* Con unidades en el pedido: borde de marca + insignia con texto (no solo color) */
.producto--en-pedido {
  border-color: var(--color-primary);
}

.producto--bloqueado {
  background: var(--color-bg);
  box-shadow: none;
  cursor: not-allowed;
}

.producto__nombre {
  font-weight: 700;
  line-height: 1.25;
}

.producto__presentacion {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.producto__precio {
  color: var(--color-primary-dark);
  font-weight: 700;
}

.producto__etiquetas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-1) var(--espacio-2);
}

.producto__motivo {
  color: var(--color-text);
  font-size: var(--texto-sm);
}

@media (prefers-reduced-motion: reduce) {
  .producto:active:not(.producto--bloqueado) {
    transform: none;
  }
}
</style>
