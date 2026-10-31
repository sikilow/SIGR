<script setup lang="ts">
// Crear o editar una reservación (paso del diálogo de Reservaciones). Cliente (buscar o crear), fecha y hora,
// personas (1 a 20) y mesa opcional. Validación: cada error va bajo su campo (aria-describedby) y, al intentar guardar,
// un resumen enfocable los enlaza. El alta lleva Idempotency-Key (también el alta de un cliente nuevo): reintentar tras
// un fallo de red no duplica nada, y si el cliente ya se creó no se vuelve a crear al reintentar la reservación.
import { computed, nextTick, ref, watch } from 'vue'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useReservacionesStore } from '../../stores/reservaciones'
import type { CambioReservacion, Cliente, Reservacion } from '../../types'
import { formatearHora } from '../../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'
import {
  aDiaISO,
  aHoraISO,
  advertenciaCapacidadMesa,
  clienteFormVacio,
  combinarFechaHora,
  type ErroresCliente,
  MAX_PERSONAS_RESERVACION,
  mesaPermitidaEnFecha,
  mesasParaReservacion,
  MIN_PERSONAS_RESERVACION,
  validarCliente,
  validarFechaHora,
  validarPersonasReservacion,
} from '../../utils/reservaciones'
import SelectorCliente from './SelectorCliente.vue'

const props = defineProps<{
  /** `null` = reservación nueva. */
  reservacion: Reservacion | null
  /** Día que se está viendo en la lista: la reservación nueva empieza en ese día (si no es pasado). */
  diaInicial: string
}>()

const emit = defineEmits<{
  /** Cancelar sin guardar: en edición vuelve a las acciones; en una nueva, cierra. */
  volver: []
  guardada: [reservacion: Reservacion]
  ocupado: [enCurso: boolean]
}>()

const store = useReservacionesStore()
const anuncios = useAnunciosStore()
const clavesReservacion = crearClaveIdempotencia()
const clavesCliente = crearClaveIdempotencia()

const edita = computed(() => props.reservacion !== null)
const hoy = aDiaISO(new Date())

/** Hora sugerida para hoy: la siguiente media hora; si cruzaría la medianoche, ninguna. */
function horaInicial(dia: string): string {
  const ahora = new Date()
  if (dia !== aDiaISO(ahora)) return ''
  const siguiente = new Date(ahora)
  siguiente.setSeconds(0, 0)
  siguiente.setMinutes(ahora.getMinutes() < 30 ? 30 : 60)
  return aDiaISO(siguiente) === dia ? aHoraISO(siguiente) : ''
}

const original = props.reservacion
const dia0 = original ? aDiaISO(original.fechaHora) : props.diaInicial < hoy ? hoy : props.diaInicial

const cliente = ref(clienteFormVacio())
const fecha = ref(dia0)
const hora = ref(original ? aHoraISO(original.fechaHora) : horaInicial(dia0))
const personasTexto = ref(original ? String(original.personas) : '2')
const idMesaTexto = ref(original?.idMesa != null ? String(original.idMesa) : '')
const preferenciasMesa = ref({ zona: '', plantaBaja: false, espacioCarriola: false, sinEscaleras: false })

const intentado = ref(false)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')
const erroresServidor = ref<{ telefono?: string; mesa?: string }>({})
/** Cliente que ya se creó en un intento anterior (para no crearlo dos veces al reintentar). */
const clienteCreado = ref<Cliente | null>(null)
const resumen = ref<HTMLElement | null>(null)

watch(enCurso, (v) => emit('ocupado', v))

// Si cambian los datos del cliente nuevo, el cliente que se creó antes ya no corresponde.
watch(
  () => [cliente.value.modo, cliente.value.nombre, cliente.value.telefono, cliente.value.correo],
  () => {
    clienteCreado.value = null
    clavesCliente.soltar()
    erroresServidor.value = { ...erroresServidor.value, telefono: undefined }
  },
)

