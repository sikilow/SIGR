<script setup lang="ts">
// Aviso breve global ("Pedido #5 cancelado", "Mesa 8: pedido listo"). Vive una sola vez
// en cada layout; no roba el foco y se anuncia por lectores de pantalla.
import { useAnunciosStore } from '../stores/anuncios'

const anuncios = useAnunciosStore()
</script>

<template>
  <div class="avisos" role="status" aria-live="polite" aria-atomic="true">
    <Transition name="aviso">
      <p v-if="anuncios.texto" class="avisos__texto">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </svg>
        {{ anuncios.texto }}
      </p>
    </Transition>
  </div>
</template>

<style scoped>
.avisos {
  position: fixed;
  top: calc(var(--altura-barra-superior) + var(--espacio-3));
  left: 50%;
  z-index: 60;
  width: max-content;
  max-width: min(560px, calc(100% - var(--espacio-8)));
  transform: translateX(-50%);
  pointer-events: none;
}

.avisos__texto {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  margin: 0;
  padding: var(--espacio-3) var(--espacio-5);
  border: 2px solid var(--color-exito);
  border-radius: var(--radio);
  background: var(--color-exito-fondo);
  box-shadow: var(--sombra-elevada);
  color: var(--color-exito-texto);
  font-weight: 650;
  line-height: 1.35;
}

.avisos__texto svg {
  flex: none;
}

.aviso-enter-active,
.aviso-leave-active {
  transition:
    opacity var(--duracion-normal) var(--curva-salida),
    transform var(--duracion-normal) var(--curva-salida);
}

.aviso-enter-from,
.aviso-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .aviso-enter-active,
  .aviso-leave-active {
    transition: none;
  }
}
</style>
