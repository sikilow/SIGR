<script setup lang="ts">
// Portal de clientes → Solicitar reservación. En cuatro pasos: cuándo (días rápidos o calendario), a qué hora (las
// horas del horario que configura Gerencia), cuántas personas y, opcional, dónde (sección y características del
// catálogo de Gerencia). Antes de enviar se ve un resumen; al enviar, una confirmación con el folio. La mesa la asigna
// la hostess: la solicitud queda pendiente hasta que la confirme.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { aCaracteristicas, aHorarioReservacion, type CaracteristicaDto, type HorarioReservacionDto } from '../../services/api/mappers'
import type { CaracteristicaMesa } from '../../types'
import {
  diaAbierto,
  HORARIO_POR_DEFECTO,
  type HorarioReservacion,
  horasDisponibles,
  textoHorario,
} from '../../utils/horarioReservacion'
import { aDia, deDia } from '../../utils/periodos'

const router = useRouter()
const MAX_PERSONAS = 20

// ---------------- Datos de la reservación ----------------
const fecha = ref('')
const hora = ref('')
const personas = ref(2)
const prefZona = ref('')
const prefCaracteristicas = ref<number[]>([])

// ---------------- Horario (Gerente → Reservas) ----------------
const horario = ref<HorarioReservacion>({ ...HORARIO_POR_DEFECTO })
const anticipacionMinutos = ref(60)
const ahora = ref(new Date())

const horarios = computed(() => (fecha.value ? horasDisponibles(horario.value, fecha.value, ahora.value, anticipacionMinutos.value) : []))
const diaCerrado = computed(() => !!fecha.value && !diaAbierto(horario.value, fecha.value))
const sinHoras = computed(() => !!fecha.value && !diaCerrado.value && horarios.value.length === 0)
const descripcionHorario = computed(() => textoHorario(horario.value))

/** Horas agrupadas para que se lean fácil: comida (antes de las 16), tarde (16–19) y cena (19 en adelante). */
const gruposHoras = computed(() => {
  const grupos = [
    { nombre: 'Mañana y comida', horas: [] as string[] },
    { nombre: 'Tarde', horas: [] as string[] },
    { nombre: 'Noche', horas: [] as string[] },
  ]
  for (const h of horarios.value) {
    const hh = Number(h.slice(0, 2))
    grupos[hh < 16 ? 0 : hh < 19 ? 1 : 2]!.horas.push(h)
  }
  return grupos.filter((g) => g.horas.length > 0)
})

watch(horarios, (lista) => {
  if (hora.value && !lista.includes(hora.value)) hora.value = ''
})

// ---------------- Días rápidos (próximas dos semanas) ----------------
const hoy = aDia(new Date())
const fechaMaxima = (() => {
  const f = new Date()
  f.setFullYear(f.getFullYear() + 1)
  return aDia(f)
})()

const diasRapidos = computed(() =>
  Array.from({ length: 14 }, (_, i) => {
    const f = new Date()
    f.setHours(0, 0, 0, 0)
    f.setDate(f.getDate() + i)
    const dia = aDia(f)
    const abierto = diaAbierto(horario.value, dia)
    const quedanHoras = abierto && horasDisponibles(horario.value, dia, ahora.value, anticipacionMinutos.value).length > 0
    return {
      dia,
      semana: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(f).replace('.', ''),
      numero: f.getDate(),
      mes: new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(f).replace('.', ''),
      disponible: quedanHoras,
      motivo: !abierto ? 'Cerrado' : quedanHoras ? '' : 'Sin horas',
    }
  }),
)
const fechaFueraDeLista = computed(() => !!fecha.value && !diasRapidos.value.some((d) => d.dia === fecha.value))

const fechaLarga = computed(() =>
  fecha.value ? new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(deDia(fecha.value)) : '',
)

// ---------------- Mesas: secciones y características (Gerente → Mesas) ----------------
interface OpcionSeccion {
  seccion: string
  mesas: number
  capacidad_maxima: number
  /** Ids de las características que tiene alguna mesa de la sección. */
  caracteristicas: number[]
}

const secciones = ref<OpcionSeccion[]>([])
const caracteristicas = ref<CaracteristicaMesa[]>([])

