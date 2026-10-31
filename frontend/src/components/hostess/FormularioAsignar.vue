<script setup lang="ts">
// Asignar mesa (segundo paso de la hoja del Salón). La hostess elige el grupo: una reservación pendiente o
// confirmada, un grupo en espera o un grupo sin registro (solo importa cuántas personas son), revisa los avisos
// (nunca bloquean) y confirma. La acción lleva Idempotency-Key: reintentar tras un fallo de red no duplica nada.
import { computed, nextTick, ref, watch } from 'vue'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useSalonStore } from '../../stores/salon'
import {
  ETIQUETA_ESTADO_RESERVACION,
  type GrupoAsignacion,
  type ListaEspera,
  type MesaSalon,
  type Reservacion,
} from '../../types'
import {
  advertenciasAsignacion,
  gruposParaMesa,
  MAX_PERSONAS_SIN_REGISTRO,
  mesaAsignable,
  motivoMesaNoAsignable,
  validarPersonas,
} from '../../utils/asignacion'
import { formatearCapacidad, formatearEspera, formatearHora } from '../../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'

const props = defineProps<{
  mesa: MesaSalon
  reservaciones: Reservacion[]
  espera: ListaEspera[]
  /** Hora actual (ms), para el tiempo de espera de cada grupo. */
  ahora: number
}>()

const emit = defineEmits<{
  volver: []
  asignada: []
}>()

const salon = useSalonStore()
const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const CLAVE_SIN_REGISTRO = 's'

const grupos = computed(() => gruposParaMesa(props.mesa, props.reservaciones, props.espera))
const asignable = computed(() => mesaAsignable(props.mesa))
const motivo = computed(() => motivoMesaNoAsignable(props.mesa))

/** Si la mesa está reservada, su propia reservación llega elegida (un toque menos y sin dudas). */
function seleccionInicial(): string {
  if (props.mesa.estado !== 'reservada') return ''
  const propia = grupos.value.reservaciones.find((r) => r.idMesa === props.mesa.idMesa)
  return propia ? `r:${propia.idReservacion}` : ''
}

const seleccion = ref(seleccionInicial())
const personasTexto = ref('')
const intentado = ref(false)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')
const grupoRef = ref<HTMLFieldSetElement | null>(null)
const campoPersonas = ref<HTMLInputElement | null>(null)
const zonaAvisos = ref<HTMLElement | null>(null)

/** La selección sigue siendo válida solo mientras ese grupo exista en las listas (el salón se actualiza solo). */
const seleccionVigente = computed(() => {
  const s = seleccion.value
  if (s === CLAVE_SIN_REGISTRO) return s
  if (s.startsWith('r:')) return grupos.value.reservaciones.some((r) => `r:${r.idReservacion}` === s) ? s : ''
  if (s.startsWith('e:')) return grupos.value.espera.some((e) => `e:${e.idEspera}` === s) ? s : ''
  return ''
})

const errorPersonas = computed(() => {
  if (seleccionVigente.value !== CLAVE_SIN_REGISTRO) return ''
  if (personasTexto.value.trim() === '' && !intentado.value) return ''
  return validarPersonas(personasTexto.value)
})

const grupoElegido = computed<GrupoAsignacion | null>(() => {
  const s = seleccionVigente.value
  if (s.startsWith('r:')) return { tipo: 'reservacion', idReservacion: Number(s.slice(2)) }
  if (s.startsWith('e:')) return { tipo: 'espera', idEspera: Number(s.slice(2)) }
  if (s === CLAVE_SIN_REGISTRO && validarPersonas(personasTexto.value) === '') {
    return { tipo: 'sinRegistro', personas: Number(personasTexto.value) }
  }
  return null
})

const personasDelGrupo = computed(() => {
  const g = grupoElegido.value
  if (!g) return 0
  if (g.tipo === 'sinRegistro') return g.personas
  if (g.tipo === 'reservacion') return props.reservaciones.find((r) => r.idReservacion === g.idReservacion)?.personas ?? 0
  return props.espera.find((e) => e.idEspera === g.idEspera)?.personas ?? 0
})

const nombreDelGrupo = computed(() => {
  const g = grupoElegido.value
  if (!g) return ''
  if (g.tipo === 'reservacion') return props.reservaciones.find((r) => r.idReservacion === g.idReservacion)?.clienteNombre ?? ''
  if (g.tipo === 'espera') return props.espera.find((e) => e.idEspera === g.idEspera)?.clienteNombre ?? ''
  return `un grupo de ${formatearCapacidad(g.personas)}`
})

const advertencias = computed(() =>
  grupoElegido.value
    ? advertenciasAsignacion(props.mesa, grupoElegido.value, personasDelGrupo.value, props.reservaciones)
    : [],
)

