<script setup lang="ts">
// Pestañas de la sección «Cortes y ventas» del gerente: Cortes de caja (cierres de turno), Reporte de ventas
// (historial y totales por periodo) y Tickets y devoluciones. Son enlaces: cada pestaña tiene su propia dirección. Estilo global `.pestanas`.
</script>

<template>
  <nav class="pestanas caja-pestanas no-imprimir" aria-label="Cortes y ventas">
    <RouterLink class="pestana" :to="{ name: 'gerente-cortes' }">Cortes de caja</RouterLink>
    <RouterLink class="pestana" :to="{ name: 'gerente-ventas' }">Reporte de ventas</RouterLink>
    <RouterLink class="pestana" :to="{ name: 'gerente-tickets' }">Tickets y devoluciones</RouterLink>
  </nav>
</template>

<style scoped>
.caja-pestanas {
  align-self: flex-start;
}
</style>
