<script setup lang="ts">
// Inicio de sesión (/login), pensado para tablet y teléfono: campos de 56 px, errores enlazados al
// campo y estado de carga en el botón. En escritorio la marca ocupa el panel izquierdo; en pantallas
// angostas se convierte en una barra compacta para dejar todo el alto al formulario.
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
      <!-- Panel de marca: editorial en escritorio, barra compacta en teléfono y tablet vertical -->
      <aside class="marca" aria-label="La Madalena">
        <div class="marca__cabecera">
          <LogoMarca :tamano="56" invertido />
          <div class="marca__identidad">
            <p class="marca__nombre">La Madalena</p>
            <p class="marca__sistema">SIGR · Gestión de restaurante</p>
          </div>
          <p class="marca__compacto" aria-hidden="true">El salón, en orden.</p>
        </div>

        <div class="marca__cuerpo">
          <p class="marca__sobretitulo">Cocina mexicana contemporánea</p>
          <h1>El salón,<br />en orden.</h1>
          <p class="marca__texto">
            Mesas, pedidos, cocina y caja en un mismo lugar. Todo el equipo ve lo que necesita,
            en el momento en que lo necesita.
          </p>
        </div>

        <div class="marca__pie">
          <ul class="marca__areas" aria-label="Áreas del restaurante">
            <li>Salón</li>
            <li>Cocina</li>
            <li>Caja</li>
          </ul>
          <p class="marca__nota">Hecho para el servicio, no para el escritorio.</p>
        </div>
      </aside>

      <!-- Formulario -->
      <section class="acceso">
        <div class="acceso__caja">
          <header class="acceso__encabezado">
            <p class="sobretitulo">Bienvenido</p>
            <h2>Inicia sesión</h2>
            <p>Usa el usuario que te asignó gerencia.</p>
          </header>

          <p v-if="aviso" class="aviso aviso--info acceso__aviso" role="status">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8v.01" />
            </svg>
            <span>{{ aviso }}</span>
          </p>

          <form class="acceso__form" novalidate :aria-busy="cargando" @submit.prevent="entrar">
            <div class="campo">
              <label for="login-usuario">Usuario</label>
              <div class="acceso__control">
                <svg class="acceso__icono" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="8" r="3.6" />
                  <path d="M4.5 20c0-3.8 3.2-6.2 7.5-6.2s7.5 2.4 7.5 6.2" />
                </svg>
                <input
                  id="login-usuario"
                  ref="campoUsuario"
                  v-model="nombreUsuario"
                  type="text"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                  placeholder="Tu usuario"
                  :aria-invalid="error ? 'true' : undefined"
                  :aria-describedby="error ? 'login-error' : undefined"
                />
              </div>
            </div>

            <div class="campo">
              <label for="login-contrasena">Contraseña</label>
              <div class="acceso__control">
                <svg class="acceso__icono" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
                </svg>
                <input
                  id="login-contrasena"
                  ref="campoContrasena"
                  v-model="contrasena"
                  :type="verContrasena ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="Tu contraseña"
                  class="acceso__input--ojo"
                  :aria-invalid="error ? 'true' : undefined"
                  :aria-describedby="error ? 'login-error' : undefined"
                />
                <button
                  type="button"
                  class="acceso__ojo"
                  :aria-pressed="verContrasena"
                  :aria-label="verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  @click="verContrasena = !verContrasena"
                >
                  <svg v-if="!verContrasena" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                </button>
              </div>
            </div>

            <p v-if="error" id="login-error" class="acceso__error" role="alert">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6M12 16.5v.01" />
              </svg>
              <span>{{ error }}</span>
            </p>

            <button class="btn btn--grande acceso__entrar" type="submit" :aria-disabled="cargando ? 'true' : undefined">
              <svg v-if="cargando" class="acceso__girando" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
              {{ cargando ? 'Entrando…' : 'Entrar' }}
              <svg v-if="!cargando" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <p class="solo-lectores" role="status">{{ cargando ? 'Iniciando sesión…' : '' }}</p>
          </form>

          <!-- Solo con el mock: usuarios de prueba -->
          <aside v-if="usandoMock" class="demo" aria-label="Acceso de demostración">
            <p class="demo__titulo">Acceso de demostración</p>
            <p class="demo__usuarios">
              <code>gerente</code>
              <code>mesero</code>
              <code>mesero2</code>
              <code>cocinero</code>
              <code>cajero</code>
              <code>hostess</code>
            </p>
            <p class="demo__nota">Contraseña para todos: <strong class="numero">1234</strong></p>
          </aside>

          <p class="acceso__ayuda">¿No puedes entrar? Avisa a gerencia para revisar tu usuario.</p>
        </div>
      </section>
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
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  min-height: 0;
}

