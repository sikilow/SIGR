<script setup lang="ts">
// Selector de lada (código de país) que va junto al campo de teléfono. Nativo (<select>) para que funcione bien con
// teclado, lectores de pantalla y teléfonos. Los 10 dígitos del número se escriben aparte.
import { computed } from 'vue'
import { etiquetaLada, opcionesLada } from '../utils/lada'

const lada = defineModel<string>({ required: true })

defineProps<{
  id?: string
  disabled?: boolean
}>()

const opciones = computed(() => opcionesLada(lada.value))
</script>

<template>
  <select :id="id" v-model="lada" class="selector-lada" :disabled="disabled" aria-label="Lada (código de país)">
    <option v-for="o in opciones" :key="o.codigo" :value="o.codigo">{{ etiquetaLada(o) }}</option>
  </select>
</template>
