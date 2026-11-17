
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// DATOS DE LA RESERVACION
const fecha = ref('')
const hora = ref('')
const personas = ref(2)

// PREFERENCIAS DE MESA (opcionales): el cliente ve las secciones del salón y sus características y elige lo que
// necesita. No aparta una mesa: la hostess lo ve al confirmar y al sentar al grupo.
interface OpcionSeccion {
  seccion: string
  mesas: number
  capacidad_maxima: number
  planta_baja: boolean
  espacio_carriola: boolean
  sin_escaleras: boolean
}

type Caracteristica = 'planta_baja' | 'espacio_carriola' | 'sin_escaleras'

const CARACTERISTICAS: { clave: Caracteristica; texto: string }[] = [
  { clave: 'planta_baja', texto: 'Planta baja' },
  { clave: 'espacio_carriola', texto: 'Espacio para carriola' },
  { clave: 'sin_escaleras', texto: 'Sin escaleras' }
]

const secciones = ref<OpcionSeccion[]>([])
const opcionesCargadas = ref(false)
const prefZona = ref('')
const prefCaracteristicas = ref<Record<Caracteristica, boolean>>({
  planta_baja: false,
  espacio_carriola: false,
  sin_escaleras: false
})

/** ¿Hay alguna mesa con esa característica en la sección elegida (o en cualquiera)? */
function hayCaracteristica(clave: Caracteristica): boolean {
  // Si no se pudieron cargar las opciones, se ofrecen todas: la hostess decide.
  if (!opcionesCargadas.value) return true
  const elegidas = prefZona.value
    ? secciones.value.filter((s) => s.seccion === prefZona.value)
    : secciones.value
  return elegidas.some((s) => s[clave])
}

function textoCaracteristicas(s: OpcionSeccion): string[] {
  return CARACTERISTICAS.filter((c) => s[c.clave]).map((c) => c.texto)
}

// Si la sección elegida no tiene una característica marcada, se desmarca.
watch(prefZona, () => {
  for (const c of CARACTERISTICAS) {
    if (!hayCaracteristica(c.clave)) prefCaracteristicas.value[c.clave] = false
  }
})

async function cargarOpciones() {
  const token = sessionStorage.getItem('cliente_token')
  if (!token) return
  try {
    const respuesta = await fetch('/api/reservaciones-clientes/opciones-mesa', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!respuesta.ok) return
    secciones.value = await respuesta.json()
    opcionesCargadas.value = true
  } catch {
    // Sin opciones el formulario sigue funcionando: solo no se muestran las secciones.
  }
}

onMounted(cargarOpciones)

const cargando = ref(false)
const error = ref('')
const mensaje = ref('')
const reservacionCreada = ref<number | null>(null)

// Fecha minima: hoy, segun el navegador
const fechaMinima = computed(() => {
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')

  return `${anio}-${mes}-${dia}`
})

// Horarios de ejemplo.
// Deben ajustarse al horario real del restaurante.
const horarios = [
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00'
]

