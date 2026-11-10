

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const correo = ref('')
const contrasena = ref('')
const error = ref('')
const cargando = ref(false)

async function iniciarSesion() {
  error.value = ''
  cargando.value = true

  try {
    const respuesta = await fetch(
      '/api/auth-clientes/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          correo: correo.value,
          contrasena: contrasena.value
        })
      }
    )

    const datos = await respuesta.json()

    if (!respuesta.ok) {
      throw new Error(
        datos.mensaje || 'No se pudo iniciar sesión.'
      )
    }

    // Almacenamiento temporal para las pruebas locales.
    sessionStorage.setItem(
      'cliente_token',
      datos.token
    )

    sessionStorage.setItem(
      'cliente_datos',
      JSON.stringify(datos.cliente)
    )

    await router.push('/cliente')

  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : 'Error de conexión con el servidor.'
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="pagina-login">
    <RouterLink to="/cliente" class="volver">
      ← Volver al inicio
    </RouterLink>

    <div class="contenedor-login">
      <div class="presentacion">
        <span>LA MADALENA</span>
        <h1>Bienvenido de nuevo.</h1>
        <p>
          Inicia sesión para disfrutar de una
          experiencia especial en nuestro restaurante.
        </p>
        <div class="decoracion">✦</div>
      </div>

      <div class="formulario">
        <span class="subtitulo">
          ACCESO DE CLIENTES
        </span>

        <h2>Iniciar sesión</h2>

        <p class="descripcion">
          Ingresa tus datos para continuar.
        </p>

        <form @submit.prevent="iniciarSesion">
          <label for="correo">Correo electrónico</label>
          <input
            id="correo"
            v-model="correo"
            type="email"
            placeholder="ejemplo@correo.com"
            autocomplete="email"
            required
          />

          <label for="contrasena">Contraseña</label>
          <input
            id="contrasena"
            v-model="contrasena"
            type="password"
            placeholder="Ingresa tu contraseña"
            autocomplete="current-password"
            required
          />

          <p v-if="error" class="error">
            {{ error }}
          </p>

          <button type="submit" :disabled="cargando">
            {{ cargando ? 'Ingresando...' : 'Iniciar sesión' }}
          </button>
        </form>

        <p class="registro">
          ¿Aún no tienes una cuenta?
          <RouterLink to="/cliente/registro">
            Regístrate aquí
          </RouterLink>
        </p>
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
  font-size: 53px;
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
  font-size: 40px;
  color: #2c1b14;
  margin: 15px 0 10px;
}

.descripcion {
  color: #806d62;
  margin-bottom: 32px;
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

button {
  background: #b9390b;
  color: white;
  padding: 15px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
}

button:hover {
  background: #932b09;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #bb2626;
  font-size: 13px;
  margin-bottom: 15px;
}

.registro {
  text-align: center;
  font-size: 14px;
  margin-top: 30px;
  color: #806d62;
}

.registro a {
  color: #b9390b;
  font-weight: bold;
  text-decoration: none;
}

@media (max-width: 750px) {
  .contenedor-login {
    grid-template-columns: 1fr;
  }

  .presentacion {
    padding: 35px;
  }

  .presentacion h1 {
    font-size: 36px;
  }

  .formulario {
    padding: 40px 28px;
  }

  .pagina-login {
    padding: 18px;
  }
}
</style>
