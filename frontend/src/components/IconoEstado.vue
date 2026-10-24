<script setup lang="ts">
// Ícono de estado (decorativo: siempre va junto a un texto visible, por eso se oculta a lectores).
export type TonoEstado =
  | 'libre'
  // Usuario o producto activo (mismo ícono de «palomita» que una mesa libre)
  | 'activo'
  | 'ocupada'
  | 'reservada'
  | 'listo'
  | 'cuenta'
  | 'cuenta_abierta'
  | 'agotado'
  | 'stock_bajo'
  | 'carrito'
  // Estados del pedido (`listo` se comparte con el aviso "Pedido listo" del panel)
  | 'registrado'
  | 'enviado'
  | 'pendiente'
  | 'en_preparacion'
  | 'entregado'
  | 'cancelado'
  | 'pagado'
  // Estado que la API envió y la interfaz no reconoce
  | 'desconocido'

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
    <!-- libre / activo: check -->
    <template v-if="tono === 'libre' || tono === 'activo'">
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
    <template v-else-if="tono === 'stock_bajo'">
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4M12 16v.01" />
    </template>
    <!-- en el pedido: carrito -->
    <template v-else-if="tono === 'carrito'">
      <path d="M3 4h2.5l2 11h10l2-8H7" />
      <circle cx="9.5" cy="19" r="1.2" />
      <circle cx="16.5" cy="19" r="1.2" />
    </template>
    <!-- cuenta abierta: nota con renglones -->
    <template v-else-if="tono === 'cuenta_abierta'">
      <path d="M5 4h14v16H5z" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </template>
    <!-- registrado: lápiz sobre hoja -->
    <template v-else-if="tono === 'registrado'">
      <path d="M5 3h9l5 5v13H5z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </template>
    <!-- enviado (y `pendiente` del catálogo de la BD): avión de papel -->
    <template v-else-if="tono === 'enviado' || tono === 'pendiente'">
      <path d="M21 3 10 14" />
      <path d="M21 3l-7 18-4-7-7-4z" />
    </template>
    <!-- en preparación: llama -->
    <template v-else-if="tono === 'en_preparacion'">
      <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2.2-4.6.2 1.4.9 2.2 1.8 2.6C11 8 11.2 5.5 12 3z" />
    </template>
    <!-- entregado: cloche (bandeja servida) -->
    <template v-else-if="tono === 'entregado'">
      <path d="M3 18h18M5 18a7 7 0 0 1 14 0" />
      <path d="M12 8V6M10 6h4" />
    </template>
    <!-- cancelado: círculo tachado -->
    <template v-else-if="tono === 'cancelado'">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </template>
    <!-- pagado: billete -->
    <template v-else-if="tono === 'pagado'">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </template>
    <!-- desconocido: círculo con signo de interrogación -->
    <template v-else-if="tono === 'desconocido'">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.5v.01" />
    </template>
    <!-- pedido listo: campana -->
    <template v-else>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 21h4" />
    </template>
  </svg>
</template>