/** ¿La sección elegida (o cualquiera) tiene alguna mesa con esa característica? */
function hayEnSeccion(id: number): boolean {
  if (!prefZona.value) return true
  return secciones.value.find((s) => s.seccion === prefZona.value)?.caracteristicas.includes(id) ?? false
}

function nombresDe(s: OpcionSeccion): string[] {
  return caracteristicas.value.filter((c) => s.caracteristicas.includes(c.idCaracteristica)).map((c) => c.nombre)
}

function alternarCaracteristica(id: number) {
  prefCaracteristicas.value = prefCaracteristicas.value.includes(id)
    ? prefCaracteristicas.value.filter((x) => x !== id)
    : [...prefCaracteristicas.value, id]
}

// Si la sección elegida no tiene una característica marcada, se desmarca.
watch(prefZona, () => {
  prefCaracteristicas.value = prefCaracteristicas.value.filter(hayEnSeccion)
})

const grupoGrande = computed(() => {
  const maxima = Math.max(0, ...secciones.value.map((s) => s.capacidad_maxima))
  return maxima > 0 && personas.value > maxima ? maxima : 0
})

// ---------------- Carga ----------------
function token(): string | null {
  return sessionStorage.getItem('cliente_token')
}

async function obtener<T>(ruta: string): Promise<T | null> {
  const t = token()
  if (!t) return null
  try {
    const r = await fetch(ruta, { headers: { Authorization: `Bearer ${t}` } })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

onMounted(async () => {
  if (!token()) {
    await router.push('/cliente/login')
    return
  }
  const [h, o] = await Promise.all([
    obtener<HorarioReservacionDto & { anticipacion_minutos?: number }>('/api/reservaciones-clientes/horario'),
    obtener<{ secciones: OpcionSeccion[]; caracteristicas: CaracteristicaDto[] }>('/api/reservaciones-clientes/opciones-mesa'),
  ])
  if (h) {
    horario.value = aHorarioReservacion(h)
    anticipacionMinutos.value = Number(h.anticipacion_minutos ?? 60)
  }
  if (o) {
    secciones.value = o.secciones ?? []
    caracteristicas.value = aCaracteristicas(o.caracteristicas)
  }
  ahora.value = new Date()
})

// ---------------- Resumen y envío ----------------
const resumen = computed(() => {
  const partes: string[] = []
  if (fechaLarga.value) partes.push(fechaLarga.value)
  if (hora.value) partes.push(`${hora.value} h`)
  partes.push(`${personas.value} ${personas.value === 1 ? 'persona' : 'personas'}`)
  const donde = [prefZona.value, ...caracteristicas.value.filter((c) => prefCaracteristicas.value.includes(c.idCaracteristica)).map((c) => c.nombre)]
    .filter(Boolean)
    .join(', ')
  return { cuando: partes.join(' · '), donde }
})
const listo = computed(() => !!fecha.value && !!hora.value)

const cargando = ref(false)
const error = ref('')
const folio = ref<number | null>(null)
const resumenEnviado = ref({ cuando: '', donde: '' })

async function solicitarReservacion() {
  error.value = ''
  const t = token()
  if (!t) {
    await router.push('/cliente/login')
    return
  }
  if (!listo.value) {
    error.value = !fecha.value ? 'Elige el día de tu visita.' : 'Elige la hora de tu visita.'
    return
  }

  cargando.value = true
  try {
    const respuesta = await fetch('/api/reservaciones-clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        fecha_hora: `${fecha.value} ${hora.value}:00`,
        personas: personas.value,
        pref_zona: prefZona.value || null,
        pref_caracteristicas: prefCaracteristicas.value,
      }),
    })
    const datos = await respuesta.json()
    if (respuesta.status === 401) {
      sessionStorage.removeItem('cliente_token')
      sessionStorage.removeItem('cliente_datos')
      await router.push('/cliente/login')
      return
    }
    if (!respuesta.ok) throw new Error(datos.mensaje || 'No se pudo registrar la reservación.')
    folio.value = datos.reservacion.id_reservacion
    resumenEnviado.value = { ...resumen.value }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Error de conexión con el servidor.'
  } finally {
    cargando.value = false
  }
}

