<script setup lang="ts">
// Cancelar un pedido (diálogo modal), reutilizado desde Mis pedidos y desde Cuenta de mesa.
// Pide un motivo OBLIGATORIO (texto libre de 5 a 180 caracteres = motivo_cancelacion.descripcion; los atajos solo rellenan el texto),
// llama a POST /pedidos/{id}/cancelar y, si sale bien, anuncia el resultado y recarga pedidos,
// cuenta y mesas. Los reintentos tras un fallo de red reutilizan la misma Idempotency-Key.
import { computed, nextTick, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import { useAnunciosStore } from '../stores/anuncios'
import { invalidarDatos } from '../stores/invalidar'
import {
  ETIQUETA_ESTADO_PEDIDO,
  DESCRIPCION_MOTIVO_MAX,
  DESCRIPCION_MOTIVO_MIN,
  MOTIVOS_RAPIDOS,
  type Pedido,
} from '../types'
import { formatearHora, formatearMoneda } from '../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../utils/idempotencia'
import DialogoModal from './DialogoModal.vue'
import InsigniaEstado from './InsigniaEstado.vue'

const props = defineProps<{
  abierto: boolean
  pedido: Pedido | null
  /** Elemento al que vuelve el foco al cerrar (por defecto, el que lo tenía al abrir). */
  origenFoco?: HTMLElement | null
  /** Si el origen desaparece (el pedido ya no se puede cancelar), el foco va aquí. */
  focoAlternativo?: HTMLElement | null
}>()

const emit = defineEmits<{
  cerrar: []
  cancelado: [pedido: Pedido]
}>()

const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const descripcion = ref('')
const tocado = ref(false)
const enCurso = ref(false)
/** Fallo de red (o inesperado): lo escrito se conserva y se puede reintentar con la misma clave. */
const errorReintentable = ref('')
/** Rechazo definitivo del servidor: ya no hay nada que reintentar, solo explicar y cerrar. */
const rechazo = ref('')
const campoDescripcion = ref<HTMLTextAreaElement | null>(null)
const botonCerrar = ref<HTMLButtonElement | null>(null)

const descripcionLimpia = computed(() => descripcion.value.trim())
const faltan = computed(() => Math.max(0, DESCRIPCION_MOTIVO_MIN - descripcionLimpia.value.length))
const valido = computed(() => descripcionLimpia.value.length >= DESCRIPCION_MOTIVO_MIN && descripcionLimpia.value.length <= DESCRIPCION_MOTIVO_MAX)
const errorCampo = computed(() => {
  if (!tocado.value || valido.value) return ''
  return descripcionLimpia.value.length === 0
    ? `El motivo es obligatorio: escribe al menos ${DESCRIPCION_MOTIVO_MIN} caracteres.`
    : `Escribe al menos ${DESCRIPCION_MOTIVO_MIN} caracteres (faltan ${faltan.value}).`
})

// Cada vez que se abre se empieza de cero: es una intención nueva (clave nueva).
watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    descripcion.value = ''
    tocado.value = false
    enCurso.value = false
    errorReintentable.value = ''
    rechazo.value = ''
    claves.soltar()
  },
)

// Al aparecer la explicación desaparece el campo (que tenía el foco): el foco pasa a "Cerrar".
watch(rechazo, async (texto) => {
  if (!texto) return
  await nextTick()
  botonCerrar.value?.focus()
})

function usarMotivoRapido(texto: string) {
  descripcion.value = texto
  errorReintentable.value = ''
}

