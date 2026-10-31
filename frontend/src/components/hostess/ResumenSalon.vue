<script setup lang="ts">
// Contadores del Salón: mesas libres, ocupadas y reservadas (sin pedidos: la hostess no los ve).
import IconoEstado, { type TonoEstado } from '../IconoEstado.vue'

const props = defineProps<{
  libres: number
  ocupadas: number
  reservadas: number
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
  /* Se adapta al ancho: en pantallas angostas o con zoom las tarjetas pasan a otra fila en vez de partir el texto */
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
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

/* ───────── Rediseño v2 «Madalena» ───────── */
.resumen__item {
  box-shadow: var(--sombra);
}

.resumen__numero {
  font-family: var(--fuente-titulo);
  font-size: 2rem;
  font-weight: 700;
}
</style>