function otraReservacion() {
  folio.value = null
  fecha.value = ''
  hora.value = ''
  personas.value = 2
  prefZona.value = ''
  prefCaracteristicas.value = []
  ahora.value = new Date()
}
</script>

<template>
  <div class="pagina-reservacion">
    <header class="encabezado">
      <RouterLink to="/cliente" class="marca">
        <span class="marca-icono">✦</span>
        <span>La Madalena</span>
      </RouterLink>
      <nav class="encabezado__enlaces">
        <RouterLink to="/cliente/mis-reservaciones" class="enlace">Mis reservaciones</RouterLink>
        <RouterLink to="/cliente" class="enlace enlace--suave">← Inicio</RouterLink>
      </nav>
    </header>

    <main class="contenido">
      <!-- Presentación -->
      <aside class="presentacion">
        <span class="etiqueta">LA MADALENA · RESERVACIONES</span>
        <h1>Tu mesa<br />te espera.</h1>
        <p class="presentacion__texto">Planea tu próxima visita y disfruta de una experiencia gastronómica especial.</p>

        <ol class="pasos">
          <li><span>1</span><div><strong>Elige día, hora y personas</strong><small>Solo verás las horas en que recibimos reservaciones.</small></div></li>
          <li><span>2</span><div><strong>Dinos dónde te gustaría sentarte</strong><small>Opcional: sección y lo que necesites.</small></div></li>
          <li><span>3</span><div><strong>Te confirmamos por correo</strong><small>La hostess revisa tu solicitud y asigna tu mesa.</small></div></li>
        </ol>

        <p class="presentacion__horario">
          <span aria-hidden="true">🕑</span>
          {{ descripcionHorario }}
        </p>
      </aside>

      <!-- Confirmación -->
      <section v-if="folio !== null" class="tarjeta exito" aria-labelledby="exito-titulo" role="status">
        <div class="exito__icono" aria-hidden="true">✓</div>
        <span class="subtitulo">SOLICITUD RECIBIDA · FOLIO #{{ folio }}</span>
        <h2 id="exito-titulo">¡Gracias! Ya tenemos tu solicitud.</h2>
        <div class="exito__resumen">
          <p><strong>{{ resumenEnviado.cuando }}</strong></p>
          <p v-if="resumenEnviado.donde">Pediste: {{ resumenEnviado.donde }}</p>
        </div>
        <p class="exito__nota">
          Todavía no está confirmada: te avisaremos por correo cuando el restaurante la confirme. Hasta entonces no tienes una
          mesa asegurada.
        </p>
        <div class="exito__acciones">
          <RouterLink to="/cliente/mis-reservaciones" class="boton">Ver mis reservaciones</RouterLink>
          <button type="button" class="boton boton--secundario" @click="otraReservacion">Hacer otra reservación</button>
        </div>
      </section>

      <!-- Formulario -->
      <section v-else class="tarjeta" aria-labelledby="form-titulo">
        <span class="subtitulo">RESERVA TU EXPERIENCIA</span>
        <h2 id="form-titulo">Solicitar reservación</h2>

        <form novalidate @submit.prevent="solicitarReservacion">
          <!-- 1. Día -->
          <fieldset class="paso">
            <legend><span class="paso__numero">1</span> ¿Qué día nos visitas?</legend>
            <div class="dias" role="radiogroup" aria-label="Día de la visita">
              <button
                v-for="d in diasRapidos"
                :key="d.dia"
                type="button"
                role="radio"
                class="dia"
                :class="{ 'dia--activo': fecha === d.dia }"
                :aria-checked="fecha === d.dia"
                :disabled="!d.disponible"
                :title="d.motivo || undefined"
                @click="fecha = d.dia"
              >
                <span class="dia__semana">{{ d.semana }}</span>
                <span class="dia__numero">{{ d.numero }}</span>
                <span class="dia__mes">{{ d.motivo || d.mes }}</span>
              </button>
            </div>
            <div class="otra-fecha">
              <label for="fecha">¿Otra fecha?</label>
              <input id="fecha" v-model="fecha" type="date" :min="hoy" :max="fechaMaxima" :class="{ 'otra-fecha--activa': fechaFueraDeLista }" />
            </div>
          </fieldset>

          <!-- 2. Hora -->
          <fieldset class="paso" :disabled="!fecha">
            <legend><span class="paso__numero">2</span> ¿A qué hora?</legend>
            <p v-if="!fecha" class="paso__ayuda">Primero elige el día.</p>
            <p v-else-if="diaCerrado" class="paso__aviso" role="alert">Ese día no recibimos reservaciones. Elige otra fecha.</p>
            <p v-else-if="sinHoras" class="paso__aviso" role="alert">Ya no hay horas disponibles ese día. Elige otra fecha.</p>
            <template v-else>
              <p class="paso__ayuda">{{ fechaLarga }}</p>
              <div v-for="g in gruposHoras" :key="g.nombre" class="horas">
                <span class="horas__grupo">{{ g.nombre }}</span>
                <div class="horas__lista" role="radiogroup" :aria-label="g.nombre">
                  <button
                    v-for="h in g.horas"
                    :key="h"
                    type="button"
                    role="radio"
                    class="hora"
                    :class="{ 'hora--activa': hora === h }"
                    :aria-checked="hora === h"
                    @click="hora = h"
                  >
                    {{ h }}
                  </button>
                </div>
              </div>
            </template>
          </fieldset>

          <!-- 3. Personas -->
          <fieldset class="paso">
            <legend><span class="paso__numero">3</span> ¿Cuántas personas?</legend>
            <div class="personas">
              <button type="button" class="personas__boton" aria-label="Una persona menos" :disabled="personas <= 1" @click="personas--">−</button>
              <output class="personas__valor" aria-live="polite">
                <strong>{{ personas }}</strong> {{ personas === 1 ? 'persona' : 'personas' }}
              </output>
              <button type="button" class="personas__boton" aria-label="Una persona más" :disabled="personas >= MAX_PERSONAS" @click="personas++">+</button>
            </div>
            <p v-if="grupoGrande" class="paso__ayuda">
              Nuestra mesa más grande es para {{ grupoGrande }} personas: la hostess buscará cómo acomodarlos.
            </p>
          </fieldset>

          <!-- 4. Dónde -->
          <fieldset v-if="secciones.length || caracteristicas.length" class="paso">
            <legend><span class="paso__numero">4</span> ¿Dónde te gustaría sentarte? <small>(opcional)</small></legend>
            <p class="paso__ayuda">Lo tomaremos en cuenta al asignar tu mesa, según disponibilidad.</p>

            <div v-if="secciones.length" class="secciones" role="radiogroup" aria-label="Sección preferida">
              <label class="seccion" :class="{ 'seccion--activa': prefZona === '' }">
                <input v-model="prefZona" type="radio" name="pref-zona" value="" />
                <span class="seccion__nombre">Cualquier sección</span>
                <span class="seccion__detalle">La que esté disponible</span>
              </label>
              <label v-for="s in secciones" :key="s.seccion" class="seccion" :class="{ 'seccion--activa': prefZona === s.seccion }">
                <input v-model="prefZona" type="radio" name="pref-zona" :value="s.seccion" />
                <span class="seccion__nombre">{{ s.seccion }}</span>
                <span class="seccion__detalle">{{ s.mesas }} {{ s.mesas === 1 ? 'mesa' : 'mesas' }} · hasta {{ s.capacidad_maxima }} personas</span>
                <span v-if="nombresDe(s).length" class="seccion__chips">
                  <span v-for="n in nombresDe(s)" :key="n" class="mini-chip">{{ n }}</span>
                </span>
              </label>
            </div>

            <div v-if="caracteristicas.length" class="necesidades">
              <span class="necesidades__titulo">¿Necesitas algo en especial?</span>
              <div class="necesidades__lista">
                <button
                  v-for="c in caracteristicas"
                  :key="c.idCaracteristica"
                  type="button"
                  class="necesidad"
                  :class="{ 'necesidad--activa': prefCaracteristicas.includes(c.idCaracteristica) }"
                  :aria-pressed="prefCaracteristicas.includes(c.idCaracteristica)"
                  :disabled="!hayEnSeccion(c.idCaracteristica)"
                  :title="hayEnSeccion(c.idCaracteristica) ? undefined : 'No disponible en esta sección'"
                  @click="alternarCaracteristica(c.idCaracteristica)"
                >
                  <span aria-hidden="true">{{ prefCaracteristicas.includes(c.idCaracteristica) ? '✓' : '+' }}</span>
                  {{ c.nombre }}
                </button>
              </div>
            </div>
          </fieldset>

          <!-- Resumen -->
          <div class="resumen" :class="{ 'resumen--listo': listo }">
            <span class="resumen__titulo">Tu solicitud</span>
            <p class="resumen__cuando">{{ listo ? resumen.cuando : 'Elige día y hora para continuar.' }}</p>
            <p v-if="listo && resumen.donde" class="resumen__donde">Pides: {{ resumen.donde }}</p>
            <p class="resumen__nota">Sujeta a disponibilidad y confirmación del restaurante.</p>
          </div>

          <p v-if="error" class="error" role="alert">{{ error }}</p>

          <button type="submit" class="boton boton--grande" :disabled="cargando">
            {{ cargando ? 'Enviando solicitud…' : 'Solicitar reservación →' }}
          </button>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pagina-reservacion {
  --rojo: #b9390b;
  --rojo-oscuro: #7b260e;
  --crema: #faf5ef;
  --crema-2: #fbeee6;
  --borde: #e6d6ca;
  --tinta: #2c1b14;
  --tinta-2: #806d62;

  min-height: 100vh;
  background:
    radial-gradient(circle at 10% 0%, #f6e3d5 0, transparent 40%),
    radial-gradient(circle at 90% 100%, #f3dccd 0, transparent 35%),
    var(--crema);
  color: var(--tinta);
  font-family: Arial, sans-serif;
}

/* ---------- Encabezado ---------- */
.encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto;
  padding: 22px 24px;
}

.marca {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--tinta);
  font-family: Georgia, serif;
  font-size: 25px;
  font-weight: bold;
  text-decoration: none;
}