const errorGrupo = computed(() => (intentado.value && grupoElegido.value === null && errorPersonas.value === '' ? 'Elige a quién se le asigna la mesa.' : ''))
const hayGrupos = computed(() => grupos.value.reservaciones.length > 0 || grupos.value.espera.length > 0)

// Un aviso nuevo puede quedar debajo de la lista: se lleva a la vista (sin animación si el usuario lo prefiere).
watch(
  () => advertencias.value.map((a) => a.tipo).join('|'),
  async (claveAvisos) => {
    if (!claveAvisos) return
    await nextTick()
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    zonaAvisos.value?.scrollIntoView({ block: 'nearest', behavior: reducir ? 'auto' : 'smooth' })
  },
)

// Cambiar de grupo cierra los mensajes de un intento anterior.
watch(seleccion, () => {
  errorReintentable.value = ''
  rechazo.value = ''
})

function cambiarPersonas(delta: number) {
  const actual = Number.parseInt(personasTexto.value, 10)
  const base = Number.isFinite(actual) ? actual : 0
  personasTexto.value = String(Math.min(MAX_PERSONAS_SIN_REGISTRO, Math.max(1, base + delta)))
}

function mensajeDeRechazo(e: unknown): string {
  if (e instanceof ErrorServicio) {
    if (e.codigo === 'mesa_no_disponible') return `La mesa ${props.mesa.numero} ya está ocupada. Vuelve al salón y elige otra mesa.`
    if (e.codigo === 'estado_invalido') return 'Ese grupo ya no se puede asignar a esta mesa. Revisa las listas, ya se actualizaron.'
    if (e.codigo === 'sin_permiso') return 'Tu usuario no tiene permiso para asignar mesas.'
    return e.message
  }
  return 'Ocurrió un error inesperado.'
}

