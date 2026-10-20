<script setup lang="ts">
// Registrar la llegada de una reservación (paso del diálogo de Reservaciones). Es el mismo efecto que «Asignar mesa»
// del Salón con una reservación: la reservación pasa a «Llegó» (llena llegada_en) y la mesa queda ocupada. Si la
// reservación ya tiene mesa y está disponible, solo se confirma; si no tiene (o ya no está disponible), se pide elegirla.
// Reutiliza las reglas de `utils/asignacion.ts` y `utils/reservaciones.ts`. Lleva Idempotency-Key.
import { computed, nextTick, ref } from 'vue'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useReservacionesStore } from '../../stores/reservaciones'
import type { Reservacion } from '../../types'
import { mesaAsignable, motivoMesaNoAsignable } from '../../utils/asignacion'
import { formatearCapacidad, formatearHora } from '../../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'
import { advertenciaCapacidadMesa, mesasParaReservacion } from '../../utils/reservaciones'

const props = defineProps<{ reservacion: Reservacion }>()

const emit = defineEmits<{
  volver: []
  hecho: []
  ocupado: [enCurso: boolean]
}>()

const store = useReservacionesStore()
const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const mesaPropia = computed(() => store.mesas.find((m) => m.idMesa === props.reservacion.idMesa) ?? null)
const propiaDisponible = computed(() => (mesaPropia.value ? mesaAsignable(mesaPropia.value) : false))
const motivoPropia = computed(() => (mesaPropia.value ? motivoMesaNoAsignable(mesaPropia.value) : null))

/** Se elige mesa cuando la reservación no tiene o la suya ya no está disponible; también si la persona lo pide. */
const eligiendo = ref(!(props.reservacion.idMesa !== null && propiaDisponible.value))
const seleccion = ref<string>(props.reservacion.idMesa !== null && propiaDisponible.value ? String(props.reservacion.idMesa) : '')
const intentado = ref(false)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')
const grupo = ref<HTMLFieldSetElement | null>(null)

const opciones = computed(() => mesasParaReservacion(store.mesas, props.reservacion.personas, props.reservacion.idMesa))
const mesaDestino = computed(() => {
  if (!eligiendo.value) return mesaPropia.value
  return store.mesas.find((m) => String(m.idMesa) === seleccion.value) ?? null
})
const aviso = computed(() => (mesaDestino.value ? advertenciaCapacidadMesa(mesaDestino.value, props.reservacion.personas) : null))
const errorMesa = computed(() => (intentado.value && eligiendo.value && !mesaDestino.value ? 'Elige la mesa en la que se sienta la reservación.' : ''))

async function elegirOtra() {
  eligiendo.value = true
  await nextTick()
  grupo.value?.querySelector('input')?.focus()
}

function mensajeDeRechazo(e: unknown): string {
  if (e instanceof ErrorServicio) {
    if (e.codigo === 'mesa_no_disponible') return `${e.message} Elige otra mesa.`
    if (e.codigo === 'estado_invalido') return 'Esta reservación ya no admite registrar la llegada (cambió mientras tanto).'
    if (e.codigo === 'sin_permiso') return 'Tu usuario no tiene permiso para esta acción.'
    return e.message
  }
  return 'Ocurrió un error inesperado.'
}

async function confirmar() {
  if (enCurso.value) return
  intentado.value = true
  errorReintentable.value = ''
  rechazo.value = ''
  const destino = mesaDestino.value
  if (!destino) {
    await nextTick()
    grupo.value?.querySelector('input')?.focus()
    return
  }

  enCurso.value = true
  emit('ocupado', true)
  // Sin elegir otra mesa se manda null: la API usa la mesa que la reservación ya tiene.
  const idMesa = eligiendo.value ? destino.idMesa : null
  try {
    await store.registrarLlegada(props.reservacion.idReservacion, idMesa, claves.para(`llegada|${props.reservacion.idReservacion}|${idMesa}`))
    claves.soltar()
    void anuncios.anunciar(`Llegada registrada: ${props.reservacion.clienteNombre} en la mesa ${destino.numero}`)
    emit('hecho')
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se duplicará el registro.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se duplicará el registro.'
    } else {
      claves.soltar()
      rechazo.value = mensajeDeRechazo(e)
      // La mesa ya no sirve: se pasa a elegir otra (la lista de mesas ya se actualizó).
      if (e instanceof ErrorServicio && e.codigo === 'mesa_no_disponible') {
        eligiendo.value = true
        seleccion.value = ''
      }
    }
  } finally {
    enCurso.value = false
    emit('ocupado', false)
  }
}
</script>