.marca-icono {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--rojo);
  color: #fff;
}

.encabezado__enlaces {
  display: flex;
  gap: 8px;
}

.enlace {
  padding: 10px 16px;
  border: 1px solid var(--borde);
  border-radius: 999px;
  background: #fff;
  color: var(--rojo);
  font-size: 14px;
  font-weight: bold;
  text-decoration: none;
}

.enlace--suave {
  border-color: transparent;
  background: transparent;
  color: var(--tinta-2);
}

.enlace:focus-visible,
.marca:focus-visible {
  outline: 3px solid var(--rojo);
  outline-offset: 2px;
}

/* ---------- Distribución ---------- */
.contenido {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  align-items: start;
  gap: 28px;
  max-width: 1180px;
  margin: 0 auto;
  padding: 8px 24px 56px;
}

.presentacion {
  position: sticky;
  top: 24px;
  overflow: hidden;
  padding: 48px 40px;
  border-radius: 24px;
  background: linear-gradient(150deg, var(--rojo), var(--rojo-oscuro));
  color: #fff;
  box-shadow: 0 18px 40px rgba(123, 38, 14, 0.25);
}

.presentacion::after {
  content: '✦';
  position: absolute;
  right: -10px;
  bottom: -40px;
  font-size: 220px;
  opacity: 0.08;
}

