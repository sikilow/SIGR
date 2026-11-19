<script setup lang="ts">
// Recuperar el acceso del personal. Dos pasos en la misma pantalla:
//   /recuperar               → el empleado escribe su usuario o correo y le llega un enlace (1 hora, un solo uso).
//   /restablecer?token=...   → desde ese enlace crea su contraseña nueva.
// También llega aquí el enlace que manda el gerente desde Usuarios → Restablecer.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import FranjaDemo from '../components/FranjaDemo.vue'
import LogoMarca from '../components/LogoMarca.vue'
import { ErrorServicio, servicios } from '../services'

const route = useRoute()
const esRestablecer = computed(() => route.name === 'restablecer')
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

const campo = ref<HTMLInputElement | null>(null)
const enviando = ref(false)
const error = ref('')

// ---------- Paso 1: pedir el enlace ----------
const usuarioOCorreo = ref('')
const mensajeEnviado = ref('')
const enlaceDemo = ref('')

async function pedirEnlace() {
  if (enviando.value) return
  error.value = ''
  if (usuarioOCorreo.value.trim() === '') {
    error.value = 'Escribe tu usuario o tu correo.'
    campo.value?.focus()
    return
  }
  enviando.value = true
  try {
    const r = await servicios.auth.solicitarRecuperacion(usuarioOCorreo.value.trim())
    mensajeEnviado.value = r.mensaje
    enlaceDemo.value = r.enlaceDemo ?? ''
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo enviar la solicitud.'
  } finally {
    enviando.value = false
  }
}

// ---------- Paso 2: crear la contraseña nueva ----------
type EstadoEnlace = 'validando' | 'valido' | 'invalido' | 'listo'
const estado = ref<EstadoEnlace>('validando')
const cuenta = ref<{ nombreUsuario: string; nombre: string } | null>(null)
const nueva = ref('')
const repetir = ref('')
const verContrasena = ref(false)

const errorNueva = computed(() => {
  if (nueva.value.length < 6) return 'Usa al menos 6 caracteres.'
  if (nueva.value.length > 72) return 'Usa como máximo 72 caracteres.'
  return ''
})

async function validarEnlace() {
  if (!token.value) {
    estado.value = 'invalido'
    return
  }
  try {
    cuenta.value = await servicios.auth.validarEnlaceRestablecer(token.value)
    estado.value = 'valido'
    await nextTick()
    campo.value?.focus()
  } catch (e) {
    if (e instanceof ErrorServicio && e.codigo === 'red') {
      error.value = 'No se pudo conectar con el servidor. Recarga la página para intentarlo de nuevo.'
    }
    estado.value = 'invalido'
  }
}

async function guardar() {
  if (enviando.value) return
  error.value = ''
  if (errorNueva.value) {
    error.value = errorNueva.value
    campo.value?.focus()
    return
  }
  if (repetir.value !== nueva.value) {
    error.value = 'Las contraseñas no coinciden.'
    return
  }
  enviando.value = true
  try {
    await servicios.auth.restablecerContrasena(token.value, nueva.value)
    estado.value = 'listo'
  } catch (e) {
    if (e instanceof ErrorServicio && e.codigo === 'enlace_invalido') estado.value = 'invalido'
    else error.value = e instanceof ErrorServicio ? e.message : 'No se pudo guardar la contraseña.'
  } finally {
    enviando.value = false
  }
}

function iniciar() {
  error.value = ''
  if (esRestablecer.value) {
    estado.value = 'validando'
    nueva.value = ''
    repetir.value = ''
    void validarEnlace()
  } else {
    mensajeEnviado.value = ''
    enlaceDemo.value = ''
    void nextTick(() => campo.value?.focus())
  }
}

onMounted(iniciar)
// Las dos rutas usan esta vista: al ir de /recuperar al enlace (o a otro enlace) Vue la reutiliza.
watch(() => route.fullPath, iniciar)
</script>

