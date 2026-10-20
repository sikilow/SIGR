<script setup lang="ts">
// "Actualizado hace N s" + botón "Actualizar", igual que en el Panel de mesas. El reloj interno
// solo repinta el texto cada segundo; la carga real la hace el padre (usePolling).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  /** Marca de tiempo (ms) de la última carga exitosa. */
  ultima: number | null
  actualizando: boolean
}>()

defineEmits<{ actualizar: [] }>()

const ahora = ref(Date.now())
let reloj: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  reloj = setInterval(() => (ahora.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(reloj))

const texto = computed(() => {
  if (props.ultima === null) return ''
  const segundos = Math.max(0, Math.floor((ahora.value - props.ultima) / 1000))
  return segundos < 60 ? `Actualizado hace ${segundos} s` : `Actualizado hace ${Math.floor(segundos / 60)} min`
})
</script>

<template>
  <div class="actualizacion">
    <span class="actualizacion__hace">{{ texto }}</span>
    <button type="button" class="btn btn--secundario" :disabled="actualizando" @click="$emit('actualizar')">
      <svg
        class="actualizacion__icono"
        :class="{ 'actualizacion__icono--girando': actualizando }"
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
      {{ actualizando ? 'Actualizando…' : 'Actualizar' }}
    </button>
  </div>
</template>

<style scoped>
.actualizacion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--espacio-1) var(--espacio-3);
}

.actualizacion__hace {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  white-space: nowrap;
}

.actualizacion__icono--girando {
  animation: girar 1s linear infinite;
}

@keyframes girar {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .actualizacion__icono--girando {
    animation: none;
  }
}
</style>