const fechaHora = computed(() => combinarFechaHora(fecha.value, hora.value))
const personas = computed(() => {
  const n = Number(personasTexto.value)
  return Number.isInteger(n) && n > 0 ? n : 0
})
const mesaPermitida = computed(() => fechaHora.value !== null && mesaPermitidaEnFecha(fechaHora.value, new Date()))

// La mesa solo se reserva para hoy: si la fecha deja de ser hoy, se quita la mesa elegida.
watch(mesaPermitida, (permitida) => {
  if (!permitida) idMesaTexto.value = ''
})
watch(idMesaTexto, () => {
  erroresServidor.value = { ...erroresServidor.value, mesa: undefined }
})

const opcionesMesa = computed(() =>
  mesasParaReservacion(store.mesas, personas.value || 1, props.reservacion?.idMesa ?? null, preferenciasMesa.value),
)
const zonasMesa = computed(() => [...new Set(store.mesas.map((mesa) => mesa.zona).filter((zona): zona is string => zona !== null))].sort())
const mesaElegida = computed(() => store.mesas.find((m) => String(m.idMesa) === idMesaTexto.value) ?? null)
const avisoCapacidad = computed(() =>
  mesaElegida.value && personas.value > 0 ? advertenciaCapacidadMesa(mesaElegida.value, personas.value) : null,
)

// ---------- Validación ----------

interface Errores {
  cliente: ErroresCliente & { cliente?: string }
  fecha?: string
  hora?: string
  personas?: string
}

function validar(): Errores {
  const errores: Errores = { cliente: {} }
  if (!edita.value) {
    if (cliente.value.modo === 'existente') {
      if (!cliente.value.seleccionado) errores.cliente.cliente = 'Busca y elige un cliente, o crea uno nuevo.'
      else if (!cliente.value.seleccionado.correo) errores.cliente.correo = 'Agrega y guarda un correo antes de hacer la reservación.'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.value.seleccionado.correo)) errores.cliente.correo = 'El correo del cliente no es válido.'
    } else {
      errores.cliente = validarCliente(cliente.value)
      if (!cliente.value.correo.trim()) errores.cliente.correo = 'El correo es obligatorio para hacer una reservación.'
    }
  }
  const f = validarFechaHora(fecha.value, hora.value, new Date(), original?.fechaHora ?? null)
  errores.fecha = f.fecha
  errores.hora = f.hora
  errores.personas = validarPersonasReservacion(personasTexto.value) || undefined
  return errores
}

/** Los errores se muestran solo después del primer intento de guardar y se corrigen en vivo. */
const errores = computed<Errores>(() => (intentado.value ? validar() : { cliente: {} }))

/** Errores del cliente: los de validación más el que rechaza el servidor (p. ej. teléfono repetido), junto a su campo. */
const erroresCliente = computed(() => ({
  ...errores.value.cliente,
  telefono: errores.value.cliente.telefono ?? erroresServidor.value.telefono,
}))

/** Resumen en el orden visual de los campos; cada elemento enlaza a su campo. */
const itemsResumen = computed(() => {
  const e = errores.value
  const items: Array<{ id: string; texto: string }> = []
  if (e.cliente.cliente) items.push({ id: 'cliente-busqueda', texto: e.cliente.cliente })
  if (e.cliente.nombre) items.push({ id: 'cliente-nombre', texto: e.cliente.nombre })
  if (e.cliente.telefono) items.push({ id: 'cliente-telefono', texto: e.cliente.telefono })
  if (e.cliente.correo) items.push({ id: 'cliente-correo', texto: e.cliente.correo })
  if (e.fecha) items.push({ id: 'res-fecha', texto: e.fecha })
  if (e.hora) items.push({ id: 'res-hora', texto: e.hora })
  if (e.personas) items.push({ id: 'res-personas', texto: e.personas })
  return items
})

function enfocar(id: string) {
  document.getElementById(id)?.focus()
}

