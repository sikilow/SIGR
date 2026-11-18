
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

interface Reservacion {
  id_reservacion: number
  fecha_hora: string
  personas: number
  estado: string
  mesa_numero: number | null
  pref_zona?: string | null
  /** Características que pidió (catálogo de Gerencia). */
  pref_caracteristicas?: Array<{ id_caracteristica: number; nombre: string }>
}

/** Lo que pidió el cliente al reservar: «Terraza · Planta baja · Espacio para carriola». Vacío si no pidió nada. */
function textoPreferencias(r: Reservacion): string {
  return [r.pref_zona, ...(r.pref_caracteristicas ?? []).map((c) => c.nombre)]
    .filter(Boolean)
    .join(' · ')
}

const router = useRouter()
const reservaciones = ref<Reservacion[]>([])
const cargando = ref(true)
const error = ref('')

async function cargarReservaciones() {
  cargando.value = true
  error.value = ''

  const token = sessionStorage.getItem('cliente_token')

  if (!token) {
    await router.replace('/cliente/login')
    return
  }

  try {
    const respuesta = await fetch(
      '/api/reservaciones-clientes/mis-reservaciones',
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (respuesta.status === 401 || respuesta.status === 403) {
      sessionStorage.removeItem('cliente_token')
      sessionStorage.removeItem('cliente_datos')
      await router.replace('/cliente/login')
      return
    }

    if (!respuesta.ok) {
      throw new Error('No se pudieron consultar las reservaciones.')
    }

    reservaciones.value = await respuesta.json()

  } catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Error de conexión con el servidor.'
  } finally {
    cargando.value = false
  }
}

function mostrarFecha(valor: string): string {
  // Formato de MySQL: AAAA-MM-DD HH:mm:ss
  // Evitamos convertirlo a UTC para no cambiar la fecha.
  const fecha = valor.slice(0, 10)
  const [anio, mes, dia] = fecha.split('-')

  return `${dia}/${mes}/${anio}`
}

function mostrarHora(valor: string): string {
  return valor.slice(11, 16)
}

/**
 * Una reservación sin confirmar es una SOLICITUD: todavía no tiene mesa asegurada, así que no aparece como «próxima».
 *  - solicitudes: pendientes de confirmar por el restaurante.
 *  - proximas: confirmadas que aún no pasan, por fecha.
 *  - historial: todo lo demás (llegó, cancelada, vencida o ya pasada), lo más reciente primero.
 */
function aMilisegundos(valor: string): number {
  // «AAAA-MM-DD HH:mm:ss» en hora local del restaurante.
  return new Date(valor.replace(' ', 'T')).getTime()
}

const solicitudes = computed(() =>
  reservaciones.value
    .filter((r) => r.estado === 'pendiente')
    .sort((a, b) => aMilisegundos(a.fecha_hora) - aMilisegundos(b.fecha_hora)),
)

const proximas = computed(() =>
  reservaciones.value
    .filter((r) => r.estado === 'confirmada' && aMilisegundos(r.fecha_hora) >= Date.now())
    .sort((a, b) => aMilisegundos(a.fecha_hora) - aMilisegundos(b.fecha_hora)),
)

const historial = computed(() => {
  const enOtrasListas = new Set([...solicitudes.value, ...proximas.value].map((r) => r.id_reservacion))
  return reservaciones.value
    .filter((r) => !enOtrasListas.has(r.id_reservacion))
    .sort((a, b) => aMilisegundos(b.fecha_hora) - aMilisegundos(a.fecha_hora))
})

function estadoTexto(estado: string): string {
  const estados: Record<string, string> = {
    pendiente: 'Solicitud pendiente',
    confirmada: 'Confirmada',
    cancelada: 'Cancelada',
    llego: 'Llegada registrada',
    vencida: 'Vencida'
  }

  return estados[estado] ?? estado
}

onMounted(cargarReservaciones)
</script>