/* ---------- Panel de marca ---------- */
.marca {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--espacio-8);
  padding: clamp(var(--espacio-8), 5vw, var(--espacio-12));
  background:
    radial-gradient(circle at 76% 16%, rgb(197 138 36 / 30%), transparent 38%),
    radial-gradient(circle at 12% 88%, rgb(46 107 88 / 28%), transparent 42%),
    linear-gradient(145deg, #8c2f19 0%, var(--color-primary) 52%, #6c2413 100%);
  color: var(--color-on-primary);
}

/* Anillo decorativo: guiño al plato del logo, sin competir con el texto */
.marca::before,
.marca::after {
  content: '';
  position: absolute;
  border: 1px solid rgb(255 249 243 / 16%);
  border-radius: 50%;
  pointer-events: none;
}

.marca::before {
  right: -22%;
  bottom: -30%;
  width: 34rem;
  height: 34rem;
}

.marca::after {
  right: -6%;
  bottom: -12%;
  width: 18rem;
  height: 18rem;
  border-color: rgb(197 138 36 / 38%);
}

.marca__cabecera,
.marca__cuerpo,
.marca__pie {
  position: relative;
  z-index: 1;
}

.marca__cabecera {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
}

.marca__identidad {
  min-width: 0;
}

.marca__nombre {
  margin: 0;
  font-family: var(--fuente-titulo);
  font-size: var(--texto-xl);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.marca__sistema {
  margin: 2px 0 0;
  color: rgb(255 249 243 / 74%);
  font-size: var(--texto-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.marca__compacto {
  display: none;
}

.marca__cuerpo {
  max-width: 34rem;
}

.marca__sobretitulo {
  margin: 0;
  color: #f4d6a4;
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.marca__cuerpo h1 {
  margin: var(--espacio-4) 0 0;
  color: var(--color-on-primary);
  font-size: clamp(3.2rem, 2rem + 5vw, 6rem);
  font-weight: 600;
  line-height: 0.9;
  letter-spacing: -0.05em;
}

.marca__texto {
  max-width: 38ch;
  margin: var(--espacio-5) 0 0;
  color: rgb(255 249 243 / 86%);
  font-size: var(--texto-lg);
  line-height: 1.5;
}

.marca__pie {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.marca__areas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2) var(--espacio-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.marca__areas li {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  color: #f4d6a4;
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.marca__areas li + li::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.7;
}

.marca__nota {
  margin: 0;
  color: rgb(255 249 243 / 66%);
  font-size: var(--texto-sm);
}

/* ---------- Formulario ---------- */
.acceso {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--espacio-6);
  padding: clamp(var(--espacio-6), 4vw, var(--espacio-12));
  background: var(--color-bg);
}

.acceso__caja {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  width: min(100%, 420px);
}

.acceso__encabezado h2 {
  margin: var(--espacio-1) 0 0;
  font-size: clamp(1.9rem, 1.5rem + 1.4vw, 2.5rem);
}

.acceso__encabezado p:last-child {
  margin: var(--espacio-2) 0 0;
  color: var(--color-muted);
}

.acceso__aviso {
  justify-content: flex-start;
  align-items: flex-start;
  padding: var(--espacio-3);
}

.acceso__aviso span {
  color: var(--color-info-texto);
  font-size: var(--texto-sm);
  font-weight: 600;
  line-height: 1.4;
}

.acceso__form {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

/* Campos de 56 px: cómodos para el dedo y sin zoom automático en iOS */
.acceso__form .campo {
  gap: var(--espacio-1);
}

.acceso__form .campo > label {
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.acceso__control {
  position: relative;
}

.acceso__control input {
  min-height: 56px;
  padding-left: 48px;
  border-radius: var(--radio);
  font-size: var(--texto-lg);
}

.acceso__control input::placeholder {
  color: var(--color-muted);
  opacity: 0.72;
}

.acceso__input--ojo {
  padding-right: 58px;
}

.acceso__icono {
  position: absolute;
  top: 50%;
  left: var(--espacio-4);
  z-index: 1;
  color: var(--color-muted);
  transform: translateY(-50%);
  pointer-events: none;
}

.acceso__form .campo input:focus-visible + .acceso__ojo {
  border-color: transparent;
}

.acceso__ojo {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: calc(var(--radio) - 4px);
  background: transparent;
  color: var(--color-muted);
  touch-action: manipulation;
  transition:
    background-color var(--duracion-rapida) ease,
    color var(--duracion-rapida) ease;
}

@media (hover: hover) and (pointer: fine) {
  .acceso__ojo:hover {
    background: var(--color-surface-2);
    color: var(--color-primary-dark);
  }
}

.acceso__ojo:active {
  background: var(--color-primary-soft);
}

.acceso__error {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-2);
  margin: 0;
  color: var(--color-peligro-texto);
  font-weight: 650;
  line-height: 1.4;
}

.acceso__error svg {
  flex: none;
  margin-top: 2px;
  color: var(--color-peligro);
}

.acceso__form .campo input[aria-invalid='true'] {
  border-color: var(--color-peligro);
  background: var(--color-peligro-fondo);
}

.acceso__entrar {
  width: 100%;
  margin-top: var(--espacio-1);
}

.acceso__girando {
  animation: girar-login 0.9s linear infinite;
}

@keyframes girar-login {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- Acceso demo ---------- */
.demo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px dashed var(--color-borde-fuerte);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.demo__titulo {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.demo__usuarios {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-1) var(--espacio-2);
  margin: 0;
}

.demo__usuarios code {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: 0.78rem;
}

.demo__nota {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.demo__nota strong {
  color: var(--color-text);
}

.acceso__ayuda {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  text-align: center;
}

/* ---------- Tablet vertical y teléfono ---------- */
@media (max-width: 56em) {
  .login {
    grid-template-columns: minmax(0, 1fr);
  }

  .marca {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--espacio-4);
    padding: var(--espacio-4) var(--espacio-6);
  }

  .marca::before,
  .marca::after {
    display: none;
  }

  .marca__cuerpo,
  .marca__pie {
    display: none;
  }

  .marca__cabecera {
    min-width: 0;
  }

  .marca__nombre {
    font-size: var(--texto-lg);
  }

  .marca__sistema {
    font-size: 0.78rem;
  }

  .marca__compacto {
    display: block;
    flex: none;
    margin: 0;
    color: #f4d6a4;
    font-family: var(--fuente-titulo);
    font-size: var(--texto-lg);
    font-style: italic;
    letter-spacing: -0.01em;
  }

  .acceso {
    justify-content: flex-start;
    padding: var(--espacio-6) var(--espacio-4) var(--espacio-10);
  }

  .acceso__caja {
    padding-top: var(--espacio-2);
  }
}

@media (max-width: 30em) {
  .marca {
    padding: var(--espacio-3) var(--espacio-4);
  }

  .marca__compacto {
    display: none;
  }

  .marca__sistema {
    max-width: 22ch;
  }
}

/* Horizontal con poca altura: todo más compacto para que quepan los campos */
@media (max-height: 37.5em) and (max-width: 56em) {
  .marca {
    padding-block: var(--espacio-2);
  }

  .acceso {
    padding-block: var(--espacio-4) var(--espacio-8);
  }

  .acceso__caja {
    gap: var(--espacio-3);
  }

  .acceso__encabezado h2 {
    font-size: var(--texto-xl);
  }

  .acceso__encabezado p:last-child,
  .acceso__ayuda {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .acceso__girando {
    animation: none;
  }
}

/* El login del rediseño A ya usa el panel de marca y la serifa; se conserva tal cual. */
</style>