function cambiarPersonas(delta: number) {
  const actual = Number.parseInt(personasTexto.value, 10)
  const base = Number.isFinite(actual) ? actual : 0
  personasTexto.value = String(Math.min(MAX_PERSONAS_RESERVACION, Math.max(MIN_PERSONAS_RESERVACION, base + delta)))
}

// ---------- Guardar ----------

function mensajeDeRechazo(e: unknown): string {
  if (e instanceof ErrorServicio) {
    if (e.codigo === 'sin_permiso') return 'Tu usuario no tiene permiso para esta acción.'
    return e.message
  }
  return 'Ocurrió un error inesperado.'
}

/** Cambios respecto a lo guardado (solo en edición). */
function cambiosDeEdicion(): CambioReservacion {
  const cambio: CambioReservacion = {}
  if (!original || !fechaHora.value) return cambio
  if (fechaHora.value.getTime() !== original.fechaHora.getTime()) cambio.fechaHora = fechaHora.value
  if (personas.value !== original.personas) cambio.personas = personas.value
  const mesaNueva = idMesaTexto.value === '' ? null : Number(idMesaTexto.value)
  if (mesaNueva !== original.idMesa) cambio.idMesa = mesaNueva
  return cambio
}

async function guardar() {
  if (enCurso.value) return
  intentado.value = true
  errorReintentable.value = ''
  rechazo.value = ''
  erroresServidor.value = {}

  if (itemsResumen.value.length > 0 || !fechaHora.value) {
    await nextTick()
    resumen.value?.focus()
    return
  }

  const cambio = cambiosDeEdicion()
  if (edita.value && Object.keys(cambio).length === 0) {
    rechazo.value = 'No hay cambios que guardar.'
    return
  }

  enCurso.value = true
  /** Campo al que se lleva el foco al terminar (no se puede enfocar mientras el formulario está deshabilitado). */
  let enfocarAlTerminar: string | null = null
  try {
    let guardada: Reservacion
    if (original) {
      guardada = await store.actualizar(original.idReservacion, cambio, clavesReservacion.para(`editar|${original.idReservacion}|${JSON.stringify(cambio)}`))
    } else {
      // 1) El cliente: el elegido o uno nuevo (que se crea una sola vez aunque se reintente la reservación).
      let idCliente: number
      if (cliente.value.modo === 'existente' && cliente.value.seleccionado) {
        idCliente = cliente.value.seleccionado.idCliente
      } else {
        if (!clienteCreado.value) {
          const datos = { nombre: cliente.value.nombre, telefono: cliente.value.telefono, correo: cliente.value.correo.trim() || null }
          try {
            clienteCreado.value = await store.crearCliente(datos, clavesCliente.para(`cliente|${JSON.stringify(datos)}`))
            clavesCliente.soltar()
          } catch (e) {
            if (!esFalloReintentable(e)) clavesCliente.soltar()
            if (e instanceof ErrorServicio && e.codigo === 'estado_invalido') {
              // Teléfono repetido o dato rechazado: se dice junto al campo y se enfoca.
              erroresServidor.value = { telefono: e.message }
              enfocarAlTerminar = 'cliente-telefono'
              return
            }
            throw e
          }
        }
        idCliente = clienteCreado.value.idCliente
      }
      // 2) La reservación.
      const nueva = {
        idCliente,
        fechaHora: fechaHora.value,
        personas: personas.value,
        idMesa: idMesaTexto.value === '' ? null : Number(idMesaTexto.value),
      }
      guardada = await store.crear(nueva, clavesReservacion.para(`crear|${JSON.stringify(nueva)}`))
    }
    clavesReservacion.soltar()
    void anuncios.anunciar(
      edita.value
        ? `Reservación de ${guardada.clienteNombre} actualizada`
        : `Reservación de ${guardada.clienteNombre} creada para las ${formatearHora(guardada.fechaHora)}`,
    )
    emit('guardada', guardada)
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se duplicará la reservación.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se duplicará la reservación.'
    } else {
      clavesReservacion.soltar()
      if (e instanceof ErrorServicio && e.codigo === 'mesa_no_disponible') {
        erroresServidor.value = { mesa: `${e.message} Elige otra mesa o déjala sin mesa.` }
        enfocarAlTerminar = 'res-mesa'
      } else {
        rechazo.value = mensajeDeRechazo(e)
      }
    }
  } finally {
    enCurso.value = false
    if (enfocarAlTerminar) {
      await nextTick()
      enfocar(enfocarAlTerminar)
    }
  }
}
</script>

