<script setup lang="ts">
// Tarjeta de una reservación en la lista. TODA la tarjeta es un botón (≥ 48 px) que abre sus acciones.
// Hora, cliente, teléfono, personas, mesa («Sin mesa» si no tiene) y estado (ícono + texto).
import { computed } from 'vue'
import type { Reservacion } from '../../types'
import { formatearCapacidad, formatearHora } from '../../utils/formato'
import InsigniaReservacion from './InsigniaReservacion.vue'

const props = defineProps<{ reservacion: Reservacion; resaltada?: boolean }>()
defineEmits<{ seleccionar: [reservacion: Reservacion] }>()

const textoMesa = computed(() => (props.reservacion.mesaNumero === null ? 'Sin mesa' : `Mesa ${props.reservacion.mesaNumero}`))
const finalizada = computed(() => props.reservacion.estado === 'llego' || props.reservacion.estado === 'cancelada')
</script>

<template>
  <button
    type="button"
    class="reserva"
    :class="[`reserva--${reservacion.estado}`, { 'reserva--final': finalizada, 'reserva--resaltada': resaltada }]"
    aria-haspopup="dialog"
    @click="$emit('seleccionar', reservacion)"
  >
    <span class="reserva__hora numero">{{ formatearHora(reservacion.fechaHora) }}</span>

    <span class="reserva__cuerpo">
      <strong class="reserva__nombre">{{ reservacion.clienteNombre }}</strong>
      <span class="reserva__detalle">
        <span>{{ reservacion.clienteTelefono ?? 'Sin teléfono' }}</span>
        <span>{{ formatearCapacidad(reservacion.personas) }}</span>
        <span class="reserva__mesa" :class="{ 'reserva__mesa--sin': reservacion.mesaNumero === null }">{{ textoMesa }}</span>
      </span>
    </span>

    <InsigniaReservacion class="reserva__estado" :estado="reservacion.estado" />
  </button>
</template>

<style scoped>
.reserva {
  --estado: var(--color-muted);

  display: flex;
  align-items: center;
  gap: var(--espacio-4);
  width: 100%;
  min-height: 72px;
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-left: 6px solid var(--estado);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: var(--sombra);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    transform 100ms ease-out,
    box-shadow 150ms ease-out;
}

.reserva:active {
  transform: scale(0.99);
  box-shadow: none;
}

.reserva--pendiente {
  --estado: var(--color-listo);
}

.reserva--confirmada {
  --estado: var(--color-reservada);
}

.reserva--llego {
  --estado: var(--color-libre);
}

.reserva--cancelada {
  --estado: var(--color-peligro);
}

/* Ya llegó o se canceló: atenuada (sin sombra) pero con texto legible */
.reserva--final {
  background: var(--color-bg);
  box-shadow: none;
}

.reserva__hora {
  flex: none;
  width: 4.5rem;
  font-size: var(--texto-xl);
  font-weight: 800;
  line-height: 1.2;
}

.reserva__cuerpo {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.reserva__nombre {
  overflow-wrap: anywhere;
  font-size: var(--texto-lg);
}

.reserva__detalle {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--espacio-3);
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.reserva__mesa {
  font-weight: 700;
}

/* «Sin mesa» se distingue por el texto, no solo por el color */
.reserva__mesa--sin {
  font-weight: 400;
}

.reserva__estado {
  flex: none;
}

.reserva--resaltada {
  outline: 4px solid var(--color-primary-dark);
  outline-offset: 2px;
}

/* Tablet vertical: el estado baja debajo del nombre para que ningún texto se corte */
@media (max-width: 53.75em) {
  .reserva {
    flex-wrap: wrap;
  }

  .reserva__cuerpo {
    flex-basis: calc(100% - 6.5rem);
  }

  .reserva__estado {
    margin-left: calc(4.5rem + var(--espacio-4));
  }
}

@media (prefers-reduced-motion: reduce) {
  .reserva:active {
    transform: none;
  }
}

/* ───────── Rediseño v2 «Madalena» ───────── */
.reserva:hover {
  transform: translateY(-1px);
  box-shadow: var(--sombra-alta);
}

.reserva:active {
  transform: scale(0.99);
  box-shadow: none;
}

.reserva__hora {
  font-family: var(--fuente-titulo);
  font-weight: 700;
  letter-spacing: -0.01em;
}

@media (prefers-reduced-motion: reduce) {
  .reserva:hover,
  .reserva:active {
    transform: none;
  }
}
</style>
