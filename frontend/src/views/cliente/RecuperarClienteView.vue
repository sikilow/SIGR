<script setup lang="ts">
// Recuperar la contraseña de la cuenta de cliente (portal). Dos pasos, como el del personal:
//   /cliente/recuperar                    → escribe su correo y recibe un enlace de un solo uso (1 hora).
//   /cliente/restablecer?token=...        → desde ese enlace crea su contraseña nueva.
// La respuesta del primer paso es siempre la misma, tenga o no cuenta ese correo (así no se revela quién está registrado).
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CONTRASENA_AYUDA, errorContrasena, vPermitir } from '../../utils/campos'

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const enModoEnlace = computed(() => route.name === 'cliente-restablecer')

async function llamar<T>(ruta: string, metodo: 'GET' | 'POST', cuerpo?: unknown): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.')
  }
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw Object.assign(new Error(datos?.mensaje ?? 'No se pudo completar la solicitud.'), { estado: respuesta.status })
  return datos as T
}

// ---------- Paso 1: pedir el enlace ----------
const correo = ref('')
const enviando = ref(false)
const enviado = ref('')
const error = ref('')

async function pedirEnlace() {
  if (enviando.value) return
  error.value = ''
  if (!correo.value.trim()) {
    error.value = 'Escribe tu correo electrónico.'
    return
  }
  enviando.value = true
  try {
    const r = await llamar<{ mensaje: string }>('/api/auth-clientes/recuperar', 'POST', { correo: correo.value.trim() })
    enviado.value = r.mensaje
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo enviar la solicitud.'
  } finally {
    enviando.value = false
  }
}

// ---------- Paso 2: crear la contraseña nueva ----------
type EstadoEnlace = 'validando' | 'valido' | 'invalido' | 'listo'
const estado = ref<EstadoEnlace>('validando')
const cuenta = ref<{ nombre: string; correo: string } | null>(null)
const nueva = ref('')
const repetir = ref('')
const guardando = ref(false)
const errorEnlace = ref('')

onMounted(async () => {
  if (!enModoEnlace.value) return
  if (!token.value) {
    estado.value = 'invalido'
    return
  }
  try {
    cuenta.value = await llamar<{ nombre: string; correo: string }>(`/api/auth-clientes/restablecer/${encodeURIComponent(token.value)}`, 'GET')
    estado.value = 'valido'
  } catch {
    estado.value = 'invalido'
  }
})