<template>
  <form class="formulario" novalidate :aria-busy="enCurso" @submit.prevent="guardar">
    <p class="formulario__nota">Todos los datos son obligatorios, salvo los marcados como opcionales.</p>

    <!-- Resumen de errores: aparece al intentar guardar, recibe el foco y enlaza cada error con su campo -->
    <div v-if="itemsResumen.length > 0" ref="resumen" class="resumen-errores" tabindex="-1" role="group" aria-labelledby="res-resumen-titulo">
      <h3 id="res-resumen-titulo">Revisa {{ itemsResumen.length === 1 ? 'este dato' : 'estos datos' }}</h3>
      <ul>
        <li v-for="item in itemsResumen" :key="item.id">
          <a :href="`#${item.id}`" @click.prevent="enfocar(item.id)">{{ item.texto }}</a>
        </li>
      </ul>
    </div>
    <div v-else ref="resumen" tabindex="-1" class="solo-lectores" />

    <!-- Cliente: elegir o crear al dar de alta; fijo al editar -->
    <div v-if="edita && reservacion" class="cliente-fijo">
      <span class="cliente-fijo__etiqueta">Cliente</span>
      <strong>{{ reservacion.clienteNombre }}</strong>
      <span>{{ reservacion.clienteTelefono ?? 'Sin teléfono' }}</span>
    </div>
    <SelectorCliente
      v-else
      v-model="cliente"
      :buscar="store.buscarClientes"
      :errores="erroresCliente"
      :deshabilitado="enCurso"
    />

    <fieldset class="cuando" :disabled="enCurso">
      <legend>Cuándo y cuántos</legend>

      <div class="cuando__fila">
        <div class="campo">
          <label for="res-fecha">Fecha</label>
          <input
            id="res-fecha"
            v-model="fecha"
            type="date"
            :min="edita && original && aDiaISO(original.fechaHora) < hoy ? aDiaISO(original.fechaHora) : hoy"
            aria-required="true"
            :aria-invalid="errores.fecha ? 'true' : undefined"
            :aria-describedby="errores.fecha ? 'error-res-fecha' : undefined"
          />
          <p v-if="errores.fecha" id="error-res-fecha" class="texto-error">{{ errores.fecha }}</p>
        </div>

        <div class="campo">
          <label for="res-hora">Hora</label>
          <input
            id="res-hora"
            v-model="hora"
            type="time"
            aria-required="true"
            :aria-invalid="errores.hora ? 'true' : undefined"
            :aria-describedby="errores.hora ? 'error-res-hora' : undefined"
          />
          <p v-if="errores.hora" id="error-res-hora" class="texto-error">{{ errores.hora }}</p>
        </div>
      </div>

      <div class="campo">
        <label for="res-personas">Personas ({{ MIN_PERSONAS_RESERVACION }} a {{ MAX_PERSONAS_RESERVACION }})</label>
        <div class="personas__control">
          <button type="button" class="btn btn--secundario personas__paso" aria-label="Una persona menos" @click="cambiarPersonas(-1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12" /></svg>
          </button>
          <input
            id="res-personas"
            v-model="personasTexto"
            class="personas__campo numero"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            aria-required="true"
            :aria-invalid="errores.personas ? 'true' : undefined"
            :aria-describedby="errores.personas ? 'error-res-personas' : undefined"
          />
          <button type="button" class="btn btn--secundario personas__paso" aria-label="Una persona más" @click="cambiarPersonas(1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </button>
        </div>
        <p v-if="errores.personas" id="error-res-personas" class="texto-error">{{ errores.personas }}</p>
      </div>

      <div class="campo">
        <label for="res-mesa">Mesa (opcional)</label>
        <fieldset class="campo__preferencias">
          <legend>Preferencias de acceso</legend>
          <div class="campo">
            <label for="res-zona">Sección preferida</label>
            <select id="res-zona" v-model="preferenciasMesa.zona" :disabled="!mesaPermitida || enCurso">
              <option value="">Cualquier sección</option>
              <option v-for="zona in zonasMesa" :key="zona" :value="zona">{{ zona }}</option>
            </select>
          </div>
          <div class="campo__opciones">
            <label class="opcion-acceso">
              <input v-model="preferenciasMesa.plantaBaja" type="checkbox" />
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 21V5a2 2 0 0 1 2-2h9M9 21h11M4 12h11M19 8v13" />
              </svg>
              <span>Planta baja</span>
            </label>
            <label class="opcion-acceso">
              <input v-model="preferenciasMesa.espacioCarriola" type="checkbox" />
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 4h2.2l1.6 9.5h10.5L20 7H6" />
                <circle cx="9" cy="19" r="1.6" />
                <circle cx="17" cy="19" r="1.6" />
                <path d="M12 4v4" />
              </svg>
              <span>Espacio para carriola</span>
            </label>
            <label class="opcion-acceso">
              <input v-model="preferenciasMesa.sinEscaleras" type="checkbox" />
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 20h4v-4h4v-4h4V8h4" />
                <circle cx="6" cy="5" r="2" />
              </svg>
              <span>Sin escaleras</span>
            </label>
          </div>
        </fieldset>
        <select
          id="res-mesa"
          v-model="idMesaTexto"
          class="select"
          :disabled="!mesaPermitida || enCurso"
          :aria-invalid="erroresServidor.mesa ? 'true' : undefined"
          aria-describedby="ayuda-res-mesa"
        >
          <option value="">Sin mesa (se elige al llegar)</option>
          <option v-for="o in opcionesMesa" :key="o.mesa.idMesa" :value="String(o.mesa.idMesa)">
            Mesa {{ o.mesa.numero }} · {{ o.mesa.zona }} · para {{ o.mesa.capacidad }}{{ o.alcanza ? '' : ' · no alcanza' }}{{ o.mesa.idMesa === reservacion?.idMesa ? ' · la actual' : '' }}{{ o.mesa.plantaBaja ? ' · planta baja' : '' }}{{ o.mesa.espacioCarriola ? ' · carriola' : '' }}{{ o.mesa.sinEscaleras ? ' · sin escaleras' : '' }}
          </option>
        </select>
        <p id="ayuda-res-mesa" class="campo__ayuda">
          <template v-if="mesaPermitida">Solo se ofrecen mesas libres. {{ opcionesMesa.length === 0 ? 'Ahora no hay ninguna.' : '' }}</template>
          <template v-else>La mesa solo se reserva para reservaciones de hoy; para otro día se elige al llegar.</template>
        </p>
        <p v-if="erroresServidor.mesa" class="texto-error" role="alert">{{ erroresServidor.mesa }}</p>
      </div>

      <!-- Aviso de capacidad: no bloquea. Región en vivo persistente (se anuncia al elegir la mesa). -->
      <div class="advertencias" role="status" aria-live="polite">
        <p v-if="avisoCapacidad" class="advertencia">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3 2.5 20h19z" />
            <path d="M12 10v5M12 17.5v.01" />
          </svg>
          <span><strong>Aviso:</strong> {{ avisoCapacidad }}</span>
        </p>
      </div>
    </fieldset>

    <p v-if="errorReintentable" class="texto-error" role="alert">{{ errorReintentable }}</p>
    <div v-if="rechazo" class="aviso" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>{{ rechazo }}</p>
    </div>

    <div class="fila-botones formulario__acciones">
      <button type="button" class="btn btn--secundario btn--grande" :disabled="enCurso" @click="emit('volver')">
        {{ edita ? 'Volver' : 'Cancelar' }}
      </button>
      <button type="submit" class="btn btn--grande" :disabled="enCurso">
        {{ enCurso ? 'Guardando…' : edita ? 'Guardar cambios' : 'Crear reservación' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.formulario {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.formulario__nota {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.resumen-errores {
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-error);
  border-radius: var(--radio-sm);
  background: var(--color-peligro-fondo);
}

.resumen-errores h3 {
  color: var(--color-peligro-texto);
  font-size: var(--texto-base);
}

.resumen-errores ul {
  margin: var(--espacio-2) 0 0;
  padding-left: var(--espacio-5);
}

.resumen-errores a {
  display: inline-block;
  min-height: 32px;
  color: var(--color-peligro-texto);
  font-weight: 600;
}

.cliente-fijo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--espacio-1) var(--espacio-3);
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-bg);
}