<template>
  <div class="pagina-reservaciones">

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

      <div class="titulo">
        <span class="etiqueta">LA MADALENA · MI CUENTA</span>

        <h1>Mis reservaciones</h1>

        <p>
          Consulta tus solicitudes y revisa su estado
          de confirmación.
        </p>
      </div>

      <div class="acciones">
        <RouterLink
          to="/cliente/reservar"
          class="boton-principal"
        >
          + Nueva reservación
        </RouterLink>

        <button
          type="button"
          class="boton-actualizar"
          :disabled="cargando"
          @click="cargarReservaciones"
        >
          Actualizar
        </button>
      </div>

      <p v-if="cargando" class="mensaje">
        Cargando tus reservaciones...
      </p>

      <p v-else-if="error" class="error" role="alert">
        {{ error }}
      </p>

      <div
        v-else-if="reservaciones.length === 0"
        class="sin-reservaciones"
      >
        <div class="icono-calendario">✦</div>

        <h2>Aún no tienes reservaciones</h2>

        <p>
          Tu próxima experiencia en La Madalena
          comienza con una reservación.
        </p>

        <RouterLink
          to="/cliente/reservar"
          class="boton-principal"
        >
          Reservar una mesa
        </RouterLink>
      </div>

      <template v-else>
        <section v-if="solicitudes.length > 0" class="grupo" aria-labelledby="grupo-solicitudes">
          <h2 id="grupo-solicitudes" class="grupo-titulo">Solicitudes en espera de confirmación</h2>
          <p class="grupo-ayuda">
            Todavía no tienes una mesa asegurada. Te avisaremos por correo cuando el restaurante confirme cada solicitud.
          </p>
          <div class="lista-reservaciones">
            <article v-for="reservacion in solicitudes" :key="reservacion.id_reservacion" class="tarjeta">
              <div class="tarjeta-superior">
                <div>
                  <span class="folio">SOLICITUD #{{ reservacion.id_reservacion }}</span>
                  <h2>{{ mostrarFecha(reservacion.fecha_hora) }}</h2>
                </div>
                <span class="estado" :class="reservacion.estado">{{ estadoTexto(reservacion.estado) }}</span>
              </div>
              <div class="detalles">
                <div><span>Hora</span><strong>{{ mostrarHora(reservacion.fecha_hora) }}</strong></div>
                <div><span>Personas</span><strong>{{ reservacion.personas }}</strong></div>
                <div><span>Mesa</span><strong>Se asigna al confirmar</strong></div>
                <div v-if="textoPreferencias(reservacion)" class="detalles__pidio"><span>Pediste</span><strong>{{ textoPreferencias(reservacion) }}</strong></div>
              </div>
              <p class="nota">Recibimos tu solicitud. Está pendiente de confirmación por parte del restaurante.</p>
            </article>
          </div>
        </section>

        <section class="grupo" aria-labelledby="grupo-proximas">
          <h2 id="grupo-proximas" class="grupo-titulo">Próximas reservaciones</h2>
          <p v-if="proximas.length === 0" class="grupo-ayuda">
            Aún no tienes reservaciones confirmadas. Aquí aparecerán cuando el restaurante confirme tus solicitudes.
          </p>
          <div v-else class="lista-reservaciones">
            <article v-for="reservacion in proximas" :key="reservacion.id_reservacion" class="tarjeta">
              <div class="tarjeta-superior">
                <div>
                  <span class="folio">RESERVACIÓN #{{ reservacion.id_reservacion }}</span>
                  <h2>{{ mostrarFecha(reservacion.fecha_hora) }}</h2>
                </div>
                <span class="estado" :class="reservacion.estado">{{ estadoTexto(reservacion.estado) }}</span>
              </div>
              <div class="detalles">
                <div><span>Hora</span><strong>{{ mostrarHora(reservacion.fecha_hora) }}</strong></div>
                <div><span>Personas</span><strong>{{ reservacion.personas }}</strong></div>
                <div>
                  <span>Mesa</span>
                  <strong>{{ reservacion.mesa_numero ? `Mesa ${reservacion.mesa_numero}` : 'Por asignar al llegar' }}</strong>
                </div>
                <div v-if="textoPreferencias(reservacion)" class="detalles__pidio"><span>Pediste</span><strong>{{ textoPreferencias(reservacion) }}</strong></div>
              </div>
              <p class="nota">Tu reservación ha sido confirmada por el restaurante.</p>
            </article>
          </div>
        </section>

        <section v-if="historial.length > 0" class="grupo" aria-labelledby="grupo-historial">
          <h2 id="grupo-historial" class="grupo-titulo">Historial</h2>
          <div class="lista-reservaciones">
            <article v-for="reservacion in historial" :key="reservacion.id_reservacion" class="tarjeta">
              <div class="tarjeta-superior">
                <div>
                  <span class="folio">RESERVACIÓN #{{ reservacion.id_reservacion }}</span>
                  <h2>{{ mostrarFecha(reservacion.fecha_hora) }}</h2>
                </div>
                <span class="estado" :class="reservacion.estado">{{ estadoTexto(reservacion.estado) }}</span>
              </div>
              <div class="detalles">
                <div><span>Hora</span><strong>{{ mostrarHora(reservacion.fecha_hora) }}</strong></div>
                <div><span>Personas</span><strong>{{ reservacion.personas }}</strong></div>
              </div>
              <p v-if="reservacion.estado === 'cancelada'" class="nota">Esta reservación fue cancelada.</p>
              <p v-else-if="reservacion.estado === 'vencida'" class="nota">
                Esta solicitud o reservación venció: no se confirmó o no se registró tu llegada a tiempo.
              </p>
            </article>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pagina-reservaciones {
  min-height: 100vh;
  background: #faf5ef;
  color: #2c1b14;
  font-family: Arial, sans-serif;
}

