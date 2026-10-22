<script setup lang="ts" generic="T extends MesaConSeccion">
// Cuadrícula de mesas agrupada por sección (Panel del mesero y Salón de la hostess, RF-MES-007). Cada grupo es una
// región con su encabezado (h3: el título de la pantalla es h2) que dice cuántas mesas libres tiene la sección.
// Sin `agrupar` (una sola sección o ninguna) se ve una sola cuadrícula, igual que antes. La tarjeta la pone cada
// pantalla con el slot `mesa`.
import { formatearLibresDe, type GrupoSeccion, type MesaConSeccion } from '../utils/secciones'

defineProps<{
  grupos: GrupoSeccion<T>[]
  agrupar: boolean
  /** Prefijo de los id de los encabezados (único en la pantalla). */
  idBase: string
  /** Ancho mínimo de una tarjeta (CSS), p. ej. `200px`. */
  anchoMinimo: string
}>()

defineSlots<{ mesa(props: { mesa: T }): unknown }>()
</script>

<template>
  <ul v-if="!agrupar" class="cuadricula" :style="{ '--ancho-min-mesa': anchoMinimo }" aria-label="Mesas">
    <template v-for="grupo in grupos" :key="grupo.clave">
      <li v-for="mesa in grupo.mesas" :key="mesa.idMesa">
        <slot name="mesa" :mesa="mesa" />
      </li>
    </template>
  </ul>

  <div v-else class="grupos" :style="{ '--ancho-min-mesa': anchoMinimo }">
    <section v-for="(grupo, i) in grupos" :key="grupo.clave" class="grupo" :aria-labelledby="`${idBase}-${i}`">
      <h3 :id="`${idBase}-${i}`" class="grupo__titulo">
        <span class="grupo__nombre">{{ grupo.nombre }}</span>
        <span class="solo-lectores">,</span>
        <span class="grupo__conteo numero">{{ formatearLibresDe(grupo.libres, grupo.total) }}</span>
      </h3>
      <ul class="cuadricula">
        <li v-for="mesa in grupo.mesas" :key="mesa.idMesa">
          <slot name="mesa" :mesa="mesa" />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.grupos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-6);
}

.grupo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
}

/* Encabezado de sección: nombre fuerte y conteo discreto; una línea de apoyo lo separa de las tarjetas */
.grupo__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: var(--espacio-3);
  row-gap: var(--espacio-1);
  padding-bottom: var(--espacio-2);
  border-bottom: 2px solid var(--color-border);
}

.grupo__nombre {
  min-width: 0;
  overflow-wrap: anywhere;
}

.grupo__conteo {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.cuadricula {
  display: grid;
  /* min(…, 100%): con zoom alto una tarjeta nunca es más ancha que la pantalla (sin scroll horizontal) */
  grid-template-columns: repeat(auto-fill, minmax(min(var(--ancho-min-mesa), 100%), 1fr));
  gap: var(--espacio-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Las tarjetas de una misma fila igualan su altura */
.cuadricula > li {
  display: flex;
}
</style>
