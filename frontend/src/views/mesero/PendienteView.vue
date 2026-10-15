<script setup lang="ts">
// PLACEHOLDER de las pantallas "Pedido de mesa" y "Cuenta de mesa" (se construirán después).
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <section class="tarjeta pendiente">
    <h2>{{ route.meta.titulo }} · Mesa {{ route.params.mesaId }}</h2>
    <p class="pendiente__texto">Pantalla pendiente.</p>
    <RouterLink class="btn" :to="{ name: 'mesero-mesas' }">Volver al panel de mesas</RouterLink>
  </section>
</template>

<style scoped>
.pendiente {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--espacio-4);
}

.pendiente__texto {
  margin: 0;
  color: var(--color-muted);
}

.pendiente .btn {
  text-decoration: none;
}
</style>
