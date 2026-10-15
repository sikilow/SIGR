<script setup lang="ts">
// Revisión "¿El pedido es correcto?" (diálogo modal). Al abrirse verifica la disponibilidad
// (POST /productos/disponibilidad). Desde aquí se registra, se envía a cocina o, al editar un
// pedido registrado, se guardan los cambios. Mientras una petición está en curso los botones
// quedan bloqueados para evitar dobles envíos.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { DisponibilidadProducto, Pedido } from '../types'
import { aLineasNuevoPedido, subtotalDe, type LineaCarrito } from '../utils/carrito'
import { formatearMoneda } from '../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../utils/idempotencia'
import DialogoModal from './DialogoModal.vue'

export type ResultadoPedido = 'registrado' | 'enviado' | 'actualizado'

type Operacion = 'registrar' | 'enviar' | 'reintentar' | 'guardar'

const props = defineProps<{
  abierto: boolean
  mesaId: number
  mesaNumero: number
  lineas: LineaCarrito[]
  /** Total ESTIMADO en el cliente; el real lo devuelve el servidor. */
  total: number
  /** Pedido que se está editando; `null` si es nuevo. */
  pedidoId: number | null
  origenFoco: HTMLElement | null
}>()

const emit = defineEmits<{
  /** Cerrar y volver al menú. */
  modificar: []
  /** El pedido ya existe en el servidor (registrado): el borrador debe limpiarse. */
  registrado: [pedido: Pedido]
  completado: [pedido: Pedido, resultado: ResultadoPedido]
}>()

const verificando = ref(false)
const errorVerificacion = ref('')
const faltantes = ref<DisponibilidadProducto[]>([])
const enCurso = ref<Operacion | null>(null)
const errorGeneral = ref('')
/** Pedido ya registrado cuyo envío a cocina falló (la única acción pendiente es reintentar el envío). */
const registradoSinEnviar = ref<Pedido | null>(null)
const errorEnvio = ref('')

// Idempotency-Key (CAMBIO PROPUESTO EN F5): una clave por intención. Reintentar la MISMA intención
// (mismo pedido, mismo envío) reutiliza la clave; abrir la revisión de nuevo es una intención nueva.
const claveRegistro = crearClaveIdempotencia()
const claveEnvio = crearClaveIdempotencia()

const editando = computed(() => props.pedidoId !== null)
const nombrePorProducto = computed(() => new Map(props.lineas.map((l) => [l.productoId, l.nombre])))

/** Hay algo que impide registrar/enviar: verificación pendiente, fallida o con faltantes. */
const sinPermiso = computed(
  () => verificando.value || errorVerificacion.value !== '' || faltantes.value.length > 0,
)
const bloqueado = computed(() => enCurso.value !== null || sinPermiso.value)

const textoEstado = computed(() => {
  if (verificando.value) return 'Verificando disponibilidad…'
  switch (enCurso.value) {
    case 'registrar':
      return 'Registrando el pedido…'
    case 'enviar':
      return 'Registrando y enviando a cocina…'
    case 'reintentar':
      return 'Reintentando el envío a cocina…'
    case 'guardar':
      return 'Guardando los cambios…'
    default:
      return ''
  }
})

/** "Tacos al pastor: agotado" o "Tacos al pastor: solo quedan 3" */
function describirAgotado(f: DisponibilidadProducto): string {
  const nombre = nombrePorProducto.value.get(f.productoId) ?? `Producto ${f.productoId}`
  if (f.existencia !== undefined && f.existencia > 0) return `${nombre}: solo quedan ${f.existencia}`
  return `${nombre}: agotado`
}

async function verificarDisponibilidad() {
  verificando.value = true
  errorVerificacion.value = ''
  faltantes.value = []
  try {
    const items = [...new Set(props.lineas.map((l) => l.productoId))].map((productoId) => ({ productoId }))
    const resultado = await servicios.menu.verificarDisponibilidad(items)
    faltantes.value = resultado.filter((r) => !r.disponible)
  } catch (e) {
    errorVerificacion.value = e instanceof Error ? e.message : 'No se pudo verificar la disponibilidad.'
  } finally {
    verificando.value = false
  }
}

// Cada vez que se abre, se reinicia el estado y se verifica de nuevo.
watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    enCurso.value = null
    errorGeneral.value = ''
    errorEnvio.value = ''
    registradoSinEnviar.value = null
    claveRegistro.soltar()
    claveEnvio.soltar()
    void verificarDisponibilidad()
  },
)

