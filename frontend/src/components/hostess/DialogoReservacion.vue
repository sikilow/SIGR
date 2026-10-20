<script setup lang="ts">
// Diálogo de una reservación, sobre DialogoModal (foco atrapado, Escape, foco de regreso a la tarjeta). Un solo diálogo
// con pasos, para que el foco no salte entre diálogos: «acciones» (datos y qué se puede hacer), «editar»/«nueva»
// (formulario), «llegada» (registrar llegada) y «cancelar» (confirmación). Qué acciones se ofrecen lo decide
// `utils/reservaciones.ts` según el estado.
import { computed, nextTick, ref, watch } from 'vue'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useReservacionesStore } from '../../stores/reservaciones'
import type { Reservacion } from '../../types'
import { formatearCapacidad, formatearHora } from '../../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../../utils/idempotencia'
import { accionesDisponibles } from '../../utils/reservaciones'
import DialogoModal from '../DialogoModal.vue'
import FormularioLlegada from './FormularioLlegada.vue'
import FormularioReservacion from './FormularioReservacion.vue'
import InsigniaReservacion from './InsigniaReservacion.vue'

type Paso = 'acciones' | 'editar' | 'nueva' | 'llegada' | 'cancelar'

const props = defineProps<{
  abierto: boolean
  /** Reservación abierta (viva, de la lista); `null` para una nueva. */
  reservacion: Reservacion | null
  /** `nueva` abre directo el formulario vacío. */
  modo: 'acciones' | 'nueva'
  /** Día que se ve en la lista (la reservación nueva empieza ahí). */
  diaInicial: string
  /** Si al cerrar la tarjeta de origen ya no existe (p. ej. el filtro la oculta), el foco va aquí. */
  focoAlternativo?: HTMLElement | null
}>()

const emit = defineEmits<{
  cerrar: []
  /** Se creó o editó una reservación (para que la lista vaya a su día). */
  guardada: [reservacion: Reservacion]
}>()

const store = useReservacionesStore()
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

const acciones = computed(() => (props.reservacion ? accionesDisponibles(props.reservacion.estado) : []))
const puede = (accion: ReturnType<typeof accionesDisponibles>[number]) => acciones.value.includes(accion)

const tituloPaso = computed(() => {
  switch (paso.value) {
    case 'nueva':
      return 'Nueva reservación'
    case 'editar':
      return 'Editar reservación'
    case 'llegada':
      return 'Registrar llegada'
    case 'cancelar':
      return 'Cancelar reservación'
    default:
      return props.reservacion ? `Reservación de ${props.reservacion.clienteNombre}` : 'Reservación'
  }
})

/** «viernes, 16 de octubre» de la reservación abierta. */
const fechaLarga = computed(() =>
  props.reservacion ? props.reservacion.fechaHora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
)

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

function alGuardar(r: Reservacion) {
  emit('guardada', r)
  cerrar()
}

function mensajeDeRechazo(e: unknown): string {
  if (e instanceof ErrorServicio) {
    if (e.codigo === 'estado_invalido') return 'Esta reservación cambió mientras tanto y ya no admite esa acción. Revisa la lista, ya se actualizó.'
    if (e.codigo === 'sin_permiso') return 'Tu usuario no tiene permiso para esta acción.'
    return e.message
  }
  return 'Ocurrió un error inesperado.'
}

