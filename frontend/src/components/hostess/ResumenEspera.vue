<script setup lang="ts">
// Contadores de la lista de espera: grupos que esperan, personas en total y cuántos pasaron del umbral de espera larga.
// Solo cuentan a quienes siguen esperando. Cada contador lleva ícono y texto.
import { UMBRAL_ESPERA_LARGA_MIN, type ResumenEspera } from '../../utils/espera'

defineProps<{ resumen: ResumenEspera }>()
</script>

<template>
  <ul class="resumen" aria-label="Resumen de la lista de espera">
    <li class="resumen__item resumen__item--grupos">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <strong class="numero resumen__numero">{{ resumen.grupos }}</strong>
      <span class="resumen__etiqueta">{{ resumen.grupos === 1 ? 'grupo en espera' : 'grupos en espera' }}</span>
    </li>
    <li class="resumen__item resumen__item--personas">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M16 5.5a3 3 0 0 1 0 5M18 14.5c1.7.8 3 2.6 3 5.5" />
      </svg>
      <strong class="numero resumen__numero">{{ resumen.personas }}</strong>
      <span class="resumen__etiqueta">{{ resumen.personas === 1 ? 'persona en total' : 'personas en total' }}</span>
    </li>
    <li class="resumen__item resumen__item--largas">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3 2.5 20h19z" />
        <path d="M12 10v5M12 17.5v.01" />
      </svg>
      <strong class="numero resumen__numero">{{ resumen.largas }}</strong>
      <span class="resumen__etiqueta">con más de {{ UMBRAL_ESPERA_LARGA_MIN }} min</span>
    </li>
  </ul>
</template>

<style scoped>
.resumen {
  display: grid;
  /* Se adapta al ancho: en pantallas angostas o con zoom las tarjetas pasan a otra fila en vez de partir el texto */
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
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

.resumen__item svg {
  flex: none;
  color: var(--tono);
}

.resumen__item--grupos {
  --tono: var(--color-listo);
}

.resumen__item--personas {
  --tono: var(--color-reservada);
}

.resumen__item--largas {
  --tono: var(--color-peligro);
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

</style>
