<script setup lang="ts">
// Tarjeta de mesa del Salón (hostess). TODA la tarjeta es un botón (≥ 48 px). A diferencia de MesaCard (mesero),
// NO muestra pedidos, totales ni cuenta: la hostess solo ve el estado de la mesa. Una mesa reservada muestra la
// hora y el nombre de su reservación para saber de un vistazo para quién es.
import { computed } from 'vue'
import { ETIQUETA_ESTADO_MESA, type MesaSalon, type Reservacion } from '../../types'
import { formatearCapacidad, formatearHora } from '../../utils/formato'
import { ETIQUETA_SIN_SECCION } from '../../utils/secciones'
import InsigniaEstado from '../InsigniaEstado.vue'

const props = defineProps<{
  mesa: MesaSalon
  /** Próxima reservación de la mesa (solo se usa si la mesa está reservada). */
  reservacion?: Reservacion | null
  /** Resalta la tarjeta (mesa cuyo estado cambió hace un momento). */
  resaltada?: boolean
  /** Muestra la sección (solo cuando el salón tiene varias; con una sola, la tarjeta queda como antes). */
  mostrarSeccion?: boolean
}>()

defineEmits<{ seleccionar: [mesa: MesaSalon] }>()

const textoReservacion = computed(() =>
  props.mesa.estado === 'reservada' && props.reservacion
    ? `${formatearHora(props.reservacion.fechaHora)} · ${props.reservacion.clienteNombre}`
    : '',
)
</script>

<template>
  <button
    type="button"
    class="mesa"
    :class="[`mesa--${mesa.estado}`, { 'mesa--resaltada': resaltada }]"
    aria-haspopup="dialog"
    @click="$emit('seleccionar', mesa)"
  >
    <span class="mesa__cabecera">
      <span class="mesa__titulo">
        <span class="mesa__etiqueta">Mesa</span>
        <span class="mesa__numero">{{ mesa.numero }}</span>
      </span>
      <span class="mesa__capacidad">{{ formatearCapacidad(mesa.capacidad) }}</span>
    </span>

    <span v-if="mostrarSeccion" class="mesa__seccion">
      <span v-if="mesa.zona" class="solo-lectores">Sección:</span>
      {{ mesa.zona ?? ETIQUETA_SIN_SECCION }}
    </span>

    <InsigniaEstado :tono="mesa.estado" :texto="ETIQUETA_ESTADO_MESA[mesa.estado]" />

    <span v-if="textoReservacion" class="mesa__reservacion">{{ textoReservacion }}</span>
  </button>
</template>

<style scoped>
.mesa {
  --estado: var(--color-muted);

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--espacio-3);
  width: 100%;
  min-height: 132px;
  padding: var(--espacio-4);
  border: 1px solid var(--color-border);
  border-top: 6px solid var(--estado);
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

.mesa:active {
  transform: scale(0.98);
  box-shadow: none;
}

.mesa--libre {
  --estado: var(--color-libre);
}

.mesa--ocupada {
  --estado: var(--color-ocupada);
}

.mesa--reservada {
  --estado: var(--color-reservada);
}

/* Libre y reservada: atenuadas (fondo de la página, sin sombra) pero con texto legible */
.mesa--libre,
.mesa--reservada {
  background: var(--color-bg);
  box-shadow: none;
}

.mesa--libre .mesa__numero,
.mesa--reservada .mesa__numero {
  color: var(--color-muted);
}

.mesa__cabecera {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--espacio-2);
  width: 100%;
}

.mesa__titulo {
  display: flex;
  align-items: baseline;
  gap: var(--espacio-2);
}

.mesa__etiqueta {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.mesa__numero {
  font-size: var(--texto-2xl);
  font-weight: 800;
  line-height: 1;
}

.mesa__capacidad {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

/* Sección: texto pequeño bajo el número; un nombre largo (hasta 40 caracteres) se parte sin ensanchar la tarjeta */
.mesa__seccion {
  max-width: 100%;
  margin-top: calc(var(--espacio-2) * -1);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.mesa__reservacion {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: var(--texto-sm);
  font-weight: 600;
}

/* Resaltado de cambio reciente: anillo fijo (sin movimiento) + pulso solo si se permite animar */
.mesa--resaltada {
  outline: 4px solid var(--color-primary-dark);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .mesa:active {
    transform: none;
  }
}
</style>
