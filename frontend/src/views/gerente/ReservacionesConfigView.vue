<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import { vPermitir } from '../../utils/campos'
import type { ConfiguracionReservacion } from '../../types'
import {
  copiarHorario,
  DIAS_SEMANA,
  horarioPorDefecto,
  type HorarioReservacion,
  horasDeUnDia,
  INTERVALOS_RESERVACION,
  textoHorario,
  validarHorario,
} from '../../utils/horarioReservacion'

const tolerancia = ref('15')
const recordatorio = ref('5')
const anticipacion = ref('60')
const duracion = ref('90')
// Horario de reservaciones por día (migración 030): el intervalo es uno solo; cada día tiene su apertura y cierre.
const horario = ref<HorarioReservacion>(horarioPorDefecto())

const errorHorario = computed(() => validarHorario(horario.value))
const resumen = computed(() => (errorHorario.value ? '' : textoHorario(horario.value)))

/** Día cuyas horas se muestran en la vista previa (si queda cerrado, se pasa al primero abierto). */
const diaVista = ref(0)
const diasAbiertos = computed(() => horario.value.dias.map((d, i) => (d.abierto ? i : -1)).filter((i) => i >= 0))
const diaVistaActual = computed(() => (horario.value.dias[diaVista.value]?.abierto ? diaVista.value : (diasAbiertos.value[0] ?? 0)))
/** Lo que verá el cliente en el portal el día elegido. */
const vistaPrevia = computed(() => {
  const d = horario.value.dias[diaVistaActual.value]
  return errorHorario.value || !d ? [] : horasDeUnDia(d, horario.value.intervaloMinutos)
})

/** Copia la primera y la última hora de un día a todos los demás días (cada uno conserva si está abierto o cerrado). */
function copiarATodos(origen: number) {
  const o = horario.value.dias[origen]
  if (!o) return
  for (const d of horario.value.dias) {
    d.horaApertura = o.horaApertura
    d.horaUltima = o.horaUltima
  }
  mensaje.value = `Se copió el horario del ${DIAS_SEMANA[origen]!.nombre.toLowerCase()} a todos los días. Revisa y guarda.`
}

