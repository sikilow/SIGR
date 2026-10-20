<script setup lang="ts">
// Inicio de sesión (/login), pensado para tablet: campos de 56 px, errores enlazados al campo y
// estado de carga en el botón. El logo es un marcador de posición (components/LogoMarca.vue).
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FranjaDemo from '../components/FranjaDemo.vue'
import LogoMarca from '../components/LogoMarca.vue'
import { rutaInicial } from '../router'
import { ErrorServicio, usandoMock } from '../services'
import { useSesionStore } from '../stores/sesion'

const sesion = useSesionStore()
const route = useRoute()
const router = useRouter()

const nombreUsuario = ref('')
const contrasena = ref('')
const cargando = ref(false)
const verContrasena = ref(false)
const error = ref('')
const campoUsuario = ref<HTMLInputElement | null>(null)
const campoContrasena = ref<HTMLInputElement | null>(null)

// El atributo `autofocus` no basta en una SPA (el formulario se inserta después de cargar la página):
// se enfoca el usuario a mano para que se pueda escribir de inmediato, con teclado o lector de pantalla.
onMounted(() => campoUsuario.value?.focus())

const aviso = computed(() => {
  if (route.query.motivo === 'rol') return 'Tu rol no tiene acceso a esa pantalla. Inicia sesión con otro usuario.'
  if (route.query.motivo === 'expirada') return 'Tu sesión venció. Inicia sesión de nuevo.'
  return ''
})

async function entrar() {
  if (cargando.value) return
  error.value = ''

  // Validación propia (sin burbujas del navegador): el error queda escrito junto al formulario y enlazado.
  const faltaUsuario = nombreUsuario.value.trim() === ''
  if (faltaUsuario || contrasena.value === '') {
    error.value = faltaUsuario ? 'Escribe tu usuario.' : 'Escribe tu contraseña.'
    await nextTick()
    ;(faltaUsuario ? campoUsuario : campoContrasena).value?.focus()
    return
  }

  cargando.value = true
  try {
    await sesion.iniciarSesion({ nombreUsuario: nombreUsuario.value.trim(), contrasena: contrasena.value })
    const porDefecto = sesion.usuario ? rutaInicial(sesion.usuario.rol) : '/mesero/mesas'
    const destino = typeof route.query.redirigir === 'string' ? route.query.redirigir : porDefecto
    await router.push(destino)
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo iniciar sesión.'
    // Tras un rechazo se vuelve a la contraseña para corregirla; si no hubo conexión, también.
    await nextTick()
    campoContrasena.value?.focus()
    campoContrasena.value?.select()
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="pagina">
    <FranjaDemo />

    <main class="login">
      <header class="login__marca">
        <LogoMarca :tamano="72" />
        <h1>SIGR</h1>
        <p class="login__sub">Sistema Integral de Gestión de Restaurante</p>
      </header>

      <form class="tarjeta login__tarjeta" novalidate :aria-busy="cargando" @submit.prevent="entrar">
        <h2 class="login__titulo">Inicia sesión</h2>

        <p v-if="aviso" class="aviso aviso--info" role="status">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8v.01" />
          </svg>
          {{ aviso }}
        </p>

        <div class="campo">
          <label for="login-usuario">Usuario</label>
          <input
            id="login-usuario"
            ref="campoUsuario"
            v-model="nombreUsuario"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? 'login-error' : undefined"
          />
        </div>

        <div class="campo">
          <label for="login-contrasena">Contraseña</label>
          <div class="login__contrasena">
            <input
              id="login-contrasena"
              ref="campoContrasena"
              v-model="contrasena"
              :type="verContrasena ? 'text' : 'password'"
              autocomplete="current-password"
              :aria-invalid="error ? 'true' : undefined"
              :aria-describedby="error ? 'login-error' : undefined"
            />
            <button
              type="button"
              class="btn btn--secundario login__mostrar"
              :aria-pressed="verContrasena"
              :aria-label="verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              @click="verContrasena = !verContrasena"
            >
              <svg v-if="!verContrasena" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </svg>
              <span class="login__mostrar-texto">{{ verContrasena ? 'Ocultar' : 'Mostrar' }}</span>
            </button>
          </div>
        </div>

        <p v-if="error" id="login-error" class="login__error" role="alert">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.01" />
          </svg>
          {{ error }}
        </p>

        <button class="btn btn--grande login__entrar" type="submit" :aria-disabled="cargando ? 'true' : undefined">
          <svg v-if="cargando" class="login__girando" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          {{ cargando ? 'Entrando…' : 'Entrar' }}
        </button>
        <p class="solo-lectores" role="status">{{ cargando ? 'Iniciando sesión…' : '' }}</p>

        <!-- Solo con el mock: usuarios de prueba -->
        <p v-if="usandoMock" class="login__demo">
          Usuarios demo: <strong>mesero</strong>, <strong>hostess</strong>, <strong>cajero</strong>, <strong>gerente</strong> · contraseña
          <strong class="numero">1234</strong>
        </p>
      </form>
    </main>
  </div>
</template>

<style scoped>
.pagina {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.login {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--espacio-6);
  padding: var(--espacio-6);
}

.login__marca {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--espacio-2);
  text-align: center;
}

.login__marca h1 {
  font-size: var(--texto-2xl);
  line-height: 1.1;
}

.login__sub {
  margin: 0;
  color: var(--color-muted);
}

.login__tarjeta {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  width: min(100%, 480px);
}

.login__tarjeta .aviso {
  justify-content: flex-start;
}

.login__titulo {
  font-size: var(--texto-xl);
}

/* Campos grandes (56 px) con texto de 18 px: cómodos para el dedo y sin zoom automático en iOS */
.login__tarjeta .campo input {
  min-height: 56px;
  font-size: var(--texto-lg);
}

.login__tarjeta .campo input[aria-invalid='true'] {
  border-color: var(--color-peligro);
}

.login__contrasena {
  display: flex;
  gap: var(--espacio-2);
}

.login__contrasena input {
  flex: 1;
  min-width: 0;
}

.login__mostrar {
  flex: none;
  min-height: 56px;
  padding: 0 var(--espacio-4);
}

.login__error {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-2);
  margin: 0;
  color: var(--color-peligro-texto);
  font-weight: 700;
}

.login__error svg {
  flex: none;
  margin-top: var(--espacio-1);
  color: var(--color-peligro);
}

.login__entrar {
  width: 100%;
}

.login__girando {
  animation: girar-login 0.9s linear infinite;
}

@keyframes girar-login {
  to {
    transform: rotate(360deg);
  }
}

.login__demo {
  margin: 0;
  padding-top: var(--espacio-3);
  border-top: 1px dashed var(--color-border);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  text-align: center;
}

.login__demo strong {
  color: var(--color-text);
}

@media (prefers-reduced-motion: reduce) {
  .login__girando {
    animation: none;
  }
}
</style>
