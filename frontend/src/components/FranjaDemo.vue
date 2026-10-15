<script setup lang="ts">
// Franja "Modo demo · datos simulados". Solo existe con VITE_USE_MOCK=true (mock): con la API real
// no se renderiza. Va en el flujo normal de la página (no es flotante), así que no tapa contenido.
// Lleva ícono + texto: no depende del color.
import { usandoMock } from '../services'
</script>

<template>
  <p v-if="usandoMock" class="demo">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 19l-5-10V3" />
      <path d="M7.5 15h9" />
    </svg>
    Modo demo · datos simulados
  </p>
</template>

<style scoped>
.demo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--espacio-2);
  min-height: var(--espacio-8);
  margin: 0;
  padding: var(--espacio-1) var(--espacio-4);
  border-bottom: 1px solid var(--color-muted);
  background: var(--color-border);
  color: var(--color-text);
  font-size: var(--texto-sm);
  font-weight: 700;
  text-align: center;
}

.demo svg {
  flex: none;
  color: var(--color-primary-dark);
}
</style>
