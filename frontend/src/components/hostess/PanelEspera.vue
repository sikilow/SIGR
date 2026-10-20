<script setup lang="ts">
// «En espera» del Salón: solo lectura. Nombre, personas y cuánto lleva esperando cada grupo.
import type { ListaEspera } from '../../types'
import { formatearCapacidad, formatearEspera } from '../../utils/formato'

defineProps<{
  espera: ListaEspera[]
  /** Hora actual (ms) que se repinta cada tanto para que el tiempo de espera avance. */
  ahora: number
  error?: boolean
}>()
</script>

<template>
  <section class="panel" aria-labelledby="panel-espera">
    <h3 id="panel-espera">En espera</h3>
    <p v-if="espera.length === 0" class="panel__vacio">
      {{ error ? 'No se pudo cargar la lista de espera.' : 'Nadie está esperando mesa.' }}
    </p>
    <ul v-else class="panel__lista">
      <li v-for="e in espera" :key="e.idEspera" class="item">
        <span class="item__cuerpo">
          <strong class="item__nombre">{{ e.clienteNombre }}</strong>
          <span class="item__detalle">{{ formatearCapacidad(e.personas) }}</span>
        </span>
        <span class="item__tiempo numero">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span><span class="solo-lectores">Espera </span>{{ formatearEspera(e.registradoEn, new Date(ahora)) }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  padding: var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.panel__vacio {
  margin: 0;
  color: var(--color-muted);
}

.panel__lista {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
  min-height: var(--tactil-min);
  padding: var(--espacio-2) 0;
  border-top: 1px solid var(--color-border);
}

.item:first-child {
  border-top: none;
  padding-top: 0;
}

.item__cuerpo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item__nombre {
  overflow-wrap: anywhere;
}

.item__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.item__tiempo {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--espacio-1);
  color: var(--color-listo-texto);
  font-weight: 700;
}
</style>
