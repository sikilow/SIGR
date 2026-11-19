<script setup lang="ts">
// Corrección de los datos de un cliente por el gerente (nombre, lada y teléfono, correo). Manda solo lo que cambió.
// La validación del front es una ayuda: el servidor vuelve a validar todo.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { CambioCliente, ClienteAdmin } from '../types'
import DialogoModal from './DialogoModal.vue'
import SelectorLada from './SelectorLada.vue'
import { errorCorreo, errorNombrePersona, errorTelefono, vPermitir } from '../utils/campos'
import { LADA_PREDETERMINADA, rangoTelefono, textoDigitos } from '../utils/lada'

const props = defineProps<{
  abierto: boolean
  cliente: ClienteAdmin | null
  origenFoco?: HTMLElement | null
}>()

const emit = defineEmits<{ cerrar: []; guardado: [cliente: ClienteAdmin] }>()

const nombre = ref('')
const lada = ref(LADA_PREDETERMINADA)
const telefono = ref('')
const correo = ref('')
const tocado = ref(false)
const enCurso = ref(false)
const errorServidor = ref('')

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    nombre.value = props.cliente?.nombre ?? ''
    lada.value = props.cliente?.lada ?? LADA_PREDETERMINADA
    telefono.value = props.cliente?.telefono ?? ''
    correo.value = props.cliente?.correo ?? ''
    tocado.value = false
    enCurso.value = false
    errorServidor.value = ''
  },
)

const errores = computed(() => {
  const e: Record<string, string> = {}
  const n = errorNombrePersona(nombre.value)
  if (n) e.nombre = n
  const t = errorTelefono(telefono.value, true, lada.value)
  if (t) e.telefono = t
  // El correo es el acceso al portal: se puede corregir pero no quitar.
  const c = errorCorreo(correo.value, true)
  if (c) e.correo = c
  return e
})
const campoErr = (campo: string) => (tocado.value ? errores.value[campo] : undefined)

function cambios(): CambioCliente {
  const c = props.cliente
  if (!c) return {}
  const r: CambioCliente = {}
  if (nombre.value.trim() !== c.nombre) r.nombre = nombre.value
  if (telefono.value.trim() !== (c.telefono ?? '')) r.telefono = telefono.value
  if (lada.value !== c.lada) r.lada = lada.value
  if (correo.value.trim().toLowerCase() !== (c.correo ?? '').toLowerCase()) r.correo = correo.value
  return r
}

async function guardar() {
  if (enCurso.value || !props.cliente) return
  tocado.value = true
  if (Object.keys(errores.value).length > 0) {
    const primero = ['nombre', 'telefono', 'correo'].find((k) => errores.value[k])
    document.getElementById(`cli-${primero}`)?.focus()
    return
  }
  const c = cambios()
  if (Object.keys(c).length === 0) {
    emit('cerrar')
    return
  }
  errorServidor.value = ''
  enCurso.value = true
  try {
    emit('guardado', await servicios.clientes.actualizar(props.cliente.idCliente, c))
  } catch (e) {
    errorServidor.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="form-cliente-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <form class="form" novalidate @submit.prevent="guardar">
      <h2 id="form-cliente-titulo">Editar a {{ cliente?.nombre }}</h2>

      <div class="campo">
        <label for="cli-nombre">Nombre completo</label>
        <input id="cli-nombre" v-permitir="'nombre'" v-model="nombre" type="text" autocomplete="off" autofocus maxlength="100"
          :aria-invalid="campoErr('nombre') ? 'true' : undefined" :aria-describedby="campoErr('nombre') ? 'cli-nombre-e' : undefined" />
        <p v-if="campoErr('nombre')" id="cli-nombre-e" class="texto-error form__error">{{ campoErr('nombre') }}</p>
      </div>

      <div class="campo">
        <label for="cli-telefono">Teléfono ({{ textoDigitos(lada) }})</label>
        <div class="telefono-fila">
          <SelectorLada v-model="lada" />
          <input id="cli-telefono" v-permitir="'digitos'" v-model="telefono" type="tel" inputmode="numeric" autocomplete="off" :maxlength="rangoTelefono(lada).max"
            :aria-invalid="campoErr('telefono') ? 'true' : undefined" :aria-describedby="campoErr('telefono') ? 'cli-telefono-e' : undefined" />
        </div>
        <p v-if="campoErr('telefono')" id="cli-telefono-e" class="texto-error form__error">{{ campoErr('telefono') }}</p>
      </div>

      <div class="campo">
        <label for="cli-correo">Correo</label>
        <input id="cli-correo" v-permitir="'correo'" v-model="correo" type="email" autocomplete="off" maxlength="120" spellcheck="false"
          :aria-invalid="campoErr('correo') ? 'true' : undefined" :aria-describedby="campoErr('correo') ? 'cli-correo-e' : 'cli-correo-ayuda'" />
        <p id="cli-correo-ayuda" class="form__ayuda">
          <template v-if="cliente?.tieneCuenta">Es el correo con el que entra al portal: si lo cambias, entrará con el nuevo.</template>
          <template v-else>Se usa para avisarle de sus reservaciones.</template>
        </p>
        <p v-if="campoErr('correo')" id="cli-correo-e" class="texto-error form__error">{{ campoErr('correo') }}</p>
      </div>

      <div v-if="errorServidor" class="form__alerta" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <p>{{ errorServidor }}</p>
      </div>

      <p class="solo-lectores" role="status">{{ enCurso ? 'Guardando…' : '' }}</p>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Cancelar</button>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">{{ enCurso ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--espacio-3); }
.campo input[aria-invalid='true'] { border-color: var(--color-peligro); }
.form__ayuda { margin: 0; color: var(--color-muted); font-size: var(--texto-sm); font-weight: 400; }
.form__error { margin: 0; font-size: var(--texto-sm); }
.form__alerta { display: flex; gap: var(--espacio-3); padding: var(--espacio-3) var(--espacio-4); border: 2px solid var(--color-peligro); border-radius: var(--radio); background: var(--color-peligro-fondo); color: var(--color-peligro-texto); }
.form__alerta svg { flex: none; margin-top: var(--espacio-1); }
.form__alerta p { margin: 0; color: var(--color-text); font-weight: 600; }
</style>