/** Traduce un error del servicio a lo que se muestra; los de productos agotados dejan el carrito intacto. */
function manejarError(e: unknown) {
  if (e instanceof ErrorServicio && e.codigo === 'producto_agotado' && e.faltantes.length > 0) {
    faltantes.value = e.faltantes
    return
  }
  errorGeneral.value = e instanceof Error ? e.message : 'Ocurrió un error inesperado.'
}

async function registrar(enviarACocina: boolean) {
  if (bloqueado.value) return
  errorGeneral.value = ''
  enCurso.value = enviarACocina ? 'enviar' : 'registrar'
  let pedido: Pedido
  try {
    const detalle = aLineasNuevoPedido(props.lineas)
    // Mismos productos en la misma mesa = reintento del mismo registro (misma clave).
    const clave = claveRegistro.para(`registrar|${props.mesaId}|${JSON.stringify(detalle)}`)
    pedido = await servicios.pedidos.crear({ mesaId: props.mesaId, detalle }, clave)
    claveRegistro.soltar()
  } catch (e) {
    // Si el resultado es desconocido (red) se conserva la clave para el reintento; si no, se cierra la intención.
    if (!esFalloReintentable(e)) claveRegistro.soltar()
    manejarError(e)
    enCurso.value = null
    return
  }
  // A partir de aquí el pedido existe en el servidor: el borrador ya no sirve.
  emit('registrado', pedido)
  if (!enviarACocina) {
    enCurso.value = null
    emit('completado', pedido, 'registrado')
    return
  }
  await enviar(pedido, 'enviar')
}

/** Segundo paso de "Enviar a cocina". Si falla, el pedido sigue registrado y NO se vuelve a crear. */
async function enviar(pedido: Pedido, operacion: Operacion) {
  enCurso.value = operacion
  errorEnvio.value = ''
  try {
    // "Reintentar envío" es la misma intención: reutiliza la clave y no repite el envío.
    const enviado = await servicios.pedidos.enviar(pedido.id, claveEnvio.para(`enviar|${pedido.id}`))
    claveEnvio.soltar()
    registradoSinEnviar.value = null
    enCurso.value = null
    emit('completado', enviado, 'enviado')
  } catch (e) {
    if (!esFalloReintentable(e)) claveEnvio.soltar()
    registradoSinEnviar.value = pedido
    if (e instanceof ErrorServicio && e.codigo === 'producto_agotado' && e.faltantes.length > 0) {
      faltantes.value = e.faltantes
    }
    errorEnvio.value = e instanceof Error ? e.message : 'Ocurrió un error inesperado.'
    enCurso.value = null
  }
}

function reintentarEnvio() {
  if (enCurso.value !== null || !registradoSinEnviar.value) return
  void enviar(registradoSinEnviar.value, 'reintentar')
}

function dejarRegistrado() {
  if (enCurso.value !== null || !registradoSinEnviar.value) return
  emit('completado', registradoSinEnviar.value, 'registrado')
}

async function guardarCambios() {
  if (bloqueado.value || props.pedidoId === null) return
  errorGeneral.value = ''
  enCurso.value = 'guardar'
  try {
    const pedido = await servicios.pedidos.actualizar(props.pedidoId, aLineasNuevoPedido(props.lineas))
    enCurso.value = null
    emit('completado', pedido, 'actualizado')
  } catch (e) {
    manejarError(e)
    enCurso.value = null
  }
}

function modificar() {
  if (enCurso.value === null) emit('modificar')
}
</script>

