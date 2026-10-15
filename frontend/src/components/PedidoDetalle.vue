<script setup lang="ts">
// Detalle de un pedido de "Mis pedidos": avance, líneas, total y las acciones que permite su estado.
//  - registrado: Editar, Enviar a cocina (confirmación breve) y Cancelar pedido.
//  - enviado: Cancelar pedido.
//  - en_preparacion: Cancelar bloqueado ("Requiere autorización del gerente").
//  - listo: Marcar como entregado (confirmación breve).
//  - entregado, pagado, cancelado: solo lectura.
// Si una acción falla porque el estado cambió, se explica el estado actual y se recarga todo.
import { computed, ref } from 'vue'
import { ErrorServicio, servicios } from '../services'
import { useAnunciosStore } from '../stores/anuncios'
import { invalidarDatos } from '../stores/invalidar'
import { ETIQUETA_ESTADO_PEDIDO, type Pedido } from '../types'
import { formatearHora, formatearMoneda } from '../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../utils/idempotencia'
import { accionesDePedido, PASOS_AVANCE, textoCancelarBloqueado } from '../utils/reglas'
import CancelarPedidoDialog from './CancelarPedidoDialog.vue'
import ConfirmarAccionDialog from './ConfirmarAccionDialog.vue'
import IconoEstado from './IconoEstado.vue'
import InsigniaEstado from './InsigniaEstado.vue'

const props = defineProps<{
  pedido: Pedido
  /** La cuenta de la mesa ya se solicitó: no se edita ni se cancela (suposición, ver contrato). */
  cuentaPorPagar: boolean
}>()

const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const titulo = ref<HTMLElement | null>(null)
const botonEnviar = ref<HTMLElement | null>(null)
const botonEntregar = ref<HTMLElement | null>(null)
const botonCancelar = ref<HTMLElement | null>(null)

/** Mueve el foco al encabezado del detalle (al abrir el pedido en pantalla compacta, por ejemplo). */
function enfocar() {
  titulo.value?.focus({ preventScroll: true })
}
defineExpose({ enfocar })

const cancelado = computed(() => props.pedido.estado === 'cancelado')

// ---------- Indicador de avance ----------
const ETIQUETA_PASO: Record<string, string> = {
  registrado: 'Registrado',
  enviado: 'Enviado',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
}

type FasePaso = 'hecho' | 'actual' | 'pendiente'

const pasos = computed(() => {
  // Un pedido pagado ya pasó por todos los pasos.
  const indice = props.pedido.estado === 'pagado' ? PASOS_AVANCE.length : PASOS_AVANCE.indexOf(props.pedido.estado)
  return PASOS_AVANCE.map((estado, i) => ({
    estado,
    texto: ETIQUETA_PASO[estado] ?? estado,
    fase: (i < indice ? 'hecho' : i === indice ? 'actual' : 'pendiente') as FasePaso,
  }))
})

const TEXTO_FASE: Record<FasePaso, string> = { hecho: 'completado', actual: 'paso actual', pendiente: 'pendiente' }

// ---------- Qué acciones corresponden ----------
const acciones = computed(() => accionesDePedido(props.pedido.estado, props.cuentaPorPagar))
const puedeEditar = computed(() => acciones.value.editar !== 'no_aplica')
const puedeEnviar = computed(() => acciones.value.enviar)
const puedeEntregarAhora = computed(() => acciones.value.entregar)
/** Hay botón "Cancelar pedido" (activo o bloqueado) solo mientras tenga sentido mostrarlo. */
const muestraCancelar = computed(() => acciones.value.cancelar !== 'no_aplica')
/** Motivo visible por el que "Cancelar pedido" está bloqueado; `null` si se puede usar. */
const motivoCancelarBloqueado = computed(() => textoCancelarBloqueado(acciones.value.cancelar))
const motivoEditarBloqueado = computed<string | null>(() =>
  acciones.value.editar === 'cuenta_por_pagar' ? 'La cuenta ya fue solicitada: no se puede editar.' : null,
)
const hayAcciones = computed(() => puedeEnviar.value || puedeEditar.value || puedeEntregarAhora.value || muestraCancelar.value)

// ---------- Enviar a cocina / marcar entregado (confirmación breve) ----------
type Accion = 'enviar' | 'entregar'
const accion = ref<Accion | null>(null)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')

