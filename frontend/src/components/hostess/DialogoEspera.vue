<script setup lang="ts">
// Diálogo de la lista de espera, sobre DialogoModal (foco atrapado, Escape, foco de regreso a la tarjeta). Un solo
// diálogo con pasos, para que el foco no salte entre diálogos: «acciones» (datos y qué se puede hacer), «nueva»
// (agregar un grupo), «asignar» (elegir mesa) y «quitar» (confirmación). Qué acciones se ofrecen lo decide
// `utils/espera.ts` según el estado: solo quien sigue esperando se asigna o se quita (nunca se borra la fila).
import { computed, nextTick, ref, watch } from 'vue'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useEsperaStore } from '../../stores/espera'
import type { ListaEspera } from '../../types'
import { puedeAsignarEspera, puedeQuitarEspera, textoHaceCuanto, esperaLarga, UMBRAL_ESPERA_LARGA_MIN } from '../../utils/espera'
import { formatearCapacidad, formatearHora } from '../../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'
import DialogoModal from '../DialogoModal.vue'
import FormularioAsignarEspera from './FormularioAsignarEspera.vue'
import FormularioEspera from './FormularioEspera.vue'
import InsigniaEspera from './InsigniaEspera.vue'

type Paso = 'acciones' | 'nueva' | 'asignar' | 'quitar'

const props = defineProps<{
  abierto: boolean
  /** Grupo abierto (vivo, de la lista); `null` para uno nuevo. */
  espera: ListaEspera | null
  /** `nueva` abre directo el formulario vacío. */
  modo: 'acciones' | 'nueva'
  /** Si al cerrar la tarjeta de origen ya no existe (p. ej. el grupo salió de «Esperando»), el foco va aquí. */
  focoAlternativo?: HTMLElement | null
}>()

const emit = defineEmits<{
  cerrar: []
  /** Se agregó un grupo (para resaltarlo en la lista). */
  guardada: [espera: ListaEspera]
}>()

const store = useEsperaStore()
const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const dialogo = ref<InstanceType<typeof DialogoModal> | null>(null)
const titulo = ref<HTMLElement | null>(null)
const paso = ref<Paso>('acciones')
const ocupadoHijo = ref(false)
const trabajando = ref(false)
const rechazo = ref('')
const errorReintentable = ref('')

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    paso.value = props.modo === 'nueva' ? 'nueva' : 'acciones'
    ocupadoHijo.value = false
    trabajando.value = false
    rechazo.value = ''
    errorReintentable.value = ''
    claves.soltar()
  },
  { immediate: true },
)

const puedeAsignar = computed(() => (props.espera ? puedeAsignarEspera(props.espera.estado) : false))
const puedeQuitar = computed(() => (props.espera ? puedeQuitarEspera(props.espera.estado) : false))
const esperando = computed(() => props.espera?.estado === 'esperando')
const larga = computed(() => (props.espera && esperando.value ? esperaLarga(props.espera.registradoEn, new Date(store.ahora)) : false))

const tituloPaso = computed(() => {
  switch (paso.value) {
    case 'nueva':
      return 'Agregar a la lista de espera'
    case 'asignar':
      return 'Asignar mesa'
    case 'quitar':
      return 'Quitar de la lista'
    default:
      return props.espera ? props.espera.clienteNombre : 'Grupo en espera'
  }
})

/** Cambia de paso y lleva el foco al título: teclado y lectores de pantalla saben que cambió el contenido. */
async function irA(siguiente: Paso) {
  rechazo.value = ''
  errorReintentable.value = ''
  paso.value = siguiente
  await nextTick()
  titulo.value?.focus()
}

function cerrar() {
  dialogo.value?.cerrar()
}

function alGuardar(e: ListaEspera) {
  emit('guardada', e)
  cerrar()
}

function mensajeDeRechazo(e: unknown): string {
  if (e instanceof ErrorServicio) {
    if (e.codigo === 'estado_invalido') return 'Este grupo cambió mientras tanto y ya no está esperando. Revisa la lista, ya se actualizó.'
    if (e.codigo === 'sin_permiso') return 'Tu usuario no tiene permiso para esta acción.'
    return e.message
  }
  return 'Ocurrió un error inesperado.'
}

/** Quitar de la lista: el grupo pasa a «cancelada» (se fue). La fila no se borra. */
async function quitar() {
  const e = props.espera
  if (!e || trabajando.value) return
  trabajando.value = true
  rechazo.value = ''
  errorReintentable.value = ''
  try {
    await store.actualizar(e.idEspera, { estado: 'cancelada' }, claves.para(`quitar|${e.idEspera}`))
    claves.soltar()
    void anuncios.anunciar(`${e.clienteNombre} quitado de la lista de espera`)
    cerrar()
  } catch (error) {
    if (esFalloReintentable(error)) {
      errorReintentable.value =
        error instanceof ErrorServicio && error.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se repetirá el cambio.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se repetirá el cambio.'
    } else {
      claves.soltar()
      rechazo.value = mensajeDeRechazo(error)
    }
  } finally {
    trabajando.value = false
  }
}
</script>

