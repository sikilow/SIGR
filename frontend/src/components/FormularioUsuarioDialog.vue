<script setup lang="ts">
// Alta y edición de un usuario (diálogo modal). `usuario = null` crea; con un usuario, lo edita y manda
// solo los campos que cambiaron. La contraseña solo se pide al crear (después se cambia con
// "Cambiar contraseña"). La validación del front es una ayuda: el servidor vuelve a validar todo.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import {
  CONTRASENA_MAX,
  CONTRASENA_MIN,
  ETIQUETA_ROL,
  ROLES_ASIGNABLES,
  type CambioUsuario,
  type Rol,
  type UsuarioAdmin,
} from '../types'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{
  abierto: boolean
  usuario: UsuarioAdmin | null
  /** Es el propio gerente en sesión: no puede cambiarse el rol (el servidor también lo impide). */
  esYo?: boolean
  origenFoco?: HTMLElement | null
}>()

const emit = defineEmits<{ cerrar: []; guardado: [usuario: UsuarioAdmin, creado: boolean] }>()

const nombre = ref('')
const correo = ref('')
const usuarioLogin = ref('')
const rol = ref<Rol>('mesero')
const telefono = ref('')
const contrasena = ref('')
const verContrasena = ref(false)
const tocado = ref(false)
const enCurso = ref(false)
const errorServidor = ref('')

const editando = computed(() => props.usuario !== null)

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    nombre.value = props.usuario?.nombre ?? ''
    correo.value = props.usuario?.correo ?? ''
    usuarioLogin.value = props.usuario?.nombreUsuario ?? ''
    rol.value = props.usuario?.rol ?? 'mesero'
    telefono.value = props.usuario?.telefono ?? ''
    contrasena.value = ''
    verContrasena.value = false
    tocado.value = false
    enCurso.value = false
    errorServidor.value = ''
  },
)

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REGEX_USUARIO = /^[A-Za-z0-9._-]+$/

const errores = computed(() => {
  const e: Record<string, string> = {}
  const n = nombre.value.trim()
  if (!n) e.nombre = 'Escribe el nombre.'
  else if (n.length > 100) e.nombre = 'Máximo 100 caracteres.'
  const c = correo.value.trim()
  if (!c) e.correo = 'Escribe el correo.'
  else if (!REGEX_CORREO.test(c)) e.correo = 'El correo no es válido (ejemplo: ana@correo.com).'
  const u = usuarioLogin.value.trim()
  if (!u) e.usuario = 'Escribe el nombre de usuario.'
  else if (u.length < 3) e.usuario = 'Mínimo 3 caracteres.'
  else if (!REGEX_USUARIO.test(u)) e.usuario = 'Solo letras, números, punto, guion y guion bajo (sin espacios).'
  if (telefono.value.trim().length > 20) e.telefono = 'Máximo 20 caracteres.'
  if (!editando.value) {
    if (contrasena.value.length < CONTRASENA_MIN) e.contrasena = `Mínimo ${CONTRASENA_MIN} caracteres.`
    else if (contrasena.value.length > CONTRASENA_MAX) e.contrasena = `Máximo ${CONTRASENA_MAX} caracteres.`
  }
  return e
})

const campoErr = (clave: string) => (tocado.value ? (errores.value[clave] ?? '') : '')

/** Solo lo que cambió respecto al usuario original. */
function cambios(): CambioUsuario {
  const u = props.usuario
  if (!u) return {}
  const c: CambioUsuario = {}
  if (nombre.value.trim() !== u.nombre) c.nombre = nombre.value
  if (correo.value.trim() !== u.correo) c.correo = correo.value
  if (usuarioLogin.value.trim() !== u.nombreUsuario) c.nombreUsuario = usuarioLogin.value
  if (rol.value !== u.rol) c.rol = rol.value
  if (telefono.value.trim() !== (u.telefono ?? '')) c.telefono = telefono.value
  return c
}

