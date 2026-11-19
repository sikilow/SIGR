<script setup lang="ts">
// Pestañas de la sección «Productos» del gerente: el catálogo con su inventario y las mermas (producto que se pierde).
// Son enlaces: cada pestaña tiene su propia dirección. Estilo global `.pestanas`.
</script>

<template>
  <nav class="pestanas productos-pestanas no-imprimir" aria-label="Productos">
    <RouterLink class="pestana" :to="{ name: 'gerente-productos' }">Productos e inventario</RouterLink>
    <RouterLink class="pestana" :to="{ name: 'gerente-mermas' }">Mermas</RouterLink>
  </nav>
</template>

<style scoped>
.productos-pestanas {
  align-self: flex-start;
}
</style>
