<script setup lang="ts">
// Chips de filtro por estado, con la cantidad de cada uno. El activo se comunica con aria-pressed, un check y el
// relleno (no solo color).
import { computed } from 'vue'
import type { FiltroReservaciones } from '../../utils/reservaciones'

const props = defineProps<{
  modelValue: FiltroReservaciones
  contadores: Record<FiltroReservaciones, number>
}>()
defineEmits<{ 'update:modelValue': [filtro: FiltroReservaciones] }>()

const opciones = computed<Array<{ valor: FiltroReservaciones; etiqueta: string }>>(() => [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'confirmada', etiqueta: 'Confirmadas' },
  { valor: 'llego', etiqueta: 'Llegaron' },
  { valor: 'cancelada', etiqueta: 'Canceladas' },
])
</script>

<template>
  <div class="filtros" role="group" aria-label="Filtrar reservaciones por estado">
    <button
      v-for="opcion in opciones"
      :key="opcion.valor"
      type="button"
      class="chip"
      :class="{ 'chip--activo': props.modelValue === opcion.valor }"
      :aria-pressed="props.modelValue === opcion.valor"
      @click="$emit('update:modelValue', opcion.valor)"
    >
      <svg
        v-if="props.modelValue === opcion.valor"
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