<template>
  <div class="pagina">
    <FranjaDemo />
    <main class="recuperar">
      <div class="tarjeta recuperar__caja">
        <RouterLink to="/login" class="recuperar__marca" aria-label="La Madalena, volver al inicio de sesión">
          <LogoMarca :tamano="44" />
          <span>La Madalena</span>
        </RouterLink>

        <!-- ===== Paso 1: pedir enlace ===== -->
        <template v-if="!esRestablecer">
          <header>
            <p class="sobretitulo">Acceso del personal</p>
            <h1>¿Olvidaste tu contraseña?</h1>
            <p class="recuperar__texto">
              Escribe tu usuario o el correo que registró gerencia. Te mandaremos un enlace para crear una nueva.
            </p>
          </header>

          <div v-if="mensajeEnviado" class="recuperar__exito" role="status">
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <div>
              <strong>Revisa tu correo</strong>
              <p>{{ mensajeEnviado }}</p>
              <p>El enlace sirve una sola vez y caduca en 1 hora.</p>
              <p v-if="enlaceDemo" class="recuperar__demo">
                Modo demostración (no se envían correos):
                <RouterLink :to="enlaceDemo">abrir el enlace</RouterLink>
              </p>
            </div>
          </div>

          <form v-else class="recuperar__form" novalidate :aria-busy="enviando" @submit.prevent="pedirEnlace">
            <div class="campo">
              <label for="recuperar-usuario">Usuario o correo</label>
              <input
                id="recuperar-usuario"
                ref="campo"
                v-model="usuarioOCorreo"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                :aria-invalid="error ? 'true' : undefined"
                :aria-describedby="error ? 'recuperar-error' : undefined"
              />
            </div>
            <p v-if="error" id="recuperar-error" class="recuperar__error" role="alert">{{ error }}</p>
            <button class="btn btn--grande" type="submit" :aria-disabled="enviando ? 'true' : undefined">
              {{ enviando ? 'Enviando…' : 'Enviar enlace' }}
            </button>
          </form>
        </template>

        <!-- ===== Paso 2: crear contraseña ===== -->
        <template v-else>
          <p v-if="estado === 'validando'" class="recuperar__texto" role="status">Revisando el enlace…</p>

          <template v-else-if="estado === 'invalido'">
            <header>
              <p class="sobretitulo">Enlace no válido</p>
              <h1>Este enlace ya no sirve</h1>
              <p class="recuperar__texto">
                {{ error || 'Ya se usó o pasó más de 1 hora desde que se envió. Pide uno nuevo.' }}
              </p>
            </header>
            <RouterLink to="/recuperar" class="btn btn--grande">Pedir un enlace nuevo</RouterLink>
          </template>

          <template v-else-if="estado === 'listo'">
            <header>
              <p class="sobretitulo">Listo</p>
              <h1>Contraseña actualizada</h1>
              <p class="recuperar__texto" role="status">
                Ya puedes entrar con tu usuario <strong>{{ cuenta?.nombreUsuario }}</strong> y tu contraseña nueva.
              </p>
            </header>
            <RouterLink to="/login" class="btn btn--grande">Ir a iniciar sesión</RouterLink>
          </template>

          <template v-else>
            <header>
              <p class="sobretitulo">Hola, {{ cuenta?.nombre }}</p>
              <h1>Crea tu contraseña nueva</h1>
              <p class="recuperar__texto">Tu usuario es <strong>{{ cuenta?.nombreUsuario }}</strong>.</p>
            </header>
            <form class="recuperar__form" novalidate :aria-busy="enviando" @submit.prevent="guardar">
              <!-- Campo oculto para que el gestor de contraseñas asocie la nueva al usuario correcto -->
              <input type="text" name="username" autocomplete="username" :value="cuenta?.nombreUsuario" hidden readonly />
              <div class="campo">
                <label for="restablecer-nueva">Contraseña nueva</label>
                <input
                  id="restablecer-nueva"
                  ref="campo"
                  v-model="nueva"
                  :type="verContrasena ? 'text' : 'password'"
                  autocomplete="new-password"
                  aria-describedby="restablecer-ayuda"
                />
                <p id="restablecer-ayuda" class="recuperar__ayuda">Mínimo 6 caracteres.</p>
              </div>
              <div class="campo">
                <label for="restablecer-repetir">Repite la contraseña</label>
                <input id="restablecer-repetir" v-model="repetir" :type="verContrasena ? 'text' : 'password'" autocomplete="new-password" />
              </div>
              <label class="recuperar__ver">
                <input v-model="verContrasena" type="checkbox" />
                Mostrar contraseñas
              </label>
              <p v-if="error" class="recuperar__error" role="alert">{{ error }}</p>
              <button class="btn btn--grande" type="submit" :aria-disabled="enviando ? 'true' : undefined">
                {{ enviando ? 'Guardando…' : 'Guardar contraseña' }}
              </button>
            </form>
          </template>
        </template>

        <RouterLink v-if="estado !== 'listo'" to="/login" class="recuperar__volver">← Volver a iniciar sesión</RouterLink>
      </div>
    </main>
  </div>
</template>

<style scoped>
.pagina {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background:
    radial-gradient(circle at 85% 0%, rgb(197 138 36 / 14%), transparent 40%),
    var(--color-bg);
}

.recuperar {
  display: grid;
  flex: 1;
  place-items: center;
  padding: var(--espacio-6) var(--espacio-4);
}

.recuperar__caja {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  width: min(100%, 440px);
  padding: clamp(var(--espacio-5), 4vw, var(--espacio-8));
  border-top: 4px solid var(--color-primary);
}

.recuperar__marca {
  display: inline-flex;
  align-items: center;
  gap: var(--espacio-2);
  align-self: flex-start;
  color: var(--color-text);
  font-family: var(--fuente-titulo);
  font-size: var(--texto-lg);
  font-weight: 600;
  text-decoration: none;
}

.recuperar h1 {
  margin: var(--espacio-1) 0 0;
  font-size: clamp(1.6rem, 1.3rem + 1.2vw, 2.1rem);
}

.recuperar__texto {
  margin: var(--espacio-2) 0 0;
  color: var(--color-muted);
  line-height: 1.5;
}

.recuperar__form {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.recuperar__form input:not([type='checkbox']) {
  min-height: 52px;
  font-size: var(--texto-lg);
}

.recuperar__ayuda {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.recuperar__ver {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.recuperar__error {
  margin: 0;
  color: var(--color-peligro-texto);
  font-weight: 650;
}

.recuperar__exito {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-3);
  padding: var(--espacio-4);
  border-radius: var(--radio);
  background: var(--color-primary-soft);
}

.recuperar__exito svg {
  flex: none;
  color: var(--color-primary);
}

.recuperar__exito p {
  margin: var(--espacio-1) 0 0;
  line-height: 1.45;
}

.recuperar__demo {
  font-size: var(--texto-sm);
}

.recuperar__volver {
  align-self: center;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}
</style>
