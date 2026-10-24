<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import type { ConfiguracionReservacion } from '../../types'

const tolerancia = ref('15')
const recordatorio = ref('5')
const cargando = ref(true)
const guardando = ref(false)
const error = ref('')
const mensaje = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const config = await servicios.catalogo.obtenerConfiguracionReservacion()
    tolerancia.value = String(config.toleranciaMinutos)
    recordatorio.value = String(config.recordatorioMinutos)
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo cargar la configuración.'
  } finally {
    cargando.value = false
  }
}

async function guardar() {
  if (guardando.value || cargando.value) return
  const config: ConfiguracionReservacion = {
    toleranciaMinutos: Number(tolerancia.value),
    recordatorioMinutos: Number(recordatorio.value),
  }
  if (!Number.isInteger(config.toleranciaMinutos) || config.toleranciaMinutos < 5 || config.toleranciaMinutos > 180) {
    error.value = 'La tolerancia debe estar entre 5 y 180 minutos.'
    return
  }
  if (!Number.isInteger(config.recordatorioMinutos) || config.recordatorioMinutos < 1 || config.recordatorioMinutos > 30) {
    error.value = 'El recordatorio debe estar entre 1 y 30 minutos.'
    return
  }
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const guardada = await servicios.catalogo.actualizarConfiguracionReservacion(config)
    tolerancia.value = String(guardada.toleranciaMinutos)
    recordatorio.value = String(guardada.recordatorioMinutos)
    mensaje.value = 'Configuración guardada.'
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo guardar la configuración.'
  } finally {
    guardando.value = false
  }
}

onMounted(() => void cargar())
</script>

<template>
  <section class="pagina">
    <header class="encabezado">
      <div>
        <p class="encabezado__sobretitulo">Gerencia</p>
        <h1>Reservaciones</h1>
        <p>Define el tiempo de espera para la llegada y cuándo recordar al cliente.</p>
      </div>
    </header>

    <form class="config" @submit.prevent="guardar">
      <div class="campo">
        <label for="tolerancia">Tolerancia de llegada (minutos)</label>
        <input id="tolerancia" v-model="tolerancia" type="number" min="5" max="180" step="1" required :disabled="cargando || guardando" />
        <p class="campo__ayuda">Empieza a contar desde la hora reservada. Al vencer, la reservación se marca como vencida y la mesa se libera. De 5 a 180 minutos; predeterminado: 15.</p>
      </div>
      <div class="campo">
        <label for="recordatorio">Recordatorio antes de la reservación (minutos)</label>
        <input id="recordatorio" v-model="recordatorio" type="number" min="1" max="30" step="1" required :disabled="cargando || guardando" />
        <p class="campo__ayuda">El cliente recibe un correo este tiempo antes de su hora. De 1 a 30 minutos; predeterminado: 5.</p>
      </div>
      <p v-if="error" class="aviso aviso--error" role="alert">{{ error }}</p>
      <p v-if="mensaje" class="aviso" role="status">{{ mensaje }}</p>
      <button class="btn" type="submit" :disabled="cargando || guardando">
        {{ cargando ? 'Cargando…' : guardando ? 'Guardando…' : 'Guardar configuración' }}
      </button>
    </form>

    <!--<section class="smtp" aria-labelledby="smtp-titulo">
      <h2 id="smtp-titulo">Correo de reservaciones</h2>
      <p>Para enviar recordatorios y avisos de vencimiento, configura Resend en <code>backend/.env</code> y reinicia la API.</p>
      <p>Define <code>RESEND_API_KEY</code> y <code>RESEND_FROM</code> con un remitente de un dominio verificado. Mantén la API key solo en el backend; no la agregues al repositorio.</p>
      <p>Los mensajes fallidos permanecen en la cola y se reintentan automáticamente. Consulta <code>docs/resend-reservaciones.md</code> para la guía completa.</p>
    </section> !-->
    
  </section>
</template>

<style scoped>
.pagina {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--espacio-5);
}

.encabezado { margin-bottom: var(--espacio-5); }
.encabezado h1 { margin: 0; }
.encabezado p { color: var(--color-muted); }
.encabezado__sobretitulo { margin-bottom: var(--espacio-1); font-weight: 700; }

.config, .smtp {
  display: grid;
  gap: var(--espacio-4);
  padding: var(--espacio-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.smtp { margin-top: var(--espacio-4); }
.smtp h2, .smtp p { margin: 0; }
.smtp p { line-height: 1.5; }
.campo__ayuda { color: var(--color-muted); }
.aviso--error { color: var(--color-error); }
code { overflow-wrap: anywhere; }
</style>
