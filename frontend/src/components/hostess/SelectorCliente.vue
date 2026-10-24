<script setup lang="ts">
// Cliente de una reservación: buscar uno existente (por nombre o teléfono) o dar de alta uno nuevo (nombre y teléfono;
// correo opcional). Los errores se enlazan a su campo con aria-describedby; la búsqueda anuncia cuántos resultados hay
// en una región aria-live sin mover el foco.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import type { Cliente } from '../../types'
import { type ClienteForm, type ErroresCliente, normalizarTelefono } from '../../utils/reservaciones'

const props = defineProps<{
  modelValue: ClienteForm
  /** Busca clientes por nombre o teléfono (`GET /clientes?q=`). */
  buscar: (q: string) => Promise<Cliente[]>
  /** Errores por campo (los pone el formulario al intentar guardar). `cliente` es el error de «no elegiste a nadie». */
  errores: ErroresCliente & { cliente?: string }
  deshabilitado?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [valor: ClienteForm] }>()

/** Espera (ms) tras la última tecla antes de buscar. */
const ESPERA_BUSQUEDA_MS = 250
/** Mínimo de caracteres para buscar (lo mismo que exige la API). */
const MINIMO_BUSQUEDA = 2

const texto = ref('')
const resultados = ref<Cliente[]>([])
const buscando = ref(false)
/** `true` cuando ya hay una búsqueda terminada para el texto actual (para decir «no se encontró»). */
const buscado = ref(false)
const errorBusqueda = ref('')
const correoEditado = ref('')
const guardandoCorreo = ref(false)
const errorCorreo = ref('')
let temporizador: ReturnType<typeof setTimeout> | undefined
/** Número de la última búsqueda lanzada: una respuesta tardía de una anterior se descarta. */
let consecutivo = 0

onBeforeUnmount(() => clearTimeout(temporizador))

function cambiar(parcial: Partial<ClienteForm>) {
  emit('update:modelValue', { ...props.modelValue, ...parcial })
}

function cambiarModo(modo: ClienteForm['modo']) {
  if (modo !== props.modelValue.modo) cambiar({ modo })
}

async function ejecutarBusqueda(q: string) {
  const mio = ++consecutivo
  buscando.value = true
  errorBusqueda.value = ''
  try {
    const r = await props.buscar(q)
    if (mio !== consecutivo) return
    resultados.value = r
    buscado.value = true
  } catch (e) {
    if (mio !== consecutivo) return
    resultados.value = []
    buscado.value = false
    errorBusqueda.value = e instanceof Error ? e.message : 'No se pudo buscar al cliente.'
  } finally {
    if (mio === consecutivo) buscando.value = false
  }
}

function alEscribir() {
  clearTimeout(temporizador)
  const q = texto.value.trim()
  if (q.length < MINIMO_BUSQUEDA) {
    consecutivo++
    resultados.value = []
    buscado.value = false
    buscando.value = false
    errorBusqueda.value = ''
    return
  }
  temporizador = setTimeout(() => void ejecutarBusqueda(q), ESPERA_BUSQUEDA_MS)
}

const botonCambiar = ref<HTMLButtonElement | null>(null)

// Al elegir (o soltar) al cliente la lista desaparece: el foco pasa al control que sigue, para no perderlo.
async function elegir(cliente: Cliente) {
  correoEditado.value = cliente.correo ?? ''
  errorCorreo.value = ''
  cambiar({ seleccionado: cliente })
  await nextTick()
  botonCambiar.value?.focus()
}

async function guardarCorreo() {
  const cliente = props.modelValue.seleccionado
  const correo = correoEditado.value.trim()
  if (!cliente || guardandoCorreo.value) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 120) {
    errorCorreo.value = 'Escribe un correo válido de hasta 120 caracteres.'
    return
  }
  guardandoCorreo.value = true
  errorCorreo.value = ''
  try {
    const actualizado = await servicios.hostess.actualizarCorreoCliente(cliente.idCliente, correo)
    correoEditado.value = actualizado.correo ?? ''
    cambiar({ seleccionado: actualizado })
  } catch (error) {
    errorCorreo.value = error instanceof ErrorServicio ? error.message : 'No se pudo guardar el correo.'
  } finally {
    guardandoCorreo.value = false
  }
}