const TEXTOS: Record<Accion, { titulo: (p: Pedido) => string; descripcion: (p: Pedido) => string; confirmar: string }> = {
  enviar: {
    titulo: (p) => `Enviar el pedido #${p.id} a cocina`,
    descripcion: () => 'Después de enviarlo ya no podrás editarlo; solo podrás cancelarlo mientras cocina no lo esté preparando.',
    confirmar: 'Enviar a cocina',
  },
  entregar: {
    titulo: (p) => `Marcar el pedido #${p.id} como entregado`,
    descripcion: (p) => `Confirma que el pedido #${p.id} ya llegó a la mesa ${p.mesaNumero}.`,
    confirmar: 'Marcar como entregado',
  },
}

const origenAccion = computed(() => (accion.value === 'enviar' ? botonEnviar.value : botonEntregar.value))

function abrirAccion(cual: Accion) {
  accion.value = cual
  enCurso.value = false
  errorReintentable.value = ''
  rechazo.value = ''
  claves.soltar() // abrir la confirmación es una intención nueva
}

function cerrarAccion() {
  if (!enCurso.value) accion.value = null
}

async function explicarRechazo(e: ErrorServicio, pedido: Pedido) {
  rechazo.value = e.message
  if (e.codigo === 'estado_invalido') {
    try {
      const actual = await servicios.pedidos.obtener(pedido.id)
      rechazo.value = `El pedido #${pedido.id} cambió mientras lo revisabas: ahora está «${ETIQUETA_ESTADO_PEDIDO[actual.estado]}».`
    } catch {
      // Sin red para consultarlo: se queda el mensaje del servidor.
    }
  } else if (e.codigo === 'producto_agotado' && e.faltantes.length > 0) {
    const nombres = e.faltantes
      .map((f) => pedido.detalle.find((d) => d.productoId === f.productoId)?.nombreProducto ?? `Producto ${f.productoId}`)
      .join(', ')
    rechazo.value = `Hay productos agotados: ${nombres}. Edita el pedido para quitarlos.`
  }
  void invalidarDatos()
}

async function confirmarAccion() {
  const cual = accion.value
  const pedido = props.pedido
  if (!cual || enCurso.value) return
  enCurso.value = true
  errorReintentable.value = ''
  // Misma acción sobre el mismo pedido = reintento (misma clave).
  const clave = claves.para(`${cual}|${pedido.id}`)
  try {
    if (cual === 'enviar') await servicios.pedidos.enviar(pedido.id, clave)
    else await servicios.pedidos.entregar(pedido.id, clave)
    claves.soltar()
    void anuncios.anunciar(cual === 'enviar' ? `Pedido #${pedido.id} enviado a cocina` : `Pedido #${pedido.id} entregado`)
    await invalidarDatos()
    accion.value = null
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se repetirá la acción.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se repetirá la acción.'
    } else {
      claves.soltar()
      if (e instanceof ErrorServicio) await explicarRechazo(e, pedido)
      else rechazo.value = 'Ocurrió un error inesperado.'
    }
  } finally {
    enCurso.value = false
  }
}

// ---------- Cancelar ----------
const cancelando = ref(false)
</script>

