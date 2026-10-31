<script setup lang="ts">
// Selector del día de la lista: anterior, fecha (campo nativo de fecha, táctil y con teclado), siguiente y «Hoy».
// Todos los controles miden ≥ 48 px.
import { computed } from 'vue'
import { aDiaISO, combinarFechaHora, sumarDias } from '../../utils/reservaciones'

// `etiqueta`: nombre accesible del grupo (también lo usa la pantalla Pedidos del gerente).
const props = withDefaults(defineProps<{ modelValue: string; etiqueta?: string }>(), { etiqueta: 'Día de las reservaciones' })
const emit = defineEmits<{ 'update:modelValue': [dia: string] }>()

const hoy = computed(() => aDiaISO(new Date()))
const esHoy = computed(() => props.modelValue === hoy.value)

function alCambiarCampo(evento: Event) {
  const valor = (evento.target as HTMLInputElement).value
  // Un campo vacío (la persona borró la fecha) no cambia el día.
  if (valor && combinarFechaHora(valor, '12:00')) emit('update:modelValue', valor)
}
</script>

<template>
  <div class="dia" role="group" :aria-label="etiqueta">
    <button type="button" class="btn btn--secundario dia__paso" aria-label="Día anterior" @click="emit('update:modelValue', sumarDias(modelValue, -1))">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7" /></svg>
    </button>

    <label class="dia__campo">
      <span class="solo-lectores">Ver el día</span>
      <input class="dia__input" type="date" :value="modelValue" @change="alCambiarCampo" />
    </label>

    <button type="button" class="btn btn--secundario dia__paso" aria-label="Día siguiente" @click="emit('update:modelValue', sumarDias(modelValue, 1))">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7" /></svg>
    </button>

    <button type="button" class="btn btn--secundario" :aria-pressed="esHoy" :disabled="esHoy" @click="emit('update:modelValue', hoy)">Hoy</button>
  </div>
</template>

<style scoped>
.dia {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2);
}

.dia__paso {
  min-width: var(--tactil-min);
  padding: 0;
}

.dia__campo {
  display: block;
}

.dia__input {
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-3);
  border: 1.5px solid var(--color-borde-control);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-weight: 600;
}</style>