/** Explica el rechazo del servidor y recarga los datos para que la pantalla muestre el estado real. */
async function explicarRechazo(e: ErrorServicio, pedido: Pedido) {
  if (e.codigo === 'requiere_gerente') {
    rechazo.value = `El pedido #${pedido.idPedido} ya está en preparación. Solo el gerente puede autorizar su cancelación.`
  } else if (e.codigo === 'estado_invalido') {
    rechazo.value = e.message
    try {
      const actual = await servicios.pedidos.obtener(pedido.idPedido)
      // Si el estado cambió, se explica cuál es ahora; si no, vale el motivo que da el servidor.
      if (actual.estado !== pedido.estado) {
        rechazo.value = `El pedido #${pedido.idPedido} cambió mientras lo revisabas: ahora está «${ETIQUETA_ESTADO_PEDIDO[actual.estado]}» y ya no se puede cancelar desde aquí.`
      }
    } catch {
      // Sin red para consultarlo: se queda el mensaje del servidor.
    }
  } else {
    rechazo.value = e.message
  }
  void invalidarDatos()
}

async function cancelar() {
  const pedido = props.pedido
  if (enCurso.value || !pedido) return
  tocado.value = true
  if (!valido.value) {
    campoDescripcion.value?.focus()
    return
  }

  enCurso.value = true
  errorReintentable.value = ''
  // La clave depende de qué se quiere hacer: mismo pedido y mismo motivo = reintento.
  const clave = claves.para(`cancelar|${pedido.idPedido}|${descripcionLimpia.value}`)
  try {
    const cancelado = await servicios.pedidos.cancelar(pedido.idPedido, descripcionLimpia.value, clave)
    claves.soltar()
    void anuncios.anunciar(`Pedido #${pedido.idPedido} cancelado`)
    // Se espera la recarga para que, al cerrar, el foco ya sepa si su origen sigue existiendo.
    await invalidarDatos()
    emit('cancelado', cancelado)
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Tu motivo se conservó: vuelve a intentarlo.'
          : 'El servidor no respondió como se esperaba. Tu motivo se conservó: vuelve a intentarlo.'
    } else {
      claves.soltar()
      if (e instanceof ErrorServicio) await explicarRechazo(e, pedido)
      else rechazo.value = 'Ocurrió un error inesperado.'
    }
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal
    :abierto="abierto"
    etiqueta-id="cancelar-titulo"
    variante="centro"
    :cerrable="!enCurso"
    :origen-foco="origenFoco ?? null"
    :foco-alternativo="focoAlternativo ?? null"
    @cerrar="emit('cerrar')"
  >
    <form v-if="pedido" class="cancelar" novalidate @submit.prevent="cancelar">
      <header class="cancelar__cabecera">
        <h2 id="cancelar-titulo">Cancelar pedido #{{ pedido.idPedido }}</h2>
        <InsigniaEstado :tono="pedido.estado" :texto="ETIQUETA_ESTADO_PEDIDO[pedido.estado]" />
      </header>

      <!-- Resumen del pedido -->
      <section class="cancelar__resumen" aria-label="Resumen del pedido">
        <p class="cancelar__meta">Mesa {{ pedido.mesaNumero }} · {{ formatearHora(pedido.fechaHora) }}</p>
        <ul class="cancelar__lineas">
          <li v-for="d in pedido.detalle" :key="d.idProducto">
            <span class="numero">{{ d.cantidad }}×</span> {{ d.nombreProducto }}
          </li>
        </ul>
        <p class="cancelar__total">
          <span>Total del pedido</span>
          <strong class="numero">{{ formatearMoneda(pedido.total) }}</strong>
        </p>
      </section>

      <!-- Rechazo definitivo del servidor: se explica y solo queda cerrar -->
      <div v-if="rechazo" class="cancelar__alerta" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <div>
          <strong>No se canceló el pedido</strong>
          <p>{{ rechazo }}</p>
          <p>La información de la pantalla ya se actualizó.</p>
        </div>
      </div>

      <template v-else>
        <p class="cancelar__aviso">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3 2 20h20z" />
            <path d="M12 10v5M12 17.5v.01" />
          </svg>
          Esta acción no se puede deshacer
        </p>

        <div class="campo">
          <label for="motivo-cancelacion">
            Motivo de la cancelación <span class="cancelar__requerido">(obligatorio)</span>
          </label>
          <textarea
            id="motivo-cancelacion"
            ref="campoDescripcion"
            v-model="descripcion"
            :maxlength="DESCRIPCION_MOTIVO_MAX"
            :aria-invalid="errorCampo ? 'true' : undefined"
            :aria-describedby="`motivo-ayuda${errorCampo ? ' motivo-error' : ''}`"
            aria-required="true"
            :readonly="enCurso"
            autofocus
            @blur="tocado = descripcion.length > 0 || tocado"
          />
          <div class="cancelar__pie-campo">
            <p v-if="errorCampo" id="motivo-error" class="texto-error cancelar__error">{{ errorCampo }}</p>
            <p id="motivo-ayuda" class="cancelar__ayuda">
              De {{ DESCRIPCION_MOTIVO_MIN }} a {{ DESCRIPCION_MOTIVO_MAX }} caracteres ·
              <span class="numero">{{ descripcion.length }}/{{ DESCRIPCION_MOTIVO_MAX }}</span>
            </p>
          </div>
        </div>

        <div class="cancelar__rapidos" role="group" aria-label="Motivos rápidos (rellenan el texto)">
          <button
            v-for="texto in MOTIVOS_RAPIDOS"
            :key="texto"
            type="button"
            class="chip"
            :class="{ 'chip--activo': descripcionLimpia === texto }"
            :aria-pressed="descripcionLimpia === texto"
            :disabled="enCurso"
            @click="usarMotivoRapido(texto)"
          >
            {{ texto }}
          </button>
        </div>

        <div v-if="errorReintentable" class="cancelar__alerta" role="alert">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.01" />
          </svg>
          <p>{{ errorReintentable }}</p>
        </div>
      </template>

      <p class="solo-lectores" role="status">{{ enCurso ? 'Cancelando el pedido…' : '' }}</p>

      <div class="fila-botones">
        <template v-if="rechazo">
          <button ref="botonCerrar" type="button" class="btn" @click="emit('cerrar')">Cerrar</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">
            No cancelar
          </button>
          <button type="submit" class="btn btn--peligro" :aria-disabled="enCurso ? 'true' : undefined">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m9 9 6 6M15 9l-6 6" />
            </svg>
            {{ enCurso ? 'Cancelando…' : errorReintentable ? 'Reintentar cancelación' : 'Cancelar pedido' }}
          </button>
        </template>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.cancelar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.cancelar__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.cancelar__resumen {
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-bg);
}

