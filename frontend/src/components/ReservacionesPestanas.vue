<script setup lang="ts">
// Pestañas de la sección «Reservaciones» del gerente: la configuración (horario, anticipación, tolerancia) y el reporte de
// reservaciones e inasistencias. Son enlaces: cada pestaña tiene su propia dirección. Estilo global `.pestanas`.
</script>

<template>
  <nav class="pestanas reservaciones-pestanas no-imprimir" aria-label="Reservaciones">
    <RouterLink class="pestana" :to="{ name: 'gerente-reservaciones' }">Configuración</RouterLink>
    <RouterLink class="pestana" :to="{ name: 'gerente-reservaciones-reporte' }">Reporte e inasistencias</RouterLink>
  </nav>
</template>

<style scoped>
.reservaciones-pestanas {
  align-self: flex-start;
}
</style>
