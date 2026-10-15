<script setup lang="ts">
// PLACEHOLDER: formulario mínimo para poder probar la guardia del router.
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ErrorServicio, usandoMock } from '../services'
import { useSesionStore } from '../stores/sesion'

const sesion = useSesionStore()
const route = useRoute()
const router = useRouter()

const usuario = ref('')
const contrasena = ref('')
const cargando = ref(false)
const verContrasena = ref(false)
const error = ref('')

const aviso = computed(() => {
  if (route.query.motivo === 'rol') return 'Tu rol no tiene acceso a esa pantalla. Inicia sesión con otro usuario.'
  if (route.query.motivo === 'expirada') return 'Tu sesión venció. Inicia sesión de nuevo.'
  return ''
})

async function entrar() {
  error.value = ''
  cargando.value = true
  try {
    await sesion.iniciarSesion({ usuario: usuario.value, contrasena: contrasena.value })
    const destino = typeof route.query.redirigir === 'string' ? route.query.redirigir : '/mesero/mesas'
    await router.push(destino)
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo iniciar sesión.'
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <main class="login">
    <form class="tarjeta login__tarjeta" @submit.prevent="entrar">
      <h1>La Madalena</h1>
      <p class="login__sub">Inicia sesión para continuar</p>

      <p v-if="aviso" class="texto-error" role="alert">{{ aviso }}</p>

      <label class="campo">
        Usuario
        <input v-model="usuario" type="text" autocomplete="username" required />
      </label>
      <div class="campo">
        <label for="login-contrasena">Contraseña</label>
        <div class="login__contrasena">
          <input
            id="login-contrasena"
            v-model="contrasena"
            :type="verContrasena ? 'text' : 'password'"
            autocomplete="current-password"
            required
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? 'login-error' : undefined"
          />
          <button
            type="button"
            class="btn btn--secundario"
            :aria-pressed="verContrasena"
            @click="verContrasena = !verContrasena"
          >
            {{ verContrasena ? 'Ocultar' : 'Mostrar' }}
          </button>
        </div>
      </div>

      <p v-if="error" id="login-error" class="texto-error" role="alert">{{ error }}</p>

      <button class="btn" type="submit" :disabled="cargando">
        {{ cargando ? 'Entrando…' : 'Entrar' }}
      </button>

      <p v-if="usandoMock" class="login__demo">
        Modo demo: usuario <strong>mesero</strong>, contraseña <strong>1234</strong>
        (también <strong>gerente</strong> o <strong>cajero</strong> para probar la guardia de rol).
      </p>
    </form>
  </main>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: var(--espacio-6);
}

.login__tarjeta {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  width: min(100%, 420px);
}

.login__contrasena {
  display: flex;
  gap: var(--espacio-2);
}

.login__contrasena input {
  flex: 1;
  min-width: 0;
}

.login__sub {
  margin: 0;
  color: var(--color-muted);
}

.login__demo {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}
</style>