<template>
  <article class="detalle" aria-labelledby="detalle-titulo" :data-estado="pedido.estado">
    <header class="detalle__cabecera">
      <div>
        <h2 id="detalle-titulo" ref="titulo" tabindex="-1">Pedido #{{ pedido.id }}</h2>
        <p class="detalle__meta">Mesa {{ pedido.mesaNumero }} · {{ formatearHora(pedido.creadoEn) }}</p>
      </div>
      <InsigniaEstado :tono="pedido.estado" :texto="ETIQUETA_ESTADO_PEDIDO[pedido.estado]" />
    </header>

    <!-- Cancelado: se muestra aparte, con su motivo -->
    <section v-if="cancelado" class="cancelado" aria-label="Pedido cancelado">
      <IconoEstado class="cancelado__icono" tono="cancelado" :tamano="28" />
      <div>
        <strong>Pedido cancelado</strong>
        <p v-if="pedido.motivoCancelacion">Motivo: {{ pedido.motivoCancelacion }}</p>
        <p v-else>El servidor no informó el motivo.</p>
        <p class="cancelado__nota">No suma al total de la cuenta.</p>
      </div>
    </section>

    <!-- Indicador de avance: texto + ícono, no solo color -->
    <ol v-else class="avance" aria-label="Avance del pedido">
      <li
        v-for="paso in pasos"
        :key="paso.estado"
        class="avance__paso"
        :class="`avance__paso--${paso.fase}`"
        :aria-current="paso.fase === 'actual' ? 'step' : undefined"
      >
        <span class="avance__marca" aria-hidden="true">
          <svg v-if="paso.fase === 'hecho'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12 5 5 9-10" />
          </svg>
          <IconoEstado v-else-if="paso.fase === 'actual'" :tono="paso.estado" :tamano="22" />
        </span>
        <span class="avance__texto">{{ paso.texto }}</span>
        <span class="solo-lectores">({{ TEXTO_FASE[paso.fase] }})</span>
      </li>
    </ol>

    <ul class="lineas" aria-label="Productos del pedido">
      <li v-for="d in pedido.detalle" :key="d.productoId" class="linea" :class="{ 'linea--cancelada': cancelado }">
        <span class="linea__cantidad numero">{{ d.cantidad }}×</span>
        <span class="linea__nombre">
          {{ d.nombreProducto }}
          <small v-if="d.observaciones" class="linea__nota">Obs.: {{ d.observaciones }}</small>
        </span>
        <span class="numero">{{ formatearMoneda(d.cantidad * d.precioUnitario) }}</span>
      </li>
    </ul>

    <p class="total" :class="{ 'total--cancelado': cancelado }">
      <span>Total del pedido</span>
      <strong class="numero">{{ formatearMoneda(pedido.total) }}</strong>
    </p>

    <!-- Acciones según el estado -->
    <section class="acciones" aria-label="Acciones del pedido">
      <p v-if="!hayAcciones" class="acciones__nota">Este pedido es de solo lectura: no hay acciones disponibles.</p>

      <template v-else>
        <button
          v-if="puedeEnviar"
          ref="botonEnviar"
          type="button"
          class="btn acciones__principal"
          aria-haspopup="dialog"
          @click="abrirAccion('enviar')"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 3 10 14" />
            <path d="M21 3l-7 18-4-7-7-4z" />
          </svg>
          Enviar a cocina
        </button>

        <button
          v-if="puedeEntregarAhora"
          ref="botonEntregar"
          type="button"
          class="btn acciones__principal"
          aria-haspopup="dialog"
          @click="abrirAccion('entregar')"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 18h18M5 18a7 7 0 0 1 14 0" />
            <path d="M12 8V6M10 6h4" />
          </svg>
          Marcar como entregado
        </button>

        <template v-if="puedeEditar">
          <RouterLink
            v-if="!motivoEditarBloqueado"
            class="btn btn--secundario"
            :to="{ name: 'mesero-pedido-mesa', params: { mesaId: pedido.mesaId }, query: { editar: pedido.id } }"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 20h4L19 9l-4-4L4 16z" />
            </svg>
            Editar
          </RouterLink>
          <template v-else>
            <button type="button" class="btn btn--secundario" aria-disabled="true" aria-describedby="editar-bloqueo" @click.prevent>
              Editar
            </button>
            <p id="editar-bloqueo" class="bloqueo">{{ motivoEditarBloqueado }}</p>
          </template>
        </template>

        <!-- Cancelar: separado de las demás; bloqueado con su motivo visible -->
        <div v-if="muestraCancelar" class="acciones__peligro">
          <button
            ref="botonCancelar"
            type="button"
            class="btn btn--peligro-suave"
            :aria-disabled="motivoCancelarBloqueado ? 'true' : undefined"
            :aria-describedby="motivoCancelarBloqueado ? 'cancelar-bloqueo' : undefined"
            aria-haspopup="dialog"
            @click="!motivoCancelarBloqueado && (cancelando = true)"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m9 9 6 6M15 9l-6 6" />
            </svg>
            Cancelar pedido
          </button>
          <p v-if="motivoCancelarBloqueado" id="cancelar-bloqueo" class="bloqueo">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {{ motivoCancelarBloqueado }}
          </p>
        </div>
      </template>
    </section>

    <ConfirmarAccionDialog
      :abierto="accion !== null"
      :id-base="accion ?? 'accion'"
      :titulo="accion ? TEXTOS[accion].titulo(pedido) : ''"
      :descripcion="accion ? TEXTOS[accion].descripcion(pedido) : ''"
      :texto-confirmar="accion ? TEXTOS[accion].confirmar : ''"
      :en-curso="enCurso"
      :error-reintentable="errorReintentable"
      :rechazo="rechazo"
      :origen-foco="origenAccion"
      :foco-alternativo="titulo"
      @confirmar="confirmarAccion"
      @cerrar="cerrarAccion"
    />

    <CancelarPedidoDialog
      :abierto="cancelando"
      :pedido="pedido"
      :origen-foco="botonCancelar"
      :foco-alternativo="titulo"
      @cerrar="cancelando = false"
      @cancelado="cancelando = false"
    />
  </article>
