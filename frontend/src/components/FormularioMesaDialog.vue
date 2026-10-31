<script setup lang="ts">
// Alta y edición de una mesa (gerente): número, capacidad, sección obligatoria y disponibilidad.
// `mesa = null` crea. Al editar solo se manda lo que cambió. «Disponible» desmarcado = la mesa no aparece
// para la hostess ni para el mesero (no se puede sentar ni reservar); las mesas no se borran.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import { MESA_CAPACIDAD_MAX, MESA_NUMERO_MAX, MESA_ZONA_MAX, type CambioMesa, type MesaAdmin, type SeccionAdmin } from '../types'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{
  abierto: boolean
  mesa: MesaAdmin | null
  /** Solo se puede asignar una sección activa; la sección actual inhabilitada se muestra para permitir mover la mesa. */
  secciones: SeccionAdmin[]
  /** Número propuesto al crear (el siguiente al más alto). */
  siguienteNumero: number
  origenFoco?: HTMLElement | null
}>()

const emit = defineEmits<{ cerrar: []; guardado: [mesa: MesaAdmin, creada: boolean] }>()

const numero = ref('')
const capacidad = ref('')
const zona = ref('')
const activa = ref(true)
const plantaBaja = ref(false)
const espacioCarriola = ref(false)
const sinEscaleras = ref(false)
const tocado = ref(false)
const enCurso = ref(false)
const errorServidor = ref('')

const editando = computed(() => props.mesa !== null)
const opcionesSeccion = computed(() => {
  const actuales = props.secciones.filter((s) => s.activa)
  const actualInhabilitada = props.secciones.find((s) => !s.activa && s.nombre === props.mesa?.zona)
  return actualInhabilitada ? [...actuales, actualInhabilitada] : actuales
})

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    const m = props.mesa
    numero.value = m ? String(m.numero) : String(props.siguienteNumero)
    capacidad.value = m ? String(m.capacidad) : ''
    zona.value = m?.zona ?? ''
    activa.value = m?.activa ?? true
    plantaBaja.value = m?.plantaBaja ?? false
    espacioCarriola.value = m?.espacioCarriola ?? false
    sinEscaleras.value = m?.sinEscaleras ?? false
    tocado.value = false
    enCurso.value = false
    errorServidor.value = ''
  },
)

const aNumero = (t: string): number => (t.trim() === '' ? Number.NaN : Number(t))

const errores = computed(() => {
  const e: Record<string, string> = {}
  const n = aNumero(numero.value)
  if (Number.isNaN(n)) e.numero = 'Escribe el número de la mesa.'
  else if (!Number.isInteger(n) || n < 1) e.numero = 'Escribe un número entero mayor a 0.'
  else if (n > MESA_NUMERO_MAX) e.numero = `Máximo ${MESA_NUMERO_MAX}.`
  const c = aNumero(capacidad.value)
  if (Number.isNaN(c)) e.capacidad = 'Escribe cuántas personas caben.'
  else if (!Number.isInteger(c) || c < 1) e.capacidad = 'Escribe un número entero mayor a 0.'
  else if (c > MESA_CAPACIDAD_MAX) e.capacidad = `Máximo ${MESA_CAPACIDAD_MAX} personas.`
  if (!zona.value.trim()) e.zona = 'Selecciona una sección.'
  else if (zona.value.trim().length > MESA_ZONA_MAX) e.zona = `Máximo ${MESA_ZONA_MAX} caracteres.`
  else if (!props.secciones.some((s) => s.nombre === zona.value.trim() && s.activa) && zona.value.trim() !== props.mesa?.zona) {
    e.zona = 'Selecciona una sección activa.'
  }
  return e
})

const campoErr = (k: string) => (tocado.value ? (errores.value[k] ?? '') : '')

function cambios(): CambioMesa {
  const m = props.mesa
  if (!m) return {}
  const c: CambioMesa = {}
  if (aNumero(numero.value) !== m.numero) c.numero = aNumero(numero.value)
  if (aNumero(capacidad.value) !== m.capacidad) c.capacidad = aNumero(capacidad.value)
  if (zona.value.trim() !== (m.zona ?? '')) c.zona = zona.value
  if (plantaBaja.value !== m.plantaBaja) c.plantaBaja = plantaBaja.value
  if (espacioCarriola.value !== m.espacioCarriola) c.espacioCarriola = espacioCarriola.value
  if (sinEscaleras.value !== m.sinEscaleras) c.sinEscaleras = sinEscaleras.value
  if (activa.value !== m.activa) c.activa = activa.value
  return c
}

