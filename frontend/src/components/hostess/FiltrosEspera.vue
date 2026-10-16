<script setup lang="ts">
// Chips de filtro por estado, con la cantidad de cada uno. El activo se comunica con aria-pressed, un check y el
// relleno (no solo color).
import type { FiltroEspera } from '../../utils/espera'

defineProps<{
  modelValue: FiltroEspera
  contadores: Record<FiltroEspera, number>
}>()
defineEmits<{ 'update:modelValue': [filtro: FiltroEspera] }>()

const opciones: Array<{ valor: FiltroEspera; etiqueta: string }> = [
  { valor: 'esperando', etiqueta: 'Esperando' },
  { valor: 'asignada', etiqueta: 'Asignadas' },
  { valor: 'cancelada', etiqueta: 'Canceladas' },
  { valor: 'todas', etiqueta: 'Todas' },
]
</script>

<template>
  <div class="filtros" role="group" aria-label="Filtrar la lista de espera por estado">
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
      <span class="numero filtros__cantidad">{{ contadores[opcion.valor] }}</span>
    </button>
  </div>
</template>

<style scoped>
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.filtros__cantidad {
  font-weight: 800;
}
</style>
