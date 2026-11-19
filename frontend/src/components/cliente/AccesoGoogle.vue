<script setup lang="ts">
// «Iniciar sesión / Registrarse con Google» del portal de clientes. Convive con el acceso por correo y contraseña.
//
// Flujo: el botón oficial de Google Identity Services abre la ventana para elegir la cuenta y entrega un token firmado;
// el servidor lo verifica (POST /api/auth-clientes/google). Si la persona ya tiene cuenta, entra; si es nueva, se le
// pide solo su teléfono (Google no lo da) y se crea la cuenta sin contraseña (POST /api/auth-clientes/google/completar).
//
// El ID de cliente de Google lo da el servidor (GET /api/auth-clientes/google/config). Si no está configurado, este
// componente no dibuja nada: el formulario de correo y contraseña sigue funcionando solo.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { errorNombrePersona, errorTelefono, vPermitir } from '../../utils/campos'
import { LADA_PREDETERMINADA, rangoTelefono, textoDigitos } from '../../utils/lada'
import SelectorLada from '../SelectorLada.vue'

const props = defineProps<{ modo: 'login' | 'registro' }>()

interface RespuestaCredencial {
  credential: string
}

interface GoogleId {
  initialize(opciones: { client_id: string; callback: (r: RespuestaCredencial) => void; ux_mode?: 'popup' }): void
  renderButton(elemento: HTMLElement, opciones: Record<string, string | number>): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const SCRIPT_GOOGLE = 'https://accounts.google.com/gsi/client'

const router = useRouter()
const boton = ref<HTMLElement | null>(null)
const habilitado = ref(false)
const paso = ref<'boton' | 'telefono'>('boton')
const error = ref('')
const enviando = ref(false)

const tokenRegistro = ref('')
const nombre = ref('')
const correo = ref('')
const telefono = ref('')
const lada = ref(LADA_PREDETERMINADA)

function cargarScript(): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (window.google?.accounts?.id) return resolver()
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_GOOGLE}"]`)
    const script = existente ?? document.createElement('script')
    script.addEventListener('load', () => resolver(), { once: true })
    script.addEventListener('error', () => rechazar(new Error('No se pudo cargar Google.')), { once: true })
    if (!existente) {
      script.src = SCRIPT_GOOGLE
      script.async = true
      document.head.appendChild(script)
    }
  })
}