function aplicarHorario(config: HorarioReservacion) {
  horario.value = copiarHorario(config)
}
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
    anticipacion.value = String(config.anticipacionMinutos)
    duracion.value = String(config.duracionReservacionMinutos)
    aplicarHorario(config)
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
    anticipacionMinutos: Number(anticipacion.value),
    duracionReservacionMinutos: Number(duracion.value),
    ...copiarHorario(horario.value),
  }
  if (!Number.isInteger(config.toleranciaMinutos) || config.toleranciaMinutos < 5 || config.toleranciaMinutos > 180) {
    error.value = 'La tolerancia debe estar entre 5 y 180 minutos.'
    return
  }
  if (!Number.isInteger(config.recordatorioMinutos) || config.recordatorioMinutos < 1 || config.recordatorioMinutos > 30) {
    error.value = 'El recordatorio debe estar entre 1 y 30 minutos.'
    return
  }
  if (!Number.isInteger(config.anticipacionMinutos) || config.anticipacionMinutos < 0 || config.anticipacionMinutos > 1440) {
    error.value = 'La anticipación debe estar entre 0 y 1440 minutos (24 horas).'
    return
  }
  if (!Number.isInteger(config.duracionReservacionMinutos) || config.duracionReservacionMinutos < 30 || config.duracionReservacionMinutos > 360) {
    error.value = 'La duración de la reservación debe estar entre 30 y 360 minutos.'
    return
  }
  if (errorHorario.value) {
    error.value = errorHorario.value
    return
  }
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const guardada = await servicios.catalogo.actualizarConfiguracionReservacion(config)
    tolerancia.value = String(guardada.toleranciaMinutos)
    recordatorio.value = String(guardada.recordatorioMinutos)
    anticipacion.value = String(guardada.anticipacionMinutos)
    duracion.value = String(guardada.duracionReservacionMinutos)
    aplicarHorario(guardada)
    mensaje.value = 'Configuración guardada. El horario y los tiempos se aplican a las próximas reservaciones y correos.'
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
        <p>Define el horario para reservar, con cuánta anticipación, el tiempo de espera para la llegada y cuándo recordar al cliente.</p>
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

        <fieldset class="horario">
          <legend class="horario__titulo">Horario de reservaciones</legend>
          <p class="horario__ayuda">
            Cada día tiene su propio horario: puede abrir más temprano, cerrar más tarde o no recibir reservaciones. El portal de
            clientes ofrece estas horas, y la hostess y el sistema no aceptan reservaciones fuera de ellas ni en días cerrados. La
            hostess sí puede anotar una hora entre intervalos (por ejemplo, 19:45).
          </p>

          <div class="campo campo--intervalo">
            <label for="intervalo">Horas disponibles cada</label>
            <select id="intervalo" v-model.number="horario.intervaloMinutos" :disabled="cargando || guardando">
              <option v-for="i in INTERVALOS_RESERVACION" :key="i" :value="i">{{ i === 60 ? '1 hora (en punto)' : `${i} minutos` }}</option>
            </select>
          </div>

          <ul class="semana" aria-label="Horario de cada día">
            <li v-for="(d, i) in horario.dias" :key="i" class="semana__dia" :class="{ 'semana__dia--cerrado': !d.abierto }">
              <label class="semana__nombre" :for="`dia-abierto-${i}`">
                <input :id="`dia-abierto-${i}`" v-model="d.abierto" type="checkbox" :disabled="cargando || guardando" />
                <span>{{ DIAS_SEMANA[i]!.nombre }}</span>
                <span class="semana__estado">{{ d.abierto ? 'Abierto' : 'Cerrado' }}</span>
              </label>
              <div v-if="d.abierto" class="semana__horas">
                <div class="campo">
                  <label :for="`hora-apertura-${i}`">Primera hora</label>
                  <input :id="`hora-apertura-${i}`" v-model="d.horaApertura" type="time" step="900" required :disabled="cargando || guardando" />
                </div>
                <div class="campo">
                  <label :for="`hora-ultima-${i}`">Última hora</label>
                  <input :id="`hora-ultima-${i}`" v-model="d.horaUltima" type="time" step="900" required :disabled="cargando || guardando" />
                </div>
                <button
                  type="button"
                  class="btn btn--secundario semana__copiar"
                  :aria-label="`Usar el horario del ${DIAS_SEMANA[i]!.nombre.toLowerCase()} en todos los días`"
                  :disabled="cargando || guardando"
                  @click="copiarATodos(i)"
                >
                  Copiar a todos
                </button>
              </div>
              <p v-else class="semana__cerrado">No se reciben reservaciones.</p>
            </li>
          </ul>
          <p class="campo__ayuda">La última hora es la última mesa que se puede apartar, no la hora de cierre.</p>

          <p v-if="errorHorario" class="texto-error" role="alert">{{ errorHorario }}</p>
          <div v-else class="vista-previa">
            <p class="vista-previa__resumen"><strong>Resumen:</strong> {{ resumen }}</p>
            <div class="campo campo--intervalo">
              <label for="vista-dia">Ver las horas del cliente de</label>
              <select id="vista-dia" :value="diaVistaActual" @change="diaVista = Number(($event.target as HTMLSelectElement).value)">
                <option v-for="i in diasAbiertos" :key="i" :value="i">{{ DIAS_SEMANA[i]!.nombre }}</option>
              </select>
            </div>
            <p class="vista-previa__titulo">Así verá las horas el cliente ({{ vistaPrevia.length }}):</p>
            <ul class="vista-previa__horas">
              <li v-for="h in vistaPrevia" :key="h" class="numero">{{ h }}</li>
            </ul>
          </div>
        </fieldset>

        <div class="config__campos">
          <div class="campo">
            <label for="anticipacion">Anticipación mínima para reservar (minutos)</label>
            <input id="anticipacion" v-model="anticipacion" v-permitir="'digitos'" type="text" inputmode="numeric" maxlength="4" autocomplete="off" required :disabled="cargando || guardando" />
            <p class="campo__ayuda">
              Tiempo que debe faltar, como mínimo, para la hora reservada. Aplica a la hostess y al portal de clientes.
              De 0 (sin mínimo) a 1440 minutos; predeterminado: 60 (1 hora).
            </p>
          </div>
          <div class="campo">
            <label for="duracion">Duración de cada reservación (minutos)</label>
            <input id="duracion" v-model="duracion" v-permitir="'digitos'" type="text" inputmode="numeric" maxlength="4" autocomplete="off" required :disabled="cargando || guardando" />
            <p class="campo__ayuda">
              Cuánto tiempo aparta una reservación su mesa. Con 90, una mesa reservada a las 14:00 no se da a otra reservación
              entre 12:30 y 15:30. De 30 a 360 minutos; predeterminado: 90.
            </p>
          </div>
          <div class="campo">
            <label for="tolerancia">Tolerancia de llegada (minutos)</label>
            <input id="tolerancia" v-model="tolerancia" v-permitir="'digitos'" type="text" inputmode="numeric" maxlength="4" autocomplete="off" required :disabled="cargando || guardando" />
            <p class="campo__ayuda">
              Empieza a contar desde la hora reservada. Al vencer, la reservación se marca como vencida y la mesa se libera.
              De 5 a 180 minutos; predeterminado: 15.
            </p>
          </div>
          <div class="campo">
            <label for="recordatorio">Recordatorio previo (minutos)</label>
            <input id="recordatorio" v-model="recordatorio" v-permitir="'digitos'" type="text" inputmode="numeric" maxlength="4" autocomplete="off" required :disabled="cargando || guardando" />
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