<template>
  <DialogoModal
    ref="dialogo"
    :abierto="abierto"
    etiqueta-id="esp-titulo"
    :variante="paso === 'acciones' ? 'hoja' : 'centro'"
    :cerrable="!ocupadoHijo && !trabajando"
    :foco-alternativo="focoAlternativo ?? null"
    @cerrar="emit('cerrar')"
  >
    <div v-if="paso === 'nueva' || espera" class="contenido">
      <header class="contenido__cabecera">
        <h2 id="esp-titulo" ref="titulo" tabindex="-1">{{ tituloPaso }}</h2>
        <InsigniaEspera v-if="espera && paso === 'acciones'" :estado="espera.estado" />
      </header>

      <!-- Paso 1: datos y acciones -->
      <template v-if="paso === 'acciones' && espera">
        <dl class="datos">
          <div><dt>Personas</dt><dd>{{ formatearCapacidad(espera.personas) }}</dd></div>
          <div><dt>Teléfono</dt><dd>{{ espera.clienteTelefono ?? 'Sin teléfono' }}</dd></div>
          <div><dt>Registrado</dt><dd class="numero">{{ formatearHora(espera.registradoEn) }}</dd></div>
          <div v-if="esperando">
            <dt>Espera</dt>
            <dd class="numero">{{ textoHaceCuanto(espera.registradoEn, new Date(store.ahora)) }}</dd>
          </div>
        </dl>

        <p v-if="larga" class="contenido__larga">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3 2.5 20h19z" />
            <path d="M12 10v5M12 17.5v.01" />
          </svg>
          <span><strong>Espera larga:</strong> lleva más de {{ UMBRAL_ESPERA_LARGA_MIN }} minutos.</span>
        </p>

        <p v-if="!esperando" class="contenido__final">
          {{ espera.estado === 'asignada' ? 'Este grupo ya tiene mesa.' : espera.estado === 'cancelada' ? 'Este grupo se fue y ya no está en la lista.' : 'No se reconoce el estado de este grupo.' }}
          Ya no admite cambios.
        </p>

        <p v-if="errorReintentable" class="texto-error" role="alert">{{ errorReintentable }}</p>
        <div v-if="rechazo" class="aviso" role="alert">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.01" />
          </svg>
          <p>{{ rechazo }}</p>
        </div>

        <div class="acciones">
          <button v-if="puedeAsignar" type="button" class="btn btn--grande acciones__boton" autofocus @click="irA('asignar')">Asignar mesa</button>
          <button v-if="puedeQuitar" type="button" class="btn btn--peligro-suave btn--grande acciones__boton" @click="irA('quitar')">Quitar de la lista</button>
          <button type="button" class="btn btn--secundario btn--grande acciones__boton" :autofocus="!puedeAsignar" @click="cerrar">Cerrar</button>
        </div>
      </template>

      <!-- Agregar -->
      <FormularioEspera v-else-if="paso === 'nueva'" @volver="cerrar" @guardada="alGuardar" @ocupado="ocupadoHijo = $event" />

      <!-- Asignar mesa -->
      <FormularioAsignarEspera
        v-else-if="paso === 'asignar' && espera"
        :espera="espera"
        @volver="irA('acciones')"
        @hecho="cerrar"
        @ocupado="ocupadoHijo = $event"
      />

      <!-- Quitar de la lista (acción destructiva: pide confirmación) -->
      <div v-else-if="paso === 'quitar' && espera" class="quitar">
        <p>
          ¿Quitar a <strong>{{ espera.clienteNombre }}</strong> ({{ formatearCapacidad(espera.personas) }}) de la lista de espera?
        </p>
        <p class="quitar__nota">El grupo queda marcado como «cancelada» (se fue). No se borra su registro.</p>

        <p v-if="errorReintentable" class="texto-error" role="alert">{{ errorReintentable }}</p>
        <div v-if="rechazo" class="aviso" role="alert">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.01" />
          </svg>
          <p>{{ rechazo }}</p>
        </div>

        <div class="fila-botones quitar__acciones">
          <button type="button" class="btn btn--secundario btn--grande" autofocus :disabled="trabajando" @click="irA('acciones')">No, volver</button>
          <button type="button" class="btn btn--peligro btn--grande" :disabled="trabajando" @click="quitar">
            {{ trabajando ? 'Quitando…' : 'Sí, quitar de la lista' }}
          </button>
        </div>
      </div>
    </div>
  </DialogoModal>
</template>

<style scoped>
.contenido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.contenido__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.contenido__cabecera h2 {
  min-width: 0;
  overflow-wrap: anywhere;
}

.contenido__cabecera h2:focus {
  outline: none;
}

.datos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
}

.datos > div {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-1) var(--espacio-3);
}

.datos dt {
  min-width: 6rem;
  color: var(--color-muted);
  font-weight: 600;
}

.datos dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.contenido__larga {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-3);
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-peligro);
  border-radius: var(--radio-sm);
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
}

.contenido__larga svg {
  flex: none;
  margin-top: var(--espacio-1);
}

.contenido__final {
  margin: 0;
  color: var(--color-muted);
}

.acciones {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.acciones__boton {
  width: 100%;
}

.quitar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.quitar p {
  margin: 0;
}

.quitar__nota {
  color: var(--color-muted);
}

.quitar__acciones > .btn {
  flex: 1 1 12rem;
}

.texto-error {
  margin: 0;
}
</style>