async function confirmar() {
  if (enCurso.value) return
  intentado.value = true
  if (!asignable.value) return
  const grupo = grupoElegido.value
  if (!grupo) {
    await nextTick()
    if (seleccionVigente.value === CLAVE_SIN_REGISTRO) campoPersonas.value?.focus()
    else grupoRef.value?.querySelector('input')?.focus()
    return
  }

  enCurso.value = true
  errorReintentable.value = ''
  rechazo.value = ''
  // Misma mesa y mismo grupo = reintento (misma clave); otro grupo = intención nueva.
  const clave = claves.para(`asignar|${props.mesa.idMesa}|${JSON.stringify(grupo)}`)
  const nombre = nombreDelGrupo.value
  try {
    await salon.asignar(props.mesa.idMesa, grupo, clave)
    claves.soltar()
    void anuncios.anunciar(`Mesa ${props.mesa.numero} asignada a ${nombre}`)
    emit('asignada')
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se duplicará la asignación.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se duplicará la asignación.'
    } else {
      claves.soltar()
      rechazo.value = mensajeDeRechazo(e)
    }
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <form class="asignar" novalidate @submit.prevent="confirmar">
    <p class="asignar__resumen">Mesa para {{ formatearCapacidad(mesa.capacidad) }}.</p>

    <!-- La mesa dejó de estar libre mientras la hoja estaba abierta (otra hostess, otro equipo) -->
    <div v-if="!asignable" class="aviso" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>{{ motivo }}</p>
    </div>

    <fieldset
      ref="grupoRef"
      class="grupos"
      :disabled="enCurso"
      :aria-describedby="errorGrupo ? 'error-grupo' : undefined"
    >
      <legend class="grupos__leyenda">¿Quién se sienta en la mesa {{ mesa.numero }}?</legend>

      <template v-if="grupos.reservaciones.length > 0">
        <h3 class="grupos__titulo">Reservaciones</h3>
        <label
          v-for="r in grupos.reservaciones"
          :key="r.idReservacion"
          class="opcion"
          :class="{ 'opcion--activa': seleccionVigente === `r:${r.idReservacion}` }"
        >
          <input v-model="seleccion" type="radio" name="grupo" :value="`r:${r.idReservacion}`" />
          <span class="opcion__texto">
            <strong>{{ formatearHora(r.fechaHora) }} · {{ r.clienteNombre }}</strong>
            <span class="opcion__detalle">
              {{ formatearCapacidad(r.personas) }} ·
              {{ r.mesaNumero === null ? 'Sin mesa' : `Mesa ${r.mesaNumero}` }} ·
              {{ ETIQUETA_ESTADO_RESERVACION[r.estado] }}
            </span>
          </span>
        </label>
      </template>

      <template v-if="grupos.espera.length > 0">
        <h3 class="grupos__titulo">En espera</h3>
        <label
          v-for="e in grupos.espera"
          :key="e.idEspera"
          class="opcion"
          :class="{ 'opcion--activa': seleccionVigente === `e:${e.idEspera}` }"
        >
          <input v-model="seleccion" type="radio" name="grupo" :value="`e:${e.idEspera}`" />
          <span class="opcion__texto">
            <strong>{{ e.clienteNombre }}</strong>
            <span class="opcion__detalle">
              {{ formatearCapacidad(e.personas) }} · Espera {{ formatearEspera(e.registradoEn, new Date(ahora)) }}
            </span>
          </span>
        </label>
      </template>

      <h3 v-if="hayGrupos" class="grupos__titulo">Sin reservación</h3>
      <label class="opcion" :class="{ 'opcion--activa': seleccionVigente === CLAVE_SIN_REGISTRO }">
        <input v-model="seleccion" type="radio" name="grupo" :value="CLAVE_SIN_REGISTRO" />
        <span class="opcion__texto">
          <strong>Grupo sin registro</strong>
          <span class="opcion__detalle">Llegó sin reservar ni anotarse en la lista de espera</span>
        </span>
      </label>

      <div v-if="seleccionVigente === CLAVE_SIN_REGISTRO" class="personas">
        <label class="personas__etiqueta" for="personas-sin-registro">Número de personas</label>
        <div class="personas__control">
          <button type="button" class="btn btn--secundario personas__paso" aria-label="Una persona menos" @click="cambiarPersonas(-1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12" /></svg>
          </button>
          <input
            id="personas-sin-registro"
            ref="campoPersonas"
            v-model="personasTexto"
            class="personas__campo numero"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            :aria-invalid="errorPersonas ? 'true' : undefined"
            aria-describedby="ayuda-personas"
          />
          <button type="button" class="btn btn--secundario personas__paso" aria-label="Una persona más" @click="cambiarPersonas(1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </button>
        </div>
        <p id="ayuda-personas" class="personas__ayuda" :class="{ 'texto-error': errorPersonas }">
          {{ errorPersonas || `La mesa ${mesa.numero} es para ${formatearCapacidad(mesa.capacidad)}.` }}
        </p>
      </div>
    </fieldset>

    <p v-if="errorGrupo" id="error-grupo" class="texto-error" role="alert">{{ errorGrupo }}</p>

    <!-- Región en vivo persistente: los avisos se anuncian al elegir el grupo. No bloquean la asignación. -->
    <div ref="zonaAvisos" class="advertencias" role="status" aria-live="polite">
      <p v-for="a in advertencias" :key="a.tipo" class="advertencia">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3 2.5 20h19z" />
          <path d="M12 10v5M12 17.5v.01" />
        </svg>
        <span><strong>Aviso:</strong> {{ a.texto }}</span>
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
        class="btn btn--grande asignar__confirmar"
        :disabled="enCurso"
        :aria-disabled="!asignable ? 'true' : undefined"
        @click="!asignable && $event.preventDefault()"
      >
        {{ enCurso ? 'Asignando…' : `Asignar mesa ${mesa.numero}` }}
      </button>
    </div>
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

.grupos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.grupos__leyenda {
  padding: 0;
  margin-bottom: var(--espacio-2);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.grupos__titulo {
  margin-top: var(--espacio-2);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* Cada grupo es una fila grande y táctil; el elegido lleva borde grueso + el punto del radio (no solo color) */
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

/* El anillo de foco va en toda la fila (arriba); el radio no dibuja el suyo encima */
.opcion input:focus-visible {
  outline: none;
}

.opcion__texto {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.opcion__texto strong {
  overflow-wrap: anywhere;
}

.opcion__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.personas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px dashed var(--color-muted);
  border-radius: var(--radio-sm);
}

.personas__etiqueta {
  font-weight: 700;
}

.personas__control {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
}

.personas__paso {
  flex: none;
  min-width: var(--tactil-min);
  padding: 0;
}

.personas__campo {
  width: 6rem;
  min-height: var(--tactil-min);
  border: 1.5px solid var(--color-borde-control);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-size: var(--texto-xl);
  font-weight: 700;
  text-align: center;
}

.personas__campo[aria-invalid='true'] {
  border-color: var(--color-error);
}

.personas__ayuda {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.personas__ayuda.texto-error {
  color: var(--color-error);
}

.texto-error {
  margin: 0;
}

.advertencias {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
}

.advertencias:empty {
  display: none;
}

/* Aviso de capacidad o de mesa reservada: ícono + «Aviso:» + texto, borde ámbar. No bloquea nada. */
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

.asignar__acciones > .btn {
  flex: 1 1 12rem;
}

/* «Volver» y «Asignar mesa» quedan siempre a la vista al pie de la hoja, aunque la lista de grupos sea larga */
.asignar__acciones {
  position: sticky;
  bottom: calc(var(--espacio-6) * -1);
  z-index: 1;
  margin-bottom: calc(var(--espacio-6) * -1);
  padding: var(--espacio-3) 0 var(--espacio-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

/* Los avisos y errores que se llevan a la vista no quedan tapados por la barra de botones */
.advertencias,
.texto-error {
  scroll-margin-bottom: 7rem;
}
</style>
