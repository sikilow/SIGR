<script setup lang="ts">
// El gerente restablece la contraseña de otro usuario (no hace falta conocer la anterior).
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import { CONTRASENA_MAX, CONTRASENA_MIN, type UsuarioAdmin } from '../types'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{ abierto: boolean; usuario: UsuarioAdmin | null; origenFoco?: HTMLElement | null }>()
const emit = defineEmits<{ cerrar: []; cambiada: [usuario: UsuarioAdmin] }>()

const nueva = ref('')
const repetir = ref('')
const ver = ref(false)
const tocado = ref(false)
const enCurso = ref(false)
const errorServidor = ref('')

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    nueva.value = ''
    repetir.value = ''
    ver.value = false
    tocado.value = false
    enCurso.value = false
    errorServidor.value = ''
  },
)

const errorNueva = computed(() => {
  if (!tocado.value) return ''
  if (nueva.value.length < CONTRASENA_MIN) return `Mínimo ${CONTRASENA_MIN} caracteres.`
  if (nueva.value.length > CONTRASENA_MAX) return `Máximo ${CONTRASENA_MAX} caracteres.`
  return ''
})
const errorRepetir = computed(() => (tocado.value && !errorNueva.value && repetir.value !== nueva.value ? 'Las contraseñas no coinciden.' : ''))

async function guardar() {
  const u = props.usuario
  if (enCurso.value || !u) return
  tocado.value = true
  if (nueva.value.length < CONTRASENA_MIN || nueva.value.length > CONTRASENA_MAX) {
    document.getElementById('pw-nueva')?.focus()
    return
  }
  if (repetir.value !== nueva.value) {
    document.getElementById('pw-repetir')?.focus()
    return
  }
  errorServidor.value = ''
  enCurso.value = true
  try {
    await servicios.usuarios.cambiarContrasena(u.id, nueva.value)
    emit('cambiada', u)
  } catch (e) {
    errorServidor.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="pw-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <form v-if="usuario" class="form" novalidate @submit.prevent="guardar">
      <h2 id="pw-titulo">Cambiar contraseña de {{ usuario.nombre }}</h2>
      <p class="form__texto">Usuario: <strong>{{ usuario.usuario }}</strong>. La contraseña anterior deja de funcionar de inmediato.</p>

      <div class="campo">
        <label for="pw-nueva">Nueva contraseña</label>
        <div class="form__contrasena">
          <input id="pw-nueva" v-model="nueva" :type="ver ? 'text' : 'password'" autocomplete="new-password" autofocus
            :aria-invalid="errorNueva ? 'true' : undefined" :aria-describedby="errorNueva ? 'pw-nueva-e' : undefined" />
          <button type="button" class="btn btn--secundario" :aria-pressed="ver" @click="ver = !ver">{{ ver ? 'Ocultar' : 'Mostrar' }}</button>
        </div>
        <p v-if="errorNueva" id="pw-nueva-e" class="texto-error form__error">{{ errorNueva }}</p>
      </div>

      <div class="campo">
        <label for="pw-repetir">Repite la contraseña</label>
        <input id="pw-repetir" v-model="repetir" :type="ver ? 'text' : 'password'" autocomplete="new-password"
          :aria-invalid="errorRepetir ? 'true' : undefined" :aria-describedby="errorRepetir ? 'pw-repetir-e' : undefined" />
        <p v-if="errorRepetir" id="pw-repetir-e" class="texto-error form__error">{{ errorRepetir }}</p>
      </div>

      <div v-if="errorServidor" class="form__alerta" role="alert"><p>{{ errorServidor }}</p></div>
      <p class="solo-lectores" role="status">{{ enCurso ? 'Guardando…' : '' }}</p>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Cancelar</button>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">{{ enCurso ? 'Guardando…' : 'Cambiar contraseña' }}</button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--espacio-3); }
.form__texto { margin: 0; color: var(--color-muted); }
.form__contrasena { display: flex; gap: var(--espacio-2); }
.form__contrasena input { flex: 1; min-width: 0; }
.campo input[aria-invalid='true'] { border-color: var(--color-peligro); }
.form__error { margin: 0; font-size: var(--texto-sm); }
.form__alerta { padding: var(--espacio-3) var(--espacio-4); border: 2px solid var(--color-peligro); border-radius: var(--radio); background: var(--color-peligro-fondo); }
.form__alerta p { margin: 0; color: var(--color-peligro-texto); font-weight: 600; }
</style>
