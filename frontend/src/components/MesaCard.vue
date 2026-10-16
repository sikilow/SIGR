<script setup lang="ts">
// Tarjeta de mesa del Panel de mesas. TODA la tarjeta es un botón (≥ 48 px).
// Ocupada: muestra pedidos, total y avisos. Disponible/reservada: solo el estado, atenuada
// con fondo y color de número más suaves (sin bajar el contraste del texto por debajo de AA).
import { computed } from 'vue'
import { ETIQUETA_ESTADO_MESA, ETIQUETA_TIPO_PAGO, type Mesa } from '../types'
import { formatearCapacidad, formatearMoneda, formatearPedidosActivos } from '../utils/formato'
import InsigniaEstado from './InsigniaEstado.vue'

const props = defineProps<{
  mesa: Mesa
  /** Resalta la tarjeta (mesa que acaba de pasar a "pedido listo"). */
  resaltada?: boolean
}>()

defineEmits<{ seleccionar: [mesa: Mesa] }>()

const ocupada = computed(() => props.mesa.estado === 'ocupada')
const cuentaSolicitada = computed(() => props.mesa.estadoCuenta === 'por_pagar')
const hayPedidoListo = computed(() => props.mesa.pedidosListos > 0)
/** "Cuenta solicitada · Pago digital"; sin el tipo de pago (la API no lo envía) solo "Cuenta solicitada". */
const textoCuenta = computed(() =>
  props.mesa.tipoPagoSolicitado
    ? `Cuenta solicitada · ${ETIQUETA_TIPO_PAGO[props.mesa.tipoPagoSolicitado]}`
    : 'Cuenta solicitada',
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

    <InsigniaEstado :tono="mesa.estado" :texto="ETIQUETA_ESTADO_MESA[mesa.estado]" />

    <template v-if="ocupada">
      <span class="mesa__datos">
        <span>{{ formatearPedidosActivos(mesa.pedidosActivos) }}</span>
        <strong class="numero mesa__total">{{ formatearMoneda(mesa.totalCuenta) }}</strong>
      </span>
      <span v-if="hayPedidoListo || cuentaSolicitada" class="mesa__avisos">
        <InsigniaEstado v-if="hayPedidoListo" tono="listo" texto="Pedido listo" />
        <InsigniaEstado v-if="cuentaSolicitada" tono="cuenta" :texto="textoCuenta" ajustar />
      </span>
    </template>
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
  min-height: 150px;
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

.mesa--disponible {
  --estado: var(--color-disponible);
}

.mesa--ocupada {
  --estado: var(--color-ocupada);
}

.mesa--reservada {
  --estado: var(--color-reservada);
}

/* Disponible y reservada: atenuadas (fondo de la página, sin sombra) pero con texto legible */
.mesa--disponible,
.mesa--reservada {
  background: var(--color-bg);
  box-shadow: none;
}

.mesa--disponible .mesa__numero,
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

.mesa__datos {
  display: flex;
  flex-direction: column;
  font-size: var(--texto-sm);
}

.mesa__total {
  font-size: var(--texto-lg);
}

.mesa__avisos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

/* Resaltado de "pedido listo": anillo fijo (sin movimiento) + pulso solo si se permite animar */
.mesa--resaltada {
  outline: 4px solid var(--color-listo);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .mesa:active {
    transform: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .mesa--resaltada {
    animation: pulso-listo 0.8s ease-out 2;
  }
}

@keyframes pulso-listo {
  0% {
    box-shadow: 0 0 0 0 rgb(217 119 6 / 60%);
  }

  100% {
    box-shadow: 0 0 0 16px rgb(217 119 6 / 0%);
  }
}
</style>
