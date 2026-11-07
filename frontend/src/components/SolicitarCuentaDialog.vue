<script setup lang="ts">
// Solicitar la cuenta (diálogo modal). El mesero NO cobra: solo indica a caja el tipo de pago
// ("fisico" o "digital") con POST /cuentas/{id}/solicitar-pago. Los pedidos sin entregar se avisan
// pero NO bloquean; solo se bloquea si no hay pedidos vigentes (total 0).
import { computed, nextTick, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import { useAnunciosStore } from '../stores/anuncios'
import { invalidarDatos } from '../stores/invalidar'
import { ETIQUETA_ESTADO_PEDIDO, ETIQUETA_TIPO_PAGO, type Cuenta, type EstadoPedido, type TipoPago } from '../types'
import { formatearMoneda } from '../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../utils/idempotencia'
import { estaSinEntregar, sumaAlTotal } from '../utils/reglas'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{
  abierto: boolean
  cuenta: Cuenta | null
  mesaNumero: number
  origenFoco?: HTMLElement | null
  /** Si el origen desaparece (el botón se oculta al quedar solicitada), el foco va aquí. */
  focoAlternativo?: HTMLElement | null
}>()

const emit = defineEmits<{
  cerrar: []
  solicitada: [cuenta: Cuenta]
}>()

const OPCIONES: ReadonlyArray<{ valor: TipoPago; ayuda: string }> = [
  { valor: 'fisico', ayuda: 'El cajero cobra en persona.' },
  { valor: 'digital', ayuda: 'El cajero cobra por medios digitales.' },
]

const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const tipo = ref<TipoPago | null>(null)
const intentado = ref(false)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')
const grupoPago = ref<HTMLFieldSetElement | null>(null)
const botonCerrar = ref<HTMLButtonElement | null>(null)

const vigentes = computed(() => (props.cuenta?.pedidos ?? []).filter(sumaAlTotal))
const sinEntregar = computed(() => vigentes.value.filter((p) => estaSinEntregar(p.estado)))
/** Sin pedidos vigentes no hay nada que cobrar. */
const sinPedidosActivos = computed(() => (props.cuenta?.total ?? 0) === 0 || vigentes.value.length === 0)
const errorTipo = computed(() => (intentado.value && tipo.value === null ? 'Elige una forma de pago para continuar.' : ''))

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    tipo.value = null
    intentado.value = false
    enCurso.value = false
    errorReintentable.value = ''
    rechazo.value = ''
    claves.soltar()
  },
)

watch(rechazo, async (texto) => {
  if (!texto) return
  await nextTick()
  botonCerrar.value?.focus()
})

function textoSinEntregar(estado: EstadoPedido, idPedido: number): string {
  return estado === 'registrado'
    ? `#${idPedido} · Registrado: aún no se envía a cocina`
    : `#${idPedido} · ${ETIQUETA_ESTADO_PEDIDO[estado]}`
}

async function explicarRechazo(e: ErrorServicio, cuenta: Cuenta) {
  rechazo.value = e.message
  if (e.codigo === 'estado_invalido') {
    try {
      const actual = await servicios.cuentas.obtenerPorMesa(cuenta.idMesa)
      if (actual && actual.estado !== 'abierta') {
        const pago = actual.tipoPagoSolicitado ? ` (${ETIQUETA_TIPO_PAGO[actual.tipoPagoSolicitado]})` : ''
        rechazo.value = `La cuenta de la mesa ${props.mesaNumero} ya no estaba abierta: ya se había solicitado${pago}.`
      }
    } catch {
      // Sin red para consultarla: se queda el mensaje del servidor.
    }
  }
  void invalidarDatos()
}