async function guardar() {
  if (guardando.value) return
  errorEnlace.value = ''
  const motivo = errorContrasena(nueva.value)
  if (motivo) {
    errorEnlace.value = motivo
    return
  }
  if (nueva.value !== repetir.value) {
    errorEnlace.value = 'Las contraseñas no coinciden.'
    return
  }
  guardando.value = true
  try {
    await llamar<{ ok: boolean }>('/api/auth-clientes/restablecer', 'POST', { token: token.value, contrasena: nueva.value })
    nueva.value = ''
    repetir.value = ''
    estado.value = 'listo'
  } catch (e) {
    if ((e as { estado?: number }).estado === 410) estado.value = 'invalido'
    else errorEnlace.value = e instanceof Error ? e.message : 'No se pudo guardar la contraseña.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="pagina-login">
    <RouterLink to="/cliente/login" class="volver">← Volver a iniciar sesión</RouterLink>

    <div class="contenedor-login">
      <div class="presentacion">
        <span>LA MADALENA</span>
        <h1>{{ enModoEnlace ? 'Crea tu nueva contraseña.' : '¿Olvidaste tu contraseña?' }}</h1>
        <p>
          {{ enModoEnlace ? 'Elige una contraseña segura para entrar a tu cuenta.' : 'No te preocupes: te enviaremos un enlace a tu correo para crear una nueva.' }}
        </p>
        <div class="decoracion">✦</div>
      </div>

      <div class="formulario">
        <span class="subtitulo">ACCESO DE CLIENTES</span>

        <!-- ================= Paso 1 ================= -->
        <template v-if="!enModoEnlace">
          <h2>Recuperar contraseña</h2>

          <div v-if="enviado" class="exito" role="status">
            <p>{{ enviado }}</p>
            <p class="exito__nota">El enlace sirve una sola vez y caduca en 1 hora.</p>
            <RouterLink to="/cliente/login" class="boton-enlace">Volver a iniciar sesión</RouterLink>
          </div>

          <template v-else>
            <p class="descripcion">Escribe el correo con el que creaste tu cuenta.</p>
            <form novalidate @submit.prevent="pedirEnlace">
              <label for="correo">Correo electrónico</label>
              <input
                id="correo"
                v-model="correo"
                v-permitir="'correo'"
                type="email"
                placeholder="ejemplo@correo.com"
                autocomplete="email"
                required
              />
              <p v-if="error" class="error" role="alert">{{ error }}</p>
              <button type="submit" :disabled="enviando">{{ enviando ? 'Enviando...' : 'Enviarme el enlace' }}</button>
            </form>
          </template>
        </template>

        <!-- ================= Paso 2 ================= -->
        <template v-else>
          <h2>Contraseña nueva</h2>

          <p v-if="estado === 'validando'" class="descripcion" role="status">Revisando tu enlace…</p>

          <div v-else-if="estado === 'invalido'" class="error-caja" role="alert">
            <p><strong>Este enlace ya no sirve.</strong></p>
            <p>Ya se usó o caducó. Pide uno nuevo y vuelve a intentarlo.</p>
            <RouterLink to="/cliente/recuperar" class="boton-enlace">Pedir un enlace nuevo</RouterLink>
          </div>

          <div v-else-if="estado === 'listo'" class="exito" role="status">
            <p><strong>¡Listo!</strong> Tu contraseña se actualizó.</p>
            <p class="exito__nota">Ya puedes iniciar sesión con tu correo y tu contraseña nueva.</p>
            <RouterLink to="/cliente/login" class="boton-enlace">Iniciar sesión</RouterLink>
          </div>

          <template v-else>
            <p class="descripcion">Hola {{ cuenta?.nombre }}, crea la contraseña de <strong>{{ cuenta?.correo }}</strong>.</p>
            <form novalidate @submit.prevent="guardar">
              <label for="nueva">Contraseña nueva</label>
              <input id="nueva" v-model="nueva" type="password" autocomplete="new-password" aria-describedby="ayuda-contrasena" required />
              <p id="ayuda-contrasena" class="ayuda">{{ CONTRASENA_AYUDA }}</p>

              <label for="repetir">Repite la contraseña</label>
              <input id="repetir" v-model="repetir" type="password" autocomplete="new-password" required />

              <p v-if="errorEnlace" class="error" role="alert">{{ errorEnlace }}</p>
              <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando...' : 'Guardar contraseña' }}</button>
            </form>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pagina-login {
  min-height: 100vh;
  background: #faf5ef;
  padding: 35px;
  font-family: Arial, sans-serif;
}

.volver {
  color: #a73a14;
  text-decoration: none;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  min-height: 44px; /* área táctil cómoda en el teléfono */
}

.contenedor-login {
  display: grid;
  grid-template-columns: 1fr 1fr;
  max-width: 1000px;
  min-height: 550px;
  margin: 45px auto;
  border-radius: 18px;
  overflow: hidden;
  background: white;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.08);
}

.presentacion {
  background: linear-gradient(145deg, #b9390b, #7b260e);
  color: white;
  padding: 65px 45px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.presentacion span {
  font-size: 13px;
  letter-spacing: 4px;
}

.presentacion h1 {
  font-family: Georgia, serif;
  font-size: 46px;
  font-weight: normal;
  line-height: 1.2;
  margin: 30px 0;
}

.presentacion p {
  line-height: 1.8;
  color: #f5dace;
  font-size: 16px;
}

.decoracion {
  font-size: 65px;
  margin-top: 35px;
  opacity: 0.6;
}

.formulario {
  padding: 65px 55px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.subtitulo {
  color: #b9390b;
  font-size: 12px;
  letter-spacing: 2px;
  font-weight: bold;
}

.formulario h2 {
  font-family: Georgia, serif;
  font-size: 36px;
  color: #2c1b14;
  margin: 15px 0 10px;
}

.descripcion {
  color: #806d62;
  margin-bottom: 28px;
  overflow-wrap: anywhere;
}

form {
  display: flex;
  flex-direction: column;
}

label {
  font-size: 14px;
  color: #443229;
  font-weight: 600;
  margin-bottom: 8px;
}

input {
  width: 100%;
  padding: 14px;
  border: 1px solid #ddcfc5;
  border-radius: 8px;
  margin-bottom: 22px;
  outline: none;
  font-size: 14px;
}

input:focus {
  border-color: #b9390b;
}

.ayuda {
  margin: -14px 0 22px;
  color: #806d62;
  font-size: 13px;
}

button,
.boton-enlace {
  display: inline-block;
  background: #b9390b;
  color: white;
  padding: 15px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: bold;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

button:hover,
.boton-enlace:hover {
  background: #932b09;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #bb2626;
  font-size: 13px;
  margin: 0 0 15px;
}

.error-caja,
.exito {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 10px;
}

.error-caja {
  border: 1px solid #e8b9b0;
  background: #fdf0ee;
  color: #8f2418;
}

.exito {
  border: 1px solid #b8d9c2;
  background: #eef8f0;
  color: #1f5a31;
}

.error-caja p,
.exito p {
  margin: 0;
  line-height: 1.5;
}

.exito__nota {
  font-size: 14px;
}

@media (max-width: 750px) {
  .contenedor-login {
    grid-template-columns: 1fr;
  }

  .presentacion {
    padding: 35px;
  }

  .presentacion h1 {
    font-size: 32px;
  }

  .formulario {
    padding: 40px 28px;
  }

  .pagina-login {
    padding: 18px;
  }
}
</style>
