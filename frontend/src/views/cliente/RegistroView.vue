
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AccesoGoogle from '../../components/cliente/AccesoGoogle.vue'
import { errorCorreo, errorNombrePersona, errorTelefono, vPermitir } from '../../utils/campos'
import { LADA_PREDETERMINADA, rangoTelefono, textoDigitos } from '../../utils/lada'
import SelectorLada from '../../components/SelectorLada.vue'

const router = useRouter()

const nombre = ref('')
const correo = ref('')
const telefono = ref('')
const lada = ref(LADA_PREDETERMINADA)
const contrasena = ref('')
const confirmarContrasena = ref('')

const error = ref('')
const cargando = ref(false)

async function registrarCliente() {
  error.value = ''

  if (contrasena.value !== confirmarContrasena.value) {
    error.value = 'Las contraseñas no coinciden.'
    return
  }

  const errNombre = errorNombrePersona(nombre.value)
  if (errNombre) {
    error.value = errNombre
    return
  }

  const errCorreo = errorCorreo(correo.value)
  if (errCorreo) {
    error.value = errCorreo
    return
  }

  const errTelefono = errorTelefono(telefono.value, true, lada.value)
  if (errTelefono) {
    error.value = errTelefono
    return
  }

  if (contrasena.value.length < 8) {
    error.value = 'La contraseña debe tener al menos 8 caracteres.'
    return
  }

  cargando.value = true

  try {
    const respuesta = await fetch('/api/auth-clientes/registro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nombre: nombre.value.trim(),
        correo: correo.value.trim(),
        telefono: telefono.value.trim(),
        lada: lada.value,
        contrasena: contrasena.value
      })
    })

    const datos = await respuesta.json()

    if (!respuesta.ok) {
      throw new Error(
        datos.mensaje || 'No se pudo crear la cuenta.'
      )
    }

    // Después del registro, el cliente debe iniciar sesión.
    await router.push('/cliente/login')

  } catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Error al conectar con el servidor.'
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="pagina-registro">
    <RouterLink to="/cliente" class="volver">
      ← Volver al inicio
    </RouterLink>

    <div class="contenedor">
      <section class="presentacion">
        <span class="etiqueta">LA MADALENA</span>
        <h1>Tu próxima experiencia comienza aquí.</h1>
        <p>
          Crea una cuenta para reservar tu mesa
          y disfrutar de momentos especiales.
        </p>
        <div class="decoracion">✦</div>
        <span class="pie-presentacion">
          COCINA MEXICANA CONTEMPORÁNEA
        </span>
      </section>

      <section class="formulario">
        <span class="subtitulo">BIENVENIDO</span>
        <h2>Crea tu cuenta</h2>
        <p class="descripcion">
          Completa tus datos para comenzar.
        </p>

        <form @submit.prevent="registrarCliente">
          <label for="nombre">Nombre completo</label>
          <input
            id="nombre" v-permitir="'nombre'"
            v-model="nombre"
            type="text"
            placeholder="Tu nombre completo"
            autocomplete="name"
            maxlength="100"
            required
          />

          <label for="correo">Correo electrónico</label>
          <input
            id="correo" v-permitir="'correo'"
            v-model="correo"
            type="email"
            placeholder="ejemplo@correo.com"
            autocomplete="email"
            maxlength="120"
            required
          />

          <label for="telefono">Teléfono</label>
          <div class="telefono-fila">
            <SelectorLada v-model="lada" />
            <input
              id="telefono" v-permitir="'digitos'"
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

          <label for="contrasena">Contraseña</label>
          <input
            id="contrasena"
            v-model="contrasena"
            type="password"
            placeholder="Mínimo 8 caracteres"
            autocomplete="new-password"
            minlength="8"
            maxlength="72"
            required
          />

          <label for="confirmar">Confirmar contraseña</label>
          <input
            id="confirmar"
            v-model="confirmarContrasena"
            type="password"
            placeholder="Repite tu contraseña"
            autocomplete="new-password"
            required
          />

          <p v-if="error" class="error" role="alert">
            {{ error }}
          </p>

          <button type="submit" :disabled="cargando">
            {{ cargando ? 'Creando cuenta...' : 'Crear cuenta →' }}
          </button>
        </form>

        <AccesoGoogle modo="registro" />

        <p class="acceso">
          ¿Ya tienes una cuenta?
          <RouterLink to="/cliente/login">
            Inicia sesión
          </RouterLink>
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pagina-registro {
  min-height: 100vh;
  background: #faf5ef;
  padding: 30px;
  font-family: Arial, sans-serif;
}

.volver {
  color: #a73a14;
  text-decoration: none;
  font-weight: 600;
}

.contenedor {
  max-width: 1050px;
  margin: 35px auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: white;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 12px 35px rgba(0,0,0,.08);
}

.presentacion {
  background: linear-gradient(145deg, #b9390b, #7b260e);
  color: white;
  padding: 60px 45px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.etiqueta {
  letter-spacing: 4px;
  font-size: 13px;
}

.presentacion h1 {
  font-family: Georgia, serif;
  font-size: 48px;
  line-height: 1.15;
  font-weight: normal;
  margin: 35px 0;
}

.presentacion p {
  font-size: 16px;
  line-height: 1.8;
  color: #f5dace;
}

.decoracion {
  font-size: 65px;
  margin: 40px 0;
  opacity: .7;
}

.pie-presentacion {
  font-size: 11px;
  letter-spacing: 2px;
}

.formulario {
  padding: 50px 55px;
}

.subtitulo {
  color: #b9390b;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 2px;
}

.formulario h2 {
  font-family: Georgia, serif;
  font-size: 40px;
  margin: 15px 0 10px;
  color: #2c1b14;
}

.descripcion {
  color: #806d62;
  margin-bottom: 30px;
}

form {
  display: flex;
  flex-direction: column;
}

label {
  font-size: 14px;
  font-weight: 600;
  color: #443229;
  margin-bottom: 8px;
}

/* Lada + teléfono */
.telefono-fila {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

.telefono-fila .selector-lada {
  flex: 0 1 190px;
  padding: 13px 10px;
  border: 1px solid #ddcfc5;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
}

.telefono-fila input {
  flex: 1 1 150px;
  min-width: 0;
  margin-bottom: 0;
}

input {
  width: 100%;
  padding: 13px 15px;
  border: 1px solid #ddcfc5;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 20px;
  outline: none;
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
  font-weight: bold;
  font-size: 15px;
  cursor: pointer;
}

button:hover {
  background: #932b09;
}

button:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.error {
  color: #b22222;
  margin-bottom: 15px;
  font-size: 13px;
}

.acceso {
  text-align: center;
  margin-top: 25px;
  color: #806d62;
  font-size: 14px;
}

.acceso a {
  color: #b9390b;
  font-weight: bold;
  text-decoration: none;
}

@media (max-width: 750px) {
  .pagina-registro {
    padding: 16px;
  }

  .contenedor {
    grid-template-columns: 1fr;
  }

  .presentacion {
    padding: 35px;
  }

  .presentacion h1 {
    font-size: 35px;
  }

  .decoracion {
    display: none;
  }

  .formulario {
    padding: 35px 25px;
  }
}
</style>