.horario {
  display: grid;
  gap: var(--espacio-4);
  min-width: 0;
  margin: 0;
  padding: var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface-2);
}

.horario__titulo {
  padding: 0 var(--espacio-1);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.horario__ayuda {
  margin: 0;
  color: var(--color-muted);
}

.campo--intervalo {
  max-width: 320px;
}

.semana {
  display: grid;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.semana__dia {
  display: grid;
  grid-template-columns: minmax(170px, 220px) 1fr;
  align-items: center;
  gap: var(--espacio-3);
  padding: var(--espacio-3) var(--espacio-4);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.semana__dia--cerrado {
  background: transparent;
  border-style: dashed;
}

.semana__nombre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2);
  font-weight: 700;
  cursor: pointer;
}

.semana__nombre input {
  width: 24px;
  height: 24px;
  accent-color: var(--color-primary);
}

.semana__estado {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 650;
}

.semana__horas {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr)) auto;
  align-items: end;
  gap: var(--espacio-3);
  min-width: 0;
}

.semana__copiar {
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-3);
  font-size: var(--texto-sm);
}

.semana__cerrado {
  margin: 0;
  color: var(--color-muted);
}

@media (max-width: 40em) {
  .semana__dia {
    grid-template-columns: 1fr;
  }

  .semana__horas {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .semana__copiar {
    grid-column: 1 / -1;
  }
}

/* En pantallas angostas las dos horas no caben lado a lado (el reloj del campo recorta el texto). */
@media (max-width: 30em) {
  .semana__horas {
    grid-template-columns: minmax(0, 1fr);
  }
}

.vista-previa {
  display: grid;
  gap: var(--espacio-3);
}

.vista-previa__resumen {
  margin: 0;
}

.vista-previa__titulo {
  margin: 0 0 var(--espacio-2);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 650;
}

.vista-previa__horas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.vista-previa__horas li {
  padding: 2px 10px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  font-size: var(--texto-sm);
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
