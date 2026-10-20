<script setup lang="ts">
// Insignia del estado de una reservación: SIEMPRE ícono + texto, nunca solo color. El color va en el ícono y el borde;
// el texto usa la variante oscura de la paleta (contraste AA sobre blanco).
import { computed } from 'vue'
import { ETIQUETA_ESTADO_RESERVACION, type EstadoReservacion } from '../../types'

const props = defineProps<{ estado: EstadoReservacion }>()

const texto = computed(() => ETIQUETA_ESTADO_RESERVACION[props.estado])
</script>

<template>
  <span class="insignia" :class="`insignia--${estado}`">
    <svg
      class="insignia__icono"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <!-- pendiente: reloj -->
      <template v-if="estado === 'pendiente'">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </template>
      <!-- confirmada: calendario con palomita -->
      <template v-else-if="estado === 'confirmada'">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M8 3v4M16 3v4M9 15l2 2 4-4" />
      </template>
      <!-- llegó: persona con palomita -->
      <template v-else-if="estado === 'llego'">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6 1.3 0 2.5.4 3.4 1.1M15 17l2 2 4-4" />
      </template>
      <!-- cancelada: círculo tachado -->
      <template v-else-if="estado === 'cancelada'">
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6M15 9l-6 6" />
      </template>
      <!-- desconocido: signo de interrogación -->
      <template v-else>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.5v.01" />
      </template>
    </svg>
    <span>{{ texto }}</span>
  </span>
</template>

<style scoped>
.insignia {
  --tono: var(--color-muted);
  --tono-texto: var(--color-text);

  display: inline-flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: 32px;
  padding: var(--espacio-1) var(--espacio-3);
  border: 2px solid var(--tono);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--tono-texto);
  font-size: var(--texto-sm);
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

.insignia__icono {
  flex: none;
  color: var(--tono);
}

.insignia--pendiente {
  --tono: var(--color-listo);
  --tono-texto: var(--color-listo-texto);
}

.insignia--confirmada {
  --tono: var(--color-reservada);
  --tono-texto: var(--color-reservada-texto);
}

.insignia--llego {
  --tono: var(--color-libre);
  --tono-texto: var(--color-libre-texto);
}

.insignia--cancelada {
  --tono: var(--color-peligro);
  --tono-texto: var(--color-peligro-texto);
}
</style>
