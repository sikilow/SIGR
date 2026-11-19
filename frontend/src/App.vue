<script setup lang="ts">
import GuardaInactividad from './components/GuardaInactividad.vue'
</script>

<template>
  <RouterView />
  <!-- Cierra la sesión del personal tras un rato sin tocar nada (RNF-011) -->
  <GuardaInactividad />
</template>