async function guardar() {
  if (enCurso.value) return
  tocado.value = true
  const primero = ['numero', 'capacidad', 'zona'].find((k) => errores.value[k])
  if (primero) {
    document.getElementById(`mesa-${primero}`)?.focus()
    return
  }
  errorServidor.value = ''
  enCurso.value = true
  try {
    if (props.mesa) {
      const c = cambios()
      if (Object.keys(c).length === 0) {
        emit('cerrar')
        return
      }
      emit('guardado', await servicios.catalogo.actualizarMesa(props.mesa.idMesa, c), false)
    } else {
      emit(
        'guardado',
        await servicios.catalogo.crearMesa({
          numero: aNumero(numero.value),
          capacidad: aNumero(capacidad.value),
          zona: zona.value,
          plantaBaja: plantaBaja.value,
          espacioCarriola: espacioCarriola.value,
          sinEscaleras: sinEscaleras.value,
          activa: activa.value,
        }),
        true,
      )
    }
  } catch (e) {
    errorServidor.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="form-mesa-titulo" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <form class="form" novalidate @submit.prevent="guardar">
      <h2 id="form-mesa-titulo">{{ editando ? `Editar mesa ${mesa?.numero}` : 'Nueva mesa' }}</h2>

      <div class="form__fila">
        <div class="campo">
          <label for="mesa-numero">Número de mesa</label>
          <input id="mesa-numero" v-model="numero" type="text" inputmode="numeric" autocomplete="off" autofocus
            :aria-invalid="campoErr('numero') ? 'true' : undefined" :aria-describedby="campoErr('numero') ? 'mesa-numero-e' : undefined" />
          <p v-if="campoErr('numero')" id="mesa-numero-e" class="texto-error form__error">{{ campoErr('numero') }}</p>
        </div>

        <div class="campo">
          <label for="mesa-capacidad">Cantidad de personas</label>
          <input id="mesa-capacidad" v-model="capacidad" type="text" inputmode="numeric" autocomplete="off"
            :aria-invalid="campoErr('capacidad') ? 'true' : undefined" :aria-describedby="campoErr('capacidad') ? 'mesa-capacidad-e' : undefined" />
          <p v-if="campoErr('capacidad')" id="mesa-capacidad-e" class="texto-error form__error">{{ campoErr('capacidad') }}</p>
        </div>
      </div>

      <div class="campo">
        <label for="mesa-zona">Sección <span aria-hidden="true">*</span></label>
        <select id="mesa-zona" v-model="zona"
          :aria-invalid="campoErr('zona') ? 'true' : undefined" :aria-describedby="campoErr('zona') ? 'mesa-zona-e' : undefined">
          <option value="" disabled>Selecciona una sección</option>
          <option v-for="seccion in opcionesSeccion" :key="seccion.nombre" :value="seccion.nombre" :disabled="!seccion.activa">
            {{ seccion.nombre }}{{ seccion.activa ? '' : ' (inhabilitada)' }}
          </option>
        </select>
        <p v-if="campoErr('zona')" id="mesa-zona-e" class="texto-error form__error">{{ campoErr('zona') }}</p>
      </div>

      <fieldset class="campo">
        <legend>Características de acceso</legend>
        <div class="form__accesos">
          <label class="opcion-acceso">
            <input v-model="plantaBaja" type="checkbox" />
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 21V5a2 2 0 0 1 2-2h9M9 21h11M4 12h11M19 8v13" />
            </svg>
            <span>Planta baja</span>
          </label>
          <label class="opcion-acceso">
            <input v-model="espacioCarriola" type="checkbox" />
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 4h2.2l1.6 9.5h10.5L20 7H6" />
              <circle cx="9" cy="19" r="1.6" />
              <circle cx="17" cy="19" r="1.6" />
              <path d="M12 4v4" />
            </svg>
            <span>Espacio para carriola</span>
          </label>
          <label class="opcion-acceso">
            <input v-model="sinEscaleras" type="checkbox" />
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 20h4v-4h4v-4h4V8h4" />
              <circle cx="6" cy="5" r="2" />
            </svg>
            <span>Acceso sin escaleras</span>
          </label>
        </div>
      </fieldset>

      <label class="interruptor form__disponible">
        <input v-model="activa" type="checkbox" />
        <span>
          Disponible
          <span class="form__opcional">Si lo apagas, la mesa no aparece para la hostess ni para el mesero.</span>
        </span>
      </label>

      <div v-if="errorServidor" class="aviso aviso--error" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <p>{{ errorServidor }}</p>
      </div>

      <p class="solo-lectores" role="status">{{ enCurso ? 'Guardando…' : '' }}</p>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Cancelar</button>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">
          {{ enCurso ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear mesa' }}
        </button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--espacio-3); }
.form__fila { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--espacio-3); }

.campo input[aria-invalid='true'], .campo select[aria-invalid='true'] { border-color: var(--color-peligro); }

.form__opcional { display: block; color: var(--color-muted); font-size: var(--texto-sm); font-weight: 400; }
.form__error { margin: 0; font-size: var(--texto-sm); }

.form__disponible {
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface-2);
}

.form__accesos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--espacio-2);
}

.opcion-acceso {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: var(--tactil-min);
  padding: var(--espacio-2) var(--espacio-3);
  border: 2px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-size: var(--texto-sm);
  font-weight: 600;
  cursor: pointer;
}

.opcion-acceso input {
  flex: none;
  width: 22px;
  height: 22px;
  accent-color: var(--color-primary);
}

.opcion-acceso svg {
  flex: none;
  color: var(--color-muted);
}

.opcion-acceso:has(input:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

.opcion-acceso:has(input:checked) svg {
  color: var(--color-primary-dark);
}

.opcion-acceso:has(input:focus-visible) {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 2px;
}
</style>