.cliente-fijo__etiqueta {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.cuando {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.cuando legend {
  padding: 0;
  margin-bottom: var(--espacio-1);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.cuando__fila {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--espacio-3);
}

.campo p {
  margin: 0;
}

.campo__ayuda {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 400;
}

.campo input[aria-invalid='true'],
.select[aria-invalid='true'] {
  border-color: var(--color-error);
}

.select {
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-3);
  border: 2px solid var(--color-muted);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-weight: 400;
}

.select:disabled {
  border-color: var(--color-deshabilitado-borde);
  background: var(--color-deshabilitado-fondo);
  color: var(--color-deshabilitado-texto);
}

.personas__control {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
}

.personas__paso {
  flex: none;
  min-width: var(--tactil-min);
  padding: 0;
}

.personas__campo {
  width: 6rem;
  text-align: center;
  font-size: var(--texto-xl);
  font-weight: 700;
}

.campo__preferencias {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4) var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface-2);
}

.campo__preferencias legend {
  padding-inline: var(--espacio-1);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.campo__opciones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--espacio-2);
}

.opcion-acceso {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: var(--tactil-min);
  padding: var(--espacio-2) var(--espacio-3);
  border: 2px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-size: var(--texto-sm);
  font-weight: 600;
  cursor: pointer;
}

