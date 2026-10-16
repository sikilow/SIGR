<script setup lang="ts">
// Chips de filtro. El activo se comunica con aria-pressed, un check y el relleno (no solo color).
import type { FiltroMesas } from '../stores/mesas'

defineProps<{ modelValue: FiltroMesas }>()
defineEmits<{ 'update:modelValue': [filtro: FiltroMesas] }>()

const opciones: Array<{ valor: FiltroMesas; etiqueta: string }> = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'libre', etiqueta: 'Libres' },
  { valor: 'ocupada', etiqueta: 'Ocupadas' },
  { valor: 'reservada', etiqueta: 'Reservadas' },
  { valor: 'listo', etiqueta: 'Pedido listo' },
]
</script>

<template>
  <div class="filtros" role="group" aria-label="Filtrar mesas por estado">
    <button
      v-for="opcion in opciones"
      :key="opcion.valor"
      type="button"
      class="chip"
      :class="{ 'chip--activo': modelValue === opcion.valor }"
      :aria-pressed="modelValue === opcion.valor"
      @click="$emit('update:modelValue', opcion.valor)"
    >
      <svg
        v-if="modelValue === opcion.valor"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m5 12 5 5 9-10" />
      </svg>
      {{ opcion.etiqueta }}
    </button>
  </div>
</template>

<style scoped>
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}
</style>