/** Confirmar (pendiente → confirmada) o cancelar (pendiente o confirmada → cancelada). */
async function cambiarEstado(estado: 'confirmada' | 'cancelada') {
  const r = props.reservacion
  if (!r || trabajando.value) return
  trabajando.value = true
  rechazo.value = ''
  errorReintentable.value = ''
  try {
    await store.actualizar(r.idReservacion, { estado }, claves.para(`${estado}|${r.idReservacion}`))
    claves.soltar()
    void anuncios.anunciar(
      estado === 'confirmada'
        ? `Reservación de ${r.clienteNombre} confirmada`
        : r.mesaNumero !== null
          ? `Reservación de ${r.clienteNombre} cancelada · mesa ${r.mesaNumero} liberada`
          : `Reservación de ${r.clienteNombre} cancelada`,
    )
    cerrar()
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se repetirá el cambio.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se repetirá el cambio.'
    } else {
      claves.soltar()
      rechazo.value = mensajeDeRechazo(e)
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
    etiqueta-id="res-titulo"
    :variante="paso === 'acciones' ? 'hoja' : 'centro'"
    :cerrable="!ocupadoHijo && !trabajando"
    :foco-alternativo="focoAlternativo ?? null"
    @cerrar="emit('cerrar')"
  >
    <div v-if="paso === 'nueva' || reservacion" class="contenido">
      <header class="contenido__cabecera">
        <h2 id="res-titulo" ref="titulo" tabindex="-1">{{ tituloPaso }}</h2>
        <InsigniaReservacion v-if="reservacion && paso === 'acciones'" :estado="reservacion.estado" />
      </header>

      <!-- Paso 1: datos y acciones -->
      <template v-if="paso === 'acciones' && reservacion">
        <dl class="datos">
          <div><dt>Hora</dt><dd class="numero">{{ formatearHora(reservacion.fechaHora) }} · {{ fechaLarga }}</dd></div>
          <div><dt>Teléfono</dt><dd>{{ reservacion.clienteTelefono ?? 'Sin teléfono' }}</dd></div>
          <div><dt>Personas</dt><dd>{{ formatearCapacidad(reservacion.personas) }}</dd></div>
          <div><dt>Mesa</dt><dd>{{ reservacion.mesaNumero === null ? 'Sin mesa' : `Mesa ${reservacion.mesaNumero}` }}</dd></div>
          <div v-if="reservacion.llegadaEn"><dt>Llegó a las</dt><dd class="numero">{{ formatearHora(reservacion.llegadaEn) }}</dd></div>
        </dl>

        <p v-if="acciones.length === 0" class="contenido__final">
          {{ reservacion.estado === 'llego' ? 'Esta reservación ya llegó.' : reservacion.estado === 'cancelada' ? 'Esta reservación está cancelada.' : 'No se reconoce el estado de esta reservación.' }}
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
          <button v-if="puede('llegada')" type="button" class="btn btn--grande acciones__boton" autofocus :disabled="trabajando" @click="irA('llegada')">
            Registrar llegada
          </button>
          <button v-if="puede('confirmar')" type="button" class="btn btn--secundario btn--grande acciones__boton" :disabled="trabajando" @click="cambiarEstado('confirmada')">
            {{ trabajando ? 'Confirmando…' : 'Confirmar reservación' }}
          </button>
          <button v-if="puede('editar')" type="button" class="btn btn--secundario btn--grande acciones__boton" :disabled="trabajando" @click="irA('editar')">
            Editar
          </button>
          <button v-if="puede('cancelar')" type="button" class="btn btn--peligro-suave btn--grande acciones__boton" :disabled="trabajando" @click="irA('cancelar')">
            Cancelar reservación
          </button>
          <button type="button" class="btn btn--secundario btn--grande acciones__boton" :autofocus="acciones.length === 0" :disabled="trabajando" @click="cerrar">
            Cerrar
          </button>
        </div>
      </template>

      <!-- Crear / editar -->
      <FormularioReservacion
        v-else-if="paso === 'nueva' || paso === 'editar'"
        :reservacion="paso === 'editar' ? reservacion : null"
        :dia-inicial="diaInicial"
        @volver="paso === 'editar' ? irA('acciones') : cerrar()"
        @guardada="alGuardar"
        @ocupado="ocupadoHijo = $event"
      />

      <!-- Registrar llegada -->
      <FormularioLlegada
        v-else-if="paso === 'llegada' && reservacion"
        :reservacion="reservacion"
        @volver="irA('acciones')"
        @hecho="cerrar"
        @ocupado="ocupadoHijo = $event"
      />

      <!-- Confirmar la cancelación (acción destructiva: pide confirmación) -->
      <div v-else-if="paso === 'cancelar' && reservacion" class="cancelar">
        <p>
          ¿Cancelar la reservación de <strong>{{ reservacion.clienteNombre }}</strong> de las {{ formatearHora(reservacion.fechaHora) }}
          ({{ formatearCapacidad(reservacion.personas) }})?
        </p>
        <p v-if="reservacion.mesaNumero !== null" class="cancelar__mesa">
          La mesa {{ reservacion.mesaNumero }} volverá a estar libre, salvo que otra reservación vigente la necesite.
        </p>

        <p v-if="errorReintentable" class="texto-error" role="alert">{{ errorReintentable }}</p>
        <div v-if="rechazo" class="aviso" role="alert">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.01" />
          </svg>
          <p>{{ rechazo }}</p>
        </div>

        <div class="fila-botones cancelar__acciones">
          <button type="button" class="btn btn--secundario btn--grande" autofocus :disabled="trabajando" @click="irA('acciones')">No, volver</button>
          <button type="button" class="btn btn--peligro btn--grande" :disabled="trabajando" @click="cambiarEstado('cancelada')">
            {{ trabajando ? 'Cancelando…' : 'Sí, cancelar reservación' }}
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

.cancelar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.cancelar p {
  margin: 0;
}

.cancelar__mesa {
  color: var(--color-muted);
}

.cancelar__acciones > .btn {
  flex: 1 1 12rem;
}

.texto-error {
  margin: 0;
}
</style>
