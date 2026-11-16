<script setup lang="ts">
// «Próximas reservaciones» (confirmadas) y «Solicitudes por confirmar» (pendientes) del Salón: solo lectura.
// Hora, nombre, personas y mesa (si ya tiene).
import { ETIQUETA_ESTADO_RESERVACION, type Reservacion } from '../../types'
import { formatearCapacidad, formatearHora } from '../../utils/formato'

withDefaults(defineProps<{ reservaciones: Reservacion[]; error?: boolean; titulo?: string; vacio?: string }>(), {
  titulo: 'Próximas reservaciones',
  vacio: 'No hay reservaciones confirmadas.',
})
</script>

<template>
  <section class="panel" aria-labelledby="panel-reservaciones">
    <h3 id="panel-reservaciones">{{ titulo }}</h3>
    <p v-if="reservaciones.length === 0" class="panel__vacio">
      {{ error ? 'No se pudieron cargar las reservaciones.' : vacio }}
    </p>
    <ul v-else class="panel__lista">
      <li v-for="r in reservaciones" :key="r.idReservacion" class="item">
        <span class="item__hora numero">{{ formatearHora(r.fechaHora) }}</span>
        <span class="item__cuerpo">
          <strong class="item__nombre">{{ r.clienteNombre }}</strong>
          <span class="item__detalle">
            {{ formatearCapacidad(r.personas) }} ·
            {{ r.mesaNumero === null ? 'Sin mesa' : `Mesa ${r.mesaNumero}` }} ·
            {{ ETIQUETA_ESTADO_RESERVACION[r.estado] }}
          </span>
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
  gap: var(--espacio-3);
  min-height: var(--tactil-min);
  padding: var(--espacio-2) 0;
  border-top: 1px solid var(--color-border);
}

.item:first-child {
  border-top: none;
  padding-top: 0;
}

.item__hora {
  flex: none;
  min-width: 3.5rem;
  color: var(--color-reservada-texto);
  font-size: var(--texto-lg);
  font-weight: 800;
  line-height: 1.3;
}

.item__cuerpo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item__nombre,
.item__detalle {
  overflow-wrap: anywhere;
}

.item__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}
</style>
