<script setup lang="ts">
// Hoja de acciones (bottom sheet) de una mesa del Salón, sobre DialogoModal (foco atrapado, Escape, foco de
// regreso a la tarjeta). Tiene dos pasos dentro del MISMO diálogo: «acciones» (estado de la mesa y «Asignar mesa»)
// y «asignar» (elegir el grupo y confirmar). Una mesa ocupada no se asigna: el botón queda con aria-disabled y se
// explica el motivo.
import { computed, nextTick, ref, watch } from 'vue'
import {
  ETIQUETA_ESTADO_MESA,
  ETIQUETA_ESTADO_RESERVACION,
  type ListaEspera,
  type MesaSalon,
  type Reservacion,
} from '../../types'
import { mesaAsignable, motivoMesaNoAsignable } from '../../utils/asignacion'
import { formatearCapacidad, formatearHora } from '../../utils/formato'
import DialogoModal from '../DialogoModal.vue'
import InsigniaEstado from '../InsigniaEstado.vue'
import FormularioAsignar from './FormularioAsignar.vue'

const props = defineProps<{
  mesa: MesaSalon | null
  reservaciones: Reservacion[]
  espera: ListaEspera[]
  ahora: number
  /** Si al cerrar la tarjeta de origen ya no existe (p. ej. el filtro la oculta), el foco va aquí. */
  focoAlternativo?: HTMLElement | null
}>()

const emit = defineEmits<{ cerrar: [] }>()

const dialogo = ref<InstanceType<typeof DialogoModal> | null>(null)
const paso = ref<'acciones' | 'asignar'>('acciones')
const titulo = ref<HTMLElement | null>(null)

const asignable = computed(() => (props.mesa ? mesaAsignable(props.mesa) : false))
const motivo = computed(() => (props.mesa ? motivoMesaNoAsignable(props.mesa) : null))

/** Reservaciones vigentes de la mesa (pendiente o confirmada), para decir para quién está reservada. */
const reservacionesDeLaMesa = computed(() =>
  props.mesa
    ? props.reservaciones.filter(
        (r) => r.idMesa === props.mesa!.idMesa && (r.estado === 'pendiente' || r.estado === 'confirmada'),
      )
    : [],
)

// Cada vez que se abre una mesa, se empieza por el primer paso.
watch(
  () => props.mesa?.idMesa,
  () => {
    paso.value = 'acciones'
  },
)

/** Cambia de paso y lleva el foco al título: teclado y lectores de pantalla saben que cambió el contenido. */
async function irA(siguiente: 'acciones' | 'asignar') {
  paso.value = siguiente
  await nextTick()
  titulo.value?.focus()
}

/** Los botones «deshabilitados» siguen enfocables (para leer el motivo) pero no actúan. */
function bloquear(evento: Event) {
  evento.preventDefault()
}

function alAsignar() {
  dialogo.value?.cerrar()
}
</script>

<template>
  <DialogoModal
    ref="dialogo"
    :abierto="mesa !== null"
    etiqueta-id="hoja-titulo"
    variante="hoja"
    :foco-alternativo="focoAlternativo ?? null"
    @cerrar="emit('cerrar')"
  >
    <div v-if="mesa" class="hoja__contenido">
      <header class="hoja__cabecera">
        <h2 id="hoja-titulo" ref="titulo" tabindex="-1">
          {{ paso === 'asignar' ? `Asignar mesa ${mesa.numero}` : `Mesa ${mesa.numero}` }}
        </h2>
        <InsigniaEstado :tono="mesa.estado" :texto="ETIQUETA_ESTADO_MESA[mesa.estado]" />
      </header>

      <!-- Paso 1: estado de la mesa y acción -->
      <template v-if="paso === 'acciones'">
        <p class="hoja__resumen">{{ formatearCapacidad(mesa.capacidad) }}</p>

        <ul v-if="mesa.estado === 'reservada' && reservacionesDeLaMesa.length > 0" class="hoja__reservas" aria-label="Reservaciones de la mesa">
          <li v-for="r in reservacionesDeLaMesa" :key="r.idReservacion">
            Reservada para <strong>{{ r.clienteNombre }}</strong> a las {{ formatearHora(r.fechaHora) }} ·
            {{ formatearCapacidad(r.personas) }} · {{ ETIQUETA_ESTADO_RESERVACION[r.estado] }}
          </li>
        </ul>

        <div class="hoja__acciones">
          <button
            v-if="asignable"
            type="button"
            class="btn btn--grande hoja__boton"
            autofocus
            @click="irA('asignar')"
          >
            Asignar mesa
          </button>
          <template v-else>
            <button
              type="button"
              class="btn btn--grande hoja__boton"
              aria-disabled="true"
              aria-describedby="hoja-motivo"
              autofocus
              @click="bloquear"
            >
              Asignar mesa
            </button>
            <p id="hoja-motivo" class="hoja__motivo">{{ motivo }}</p>
          </template>

          <button type="button" class="btn btn--secundario btn--grande hoja__boton" @click="dialogo?.cerrar()">Cerrar</button>
        </div>
      </template>

      <!-- Paso 2: elegir el grupo y confirmar -->
      <FormularioAsignar
        v-else
        :mesa="mesa"
        :reservaciones="reservaciones"
        :espera="espera"
        :ahora="ahora"
        @volver="irA('acciones')"
        @asignada="alAsignar"
      />
    </div>
  </DialogoModal>
</template>

<style scoped>
.hoja__contenido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.hoja__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.hoja__cabecera h2:focus {
  outline: none;
}

.hoja__resumen {
  margin: 0;
}

.hoja__reservas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.hoja__acciones {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.hoja__boton {
  width: 100%;
}

.hoja__motivo {
  margin: calc(var(--espacio-1) * -1) 0 0;
  color: var(--color-ocupada-texto);
  font-weight: 600;
}
</style>
