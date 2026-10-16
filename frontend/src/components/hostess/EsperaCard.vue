<script setup lang="ts">
// Tarjeta de un grupo de la lista de espera. TODA la tarjeta es un botón (≥ 48 px) que abre sus acciones.
// Personas, nombre, teléfono, hora de registro, tiempo de espera («hace 25 min») y estado (ícono + texto). Cuando el
// grupo pasa del umbral aparece la marca «Espera larga» con ícono y texto (no solo color).
import { computed } from 'vue'
import type { ListaEspera } from '../../types'
import { esperaLarga, textoHaceCuanto, UMBRAL_ESPERA_LARGA_MIN } from '../../utils/espera'
import { formatearHora } from '../../utils/formato'
import InsigniaEspera from './InsigniaEspera.vue'

const props = defineProps<{
  espera: ListaEspera
  /** Hora actual (ms): el tiempo de espera se calcula contra ella y avanza con el reloj de la pantalla. */
  ahora: number
  resaltada?: boolean
}>()
defineEmits<{ seleccionar: [espera: ListaEspera] }>()

const fechaAhora = computed(() => new Date(props.ahora))
const esperando = computed(() => props.espera.estado === 'esperando')
const larga = computed(() => esperando.value && esperaLarga(props.espera.registradoEn, fechaAhora.value))
const hace = computed(() => textoHaceCuanto(props.espera.registradoEn, fechaAhora.value))
</script>

<template>
  <button
    type="button"
    class="espera"
    :class="[`espera--${espera.estado}`, { 'espera--larga': larga, 'espera--final': !esperando, 'espera--resaltada': resaltada }]"
    aria-haspopup="dialog"
    @click="$emit('seleccionar', espera)"
  >
    <span class="espera__personas">
      <strong class="numero espera__cantidad">{{ espera.personas }}</strong>
      <span class="espera__etiqueta">{{ espera.personas === 1 ? 'persona' : 'personas' }}</span>
    </span>

    <span class="espera__cuerpo">
      <strong class="espera__nombre">{{ espera.clienteNombre }}</strong>
      <span class="espera__detalle">
        <span>{{ espera.clienteTelefono ?? 'Sin teléfono' }}</span>
        <span>Registrado {{ formatearHora(espera.registradoEn) }}</span>
      </span>
      <span v-if="esperando" class="espera__hace numero" :class="{ 'espera__hace--larga': larga }">{{ hace }}</span>
    </span>

    <span class="espera__marcas">
      <InsigniaEspera :estado="espera.estado" />
      <span v-if="larga" class="larga">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3 2.5 20h19z" />
          <path d="M12 10v5M12 17.5v.01" />
        </svg>
        Espera larga
        <span class="solo-lectores">(más de {{ UMBRAL_ESPERA_LARGA_MIN }} minutos)</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.espera {
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

.espera:active {
  transform: scale(0.99);
  box-shadow: none;
}

.espera--esperando {
  --estado: var(--color-listo);
}

.espera--asignada {
  --estado: var(--color-libre);
}

.espera--cancelada {
  --estado: var(--color-peligro);
}

/* Espera larga: el borde pasa a rojo (además de la marca con ícono y texto) */
.espera--larga {
  --estado: var(--color-peligro);
}

/* Ya no espera (asignada o cancelada): atenuada (sin sombra) pero con texto legible */
.espera--final {
  background: var(--color-bg);
  box-shadow: none;
}

.espera__personas {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  width: 4.5rem;
  line-height: 1.1;
}

.espera__cantidad {
  font-size: var(--texto-2xl);
  font-weight: 800;
}

.espera__etiqueta {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.espera__cuerpo {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.espera__nombre {
  overflow-wrap: anywhere;
  font-size: var(--texto-lg);
}

.espera__detalle {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--espacio-3);
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.espera__hace {
  color: var(--color-listo-texto);
  font-weight: 700;
}

.espera__hace--larga {
  color: var(--color-peligro-texto);
}

.espera__marcas {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--espacio-2);
}

/* Marca de espera larga: ícono + texto con fondo y borde de peligro (no solo color) */
.larga {
  display: inline-flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: 32px;
  padding: var(--espacio-1) var(--espacio-3);
  border: 2px solid var(--color-peligro);
  border-radius: 999px;
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
  font-size: var(--texto-sm);
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

.larga svg {
  flex: none;
}

.espera--resaltada {
  outline: 4px solid var(--color-primary-dark);
  outline-offset: 2px;
}

/* Tablet vertical: las marcas bajan debajo del nombre para que ningún texto se corte */
@media (max-width: 53.75em) {
  .espera {
    flex-wrap: wrap;
  }

  .espera__cuerpo {
    flex-basis: calc(100% - 6.5rem);
  }

  .espera__marcas {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    margin-left: calc(4.5rem + var(--espacio-4));
  }
}

@media (prefers-reduced-motion: reduce) {
  .espera:active {
    transform: none;
  }
}
</style>