.etiqueta {
  font-size: 12px;
  letter-spacing: 3px;
}

.presentacion h1 {
  margin: 24px 0 16px;
  font-family: Georgia, serif;
  font-size: clamp(40px, 4.4vw, 60px);
  font-weight: normal;
  line-height: 1.05;
}

.presentacion__texto {
  margin: 0 0 32px;
  color: #f5dace;
  font-size: 16px;
  line-height: 1.7;
}

.pasos {
  display: grid;
  gap: 18px;
  margin: 0 0 32px;
  padding: 24px 0 0;
  border-top: 1px solid #ffffff40;
  list-style: none;
}

.pasos li {
  display: flex;
  gap: 14px;
}

.pasos li > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1.5px solid #ffffff80;
  border-radius: 50%;
  font-weight: bold;
}

.pasos strong {
  display: block;
  font-size: 15px;
}

.pasos small {
  color: #f5dace;
  font-size: 13px;
  line-height: 1.5;
}

.presentacion__horario {
  display: inline-flex;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: #ffffff1f;
  font-size: 13px;
  line-height: 1.4;
}

/* ---------- Tarjeta del formulario ---------- */
.tarjeta {
  padding: 40px;
  border: 1px solid var(--borde);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 12px 35px rgba(44, 27, 20, 0.08);
}

