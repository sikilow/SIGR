<script setup lang="ts">
// Agregar un grupo a la lista de espera (paso del diálogo de Espera). Cliente (buscar uno existente o crear uno nuevo, con
// el mismo SelectorCliente de Reservaciones) y personas (1 a 20). Validación: cada error va bajo su campo
// (aria-describedby) y, al intentar guardar, un resumen enfocable los enlaza. El alta lleva Idempotency-Key (también el
// de un cliente nuevo): reintentar tras un fallo de red no duplica nada, y si el cliente ya se creó no se vuelve a crear.
import { computed, nextTick, ref, watch } from 'vue'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useEsperaStore } from '../../stores/espera'
import type { Cliente, ListaEspera } from '../../types'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'
import {
  clienteFormVacio,
  type ErroresCliente,
  MAX_PERSONAS_RESERVACION,
  MIN_PERSONAS_RESERVACION,
  validarCliente,
  validarPersonasReservacion,
} from '../../utils/reservaciones'
import SelectorCliente from './SelectorCliente.vue'

const emit = defineEmits<{
  /** Cancelar sin guardar: cierra el diálogo. */
  volver: []
  guardada: [espera: ListaEspera]
  ocupado: [enCurso: boolean]
}>()

const store = useEsperaStore()
const anuncios = useAnunciosStore()
const clavesEspera = crearClaveIdempotencia()
const clavesCliente = crearClaveIdempotencia()

const cliente = ref(clienteFormVacio())
const personasTexto = ref('2')
const intentado = ref(false)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')
const erroresServidor = ref<{ telefono?: string }>({})
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
    erroresServidor.value = {}
  },
)

const personas = computed(() => {
  const n = Number(personasTexto.value)
  return Number.isInteger(n) && n > 0 ? n : 0
})

// ---------- Validación ----------

interface Errores {
  cliente: ErroresCliente & { cliente?: string }
  personas?: string
}

function validar(): Errores {
  const errores: Errores = { cliente: {} }
  if (cliente.value.modo === 'existente') {
    if (!cliente.value.seleccionado) errores.cliente.cliente = 'Busca y elige un cliente, o crea uno nuevo.'
  } else {
    errores.cliente = validarCliente(cliente.value)
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
  if (e.personas) items.push({ id: 'esp-personas', texto: e.personas })
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

async function guardar() {
  if (enCurso.value) return
  intentado.value = true
  errorReintentable.value = ''
  rechazo.value = ''
  erroresServidor.value = {}

  if (itemsResumen.value.length > 0) {
    await nextTick()
    resumen.value?.focus()
    return
  }

  enCurso.value = true
  /** Campo al que se lleva el foco al terminar (no se puede enfocar mientras el formulario está deshabilitado). */
  let enfocarAlTerminar: string | null = null
  try {
    // 1) El cliente: el elegido o uno nuevo (que se crea una sola vez aunque se reintente el alta en la lista).
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

    // 2) El grupo en la lista de espera.
    const nueva = { idCliente, personas: personas.value }
    const guardada = await store.agregar(nueva, clavesEspera.para(`espera|${JSON.stringify(nueva)}`))
    clavesEspera.soltar()
    void anuncios.anunciar(`${guardada.clienteNombre} agregado a la lista de espera · ${guardada.personas} ${guardada.personas === 1 ? 'persona' : 'personas'}`)
    emit('guardada', guardada)
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se duplicará el grupo.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se duplicará el grupo.'
    } else {
      clavesEspera.soltar()
      rechazo.value = mensajeDeRechazo(e)
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
    <div v-if="itemsResumen.length > 0" ref="resumen" class="resumen-errores" tabindex="-1" role="group" aria-labelledby="esp-resumen-titulo">
      <h3 id="esp-resumen-titulo">Revisa {{ itemsResumen.length === 1 ? 'este dato' : 'estos datos' }}</h3>
      <ul>
        <li v-for="item in itemsResumen" :key="item.id">
          <a :href="`#${item.id}`" @click.prevent="enfocar(item.id)">{{ item.texto }}</a>
        </li>
      </ul>
    </div>
    <div v-else ref="resumen" tabindex="-1" class="solo-lectores" />

    <SelectorCliente v-model="cliente" :buscar="store.buscarClientes" :errores="erroresCliente" :deshabilitado="enCurso" />

    <fieldset class="cuantos" :disabled="enCurso">
      <legend>Cuántos son</legend>
      <div class="campo">
        <label for="esp-personas">Personas ({{ MIN_PERSONAS_RESERVACION }} a {{ MAX_PERSONAS_RESERVACION }})</label>
        <div class="personas__control">
          <button type="button" class="btn btn--secundario personas__paso" aria-label="Una persona menos" @click="cambiarPersonas(-1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12" /></svg>
          </button>
          <input
            id="esp-personas"
            v-model="personasTexto"
            class="personas__campo numero"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            aria-required="true"
            :aria-invalid="errores.personas ? 'true' : undefined"
            :aria-describedby="errores.personas ? 'error-esp-personas' : undefined"
          />
          <button type="button" class="btn btn--secundario personas__paso" aria-label="Una persona más" @click="cambiarPersonas(1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </button>
        </div>
        <p v-if="errores.personas" id="error-esp-personas" class="texto-error">{{ errores.personas }}</p>
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
      <button type="button" class="btn btn--secundario btn--grande" :disabled="enCurso" @click="emit('volver')">Cancelar</button>
      <button type="submit" class="btn btn--grande" :disabled="enCurso">{{ enCurso ? 'Guardando…' : 'Agregar a la lista' }}</button>
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

.cuantos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.cuantos legend {
  padding: 0;
  margin-bottom: var(--espacio-1);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.campo p {
  margin: 0;
}

.campo input[aria-invalid='true'] {
  border-color: var(--color-error);
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

.texto-error {
  margin: 0;
}

.formulario__acciones > .btn {
  flex: 1 1 12rem;
}

/* «Cancelar» y «Agregar» quedan siempre a la vista al pie del diálogo, aunque el formulario sea largo */
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
.formulario :is(input, a, .resumen-errores, .texto-error) {
  scroll-margin-bottom: 7rem;
}
</style>
