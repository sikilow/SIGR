<script setup lang="ts">
// Insignia de estado: SIEMPRE ícono + texto, nunca solo color.
// El color va en el ícono y el borde; el texto usa una variante oscura para contraste AA.
import IconoEstado, { type TonoEstado } from './IconoEstado.vue'

defineProps<{
  tono: TonoEstado
  texto: string
  /** Permite que un texto largo pase a otra línea (p. ej. "Cuenta solicitada · Pago digital"). */
  ajustar?: boolean
}>()
</script>

<template>
  <span class="insignia" :class="[`insignia--${tono}`, { 'insignia--ajustar': ajustar }]">
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
  max-width: 100%;
  line-height: 1.25;
}

/* Textos largos: pasan a otra línea en vez de desbordar la tarjeta */
.insignia--ajustar {
  white-space: normal;
}

.insignia__icono {
  flex: none;
  color: var(--tono);
}

.insignia--libre,
.insignia--activo {
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

/* Cuenta solicitada / abierta: usan el color de marca (no hay token propio de estado) */
.insignia--cuenta,
.insignia--cuenta_abierta {
  --tono: var(--color-primary);
  --tono-texto: var(--color-primary-dark);
}

/* Estados del pedido: cada uno con su ícono y su par color/texto oscuro */
.insignia--registrado {
  --tono: var(--color-registrado);
  --tono-texto: var(--color-registrado-texto);
}

.insignia--enviado,
/* `pendiente` (catálogo de la BD) se ve igual que `enviado` */
.insignia--pendiente {
  --tono: var(--color-enviado);
  --tono-texto: var(--color-enviado-texto);
}

.insignia--en_preparacion {
  --tono: var(--color-preparacion);
  --tono-texto: var(--color-preparacion-texto);
}

.insignia--entregado {
  --tono: var(--color-entregado);
  --tono-texto: var(--color-entregado-texto);
}

.insignia--cancelado {
  --tono: var(--color-peligro);
  --tono-texto: var(--color-peligro-texto);
}

.insignia--pagado {
  --tono: var(--color-pagado);
  --tono-texto: var(--color-pagado-texto);
}

/* Estado que la API envió y la interfaz no reconoce: neutro, con ícono y texto */
.insignia--desconocido {
  --tono: var(--color-muted);
  --tono-texto: var(--color-text);
}
</style>