async function cambiarCliente() {
  cambiar({ seleccionado: null })
  await nextTick()
  document.getElementById('cliente-busqueda')?.focus()
}

/** Pasa a «nuevo» llevando lo que ya se escribió: letras → nombre, dígitos → teléfono. */
function crearDesdeBusqueda() {
  const q = texto.value.trim()
  const esTelefono = /^[\d\s()+-]+$/.test(q)
  cambiar({
    modo: 'nuevo',
    nombre: esTelefono ? props.modelValue.nombre : q,
    telefono: esTelefono ? normalizarTelefono(q) : props.modelValue.telefono,
  })
}

/** Texto que se anuncia a lectores de pantalla (región aria-live, sin mover el foco). */
const anuncio = computed(() => {
  if (props.modelValue.modo !== 'existente') return ''
  if (buscando.value) return 'Buscando clientes…'
  if (errorBusqueda.value) return errorBusqueda.value
  if (!buscado.value) return ''
  const n = resultados.value.length
  return n === 0 ? 'No se encontró ningún cliente.' : `${n} ${n === 1 ? 'cliente encontrado' : 'clientes encontrados'}.`
})

const descripcionBusqueda = computed(() => ['ayuda-busqueda', props.errores.cliente ? 'error-cliente' : ''].filter(Boolean).join(' '))
</script>

