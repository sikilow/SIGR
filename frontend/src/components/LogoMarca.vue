<script setup lang="ts">
// MARCADOR DE POSICIÓN del logo de "La Madalena" (un plato con cubiertos sobre un círculo).
// Para poner el logo real basta con cambiar el contenido de este componente (por ejemplo, un <img>
// en src/assets/): ninguna otra vista lo conoce por dentro. Es decorativo (aria-hidden): el nombre
// del restaurante siempre aparece como texto junto a él.
withDefaults(defineProps<{ tamano?: number; invertido?: boolean }>(), { tamano: 64, invertido: false })
</script>

<template>
  <span class="logo" :class="{ 'logo--invertido': invertido }" :style="{ '--tamano-logo': `${tamano}px` }" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v5" />
      <path d="M17 3c-1.7 1.2-3 3.6-3 6.5 0 1.7.8 2.5 2 2.5h1v9" />
    </svg>
  </span>
</template>

<style scoped>
.logo {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--tamano-logo);
  height: var(--tamano-logo);
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.logo--invertido {
  background: var(--color-on-primary);
  color: var(--color-primary);
}

.logo svg {
  width: 56%;
  height: 56%;
}
</style>
