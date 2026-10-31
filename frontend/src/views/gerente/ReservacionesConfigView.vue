<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import type { ConfiguracionReservacion } from '../../types'

const tolerancia = ref('15')
const recordatorio = ref('5')
const cargando = ref(true)
const cargado = ref(false)
const guardando = ref(false)
const error = ref('')
const mensaje = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const config = await servicios.catalogo.obtenerConfiguracionReservacion()
    tolerancia.value = String(config.toleranciaMinutos)
    recordatorio.value = String(config.recordatorioMinutos)
    cargado.value = true
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
    mensaje.value = 'Configuración guardada. Los próximos correos usarán estos tiempos.'
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
        <p class="sobretitulo">Gerencia</p>
        <h2>Reservaciones</h2>
        <p>Define el tiempo de espera para la llegada y cuándo recordar al cliente.</p>
      </div>
      <button class="btn btn--secundario" type="button" :disabled="cargando || guardando" @click="cargar">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
        Actualizar
      </button>
    </header>

    <template v-if="cargando && !cargado">
      <div class="esqueletos" aria-hidden="true">
        <div class="esqueleto" />
        <div class="esqueleto" />
      </div>
      <p class="solo-lectores" role="status">Cargando configuración…</p>
    </template>

    <div v-else-if="!cargado" class="vacio" role="alert">
      <h3>No se pudo cargar la configuración</h3>
      <p>{{ error }}</p>
      <button type="button" class="btn" @click="cargar">Reintentar</button>
    </div>

    <template v-else>
      <form class="config panel" @submit.prevent="guardar">
        <div class="config__intro">
          <h3>Reglas de la reservación</h3>
          <p>Estos tiempos aplican a todas las reservaciones del restaurante.</p>
        </div>

        <div class="config__campos">
          <div class="campo">
            <label for="tolerancia">Tolerancia de llegada (minutos)</label>
            <input id="tolerancia" v-model="tolerancia" type="number" min="5" max="180" step="1" required :disabled="cargando || guardando" />
            <p class="campo__ayuda">
              Empieza a contar desde la hora reservada. Al vencer, la reservación se marca como vencida y la mesa se libera.
              De 5 a 180 minutos; predeterminado: 15.
            </p>
          </div>
          <div class="campo">
            <label for="recordatorio">Recordatorio antes de la reservación (minutos)</label>
            <input id="recordatorio" v-model="recordatorio" type="number" min="1" max="30" step="1" required :disabled="cargando || guardando" />
            <p class="campo__ayuda">
              El cliente recibe un correo este tiempo antes de su hora. De 1 a 30 minutos; predeterminado: 5.
            </p>
          </div>
        </div>

        <div v-if="error" class="aviso aviso--error" role="alert">
          <p>{{ error }}</p>
        </div>
        <div v-if="mensaje" class="aviso aviso--exito" role="status">
          <p>{{ mensaje }}</p>
        </div>

        <div class="config__acciones">
          <button class="btn btn--grande" type="submit" :disabled="cargando || guardando">
            {{ guardando ? 'Guardando…' : 'Guardar configuración' }}
          </button>
        </div>
      </form>

      <section class="correos panel" aria-labelledby="correos-titulo">
        <div class="correos__icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <div class="correos__texto">
          <h3 id="correos-titulo">Correos automáticos</h3>
          <p>El sistema escribe al cliente cuando su reservación cambia de estado. No hay que hacer nada más.</p>
          <ul>
            <li><strong>Confirmación:</strong> al crear o confirmar la reservación.</li>
            <li><strong>Recordatorio:</strong> antes de la hora, con el tiempo que definas arriba.</li>
            <li><strong>Vencimiento o cancelación:</strong> si la reservación no se presenta o se cancela.</li>
          </ul>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.pagina {
  max-width: 860px;
}

.encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.encabezado h2 {
  margin: var(--espacio-1) 0 0;
}

.encabezado p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.esqueletos {
  display: grid;
  gap: var(--espacio-4);
}

.esqueletos .esqueleto {
  min-height: 120px;
}

.config {
  display: grid;
  gap: var(--espacio-5);
}

.config__intro h3 {
  margin: 0;
  font-size: var(--texto-xl);
}

.config__intro p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.config__campos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--espacio-5);
}

.config__acciones {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--espacio-3);
  border-top: 1px solid var(--color-border);
}

.config__acciones .btn {
  width: 100%;
}

@media (min-width: 40em) {
  .config__acciones .btn {
    width: auto;
    min-width: 240px;
  }
}

.correos {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-4);
  border-left: 6px solid var(--color-secondary);
}

.correos__icono {
  display: grid;
  flex: none;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-secondary-soft);
  color: var(--color-secondary-dark);
}

.correos__texto h3 {
  margin: 0;
}

.correos__texto p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.correos__texto ul {
  display: grid;
  gap: var(--espacio-1);
  margin: var(--espacio-3) 0 0;
  padding-left: var(--espacio-5);
}

@media (max-width: 30em) {
  .correos {
    flex-direction: column;
  }
}
</style>
