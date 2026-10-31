<script setup lang="ts">
// Select «Sección» junto a los chips de estado (Panel del mesero y Salón de la hostess, RF-MES-007). Solo se muestra
// si hay más de una sección. Un select nativo: con el teclado y en tablet abre el selector del sistema (≥ 48 px).
import { TODAS_LAS_SECCIONES, type OpcionSeccion } from '../utils/secciones'

defineProps<{
  modelValue: string
  secciones: OpcionSeccion[]
  /** id del select (único en la pantalla) para asociar la etiqueta. */
  idCampo: string
}>()

defineEmits<{ 'update:modelValue': [seccion: string] }>()
</script>

<template>
  <div class="seccion" :class="{ 'seccion--activa': modelValue !== TODAS_LAS_SECCIONES }">
    <label :for="idCampo" class="seccion__etiqueta">Sección</label>
    <select
      :id="idCampo"
      class="seccion__select"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option :value="TODAS_LAS_SECCIONES">Todas las secciones</option>
      <option v-for="s in secciones" :key="s.clave" :value="s.clave">{{ s.nombre }}</option>
    </select>
  </div>
</template>

<style scoped>
.seccion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2);
  min-width: 0;
  max-width: 100%;
}

.seccion__etiqueta {
  font-weight: 600;
}

.seccion__select {
  min-width: 0;
  max-width: 100%;
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-4);
  border: 1.5px solid var(--color-borde-control);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}

/* Con una sección elegida, el borde se marca (además del texto del select, que ya dice cuál es) */
.seccion--activa .seccion__select {
  border-color: var(--color-primary-dark);
  font-weight: 600;
}
</style>
