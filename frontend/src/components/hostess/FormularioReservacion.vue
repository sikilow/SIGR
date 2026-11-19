<script setup lang="ts">
// Crear o editar una reservación (paso del diálogo de Reservaciones). Cliente (buscar o crear), fecha y hora,
// personas (1 a 20) y mesa opcional. Validación: cada error va bajo su campo (aria-describedby) y, al intentar guardar,
// un resumen enfocable los enlaza. El alta lleva Idempotency-Key (también el alta de un cliente nuevo): reintentar tras
// un fallo de red no duplica nada, y si el cliente ya se creó no se vuelve a crear al reintentar la reservación.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useReservacionesStore } from '../../stores/reservaciones'
import type { CambioReservacion, Cliente, PreferenciasReservacion, Reservacion } from '../../types'
import { formatearHora } from '../../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'
import {
  aDiaISO,
  aHoraISO,
  aPreferenciasMesa,
  caracteristicasDisponibles,
  sinPreferencias,
  textoCaracteristicasMesa,
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
  textoPreferencias,
  validarPersonasReservacion,
} from '../../utils/reservaciones'
import {
  diaAbierto,
  HORARIO_POR_DEFECTO,
  type HorarioReservacion,
  horasDelDia,
  horasDisponibles,
  motivoFueraDeHorario,
  textoHorario,
} from '../../utils/horarioReservacion'
import PreferenciasMesaCampos from './PreferenciasMesaCampos.vue'
import SelectorCliente from './SelectorCliente.vue'
import { vPermitir } from '../../utils/campos'

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

// Horario de reservaciones (lo configura Gerencia). Mientras carga se usa el predeterminado; la API valida igual.
const horario = ref<HorarioReservacion>({ ...HORARIO_POR_DEFECTO })
const anticipacionMinutos = ref(60)
const horarioCargado = ref(false)

/** Hora sugerida para hoy: la primera hora del horario que todavía cumple la anticipación; otro día, ninguna. */
function horaInicial(dia: string): string {
  if (dia !== aDiaISO(new Date())) return ''
  return horasDisponibles(horario.value, dia, new Date(), anticipacionMinutos.value)[0] ?? ''
}

const original = props.reservacion
const dia0 = original ? aDiaISO(original.fechaHora) : props.diaInicial < hoy ? hoy : props.diaInicial

const cliente = ref(clienteFormVacio())
const fecha = ref(dia0)
const hora = ref(original ? aHoraISO(original.fechaHora) : horaInicial(dia0))
/** Si la persona ya tocó la hora, no se la cambiamos al llegar el horario. */
const horaTocada = ref(false)

onMounted(async () => {
  try {
    const datos = await servicios.hostess.obtenerHorario()
    horario.value = datos
    anticipacionMinutos.value = datos.anticipacionMinutos
    horarioCargado.value = true
    if (!original && !horaTocada.value) hora.value = horaInicial(fecha.value)
  } catch {
    // Sin horario la API sigue validando al guardar.
  }
})

/** Horas sugeridas en el campo (la hostess puede escribir cualquier minuto dentro del horario). */
const horasSugeridas = computed(() => horasDelDia(horario.value))
const ayudaHora = computed(() =>
  fecha.value && !diaAbierto(horario.value, fecha.value)
    ? 'Ese día no se reciben reservaciones.'
    : `Horario: ${textoHorario(horario.value)}.`,
)
const personasTexto = ref(original ? String(original.personas) : '2')
const idMesaTexto = ref(original?.idMesa != null ? String(original.idMesa) : '')
const preferenciasMesa = ref<PreferenciasReservacion>(
  original?.preferencias ? { ...original.preferencias, caracteristicas: [...original.preferencias.caracteristicas] } : sinPreferencias(),
)

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
  mesasParaReservacion(store.mesas, personas.value || 1, props.reservacion?.idMesa ?? null, aPreferenciasMesa(preferenciasMesa.value)),
)
const caracteristicasMesa = computed(() => caracteristicasDisponibles(store.mesas))
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
  // Día cerrado o fuera del horario (solo si cambió la fecha u hora: una reservación anterior al horario se puede editar).
  const sinCambio = original && aDiaISO(original.fechaHora) === fecha.value && aHoraISO(original.fechaHora) === hora.value
  if (!errores.fecha && !errores.hora && fecha.value && hora.value && !sinCambio) {
    const motivo = motivoFueraDeHorario(horario.value, fecha.value, hora.value, false)
    if (motivo && !diaAbierto(horario.value, fecha.value)) errores.fecha = motivo
    else if (motivo) errores.hora = motivo
  }
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
  if (textoPreferencias(preferenciasMesa.value) !== textoPreferencias(original.preferencias)) cambio.preferencias = { ...preferenciasMesa.value }
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
          const datos = { nombre: cliente.value.nombre, telefono: cliente.value.telefono, lada: cliente.value.lada, correo: cliente.value.correo.trim() || null }
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
        preferencias: { ...preferenciasMesa.value },
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
            list="res-horas"
            :min="horario.horaApertura"
            :max="horario.horaUltima"
            aria-required="true"
            :aria-invalid="errores.hora ? 'true' : undefined"
            :aria-describedby="errores.hora ? 'error-res-hora ayuda-res-hora' : 'ayuda-res-hora'"
            @input="horaTocada = true"
          />
          <datalist id="res-horas">
            <option v-for="h in horasSugeridas" :key="h" :value="h" />
          </datalist>
          <p id="ayuda-res-hora" class="campo__ayuda" :class="{ 'campo__ayuda--aviso': fecha && !diaAbierto(horario, fecha) }">{{ ayudaHora }}</p>
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
            id="res-personas" v-permitir="'digitos'"
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
        <PreferenciasMesaCampos
          v-model="preferenciasMesa"
          id-prefijo="res-pref"
          :zonas="zonasMesa"
          :opciones="caracteristicasMesa"
          :deshabilitado="enCurso"
          leyenda="Preferencias del cliente"
        />
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
            Mesa {{ o.mesa.numero }} · {{ o.mesa.zona }} · para {{ o.mesa.capacidad }}{{ o.alcanza ? '' : ' · no alcanza' }}{{ o.mesa.idMesa === reservacion?.idMesa ? ' · la actual' : '' }}{{ textoCaracteristicasMesa(o.mesa) ? ` · ${textoCaracteristicasMesa(o.mesa)}` : '' }}
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

.campo__ayuda--aviso {
  color: var(--color-peligro-texto);
  font-weight: 650;
}

.campo input[aria-invalid='true'],
.select[aria-invalid='true'] {
  border-color: var(--color-error);
}

.select {
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-3);
  border: 1.5px solid var(--color-borde-control);
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