.subtitulo {
  color: var(--rojo);
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 2px;
}

.tarjeta h2 {
  margin: 10px 0 24px;
  font-family: Georgia, serif;
  font-size: clamp(28px, 3vw, 38px);
}

form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.paso {
  min-width: 0;
  margin: 0;
  padding: 20px;
  border: 1px solid var(--borde);
  border-radius: 18px;
  background: #fffcf9;
}

.paso:disabled {
  opacity: 0.6;
}

.paso legend {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
  font-size: 16px;
  font-weight: bold;
}

.paso legend small {
  color: var(--tinta-2);
  font-weight: normal;
}

.paso__numero {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--rojo);
  color: #fff;
  font-size: 14px;
}

.paso__ayuda {
  margin: 4px 0 12px;
  color: var(--tinta-2);
  font-size: 14px;
}

.paso__ayuda::first-letter {
  text-transform: uppercase;
}

.paso__aviso {
  margin: 4px 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fdecea;
  color: #a12a1b;
  font-size: 14px;
  font-weight: bold;
}

/* Días */
.dias {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  padding-bottom: 6px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
}

.dia {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 70px;
  padding: 10px 6px;
  border: 1.5px solid var(--borde);
  border-radius: 14px;
  background: #fff;
  color: var(--tinta);
  font: inherit;
  cursor: pointer;
  scroll-snap-align: start;
}

.dia:hover:not(:disabled) {
  border-color: var(--rojo);
}

.dia:disabled {
  background: #f5efe9;
  color: #b7a79b;
  cursor: not-allowed;
}

.dia__semana {
  font-size: 12px;
  text-transform: capitalize;
}

.dia__numero {
  font-family: Georgia, serif;
  font-size: 24px;
  font-weight: bold;
}

.dia__mes {
  font-size: 11px;
}

.dia--activo {
  border-color: var(--rojo);
  background: var(--rojo);
  color: #fff;
}

.otra-fecha {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 14px;
}

.otra-fecha label {
  color: var(--tinta-2);
}

.otra-fecha input {
  padding: 9px 12px;
  border: 1px solid var(--borde);
  border-radius: 10px;
  background: #fff;
  color: var(--tinta);
  font: inherit;
}

.otra-fecha input.otra-fecha--activa {
  border: 2px solid var(--rojo);
}

/* Horas */
.horas + .horas {
  margin-top: 12px;
}

.horas__grupo {
  display: block;
  margin-bottom: 6px;
  color: var(--tinta-2);
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.horas__lista {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
  gap: 8px;
}

.hora {
  min-height: 42px;
  border: 1.5px solid var(--borde);
  border-radius: 10px;
  background: #fff;
  color: var(--tinta);
  font: inherit;
  font-weight: bold;
  cursor: pointer;
}

.hora:hover {
  border-color: var(--rojo);
}

.hora--activa {
  border-color: var(--rojo);
  background: var(--rojo);
  color: #fff;
}

/* Personas */
.personas {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  margin-top: 6px;
}

.personas__boton {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 1.5px solid var(--borde);
  border-radius: 50%;
  background: #fff;
  color: var(--rojo);
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
}

.personas__boton:disabled {
  color: #c9b9ad;
  cursor: not-allowed;
}

.personas__valor {
  min-width: 120px;
  font-size: 16px;
  text-align: center;
}

.personas__valor strong {
  font-family: Georgia, serif;
  font-size: 28px;
}

/* Secciones */
.secciones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}

.seccion {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1.5px solid var(--borde);
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
}

.seccion input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
}