async function solicitarReservacion() {
  error.value = ''
  mensaje.value = ''

  const token = sessionStorage.getItem('cliente_token')

  if (!token) {
    await router.push('/cliente/login')
    return
  }

  if (!fecha.value || !hora.value) {
    error.value = 'Selecciona una fecha y una hora.'
    return
  }

  const fechaHora = `${fecha.value} ${hora.value}:00`

  cargando.value = true

  try {
    const respuesta = await fetch(
      '/api/reservaciones-clientes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fecha_hora: fechaHora,
          personas: personas.value,
          pref_zona: prefZona.value || null,
          pref_planta_baja: prefCaracteristicas.value.planta_baja,
          pref_carriola: prefCaracteristicas.value.espacio_carriola,
          pref_sin_escaleras: prefCaracteristicas.value.sin_escaleras
        })
      }
    )

    const datos = await respuesta.json()

    if (respuesta.status === 401) {
      sessionStorage.removeItem('cliente_token')
      sessionStorage.removeItem('cliente_datos')
      await router.push('/cliente/login')
      return
    }

    if (!respuesta.ok) {
      throw new Error(
        datos.mensaje ||
        'No se pudo registrar la reservación.'
      )
    }

    reservacionCreada.value =
      datos.reservacion.id_reservacion

    mensaje.value =
      'Recibimos tu solicitud. Todavía no está confirmada: ' +
      'te avisaremos por correo cuando el restaurante la confirme. ' +
      'Hasta entonces no tienes una mesa asegurada.'

    fecha.value = ''
    hora.value = ''
    personas.value = 2
    prefZona.value = ''
    prefCaracteristicas.value = { planta_baja: false, espacio_carriola: false, sin_escaleras: false }

  } catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Error de conexión con el servidor.'
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="pagina-reservacion">

    <header class="encabezado">
      <RouterLink to="/cliente" class="marca">
        <span class="marca-icono">✦</span>
        <span>La Madalena</span>
      </RouterLink>

      <RouterLink to="/cliente" class="volver">
        ← Volver al inicio
      </RouterLink>
    </header>

    <main class="contenido">

      <section class="presentacion">
        <span class="etiqueta">
          LA MADALENA · RESERVACIONES
        </span>

        <h1>
          Tu mesa te
          <br>
          espera.
        </h1>

        <p>
          Planea tu próxima visita y disfruta
          de una experiencia gastronómica especial.
        </p>

        <div class="decoracion">✦</div>

        <div class="informacion">
          <h3>¿Cómo funciona?</h3>

          <p>1. Selecciona fecha, hora y personas.</p>
          <p>2. Envía tu solicitud de reservación.</p>
          <p>3. Hostess revisará y confirmará tu solicitud.</p>
          <p>4. Hostess asignará la mesa correspondiente.</p>
        </div>
      </section>

      <section class="panel-formulario">

        <span class="subtitulo">
          RESERVA TU EXPERIENCIA
        </span>

        <h2>Solicitar reservación</h2>

        <p class="descripcion">
          Completa los detalles de tu próxima visita.
        </p>

        <form @submit.prevent="solicitarReservacion">

          <label for="fecha">Fecha de la visita</label>
          <input
            id="fecha"
            v-model="fecha"
            type="date"
            :min="fechaMinima"
            required
          />

          <label for="hora">Hora de la visita</label>
          <select
            id="hora"
            v-model="hora"
            required
          >
            <option value="" disabled>
              Selecciona una hora
            </option>

            <option
              v-for="horario in horarios"
              :key="horario"
              :value="horario"
            >
              {{ horario }}
            </option>
          </select>

          <label for="personas">
            Número de personas
          </label>

          <select
            id="personas"
            v-model.number="personas"
            required
          >
            <option
              v-for="cantidad in 20"
              :key="cantidad"
              :value="cantidad"
            >
              {{ cantidad }}
              {{ cantidad === 1 ? 'persona' : 'personas' }}
            </option>
          </select>

          <fieldset class="preferencias">
            <legend>¿Dónde te gustaría sentarte? (opcional)</legend>
            <p class="preferencias__ayuda">
              Elige una sección o lo que necesites. Lo tomaremos en cuenta al asignar tu mesa,
              según disponibilidad.
            </p>

            <div
              v-if="secciones.length"
              class="secciones"
              role="radiogroup"
              aria-label="Sección preferida"
            >
              <label
                class="seccion"
                :class="{ 'seccion--activa': prefZona === '' }"
              >
                <input v-model="prefZona" type="radio" name="pref-zona" value="" />
                <span class="seccion__nombre">Cualquier sección</span>
                <span class="seccion__detalle">La que esté disponible</span>
              </label>
              <label
                v-for="s in secciones"
                :key="s.seccion"
                class="seccion"
                :class="{ 'seccion--activa': prefZona === s.seccion }"
              >
                <input v-model="prefZona" type="radio" name="pref-zona" :value="s.seccion" />
                <span class="seccion__nombre">{{ s.seccion }}</span>
                <span class="seccion__detalle">
                  {{ s.mesas }} {{ s.mesas === 1 ? 'mesa' : 'mesas' }} · hasta {{ s.capacidad_maxima }} personas
                </span>
                <span v-if="textoCaracteristicas(s).length" class="seccion__chips">
                  <span v-for="c in textoCaracteristicas(s)" :key="c" class="chip">{{ c }}</span>
                </span>
              </label>
            </div>

            <div class="caracteristicas">
              <label
                v-for="c in CARACTERISTICAS"
                :key="c.clave"
                class="caracteristica"
                :class="{ 'caracteristica--no': !hayCaracteristica(c.clave) }"
              >
                <input
                  v-model="prefCaracteristicas[c.clave]"
                  type="checkbox"
                  :disabled="!hayCaracteristica(c.clave)"
                />
                <span>
                  {{ c.texto }}
                  <small v-if="!hayCaracteristica(c.clave)">
                    {{ prefZona ? 'No disponible en esta sección' : 'No disponible' }}
                  </small>
                </span>
              </label>
            </div>
          </fieldset>

          <p class="aviso">
            La solicitud estará sujeta a disponibilidad
            y confirmación por parte del restaurante.
          </p>

          <p v-if="error" class="error" role="alert">
            {{ error }}
          </p>

          <div
            v-if="mensaje"
            class="mensaje-exito"
            role="status"
          >
            <strong>Solicitud recibida</strong>

            <p>{{ mensaje }}</p>

            <p v-if="reservacionCreada">
              Folio: #{{ reservacionCreada }}
            </p>
          </div>

          <button
            type="submit"
            :disabled="cargando"
          >
            {{
              cargando
                ? 'Enviando solicitud...'
                : 'Solicitar reservación →'
            }}
          </button>

        </form>

        <RouterLink
          to="/cliente/mis-reservaciones"
          class="mis-reservaciones"
        >
          Consultar mis reservaciones
        </RouterLink>

      </section>
    </main>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pagina-reservacion {
  min-height: 100vh;
  background: #faf5ef;
  font-family: Arial, sans-serif;
  color: #2c1b14;
}

