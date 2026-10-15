<script setup lang="ts">
// Insignia de estado: SIEMPRE ícono + texto, nunca solo color.
// El color va en el ícono y el borde; el texto usa una variante oscura para contraste AA.
import IconoEstado, { type TonoEstado } from './IconoEstado.vue'

defineProps<{
  tono: TonoEstado
  texto: string
}>()
</script>

<template>
  <span class="insignia" :class="`insignia--${tono}`">
    <IconoEstado class="insignia__icono" :tono="tono" />
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
  white-space: nowrap;
}

.insignia__icono {
  flex: none;
  color: var(--tono);
}

.insignia--libre {
  --tono: var(--color-libre);
  --tono-texto: var(--color-libre-texto);
}

.insignia--ocupada {
  --tono: var(--color-ocupada);
  --tono-texto: var(--color-ocupada-texto);
}

.insignia--reservada {
  --tono: var(--color-reservada);
  --tono-texto: var(--color-reservada-texto);
}

.insignia--listo {
  --tono: var(--color-listo);
  --tono-texto: var(--color-listo-texto);
}

/* Agotado: rojo de error */
.insignia--agotado {
  --tono: var(--color-error);
  --tono-texto: var(--color-ocupada-texto);
}

/* En el pedido: color de marca */
.insignia--carrito {
  --tono: var(--color-primary);
  --tono-texto: var(--color-primary-dark);
}

/* Cuenta solicitada: usa el color de marca (no hay token propio de estado) */
.insignia--cuenta {
  --tono: var(--color-primary);
  --tono-texto: var(--color-primary-dark);
}
</style>