<template>
  <form class="llegada" novalidate :aria-busy="enCurso" @submit.prevent="confirmar">
    <p class="llegada__resumen">
      <strong>{{ reservacion.clienteNombre }}</strong> · {{ formatearCapacidad(reservacion.personas) }} · reservó para las
      {{ formatearHora(reservacion.fechaHora) }}
    </p>

    <!-- La mesa que ya tenía la reservación -->
    <template v-if="!eligiendo && mesaPropia">
      <p class="llegada__mesa">
        Se sienta en la <strong>mesa {{ mesaPropia.numero }}</strong> (para {{ mesaPropia.capacidad }}). Al registrar la llegada la mesa quedará
        ocupada.
      </p>
      <button type="button" class="btn btn--secundario" :disabled="enCurso" @click="elegirOtra">Elegir otra mesa</button>
    </template>

    <!-- Elegir mesa -->
    <fieldset v-else ref="grupo" class="mesas" :disabled="enCurso" :aria-describedby="errorMesa ? 'error-llegada-mesa' : undefined">
      <legend class="mesas__leyenda">
        {{ reservacion.idMesa === null ? 'Esta reservación no tiene mesa: elige una' : 'Elige la mesa en la que se sienta' }}
      </legend>
      <p v-if="reservacion.idMesa !== null && motivoPropia" class="mesas__motivo">{{ motivoPropia }}</p>

      <label
        v-for="o in opciones"
        :key="o.mesa.idMesa"
        class="opcion"
        :class="{ 'opcion--activa': seleccion === String(o.mesa.idMesa) }"
      >
        <input v-model="seleccion" type="radio" name="mesa-llegada" :value="String(o.mesa.idMesa)" />
        <span class="opcion__texto">
          <strong>Mesa {{ o.mesa.numero }} · para {{ o.mesa.capacidad }}</strong>
          <span class="opcion__detalle">
            {{ o.mesa.estado === 'reservada' ? 'Reservada para esta reservación' : 'Libre' }}{{ o.alcanza ? '' : ' · no alcanza para el grupo' }}
          </span>
        </span>
      </label>
      <p v-if="opciones.length === 0" class="mesas__vacio">No hay mesas libres en este momento.</p>
      <p v-if="errorMesa" id="error-llegada-mesa" class="texto-error">{{ errorMesa }}</p>
    </fieldset>

    <!-- Aviso de capacidad (no bloquea): región en vivo persistente -->
    <div class="advertencias" role="status" aria-live="polite">
      <p v-if="aviso" class="advertencia">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3 2.5 20h19z" />
          <path d="M12 10v5M12 17.5v.01" />
        </svg>
        <span><strong>Aviso:</strong> {{ aviso }}</span>
      </p>
    </div>

    <p v-if="errorReintentable" class="texto-error" role="alert">{{ errorReintentable }}</p>
    <div v-if="rechazo" class="aviso" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>{{ rechazo }}</p>
    </div>

    <div class="fila-botones llegada__acciones">
      <button type="button" class="btn btn--secundario btn--grande" :disabled="enCurso" @click="emit('volver')">Volver</button>
      <button type="submit" class="btn btn--grande" :disabled="enCurso">{{ enCurso ? 'Registrando…' : 'Registrar llegada' }}</button>
    </div>
  </form>
</template>

<style scoped>
.llegada {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.llegada__resumen,
.llegada__mesa {
  margin: 0;
}

.llegada > .btn {
  align-self: flex-start;
}

.mesas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.mesas__leyenda {
  padding: 0;
  margin-bottom: var(--espacio-2);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.mesas__motivo {
  margin: 0 0 var(--espacio-2);
  color: var(--color-ocupada-texto);
  font-weight: 600;
}

.mesas__vacio {
  margin: 0;
  color: var(--color-muted);
}

/* Cada mesa es una fila grande y táctil; la elegida lleva borde grueso + el punto del radio (no solo color) */
.opcion {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  min-height: 56px;
  padding: var(--espacio-2) var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  cursor: pointer;
  touch-action: manipulation;
}

.opcion--activa {
  border-color: var(--color-primary-dark);
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-primary-dark);
}

.opcion:has(input:focus-visible) {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.opcion input {
  flex: none;
  width: 24px;
  height: 24px;
  margin: 0;
  accent-color: var(--color-primary-dark);
}

.opcion input:focus-visible {
  outline: none;
}

.opcion__texto {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.opcion__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.advertencias:empty {
  display: none;
}

.advertencia {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-3);
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-listo);
  border-radius: var(--radio-sm);
  background: var(--color-listo-fondo);
  color: var(--color-listo-texto);
}

.advertencia svg {
  flex: none;
  margin-top: var(--espacio-1);
}

.texto-error {
  margin: 0;
}

.llegada__acciones > .btn {
  flex: 1 1 12rem;
}

/* «Volver» y «Registrar llegada» siempre a la vista al pie del diálogo */
.llegada__acciones {
  position: sticky;
  bottom: calc(var(--espacio-6) * -1);
  z-index: 1;
  margin-bottom: calc(var(--espacio-6) * -1);
  padding: var(--espacio-3) 0 var(--espacio-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
</style>