.cancelar__meta {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.cancelar__lineas {
  margin: var(--espacio-2) 0;
  padding: 0;
  list-style: none;
}

.cancelar__lineas li {
  padding: var(--espacio-1) 0;
}

.cancelar__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  font-weight: 600;
}

.cancelar__total strong {
  font-size: var(--texto-lg);
}

/* Advertencia: ícono + texto, nunca solo color */
.cancelar__aviso {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  margin: 0;
  color: var(--color-peligro-texto);
  font-weight: 700;
}

.cancelar__aviso svg {
  flex: none;
  color: var(--color-peligro);
}

.cancelar__requerido {
  color: var(--color-muted);
  font-weight: 400;
}

.campo textarea[aria-invalid='true'] {
  border-color: var(--color-peligro);
}

.cancelar__pie-campo {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--espacio-1) var(--espacio-3);
}

.cancelar__ayuda,
.cancelar__error {
  margin: 0;
  font-size: var(--texto-sm);
}

.cancelar__ayuda {
  margin-left: auto;
  color: var(--color-muted);
  font-weight: 400;
}

.cancelar__error {
  color: var(--color-peligro-texto);
}

.cancelar__rapidos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.cancelar__alerta {
  display: flex;
  gap: var(--espacio-3);
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-peligro);
  border-radius: var(--radio);
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
}

.cancelar__alerta svg {
  flex: none;
  margin-top: var(--espacio-1);
}

.cancelar__alerta p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-text);
}

.cancelar__alerta strong {
  color: var(--color-peligro-texto);
}

</style>