</template>

<style scoped>
.detalle {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.detalle__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.detalle h2:focus {
  outline: none;
}

.detalle__meta {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

/* ---------- Cancelado ---------- */
.cancelado {
  display: flex;
  gap: var(--espacio-3);
  padding: var(--espacio-4);
  border: 2px solid var(--color-peligro);
  border-radius: var(--radio);
  background: var(--color-peligro-fondo);
}

.cancelado__icono {
  flex: none;
  color: var(--color-peligro);
}

.cancelado strong {
  color: var(--color-peligro-texto);
  font-size: var(--texto-lg);
}

.cancelado p {
  margin: var(--espacio-1) 0 0;
  overflow-wrap: anywhere;
}

.cancelado__nota {
  font-weight: 600;
}

/* ---------- Avance ---------- */
.avance {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.avance__paso {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--espacio-2);
  text-align: center;
}

/* Conector entre pasos (a la izquierda de cada marca, salvo el primero) */
.avance__paso + .avance__paso::before {
  content: '';
  position: absolute;
  top: 17px;
  right: 50%;
  width: 100%;
  height: 4px;
  background: var(--color-border);
}

.avance__paso--hecho::before,
.avance__paso--actual::before {
  background: var(--color-primary-dark) !important;
}

.avance__marca {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 3px solid var(--color-muted);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-muted);
}

/* Hecho: relleno + check. Actual: ícono propio + aro grueso. Pendiente: aro vacío. */
.avance__paso--hecho .avance__marca {
  border-color: var(--color-primary-dark);
  background: var(--color-primary-dark);
  color: var(--color-on-primary);
}

.avance__paso--actual .avance__marca {
  border-color: var(--color-primary-dark);
  box-shadow: 0 0 0 4px var(--color-border);
  color: var(--color-primary-dark);
}

.avance__texto {
  font-size: var(--texto-sm);
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-muted);
}

.avance__paso--hecho .avance__texto,
.avance__paso--actual .avance__texto {
  color: var(--color-text);
}

.avance__paso--actual .avance__texto {
  font-weight: 800;
}

/* ---------- Líneas y total ---------- */
.lineas {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-border);
}

.linea {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--espacio-3);
  padding: var(--espacio-3) 0;
  border-bottom: 1px solid var(--color-border);
}

.linea__cantidad {
  font-weight: 700;
}

.linea__nota {
  display: block;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.linea--cancelada {
  color: var(--color-muted);
  text-decoration: line-through;
}

.total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  font-size: var(--texto-lg);
}

.total strong {
  color: var(--color-primary-dark);
  font-size: var(--texto-2xl);
  line-height: 1.1;
}

.total--cancelado strong {
  color: var(--color-muted);
  text-decoration: line-through;
}

/* ---------- Acciones ---------- */
.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-3);
}

.acciones .btn {
  min-height: 56px;
  font-size: var(--texto-lg); /* igual que .btn--grande */
}

.acciones__principal {
  flex: 1 1 240px;
}

.acciones__nota {
  margin: 0;
  color: var(--color-muted);
}

.acciones__peligro {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  width: 100%;
  padding-top: var(--espacio-3);
  border-top: 1px dashed var(--color-border);
}

.acciones__peligro .btn {
  align-self: flex-start;
}

.bloqueo {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  margin: 0;
  color: var(--color-text);
  font-weight: 600;
}

.bloqueo svg {
  flex: none;
}
</style>
