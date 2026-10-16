<script setup lang="ts">
// Sentar a un grupo de la lista de espera (paso del diálogo de Espera). Es el flujo de «Asignar mesa» del Salón con el grupo
// ya elegido: aquí solo se escoge la mesa. Se sugieren las mesas LIBRES, primero las que alcanzan (de la más justa a
// la más grande); si las personas no caben se avisa, sin bloquear. Efecto: la mesa queda ocupada y el grupo pasa a
// «asignada». Lleva Idempotency-Key (el mismo `POST /mesas/{id}/asignar` del Salón).
import { computed, nextTick, ref } from 'vue'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useEsperaStore } from '../../stores/espera'
import type { ListaEspera } from '../../types'
import { mesasSugeridasParaEspera } from '../../utils/espera'
import { formatearCapacidad, formatearEspera } from '../../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'
import { advertenciaCapacidadMesa } from '../../utils/reservaciones'

const props = defineProps<{ espera: ListaEspera }>()

const emit = defineEmits<{
  volver: []
  hecho: []
  ocupado: [enCurso: boolean]
}>()

const store = useEsperaStore()
const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const opciones = computed(() => mesasSugeridasParaEspera(store.mesas, props.espera.personas))
/** La mejor opción: la primera que alcanza (la más justa). */
const idSugerida = computed(() => opciones.value.find((o) => o.alcanza)?.mesa.idMesa ?? null)

const seleccion = ref('')
const intentado = ref(false)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')
const grupo = ref<HTMLFieldSetElement | null>(null)

const mesaElegida = computed(() => store.mesas.find((m) => String(m.idMesa) === seleccion.value) ?? null)
// Si la mesa elegida dejó de estar libre mientras tanto (el salón se actualiza solo), la selección ya no vale.
const mesaVigente = computed(() => (mesaElegida.value && opciones.value.some((o) => o.mesa.idMesa === mesaElegida.value!.idMesa) ? mesaElegida.value : null))
const aviso = computed(() => (mesaVigente.value ? advertenciaCapacidadMesa(mesaVigente.value, props.espera.personas) : null))
const errorMesa = computed(() => (intentado.value && !mesaVigente.value ? 'Elige la mesa en la que se sienta el grupo.' : ''))
const sinMesas = computed(() => opciones.value.length === 0)

function mensajeDeRechazo(e: unknown): string {
  if (e instanceof ErrorServicio) {
    if (e.codigo === 'mesa_no_disponible') return `${e.message} Elige otra mesa.`
    if (e.codigo === 'estado_invalido') return 'Este grupo ya no está esperando (cambió mientras tanto). Revisa la lista, ya se actualizó.'
    if (e.codigo === 'sin_permiso') return 'Tu usuario no tiene permiso para esta acción.'
    return e.message
  }
  return 'Ocurrió un error inesperado.'
}

async function confirmar() {
  if (enCurso.value || sinMesas.value) return
  intentado.value = true
  errorReintentable.value = ''
  rechazo.value = ''
  const mesa = mesaVigente.value
  if (!mesa) {
    await nextTick()
    grupo.value?.querySelector('input')?.focus()
    return
  }

  enCurso.value = true
  emit('ocupado', true)
  try {
    await store.asignar(mesa.idMesa, props.espera.idEspera, claves.para(`asignar-espera|${props.espera.idEspera}|${mesa.idMesa}`))
    claves.soltar()
    void anuncios.anunciar(`Mesa ${mesa.numero} asignada a ${props.espera.clienteNombre}`)
    emit('hecho')
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se duplicará la asignación.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se duplicará la asignación.'
    } else {
      claves.soltar()
      rechazo.value = mensajeDeRechazo(e)
      // La mesa ya no sirve: se vuelve a elegir (la lista de mesas ya se actualizó).
      if (e instanceof ErrorServicio && e.codigo === 'mesa_no_disponible') seleccion.value = ''
    }
  } finally {
    enCurso.value = false
    emit('ocupado', false)
  }
}
</script>

<template>
  <form class="asignar" novalidate :aria-busy="enCurso" @submit.prevent="confirmar">
    <p class="asignar__resumen">
      <strong>{{ espera.clienteNombre }}</strong> · {{ formatearCapacidad(espera.personas) }} · espera {{ formatearEspera(espera.registradoEn, new Date(store.ahora)) }}
    </p>

    <fieldset ref="grupo" class="mesas" :disabled="enCurso" :aria-describedby="errorMesa ? 'error-asignar-espera' : undefined">
      <legend class="mesas__leyenda">Elige la mesa en la que se sienta</legend>

      <label
        v-for="o in opciones"
        :key="o.mesa.idMesa"
        class="opcion"
        :class="{ 'opcion--activa': seleccion === String(o.mesa.idMesa) }"
      >
        <input v-model="seleccion" type="radio" name="mesa-espera" :value="String(o.mesa.idMesa)" />
        <span class="opcion__texto">
          <strong>Mesa {{ o.mesa.numero }} · para {{ o.mesa.capacidad }}</strong>
          <span class="opcion__detalle">
            Libre<template v-if="o.mesa.idMesa === idSugerida"> · <strong class="opcion__sugerida">Sugerida</strong></template
            ><template v-if="!o.alcanza"> · no alcanza para el grupo</template>
          </span>
        </span>
      </label>

      <p v-if="sinMesas" class="mesas__vacio">No hay mesas libres en este momento. El grupo sigue en la lista.</p>
      <p v-if="errorMesa" id="error-asignar-espera" class="texto-error">{{ errorMesa }}</p>
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

    <div class="fila-botones asignar__acciones">
      <button type="button" class="btn btn--secundario btn--grande" :disabled="enCurso" @click="emit('volver')">Volver</button>
      <button
        type="submit"
        class="btn btn--grande"
        :disabled="enCurso"
        :aria-disabled="sinMesas ? 'true' : undefined"
        :aria-describedby="sinMesas ? 'asignar-sin-mesas' : undefined"
      >
        {{ enCurso ? 'Asignando…' : 'Asignar mesa' }}
      </button>
    </div>
    <p v-if="sinMesas" id="asignar-sin-mesas" class="solo-lectores">No hay mesas libres: no se puede asignar mesa ahora.</p>
  </form>
</template>

<style scoped>
.asignar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.asignar__resumen {
  margin: 0;
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

.mesas__vacio {
  margin: 0;
  color: var(--color-ocupada-texto);
  font-weight: 600;
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

.opcion__sugerida {
  color: var(--color-libre-texto);
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

.asignar__acciones > .btn {
  flex: 1 1 12rem;
}

/* «Volver» y «Asignar mesa» siempre a la vista al pie del diálogo */
.asignar__acciones {
  position: sticky;
  bottom: calc(var(--espacio-6) * -1);
  z-index: 1;
  margin-bottom: calc(var(--espacio-6) * -1);
  padding: var(--espacio-3) 0 var(--espacio-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.asignar__acciones > .btn[aria-disabled='true'] {
  cursor: not-allowed;
}
</style>