.encabezado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 6%;
  gap: 20px;
}

.marca {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #2c1b14;
  text-decoration: none;
  font-family: Georgia, serif;
  font-size: 25px;
  font-weight: bold;
}

.marca-icono {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #b9390b;
  color: white;
  border-radius: 50%;
}

.volver {
  text-decoration: none;
  color: #a53a16;
  font-size: 14px;
  font-weight: bold;
}

.contenido {
  max-width: 1100px;
  min-height: 600px;
  margin: 40px auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-radius: 18px;
  overflow: hidden;
  background: white;
  box-shadow: 0 12px 35px rgba(0,0,0,0.08);
}

.presentacion {
  background: linear-gradient(
    145deg,
    #b9390b,
    #7b260e
  );
  padding: 65px 50px;
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.etiqueta {
  font-size: 12px;
  letter-spacing: 3px;
}

.presentacion h1 {
  font-family: Georgia, serif;
  font-size: clamp(45px, 5vw, 66px);
  font-weight: normal;
  line-height: 1.1;
  margin: 30px 0;
}

.presentacion > p {
  color: #f5dace;
  line-height: 1.8;
  font-size: 16px;
}

.decoracion {
  font-size: 60px;
  opacity: 0.6;
  margin: 30px 0;
}

.informacion {
  border-top: 1px solid #ffffff55;
  padding-top: 20px;
}

.informacion h3 {
  font-family: Georgia, serif;
  font-size: 24px;
}

.informacion p {
  color: #f5dace;
  font-size: 14px;
  line-height: 1.7;
}

.panel-formulario {
  padding: 65px 55px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.subtitulo {
  color: #b9390b;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 2px;
}

.panel-formulario h2 {
  font-family: Georgia, serif;
  font-size: 39px;
  margin: 15px 0 10px;
}

.descripcion {
  color: #806d62;
  margin-bottom: 30px;
  line-height: 1.5;
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

input,
select {
  width: 100%;
  padding: 14px;
  background: white;
  border: 1px solid #ddcfc5;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 23px;
  color: #39251c;
  outline: none;
}

input:focus,
select:focus {
  border-color: #b9390b;
}

.preferencias {
  margin: 0 0 23px;
  padding: 16px;
  border: 1px solid #ddcfc5;
  border-radius: 10px;
  min-width: 0;
}
.preferencias legend {
  padding: 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: #443229;
}
.preferencias__ayuda {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.5;
  color: #806d62;
}
.secciones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.seccion {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #ddcfc5;
  border-radius: 9px;
  background: #fffaf6;
  cursor: pointer;
}
.seccion input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}
.seccion:has(input:focus-visible) {
  outline: 3px solid #b9390b;
  outline-offset: 2px;
}
.seccion--activa {
  border: 2px solid #b9390b;
  background: #fbeee6;
}
.seccion__nombre {
  font-weight: bold;
  color: #2c1b14;
}
.seccion__detalle {
  font-size: 12px;
  font-weight: normal;
  color: #806d62;
}
.seccion__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3e2d7;
  color: #7b260e;
  font-size: 11px;
  font-weight: 600;
}
.caracteristicas {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.caracteristica {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-weight: 600;
  cursor: pointer;
}
.caracteristica input {
  width: 20px;
  height: 20px;
  margin: 0;
  padding: 0;
  flex: none;
  accent-color: #b9390b;
}
.caracteristica small {
  display: block;
  font-size: 12px;
  font-weight: normal;
  color: #806d62;
}
.caracteristica--no {
  color: #a8968b;
  cursor: not-allowed;
}
.aviso {
  font-size: 13px;
  color: #806d62;
  line-height: 1.6;
  margin: 0 0 25px;
}

button {
  width: 100%;
  background: #b9390b;
  color: white;
  border: none;
  padding: 16px;
  border-radius: 9px;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
}

button:hover {
  background: #922d08;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #b22222;
  font-size: 14px;
  margin-bottom: 15px;
}

.mensaje-exito {
  background: #edf7ee;
  border: 1px solid #a8d4ad;
  color: #256332;
  padding: 16px;
  border-radius: 9px;
  margin-bottom: 20px;
  font-size: 14px;
  line-height: 1.5;
}

.mensaje-exito p {
  margin: 8px 0 0;
}

.mis-reservaciones {
  text-align: center;
  color: #b9390b;
  text-decoration: none;
  font-size: 14px;
  font-weight: bold;
  margin-top: 25px;
}

@media (max-width: 800px) {
  .contenido {
    grid-template-columns: 1fr;
    margin: 20px 15px;
  }

  .presentacion {
    padding: 40px 30px;
  }

  .panel-formulario {
    padding: 40px 25px;
  }

  .encabezado {
    flex-wrap: wrap;
  }
}
</style>