.encabezado {
  padding: 22px 6%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.marca {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #2c1b14;
  font-family: Georgia, serif;
  font-size: 25px;
  font-weight: bold;
  text-decoration: none;
}

.marca-icono {
  width: 42px;
  height: 42px;
  background: #b9390b;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.volver {
  color: #a53a16;
  text-decoration: none;
  font-size: 14px;
  font-weight: bold;
}

.contenido {
  max-width: 1000px;
  margin: 50px auto;
  padding: 0 25px 70px;
}

.titulo {
  text-align: center;
}

.etiqueta {
  color: #b9390b;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 2px;
}

.titulo h1 {
  font-family: Georgia, serif;
  font-size: clamp(36px, 5vw, 54px);
  margin: 20px 0;
}

.titulo p {
  color: #806d62;
  line-height: 1.7;
}

.acciones {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin: 40px 0 25px;
}

.boton-principal {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background: #b9390b;
  color: white;
  padding: 15px 22px;
  border-radius: 9px;
  text-decoration: none;
  font-weight: bold;
  font-size: 14px;
}

.boton-principal:hover {
  background: #922d08;
}

.boton-actualizar {
  border: 1px solid #cfa58d;
  background: transparent;
  color: #a53a16;
  border-radius: 9px;
  padding: 13px 22px;
  font-weight: bold;
  cursor: pointer;
}

.boton-actualizar:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lista-reservaciones {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.tarjeta {
  background: white;
  border: 1px solid #eadbd1;
  border-radius: 14px;
  padding: 28px;
  box-shadow: 0 8px 25px rgba(0,0,0,0.04);
}

.tarjeta-superior {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.folio {
  color: #a53a16;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 1.5px;
}

.tarjeta h2 {
  font-family: Georgia, serif;
  font-size: 28px;
  margin: 12px 0;
}

.estado {
  padding: 9px 14px;
  border-radius: 20px;
  background: #f5e8d6;
  color: #85561a;
  font-weight: bold;
  font-size: 12px;
}

.estado.confirmada {
  background: #e3f2e7;
  color: #257341;
}

.grupo {
  margin-top: 28px;
}

.grupo-titulo {
  margin: 0 0 6px;
  font-size: 1.25rem;
}

.grupo-ayuda {
  margin: 0 0 14px;
  color: #6b5547;
}

.estado.vencida {
  background: #fbeae8;
  color: #7a1818;
}

.estado.cancelada {
  background: #fbe5e5;
  color: #a52d2d;
}

.estado.llego {
  background: #e2edf7;
  color: #285c88;
}

.detalles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  border-top: 1px solid #eadbd1;
  margin-top: 18px;
  padding-top: 22px;
}

.detalles .detalles__pidio {
  grid-column: 1 / -1;
}

.detalles div {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detalles span {
  color: #806d62;
  font-size: 13px;
}

.detalles strong {
  font-size: 16px;
}

.nota {
  background: #faf5ef;
  padding: 14px;
  border-radius: 8px;
  color: #705b50;
  font-size: 13px;
  line-height: 1.6;
  margin-top: 25px;
}

.sin-reservaciones {
  background: white;
  border-radius: 14px;
  padding: 65px 25px;
  text-align: center;
  border: 1px solid #eadbd1;
}

.icono-calendario {
  font-size: 50px;
  color: #b9390b;
}

.sin-reservaciones h2 {
  font-family: Georgia, serif;
  margin: 20px 0;
}

.sin-reservaciones p {
  color: #806d62;
  margin-bottom: 25px;
}

.mensaje {
  text-align: center;
  color: #806d62;
}

.error {
  color: #b22222;
  text-align: center;
}

@media (max-width: 650px) {
  .encabezado,
  .acciones,
  .tarjeta-superior {
    flex-direction: column;
    align-items: flex-start;
  }

  .detalles {
    grid-template-columns: 1fr;
  }

  .tarjeta {
    padding: 20px;
  }
}
</style>
