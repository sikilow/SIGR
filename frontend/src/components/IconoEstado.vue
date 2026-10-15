<script setup lang="ts">
// Ícono de estado (decorativo: siempre va junto a un texto visible, por eso se oculta a lectores).
export type TonoEstado = 'libre' | 'ocupada' | 'reservada' | 'listo' | 'cuenta' | 'agotado' | 'carrito'

withDefaults(defineProps<{ tono: TonoEstado; tamano?: number }>(), { tamano: 20 })
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="tamano"
    :height="tamano"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- libre: check -->
    <template v-if="tono === 'libre'">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </template>
    <!-- ocupada: personas -->
    <template v-else-if="tono === 'ocupada'">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 0 1 0 5M18 14.5c1.7.8 3 2.6 3 5.5" />
    </template>
    <!-- reservada: calendario -->
    <template v-else-if="tono === 'reservada'">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </template>
    <!-- cuenta solicitada: recibo -->
    <template v-else-if="tono === 'cuenta'">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </template>
    <!-- agotado: círculo tachado -->
    <template v-else-if="tono === 'agotado'">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </template>
    <!-- en el pedido: carrito -->
    <template v-else-if="tono === 'carrito'">
      <path d="M3 4h2.5l2 11h10l2-8H7" />
      <circle cx="9.5" cy="19" r="1.2" />
      <circle cx="16.5" cy="19" r="1.2" />
    </template>
    <!-- pedido listo: campana -->
    <template v-else>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 21h4" />
    </template>
  </svg>
</template>