.opcion-acceso input {
  flex: none;
  width: 22px;
  height: 22px;
  accent-color: var(--color-primary);
}

.opcion-acceso svg {
  flex: none;
  color: var(--color-muted);
}

.opcion-acceso:has(input:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

.opcion-acceso:has(input:checked) svg {
  color: var(--color-primary-dark);
}

.opcion-acceso:has(input:focus-visible) {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.advertencias:empty {
  display: none;
}

.advertencia {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-3);
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-advertencia);
  border-radius: var(--radio-sm);
  background: var(--color-advertencia-fondo);
  color: var(--color-advertencia-texto);
}

.advertencia svg {
  flex: none;
  margin-top: var(--espacio-1);
}

.texto-error {
  margin: 0;
}

.formulario__acciones > .btn {
  flex: 1 1 12rem;
}

/* «Cancelar» y «Guardar» quedan siempre a la vista al pie del diálogo, aunque el formulario sea largo */
.formulario__acciones {
  position: sticky;
  bottom: calc(var(--espacio-6) * -1);
  z-index: 1;
  margin-bottom: calc(var(--espacio-6) * -1);
  padding: var(--espacio-3) 0 var(--espacio-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

/* Lo que se enfoca o se lleva a la vista no queda tapado por la barra de botones */
.formulario :is(input, select, a, .resumen-errores, .texto-error) {
  scroll-margin-bottom: 7rem;
}
</style>