async function publicar<T>(ruta: string, cuerpo: unknown): Promise<T> {
  const respuesta = await fetch(`/api/auth-clientes${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) throw new Error(datos.mensaje || 'No se pudo completar el acceso con Google.')
  return datos as T
}

interface Sesion {
  token: string
  cliente: { id_cliente: number; nombre: string; correo: string }
}

async function iniciarSesion(sesion: Sesion) {
  // Mismo almacenamiento que el acceso por contraseña.
  sessionStorage.setItem('cliente_token', sesion.token)
  sessionStorage.setItem('cliente_datos', JSON.stringify(sesion.cliente))
  await router.push('/cliente')
}

async function alElegirCuenta(respuesta: RespuestaCredencial) {
  error.value = ''
  enviando.value = true
  try {
    const datos = await publicar<Sesion & { requiere_telefono?: boolean; token_registro?: string; nombre?: string; correo?: string }>(
      '/google',
      { credential: respuesta.credential },
    )
    if (datos.requiere_telefono && datos.token_registro) {
      tokenRegistro.value = datos.token_registro
      nombre.value = datos.nombre ?? ''
      correo.value = datos.correo ?? ''
      paso.value = 'telefono'
      return
    }
    await iniciarSesion(datos)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error de conexión con el servidor.'
  } finally {
    enviando.value = false
  }
}

async function completar() {
  error.value = ''
  const errNombre = nombre.value.trim() === '' ? '' : errorNombrePersona(nombre.value)
  if (errNombre) {
    error.value = errNombre
    return
  }
  const errTelefono = errorTelefono(telefono.value, true, lada.value)
  if (errTelefono) {
    error.value = errTelefono
    return
  }
  enviando.value = true
  try {
    const sesion = await publicar<Sesion>('/google/completar', {
      token_registro: tokenRegistro.value,
      telefono: telefono.value.trim(),
      lada: lada.value,
      ...(nombre.value.trim().length >= 2 ? { nombre: nombre.value.trim() } : {}),
    })
    await iniciarSesion(sesion)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error de conexión con el servidor.'
  } finally {
    enviando.value = false
  }
}

function cancelar() {
  paso.value = 'boton'
  tokenRegistro.value = ''
  telefono.value = ''
  error.value = ''
}

onMounted(async () => {
  try {
    const respuesta = await fetch('/api/auth-clientes/google/config')
    if (!respuesta.ok) return
    const config = (await respuesta.json()) as { habilitado: boolean; client_id: string | null }
    if (!config.habilitado || !config.client_id) return

    await cargarScript()
    habilitado.value = true
    // El contenedor existe en el siguiente ciclo de dibujo.
    await new Promise((listo) => requestAnimationFrame(() => listo(null)))
    const google = window.google?.accounts?.id
    if (!google || !boton.value) return
    google.initialize({ client_id: config.client_id, callback: (r) => void alElegirCuenta(r), ux_mode: 'popup' })
    google.renderButton(boton.value, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: props.modo === 'registro' ? 'signup_with' : 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'center',
      locale: 'es',
      width: Math.min(400, Math.max(240, boton.value.clientWidth || 320)),
    })
  } catch {
    // Sin internet o sin acceso a Google: el formulario de correo y contraseña sigue disponible.
    habilitado.value = false
  }
})
</script>

<template>
  <div v-if="habilitado" class="google">
    <!-- Botón de Google: se oculta (no se destruye) al pedir el teléfono, para no volver a dibujarlo -->
    <div v-show="paso === 'boton'">
      <p class="google__o"><span>o</span></p>
      <div ref="boton" class="google__boton" :aria-busy="enviando" />
      <p v-if="error && paso === 'boton'" class="google__error" role="alert">{{ error }}</p>
    </div>

    <form v-if="paso === 'telefono'" class="google__telefono" @submit.prevent="completar">
      <h3>Un último paso</h3>
      <p>Elegiste la cuenta <strong>{{ correo }}</strong>. Solo falta tu teléfono para contactarte sobre tus reservaciones.</p>

      <label for="google-nombre">Nombre</label>
      <input id="google-nombre" v-permitir="'nombre'" v-model="nombre" type="text" autocomplete="name" maxlength="100" />

      <label for="google-telefono">Teléfono</label>
      <div class="telefono-fila">
        <SelectorLada v-model="lada" />
        <input
          id="google-telefono" v-permitir="'digitos'"
          v-model="telefono"
          type="tel"
          inputmode="numeric"
          :placeholder="textoDigitos(lada)"
          autocomplete="tel-national"
          :maxlength="rangoTelefono(lada).max"
          :title="`${textoDigitos(lada)}, sin espacios ni guiones`"
          required
        />
      </div>

      <p v-if="error" class="google__error" role="alert">{{ error }}</p>

      <div class="google__acciones">
        <button type="button" class="google__secundario" :disabled="enviando" @click="cancelar">Volver</button>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Creando cuenta...' : 'Continuar →' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.google {
  margin-top: 22px;
}

.google__o {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 16px;
  color: #7a6a5f;
  font-size: 13px;
}

.google__o::before,
.google__o::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #ddcfc5;
}

.google__boton {
  display: flex;
  justify-content: center;
  min-height: 44px;
}

.google__error {
  margin: 12px 0 0;
  color: #bb2626;
  font-size: 13px;
}

.google__telefono {
  display: flex;
  flex-direction: column;
}

.google__telefono h3 {
  margin: 0 0 6px;
}

.google__telefono p {
  margin: 0 0 16px;
  color: #5b4a3f;
  font-size: 14px;
}

.google__telefono label {
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 14px;
}

.google__telefono .telefono-fila {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.google__telefono .selector-lada {
  flex: 0 1 190px;
  padding: 14px 10px;
  border: 1px solid #ddcfc5;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
}

.google__telefono .telefono-fila input {
  flex: 1 1 150px;
  min-width: 0;
  margin-bottom: 0;
}

.google__telefono input {
  width: 100%;
  padding: 14px;
  margin-bottom: 18px;
  border: 1px solid #ddcfc5;
  border-radius: 8px;
  font-size: 14px;
}

.google__acciones {
  display: flex;
  gap: 12px;
}

.google__acciones button {
  flex: 1;
  padding: 15px;
  border: none;
  border-radius: 8px;
  background: #b9390b;
  color: #fff;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
}

.google__acciones button:hover:not(:disabled) {
  background: #932b09;
}

.google__acciones button:disabled {
  opacity: 0.7;
  cursor: progress;
}

.google__acciones .google__secundario {
  background: #fff;
  color: #b9390b;
  border: 1.5px solid #b9390b;
}
</style>