<template>
  <fieldset class="cliente" :disabled="deshabilitado">
    <legend class="cliente__leyenda">Cliente</legend>

    <!-- Cliente ya elegido: resumen con «Cambiar» -->
    <div v-if="modelValue.modo === 'existente' && modelValue.seleccionado" class="elegido">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </svg>
      <p class="elegido__texto">
        <strong>{{ modelValue.seleccionado.nombre }}</strong>
        <span>{{ modelValue.seleccionado.telefono ?? 'Sin teléfono' }}</span>
      </p>
      <button ref="botonCambiar" type="button" class="btn btn--secundario" @click="cambiarCliente">Cambiar cliente</button>
      <div class="campo elegido__correo">
        <label for="cliente-correo">Correo para la reservación</label>
        <div class="elegido__correo-fila">
          <input id="cliente-correo" v-model="correoEditado" type="email" inputmode="email" autocomplete="email" maxlength="120" @input="errorCorreo = ''"
            :aria-invalid="errores.correo || errorCorreo ? 'true' : undefined"
            :aria-describedby="errores.correo ? 'error-cliente-correo' : errorCorreo ? 'error-cliente-correo-servidor' : undefined" />
          <button type="button" class="btn btn--secundario" :disabled="guardandoCorreo || correoEditado.trim() === (modelValue.seleccionado.correo ?? '')" @click="guardarCorreo">
            {{ guardandoCorreo ? 'Guardando…' : 'Guardar correo' }}
          </button>
        </div>
        <p v-if="errores.correo" id="error-cliente-correo" class="texto-error">{{ errores.correo }}</p>
        <p v-if="errorCorreo" id="error-cliente-correo-servidor" class="texto-error" role="alert">{{ errorCorreo }}</p>
      </div>
    </div>

    <template v-else>
      <div class="cliente__modos" role="group" aria-label="¿El cliente ya está registrado?">
        <button type="button" class="chip" :class="{ 'chip--activo': modelValue.modo === 'existente' }" :aria-pressed="modelValue.modo === 'existente'" @click="cambiarModo('existente')">
          <svg v-if="modelValue.modo === 'existente'" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg>
          Cliente existente
        </button>
        <button type="button" class="chip" :class="{ 'chip--activo': modelValue.modo === 'nuevo' }" :aria-pressed="modelValue.modo === 'nuevo'" @click="cambiarModo('nuevo')">
          <svg v-if="modelValue.modo === 'nuevo'" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg>
          Cliente nuevo
        </button>
      </div>

      <!-- Buscar uno existente -->
      <div v-if="modelValue.modo === 'existente'" class="busqueda">
        <label class="campo" for="cliente-busqueda">
          Buscar por nombre o teléfono
          <input
            id="cliente-busqueda"
            v-model="texto"
            type="search"
            inputmode="search"
            autocomplete="off"
            enterkeyhint="search"
            :aria-invalid="errores.cliente ? 'true' : undefined"
            :aria-describedby="descripcionBusqueda"
            @input="alEscribir"
            @keydown.enter.prevent
          />
        </label>
        <p id="ayuda-busqueda" class="busqueda__ayuda">Escribe al menos {{ MINIMO_BUSQUEDA }} letras o 3 números del teléfono.</p>
        <p v-if="errores.cliente" id="error-cliente" class="texto-error">{{ errores.cliente }}</p>

        <!-- Región en vivo persistente: anuncia cuántos resultados hay sin quitar el foco del campo -->
        <p class="busqueda__estado" role="status" aria-live="polite">{{ anuncio }}</p>

        <ul v-if="resultados.length > 0" class="resultados" aria-label="Clientes encontrados">
          <li v-for="c in resultados" :key="c.idCliente">
            <button type="button" class="resultado" @click="elegir(c)">
              <span class="resultado__nombre">{{ c.nombre }}</span>
              <span class="resultado__telefono">{{ c.telefono ?? 'Sin teléfono' }}</span>
            </button>
          </li>
        </ul>

        <div v-else-if="buscado && !buscando" class="busqueda__vacio">
          <p>No se encontró ningún cliente con «{{ texto.trim() }}».</p>
          <button type="button" class="btn btn--secundario" @click="crearDesdeBusqueda">Crear cliente nuevo</button>
        </div>
      </div>

      <!-- Alta de cliente nuevo -->
      <div v-else class="nuevo">
        <div class="campo">
          <label for="cliente-nombre">Nombre completo</label>
          <input
            id="cliente-nombre"
            :value="modelValue.nombre"
            type="text"
            autocomplete="off"
            maxlength="100"
            :aria-invalid="errores.nombre ? 'true' : undefined"
            :aria-describedby="errores.nombre ? 'error-cliente-nombre' : undefined"
            @input="cambiar({ nombre: ($event.target as HTMLInputElement).value })"
          />
          <p v-if="errores.nombre" id="error-cliente-nombre" class="texto-error">{{ errores.nombre }}</p>
        </div>

        <div class="campo">
          <label for="cliente-telefono">Teléfono (10 dígitos)</label>
          <input
            id="cliente-telefono"
            :value="modelValue.telefono"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            maxlength="20"
            :aria-invalid="errores.telefono ? 'true' : undefined"
            :aria-describedby="errores.telefono ? 'error-cliente-telefono' : undefined"
            @input="cambiar({ telefono: ($event.target as HTMLInputElement).value })"
          />
          <p v-if="errores.telefono" id="error-cliente-telefono" class="texto-error">{{ errores.telefono }}</p>
        </div>

        <div class="campo">
          <label for="cliente-correo">Correo para la reservación <span aria-hidden="true">*</span></label>
          <input
            id="cliente-correo"
            :value="modelValue.correo"
            type="email"
            inputmode="email"
            autocomplete="off"
            maxlength="120"
            :aria-invalid="errores.correo ? 'true' : undefined"
            :aria-describedby="errores.correo ? 'error-cliente-correo' : undefined"
            @input="cambiar({ correo: ($event.target as HTMLInputElement).value })"
          />
          <p v-if="errores.correo" id="error-cliente-correo" class="texto-error">{{ errores.correo }}</p>
        </div>
      </div>
    </template>
  </fieldset>
</template>

<style scoped>
.cliente {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.cliente__leyenda {
  padding: 0;
  margin-bottom: var(--espacio-1);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.cliente__modos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.elegido {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-libre-texto);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  color: var(--color-libre-texto);
}

.elegido svg {
  flex: none;
}

.elegido__texto {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.busqueda {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
}

.busqueda__ayuda {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.busqueda__estado {
  min-height: 1.5em;
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.busqueda__vacio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--espacio-2);
}

.busqueda__vacio p {
  margin: 0;
}

.resultados {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  max-height: 14rem;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.resultado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-1) var(--espacio-3);
  width: 100%;
  min-height: 56px;
  padding: var(--espacio-2) var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.resultado:active {
  background: var(--color-border);
}

.resultado__nombre {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.resultado__telefono {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.nuevo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.campo p {
  margin: 0;
}

.campo[for] {
  gap: var(--espacio-1);
}

.campo input[aria-invalid='true'] {
  border-color: var(--color-error);
}
</style>
