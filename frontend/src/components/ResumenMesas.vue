<script setup lang="ts">
// Contadores del panel: mesas por estado y pedidos listos por servir.
import IconoEstado, { type TonoEstado } from './IconoEstado.vue'

const props = defineProps<{
  libres: number
  ocupadas: number
  reservadas: number
  pedidosListos: number
}>()

interface Contador {
  tono: TonoEstado
  etiqueta: string
  valor: number
}

const contadores = (): Contador[] => [
  { tono: 'libre', etiqueta: 'Libres', valor: props.libres },
  { tono: 'ocupada', etiqueta: 'Ocupadas', valor: props.ocupadas },
  { tono: 'reservada', etiqueta: 'Reservadas', valor: props.reservadas },
  { tono: 'listo', etiqueta: 'Pedidos listos por servir', valor: props.pedidosListos },
]
</script>

<template>
  <ul class="resumen" aria-label="Resumen de mesas">
    <li v-for="c in contadores()" :key="c.tono" class="resumen__item" :class="`resumen__item--${c.tono}`">
      <IconoEstado class="resumen__icono" :tono="c.tono" :tamano="24" />
      <strong class="numero resumen__numero">{{ c.valor }}</strong>
      <span class="resumen__etiqueta">{{ c.etiqueta }}</span>
    </li>
  </ul>
</template>

<style scoped>
.resumen {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.resumen__item {
  --tono: var(--color-muted);

  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  min-width: 0;
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-left: 6px solid var(--tono);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.resumen__item--libre {
  --tono: var(--color-libre);
}

.resumen__item--ocupada {
  --tono: var(--color-ocupada);
}

.resumen__item--reservada {
  --tono: var(--color-reservada);
}

.resumen__item--listo {
  --tono: var(--color-listo);
}

.resumen__icono {
  flex: none;
  color: var(--tono);
}

.resumen__numero {
  font-size: var(--texto-xl);
  line-height: 1;
}

.resumen__etiqueta {
  min-width: 0;
  font-size: var(--texto-sm);
  line-height: 1.2;
}

/* Tablet vertical (768 px): dos columnas para que los textos no se corten */
@media (max-width: 860px) {
  .resumen {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
