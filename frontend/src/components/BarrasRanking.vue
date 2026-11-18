<script setup lang="ts">
// Lista ordenada con una barra por fila (un solo color: la barra mide el importe, el texto dice el valor). La usan las
// secciones del reporte de ventas: métodos de pago, meseros, productos, categorías, secciones y horas.
import { computed, ref } from 'vue'
import { formatearMoneda } from '../utils/formato'

export interface FilaRanking {
  clave: string
  nombre: string
  /** Texto chico bajo el nombre: «12 cuentas», «Bebidas · 34 piezas». */
  detalle?: string
  total: number
}

const props = withDefaults(
  defineProps<{
    filas: FilaRanking[]
    /** Total del periodo, para el porcentaje de cada fila. */
    totalGeneral: number
    /** Filas visibles antes de «Ver todas». */
    limite?: number
    /** Texto cuando no hay filas. */
    vacio?: string
    /** Muestra el número de lugar (1, 2, 3…). */
    numerada?: boolean
  }>(),
  { limite: 8, vacio: 'Sin ventas en este periodo.', numerada: false },
)

const todas = ref(false)
const maximo = computed(() => Math.max(...props.filas.map((f) => f.total), 0))
const visibles = computed(() => (todas.value ? props.filas : props.filas.slice(0, props.limite)))

function porcentaje(total: number): string {
  if (props.totalGeneral <= 0) return '0%'
  return `${((total / props.totalGeneral) * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`
}
</script>

<template>
  <p v-if="filas.length === 0" class="ranking__vacio">{{ vacio }}</p>
  <template v-else>
    <ol class="ranking" :class="{ 'ranking--numerada': numerada }">
      <li v-for="(fila, i) in visibles" :key="fila.clave" class="ranking__fila">
        <span v-if="numerada" class="ranking__lugar numero" aria-hidden="true">{{ i + 1 }}</span>
        <span class="ranking__texto">
          <span class="ranking__nombre">{{ fila.nombre }}</span>
          <span v-if="fila.detalle" class="ranking__detalle">{{ fila.detalle }}</span>
        </span>
        <span class="ranking__valor">
          <strong class="numero">{{ formatearMoneda(fila.total) }}</strong>
          <span class="ranking__parte numero">{{ porcentaje(fila.total) }}</span>
        </span>
        <span class="ranking__pista" aria-hidden="true">
          <span class="ranking__barra" :style="{ width: maximo > 0 ? `${Math.max((fila.total / maximo) * 100, 1.5)}%` : '0%' }" />
        </span>
      </li>
    </ol>
    <button v-if="filas.length > limite" type="button" class="btn btn--secundario ranking__mas" @click="todas = !todas">
      {{ todas ? 'Ver menos' : `Ver todas (${filas.length})` }}
    </button>
  </template>
</template>

<style scoped>
.ranking {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ranking__fila {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'texto valor'
    'pista pista';
  align-items: end;
  gap: var(--espacio-1) var(--espacio-3);
}

.ranking--numerada .ranking__fila {
  grid-template-columns: 1.75rem minmax(0, 1fr) auto;
  grid-template-areas:
    'lugar texto valor'
    'lugar pista pista';
}

.ranking__lugar {
  grid-area: lugar;
  align-self: start;
  color: var(--color-muted);
  font-weight: 700;
}

.ranking__texto {
  grid-area: texto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ranking__nombre {
  font-weight: 650;
  overflow-wrap: anywhere;
}

.ranking__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.ranking__valor {
  grid-area: valor;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  white-space: nowrap;
}

.ranking__parte {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.ranking__pista {
  grid-area: pista;
  height: 8px;
  border-radius: 4px;
  background: var(--color-surface-2);
  overflow: hidden;
}

.ranking__barra {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--color-primary);
}

.ranking__vacio {
  margin: 0;
  color: var(--color-muted);
}

.ranking__mas {
  align-self: flex-start;
  margin-top: var(--espacio-3);
}
</style>