.seccion:has(input:focus-visible) {
  outline: 3px solid var(--rojo);
  outline-offset: 2px;
}

.seccion--activa {
  border: 2px solid var(--rojo);
  background: var(--crema-2);
}

.seccion--activa::after {
  content: '✓';
  position: absolute;
  top: 10px;
  right: 12px;
  color: var(--rojo);
  font-weight: bold;
}

.seccion__nombre {
  font-weight: bold;
}

.seccion__detalle {
  color: var(--tinta-2);
  font-size: 12px;
}

.seccion__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.mini-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3e2d7;
  color: var(--rojo-oscuro);
  font-size: 11px;
  font-weight: 600;
}

/* Necesidades */
.necesidades {
  margin-top: 16px;
}

.necesidades__titulo {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: bold;
}

.necesidades__lista {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.necesidad {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border: 1.5px solid var(--borde);
  border-radius: 999px;
  background: #fff;
  color: var(--tinta);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.necesidad:hover:not(:disabled) {
  border-color: var(--rojo);
}

.necesidad:disabled {
  color: #b7a79b;
  text-decoration: line-through;
  cursor: not-allowed;
}

.necesidad--activa {
  border-color: var(--rojo);
  background: var(--crema-2);
  color: var(--rojo-oscuro);
}

/* Foco visible en todos los botones del formulario */
.dia:focus-visible,
.hora:focus-visible,
.necesidad:focus-visible,
.personas__boton:focus-visible,
.boton:focus-visible {
  outline: 3px solid var(--rojo);
  outline-offset: 2px;
}

/* Resumen */
.resumen {
  padding: 18px 20px;
  border: 1.5px dashed var(--borde);
  border-radius: 16px;
  background: #fff;
}

.resumen--listo {
  border-style: solid;
  border-color: var(--rojo);
  background: var(--crema-2);
}

.resumen__titulo {
  color: var(--rojo);
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.resumen__cuando {
  margin: 6px 0 0;
  font-family: Georgia, serif;
  font-size: 19px;
}

.resumen__cuando::first-letter {
  text-transform: uppercase;
}

.resumen__donde {
  margin: 6px 0 0;
  font-size: 14px;
}

.resumen__nota {
  margin: 8px 0 0;
  color: var(--tinta-2);
  font-size: 12px;
}

.error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fdecea;
  color: #a12a1b;
  font-size: 14px;
  font-weight: bold;
}

/* Botones */
.boton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 22px;
  border: none;
  border-radius: 12px;
  background: var(--rojo);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: bold;
  text-decoration: none;
  cursor: pointer;
}

.boton:hover {
  background: #922d08;
}

.boton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.boton--grande {
  min-height: 56px;
  font-size: 16px;
}

.boton--secundario {
  border: 1.5px solid var(--borde);
  background: #fff;
  color: var(--rojo);
}

.boton--secundario:hover {
  background: var(--crema-2);
}

/* Confirmación */
.exito {
  text-align: center;
}

.exito__icono {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin: 0 auto 18px;
  border-radius: 50%;
  background: #e5f3e7;
  color: #256332;
  font-size: 36px;
  font-weight: bold;
}

.exito__resumen {
  margin: 0 auto 16px;
  padding: 16px;
  border-radius: 14px;
  background: var(--crema-2);
}

.exito__resumen p {
  margin: 4px 0;
}

.exito__resumen strong {
  display: block;
}

.exito__resumen strong::first-letter {
  text-transform: uppercase;
}

.exito__nota {
  margin: 0 auto 24px;
  max-width: 460px;
  color: var(--tinta-2);
  line-height: 1.6;
}

.exito__acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

/* ---------- Pantallas angostas ---------- */
@media (max-width: 900px) {
  .contenido {
    grid-template-columns: minmax(0, 1fr);
  }

  .presentacion {
    position: static;
    padding: 32px 26px;
  }

  .pasos {
    display: none;
  }
}

@media (max-width: 520px) {
  .encabezado {
    padding: 16px;
  }

  .contenido {
    padding: 0 16px 40px;
  }

  .tarjeta {
    padding: 24px 18px;
  }

  .paso {
    padding: 16px 12px;
  }
}
</style>