async function guardar() {
  if (enCurso.value) return
  tocado.value = true
  if (Object.keys(errores.value).length > 0) {
    // El foco va al primer campo con error, para teclado y lectores de pantalla.
    const primero = ['nombre', 'correo', 'usuario', 'telefono', 'contrasena'].find((k) => errores.value[k])
    document.getElementById(`usr-${primero}`)?.focus()
    return
  }
  errorServidor.value = ''
  enCurso.value = true
  try {
    if (props.usuario) {
      const c = cambios()
      if (Object.keys(c).length === 0) {
        emit('cerrar')
        return
      }
      emit('guardado', await servicios.usuarios.actualizar(props.usuario.idUsuario, c), false)
    } else {
      emit(
        'guardado',
        await servicios.usuarios.crear({
          nombre: nombre.value,
          correo: correo.value,
          nombreUsuario: usuarioLogin.value,
          contrasena: contrasena.value,
          rol: rol.value,
          telefono: telefono.value,
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
  <DialogoModal
    :abierto="abierto"
    etiqueta-id="form-usuario-titulo"
    variante="centro"
    :cerrable="!enCurso"
    :origen-foco="origenFoco ?? null"
    @cerrar="emit('cerrar')"
  >
    <form class="form" novalidate @submit.prevent="guardar">
      <h2 id="form-usuario-titulo">{{ editando ? `Editar a ${usuario?.nombre}` : 'Nuevo usuario' }}</h2>

      <div class="campo">
        <label for="usr-nombre">Nombre completo</label>
        <input id="usr-nombre" v-model="nombre" type="text" autocomplete="off" autofocus maxlength="100"
          :aria-invalid="campoErr('nombre') ? 'true' : undefined" :aria-describedby="campoErr('nombre') ? 'usr-nombre-e' : undefined" />
        <p v-if="campoErr('nombre')" id="usr-nombre-e" class="texto-error form__error">{{ campoErr('nombre') }}</p>
      </div>

      <div class="campo">
        <label for="usr-correo">Correo</label>
        <input id="usr-correo" v-model="correo" type="email" autocomplete="off" maxlength="120" spellcheck="false"
          :aria-invalid="campoErr('correo') ? 'true' : undefined" :aria-describedby="campoErr('correo') ? 'usr-correo-e' : undefined" />
        <p v-if="campoErr('correo')" id="usr-correo-e" class="texto-error form__error">{{ campoErr('correo') }}</p>
      </div>

      <div class="form__fila">
        <div class="campo">
          <label for="usr-usuario">Nombre de usuario (para iniciar sesión)</label>
          <input id="usr-usuario" v-model="usuarioLogin" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="60"
            :aria-invalid="campoErr('usuario') ? 'true' : undefined" :aria-describedby="campoErr('usuario') ? 'usr-usuario-e' : undefined" />
          <p v-if="campoErr('usuario')" id="usr-usuario-e" class="texto-error form__error">{{ campoErr('usuario') }}</p>
        </div>

        <div class="campo">
          <label for="usr-rol">Rol</label>
          <select id="usr-rol" v-model="rol" :disabled="esYo" :aria-describedby="esYo ? 'usr-rol-ayuda' : undefined">
            <option v-for="r in ROLES_ASIGNABLES" :key="r" :value="r">{{ ETIQUETA_ROL[r] }}</option>
          </select>
          <p v-if="esYo" id="usr-rol-ayuda" class="form__ayuda">No puedes cambiar tu propio rol.</p>
        </div>
      </div>

      <div class="campo">
        <label for="usr-telefono">Teléfono <span class="form__opcional">(opcional)</span></label>
        <input id="usr-telefono" v-model="telefono" type="tel" autocomplete="off" maxlength="20"
          :aria-invalid="campoErr('telefono') ? 'true' : undefined" :aria-describedby="campoErr('telefono') ? 'usr-telefono-e' : undefined" />
        <p v-if="campoErr('telefono')" id="usr-telefono-e" class="texto-error form__error">{{ campoErr('telefono') }}</p>
      </div>

      <div v-if="!editando" class="campo">
        <label for="usr-contrasena">Contraseña inicial</label>
        <div class="form__contrasena">
          <input id="usr-contrasena" v-model="contrasena" :type="verContrasena ? 'text' : 'password'" autocomplete="new-password"
            :aria-invalid="campoErr('contrasena') ? 'true' : undefined"
            :aria-describedby="`usr-contrasena-ayuda${campoErr('contrasena') ? ' usr-contrasena-e' : ''}`" />
          <button type="button" class="btn btn--secundario" :aria-pressed="verContrasena" @click="verContrasena = !verContrasena">
            {{ verContrasena ? 'Ocultar' : 'Mostrar' }}
          </button>
        </div>
        <p id="usr-contrasena-ayuda" class="form__ayuda">De {{ CONTRASENA_MIN }} a {{ CONTRASENA_MAX }} caracteres. La persona podrá pedir que se la cambien después.</p>
        <p v-if="campoErr('contrasena')" id="usr-contrasena-e" class="texto-error form__error">{{ campoErr('contrasena') }}</p>
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
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">
          Cancelar
        </button>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">
          {{ enCurso ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario' }}
        </button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.form__fila {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--espacio-3);
}

.form__contrasena {
  display: flex;
  gap: var(--espacio-2);
}

.form__contrasena input {
  flex: 1;
  min-width: 0;
}

.campo select {
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-4);
  border: 1.5px solid var(--color-borde-control);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-weight: 400;
}

.campo select:disabled {
  border-color: var(--color-deshabilitado-borde);
  background: var(--color-deshabilitado-fondo);
  color: var(--color-deshabilitado-texto);
}

.campo input[aria-invalid='true'] {
  border-color: var(--color-peligro);
}

.form__opcional,
.form__ayuda {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 400;
}

.form__ayuda,
.form__error {
  margin: 0;
}

.form__error {
  font-size: var(--texto-sm);
}

.form__alerta {
  display: flex;
  gap: var(--espacio-3);
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-peligro);
  border-radius: var(--radio);
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
}

.form__alerta svg {
  flex: none;
  margin-top: var(--espacio-1);
}

.form__alerta p {
  margin: 0;
  color: var(--color-text);
  font-weight: 600;
}
</style>