async function solicitar() {
  const cuenta = props.cuenta
  if (enCurso.value || !cuenta || sinPedidosActivos.value) return
  intentado.value = true
  if (tipo.value === null) {
    grupoPago.value?.querySelector('input')?.focus()
    return
  }

  enCurso.value = true
  errorReintentable.value = ''
  // Misma cuenta y mismo tipo de pago = reintento (misma clave); otro tipo = intención nueva.
  const clave = claves.para(`solicitar|${cuenta.idCuenta}|${tipo.value}`)
  const elegido = tipo.value
  try {
    const actualizada = await servicios.cuentas.solicitarPago(cuenta.idCuenta, elegido, clave)
    claves.soltar()
    void anuncios.anunciar(`Cuenta solicitada · ${ETIQUETA_TIPO_PAGO[elegido]} · Esperando al cajero`)
    await invalidarDatos()
    emit('solicitada', actualizada)
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se duplicará la solicitud.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se duplicará la solicitud.'
    } else {
      claves.soltar()
      if (e instanceof ErrorServicio) await explicarRechazo(e, cuenta)
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
    etiqueta-id="solicitar-titulo"
    variante="centro"
    :cerrable="!enCurso"
    :origen-foco="origenFoco ?? null"
    :foco-alternativo="focoAlternativo ?? null"
    @cerrar="emit('cerrar')"
  >
    <form v-if="cuenta" class="solicitar" novalidate @submit.prevent="solicitar">
      <header>
        <h2 id="solicitar-titulo">Solicitar cuenta · Mesa {{ mesaNumero }}</h2>
        <p class="solicitar__sub">El cajero hará el cobro; aquí solo indicas cómo pagará el cliente.</p>
      </header>

      <p class="solicitar__total">
        <span>Total de la cuenta</span>
        <strong class="numero">{{ formatearMoneda(cuenta.total) }}</strong>
      </p>

      <!-- Rechazo definitivo del servidor -->
      <div v-if="rechazo" class="solicitar__alerta" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <div>
          <strong>No se solicitó la cuenta</strong>
          <p>{{ rechazo }}</p>
          <p>La información de la pantalla ya se actualizó.</p>
        </div>
      </div>

      <!-- Bloqueo: nada que cobrar -->
      <div v-else-if="sinPedidosActivos" class="solicitar__alerta" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <div>
          <strong>No se puede solicitar la cuenta</strong>
          <p>No hay pedidos activos: el total es {{ formatearMoneda(0) }}.</p>
        </div>
      </div>

      <template v-else>
        <!-- Advertencia (no bloquea) -->
        <div v-if="sinEntregar.length > 0" class="solicitar__advertencia">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3 2 20h20z" />
            <path d="M12 10v5M12 17.5v.01" />
          </svg>
          <div>
            <strong>
              Hay {{ sinEntregar.length }} {{ sinEntregar.length === 1 ? 'pedido sin entregar' : 'pedidos sin entregar' }}
            </strong>
            <ul>
              <li v-for="p in sinEntregar" :key="p.idPedido">{{ textoSinEntregar(p.estado, p.idPedido) }}</li>
            </ul>
            <p>Puedes solicitar la cuenta de todos modos.</p>
          </div>
        </div>

        <fieldset ref="grupoPago" class="pago" :aria-describedby="errorTipo ? 'pago-error' : undefined">
          <legend>Forma de pago <span class="solicitar__requerido">(obligatorio)</span></legend>
          <label
            v-for="opcion in OPCIONES"
            :key="opcion.valor"
            class="pago__opcion"
            :class="{ 'pago__opcion--elegida': tipo === opcion.valor }"
          >
            <input
              v-model="tipo"
              type="radio"
              name="tipo-pago"
              :value="opcion.valor"
              :disabled="enCurso"
              :aria-invalid="errorTipo ? 'true' : undefined"
            />
            <span class="pago__texto">
              <strong>{{ ETIQUETA_TIPO_PAGO[opcion.valor] }}</strong>
              <small>{{ opcion.ayuda }}</small>
            </span>
            <svg v-if="tipo === opcion.valor" class="pago__marca" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </label>
          <p v-if="errorTipo" id="pago-error" class="texto-error" role="alert">{{ errorTipo }}</p>
        </fieldset>

        <div v-if="errorReintentable" class="solicitar__alerta" role="alert">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.01" />
          </svg>
          <p>{{ errorReintentable }}</p>
        </div>
      </template>

      <p class="solo-lectores" role="status">{{ enCurso ? 'Solicitando la cuenta…' : '' }}</p>

      <div class="fila-botones">
        <button v-if="rechazo || sinPedidosActivos" ref="botonCerrar" type="button" class="btn" autofocus @click="emit('cerrar')">
          Cerrar
        </button>
        <template v-else>
          <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">
            Volver
          </button>
          <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
              <path d="M9 8h6M9 12h6" />
            </svg>
            {{ enCurso ? 'Solicitando…' : errorReintentable ? 'Reintentar solicitud' : 'Solicitar cuenta' }}
          </button>
        </template>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.solicitar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.solicitar__sub {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.solicitar__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--espacio-3);
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4);
  border-radius: var(--radio);
  background: var(--color-bg);
  font-weight: 600;
}

.solicitar__total strong {
  color: var(--color-primary-dark);
  font-size: var(--texto-2xl);
  line-height: 1.1;
}

.solicitar__requerido {
  color: var(--color-muted);
  font-weight: 400;
}

.solicitar__advertencia,
.solicitar__alerta {
  display: flex;
  gap: var(--espacio-3);
  padding: var(--espacio-3) var(--espacio-4);
  border-radius: var(--radio);
}

.solicitar__advertencia svg,
.solicitar__alerta svg {
  flex: none;
  margin-top: var(--espacio-1);
}

.solicitar__advertencia p,
.solicitar__alerta p {
  margin: var(--espacio-1) 0 0;
}

.solicitar__advertencia ul {
  margin: var(--espacio-1) 0 0;
  padding-left: var(--espacio-5);
}

/* Advertencia: ámbar + ícono + texto */
.solicitar__advertencia {
  border: 2px solid var(--color-listo);
  background: var(--color-listo-fondo);
}

.solicitar__advertencia svg,
.solicitar__advertencia strong {
  color: var(--color-listo-texto);
}

.solicitar__alerta {
  border: 2px solid var(--color-peligro);
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
}

.solicitar__alerta strong {
  color: var(--color-peligro-texto);
}

.solicitar__alerta p {
  color: var(--color-text);
}

.pago {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  border: none;
}

.pago legend {
  padding: 0;
  margin-bottom: var(--espacio-2);
  font-weight: 700;
}

/* Cada opción es una tarjeta táctil de 64 px; la elegida lleva check + borde grueso (no solo color) */
.pago__opcion {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  min-height: 64px;
  padding: var(--espacio-3) var(--espacio-4);
  border: 1.5px solid var(--color-borde-control);
  border-radius: var(--radio);
  background: var(--color-surface);
  cursor: pointer;
  touch-action: manipulation;
}

.pago__opcion--elegida {
  border-color: var(--color-primary-dark);
  background: var(--color-bg);
  box-shadow: inset 0 0 0 2px var(--color-primary-dark);
}

.pago__opcion input {
  flex: none;
  width: 24px;
  height: 24px;
  margin: 0;
  accent-color: var(--color-primary-dark);
}

.pago__opcion:has(input:focus-visible) {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.pago__texto {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.pago__texto small {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.pago__marca {
  flex: none;
  color: var(--color-primary-dark);
}

</style>