<template>
  <DialogoModal
    :abierto="abierto"
    etiqueta-id="revision-titulo"
    variante="centro"
    :cerrable="enCurso === null && registradoSinEnviar === null"
    :origen-foco="origenFoco"
    @cerrar="modificar"
  >
    <div class="revision">
      <header>
        <h2 id="revision-titulo" tabindex="-1" autofocus>
          {{ editando ? '¿Los cambios son correctos?' : '¿El pedido es correcto?' }}
        </h2>
        <p class="revision__sub">
          Mesa {{ mesaNumero }}<template v-if="editando"> · Pedido #{{ pedidoId }}</template>
        </p>
      </header>

      <p class="solo-lectores" role="status">{{ textoEstado }}</p>
      <p v-if="textoEstado" class="revision__estado" aria-hidden="true">{{ textoEstado }}</p>

      <!-- Productos que no alcanzan -->
      <div v-if="faltantes.length > 0" class="revision__alerta" role="alert">
        <strong>Hay productos agotados o sin existencia suficiente:</strong>
        <ul>
          <li v-for="f in faltantes" :key="f.productoId">{{ describirAgotado(f) }}</li>
        </ul>
        <p v-if="!registradoSinEnviar">Ajusta las cantidades o quita los productos para continuar.</p>
      </div>

      <div v-if="errorVerificacion" class="revision__alerta" role="alert">
        <strong>No se pudo verificar la disponibilidad.</strong>
        <p>{{ errorVerificacion }}</p>
        <button type="button" class="btn btn--secundario" :aria-disabled="verificando ? 'true' : undefined" @click="!verificando && verificarDisponibilidad()">
          Reintentar verificación
        </button>
      </div>

      <div v-if="errorGeneral" class="revision__alerta" role="alert">
        <strong>No se pudo completar la operación.</strong>
        <p>{{ errorGeneral }}</p>
      </div>

      <!-- Registrado pero sin enviar -->
      <div v-if="registradoSinEnviar" class="revision__alerta" role="alert">
        <strong>El pedido se registró pero no se pudo enviar a cocina</strong>
        <p>Pedido #{{ registradoSinEnviar.id }} · {{ errorEnvio }}</p>
      </div>

      <ul class="revision__lineas" aria-label="Resumen del pedido">
        <li v-for="linea in lineas" :key="linea.productoId" class="revision__linea">
          <span class="revision__cantidad numero">{{ linea.cantidad }}×</span>
          <span class="revision__nombre">
            {{ linea.nombre }}
            <small v-if="linea.observaciones" class="revision__nota">Obs.: {{ linea.observaciones }}</small>
          </span>
          <span class="numero">{{ formatearMoneda(subtotalDe(linea)) }}</span>
        </li>
      </ul>

      <p class="revision__total">
        <span>Total estimado</span>
        <strong class="numero">{{ formatearMoneda(total) }}</strong>
      </p>
      <p class="revision__nota-total">El total final lo calcula el sistema al registrar.</p>

      <div class="fila-botones">
        <template v-if="registradoSinEnviar">
          <button type="button" class="btn btn--secundario" :aria-disabled="enCurso !== null ? 'true' : undefined" @click="dejarRegistrado">
            Dejar registrado
          </button>
          <button type="button" class="btn" :aria-disabled="enCurso !== null ? 'true' : undefined" @click="reintentarEnvio">
            Reintentar envío
          </button>
        </template>
        <template v-else>
          <button type="button" class="btn btn--secundario" :aria-disabled="enCurso !== null ? 'true' : undefined" @click="modificar">
            Modificar
          </button>
          <template v-if="editando">
            <button type="button" class="btn" :aria-disabled="bloqueado ? 'true' : undefined" @click="guardarCambios">
              Guardar cambios
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn--secundario" :aria-disabled="bloqueado ? 'true' : undefined" @click="registrar(false)">
              Registrar
            </button>
            <button type="button" class="btn" :aria-disabled="bloqueado ? 'true' : undefined" @click="registrar(true)">
              Enviar a cocina
            </button>
          </template>
        </template>
      </div>
    </div>
  </DialogoModal>
</template>

<style scoped>
.revision {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.revision h2:focus {
  outline: none;
}

.revision__sub {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.revision__estado {
  margin: 0;
  color: var(--color-primary-dark);
  font-weight: 600;
}

.revision__alerta {
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-error);
  border-radius: var(--radio);
}

.revision__alerta p,
.revision__alerta ul {
  margin: var(--espacio-1) 0 0;
}

.revision__alerta ul {
  padding-left: var(--espacio-5);
}

.revision__alerta .btn {
  margin-top: var(--espacio-2);
}

.revision__lineas {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-border);
}

.revision__linea {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--espacio-3);
  padding: var(--espacio-3) 0;
  border-bottom: 1px solid var(--color-border);
}

.revision__cantidad {
  font-weight: 700;
}

.revision__nota {
  display: block;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.revision__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  font-size: var(--texto-lg);
}

.revision__total strong {
  font-size: var(--texto-xl);
}

.revision__nota-total {
  margin: calc(var(--espacio-2) * -1) 0 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

</style>
