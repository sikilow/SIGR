<script setup lang="ts">
// Cuenta de mesa (/mesero/mesas/:mesaId/cuenta). Muestra los pedidos de la cuenta activa, su total
// (calculado por el servidor, sin pedidos cancelados) y permite agregar pedidos o solicitar la cuenta.
// El mesero NO cobra: solo indica a caja si el pago será físico o digital.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CancelarPedidoDialog from '../../components/CancelarPedidoDialog.vue'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import SolicitarCuentaDialog from '../../components/SolicitarCuentaDialog.vue'
import { usePolling } from '../../composables/usePolling'
import { useCuentaStore } from '../../stores/cuenta'
import { useMesasStore } from '../../stores/mesas'
import { ETIQUETA_ESTADO_PEDIDO, ETIQUETA_TIPO_PAGO, type Pedido } from '../../types'
import { formatearHora, formatearMoneda, formatearPedidos } from '../../utils/formato'
import { accionesDePedido, textoCancelarBloqueado } from '../../utils/reglas'

const route = useRoute()
const router = useRouter()
const store = useCuentaStore()
const mesas = useMesasStore()

type Fase = 'validando' | 'error' | 'listo'
const fase = ref<Fase>('validando')
const errorGuardia = ref('')
const titulo = ref<HTMLElement | null>(null)

/** Entero positivo o `null`. */
function entero(valor: unknown): number | null {
  return typeof valor === 'string' && /^[1-9]\d*$/.test(valor) ? Number(valor) : null
}

const mesaId = computed(() => entero(route.params.mesaId))
/** La mesa se lee del store de mesas, así su número se mantiene al día. */
const mesa = computed(() => mesas.mesas.find((m) => m.id === mesaId.value) ?? null)
const cuenta = computed(() => store.cuenta)
const porPagar = computed(() => cuenta.value?.estado === 'por_pagar')
const textoPago = computed(() =>
  cuenta.value?.tipoPagoSolicitado ? ETIQUETA_TIPO_PAGO[cuenta.value.tipoPagoSolicitado] : 'Pago por definir',
)
const textoSolicitada = computed(() => `Cuenta solicitada · ${textoPago.value} · Esperando al cajero`)

const sinPedidos = computed(() => store.cargada && store.pedidos.length === 0)
const puedeSolicitar = computed(() => cuenta.value !== null && store.pedidosVigentes.length > 0)

// ---------- Guardia: la mesa debe existir y estar ocupada ----------
/** Vuelve al panel con un aviso (se anuncia en la región aria-live del layout). */
async function volverConAviso(texto: string) {
  mesas.mostrarAviso(texto)
  await router.replace({ name: 'mesero-mesas' })
}

const polling = usePolling(() => (mesaId.value === null ? Promise.resolve() : store.cargar(mesaId.value)))

async function iniciar() {
  fase.value = 'validando'
  errorGuardia.value = ''
  const id = mesaId.value
  if (id === null) return volverConAviso('La mesa indicada no es válida.')

  try {
    await mesas.cargar()
    if (mesas.mesas.length === 0 && mesas.error) throw new Error(mesas.error)
    const encontrada = mesas.mesas.find((m) => m.id === id)
    if (!encontrada) return volverConAviso(`La mesa ${id} no existe.`)
    if (encontrada.estado !== 'ocupada') return volverConAviso(`La mesa ${encontrada.numero} no está ocupada.`)
    fase.value = 'listo'
    polling.iniciar()
  } catch (e) {
    errorGuardia.value = e instanceof Error ? e.message : 'No se pudo abrir la cuenta.'
    fase.value = 'error'
  }
}

// Carga inicial y recarga si cambia la mesa (se ignora al salir hacia otra ruta).
watch(
  () => route.params.mesaId,
  () => {
    if (route.name === 'mesero-cuenta-mesa') void iniciar()
  },
  { immediate: true },
)

// ---------- Pedidos: marcas de cada tarjeta ----------
const esCancelado = (p: Pedido) => p.estado === 'cancelado'

/** Motivo visible por el que "Cancelar pedido" no se puede usar; `null` si se puede (o no aplica). */
function bloqueoCancelar(p: Pedido): string | null {
  return textoCancelarBloqueado(accionesDePedido(p.estado, porPagar.value).cancelar)
}

const muestraCancelar = (p: Pedido) => accionesDePedido(p.estado, porPagar.value).cancelar !== 'no_aplica'

// ---------- Cancelar (diálogo compartido con Mis pedidos) ----------
const pedidoCancelando = ref<Pedido | null>(null)
const origenCancelar = ref<HTMLElement | null>(null)

function cancelar(pedido: Pedido, evento: MouseEvent) {
  if (bloqueoCancelar(pedido)) return
  origenCancelar.value = evento.currentTarget instanceof HTMLElement ? evento.currentTarget : null
  pedidoCancelando.value = pedido
}

// ---------- Solicitar cuenta ----------
const solicitando = ref(false)
const botonSolicitar = ref<HTMLElement | null>(null)

function alSolicitarse() {
  solicitando.value = false
}
</script>

<template>
  <section class="cuenta" :aria-busy="store.cargando || fase === 'validando'">
    <header class="cuenta__encabezado">
      <div class="cuenta__titulo">
        <RouterLink class="enlace-volver" :to="{ name: 'mesero-mesas' }">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
          Panel de mesas
        </RouterLink>
        <h2 ref="titulo" tabindex="-1">
          <span class="cuenta__etiqueta">Cuenta ·</span> Mesa {{ mesa?.numero ?? mesaId }}
        </h2>
        <p v-if="fase === 'listo'" class="cuenta__resumen">
          <InsigniaEstado v-if="cuenta && porPagar" tono="cuenta" :texto="`Por pagar · ${textoPago}`" />
          <InsigniaEstado v-else-if="cuenta" tono="cuenta_abierta" texto="Abierta" />
          <span v-if="store.cargada">
            {{ formatearPedidos(store.pedidos.length) }}
            <template v-if="store.pedidosCancelados.length > 0">
              · {{ store.pedidosCancelados.length }} {{ store.pedidosCancelados.length === 1 ? 'cancelado' : 'cancelados' }}
            </template>
          </span>
        </p>
      </div>
      <IndicadorActualizacion
        v-if="fase === 'listo'"
        :ultima="store.ultimaActualizacion"
        :actualizando="store.actualizando"
        @actualizar="polling.ejecutarAhora()"
      />
    </header>

    <!-- Validando la mesa / cargando por primera vez: esqueleto con la forma de las tarjetas -->
    <template v-if="fase === 'validando' || (fase === 'listo' && store.cargando)">
      <div class="esqueletos" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="esqueleto cuenta__esqueleto" />
      </div>
      <p class="solo-lectores" role="status">Cargando la cuenta…</p>
    </template>

    <!-- No se pudo validar la mesa -->
    <div v-else-if="fase === 'error'" class="vacio" role="alert">
      <h3>No se pudo abrir la cuenta</h3>
      <p>{{ errorGuardia }}</p>
      <div class="cuenta__acciones-vacio">
        <button type="button" class="btn" @click="iniciar">Reintentar</button>
        <RouterLink class="btn btn--secundario" :to="{ name: 'mesero-mesas' }">Volver al panel</RouterLink>
      </div>
    </div>

    <template v-else>
      <!-- Error con datos previos: se conservan los pedidos y se ofrece reintentar -->
      <div v-if="store.error && store.cargada" class="aviso aviso--error" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <p>No se pudo actualizar. Se muestran los últimos datos recibidos. {{ store.error }}</p>
        <button type="button" class="btn" :disabled="store.actualizando" @click="polling.ejecutarAhora()">Reintentar</button>
      </div>

      <!-- Error sin datos previos -->
      <div v-if="store.error && !store.cargada" class="vacio" role="alert">
        <h3>No se pudo cargar la cuenta</h3>
        <p>{{ store.error }}</p>
        <button type="button" class="btn" :disabled="store.actualizando" @click="polling.ejecutarAhora()">Reintentar</button>
      </div>

      <!-- Vacío -->
      <div v-else-if="sinPedidos" class="vacio">
        <h3>Aún no hay pedidos en esta mesa</h3>
        <RouterLink class="btn" :to="{ name: 'mesero-pedido-mesa', params: { mesaId: mesaId ?? 0 } }">Nuevo pedido</RouterLink>
      </div>

      <template v-else-if="store.cargada">
        <ul class="pedidos" aria-label="Pedidos de la cuenta">
          <li
            v-for="p in store.pedidos"
            :key="p.id"
            class="pedido tarjeta"
            :class="{ 'pedido--cancelado': esCancelado(p) }"
          >
            <header class="pedido__cabecera">
              <h3 :id="`pedido-titulo-${p.id}`" class="numero">Pedido #{{ p.id }}</h3>
              <span class="pedido__hora numero">{{ formatearHora(p.creadoEn) }}</span>
              <InsigniaEstado :tono="p.estado" :texto="ETIQUETA_ESTADO_PEDIDO[p.estado]" />
            </header>

            <!-- Cancelado: no suma al total, y el motivo si viene -->
            <div v-if="esCancelado(p)" class="pedido__cancelado">
              <InsigniaEstado tono="cancelado" texto="No suma al total" />
              <p v-if="p.motivoCancelacion">Motivo: {{ p.motivoCancelacion }}</p>
            </div>

            <ul class="pedido__lineas" :aria-labelledby="`pedido-titulo-${p.id}`">
              <li v-for="d in p.detalle" :key="d.productoId" class="linea">
                <span class="linea__cantidad numero">{{ d.cantidad }}×</span>
                <span class="linea__nombre">
                  {{ d.nombreProducto }}
                  <small v-if="d.observaciones" class="linea__nota">Obs.: {{ d.observaciones }}</small>
                </span>
                <span class="numero">{{ formatearMoneda(d.cantidad * d.precioUnitario) }}</span>
              </li>
            </ul>

            <p class="pedido__subtotal">
              <span>Subtotal del pedido</span>
              <strong class="numero">{{ formatearMoneda(p.total) }}</strong>
            </p>

            <div class="pedido__acciones">
              <RouterLink
                class="btn btn--secundario"
                :to="{ name: 'mesero-pedidos', params: { pedidoId: p.id } }"
                :aria-label="`Ver detalle del pedido ${p.id}`"
              >
                Ver detalle
              </RouterLink>
              <template v-if="muestraCancelar(p)">
                <button
                  type="button"
                  class="btn btn--peligro-suave"
                  :aria-disabled="bloqueoCancelar(p) ? 'true' : undefined"
                  :aria-describedby="bloqueoCancelar(p) ? `bloqueo-${p.id}` : undefined"
                  :aria-label="`Cancelar pedido ${p.id}`"
                  aria-haspopup="dialog"
                  @click="cancelar(p, $event)"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m9 9 6 6M15 9l-6 6" />
                  </svg>
                  Cancelar pedido
                </button>
                <p v-if="bloqueoCancelar(p)" :id="`bloqueo-${p.id}`" class="pedido__bloqueo">{{ bloqueoCancelar(p) }}</p>
              </template>
            </div>
          </li>
        </ul>

        <!-- Total y acciones: barra fija abajo -->
        <div class="barra" role="region" aria-label="Total y acciones de la cuenta">
          <p class="barra__total">
            <span>Total de la cuenta</span>
            <strong class="numero">{{ formatearMoneda(cuenta?.total ?? 0) }}</strong>
            <small v-if="store.pedidosCancelados.length > 0">Los pedidos cancelados no suman.</small>
          </p>

          <div class="barra__acciones">
            <!-- Agregar pedido: bloqueado con su motivo si la cuenta ya se solicitó -->
            <RouterLink
              v-if="!porPagar"
              class="btn btn--secundario btn--grande"
              :to="{ name: 'mesero-pedido-mesa', params: { mesaId: mesaId ?? 0 } }"
            >
              Agregar pedido
            </RouterLink>
            <button v-else type="button" class="btn btn--secundario btn--grande" aria-disabled="true" aria-describedby="motivo-agregar" @click.prevent>
              Agregar pedido
            </button>

            <button
              v-if="!porPagar"
              ref="botonSolicitar"
              type="button"
              class="btn btn--grande"
              aria-haspopup="dialog"
              :aria-disabled="puedeSolicitar ? undefined : 'true'"
              :aria-describedby="puedeSolicitar ? undefined : 'motivo-solicitar'"
              @click="puedeSolicitar && (solicitando = true)"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
                <path d="M9 8h6M9 12h6" />
              </svg>
              Solicitar cuenta
            </button>
          </div>

          <!-- Estado de la solicitud o motivos de bloqueo (texto + ícono) -->
          <p v-if="porPagar" class="barra__estado barra__estado--solicitada">
            <InsigniaEstado tono="cuenta" :texto="textoSolicitada" ajustar />
          </p>
          <p v-if="porPagar" id="motivo-agregar" class="barra__nota">La cuenta ya fue solicitada: no se pueden agregar pedidos.</p>
          <p v-else-if="!puedeSolicitar" id="motivo-solicitar" class="barra__nota">No hay pedidos activos que cobrar.</p>
        </div>
      </template>
    </template>

    <CancelarPedidoDialog
      :abierto="pedidoCancelando !== null"
      :pedido="pedidoCancelando"
      :origen-foco="origenCancelar"
      :foco-alternativo="titulo"
      @cerrar="pedidoCancelando = null"
      @cancelado="pedidoCancelando = null"
    />

    <SolicitarCuentaDialog
      :abierto="solicitando"
      :cuenta="cuenta"
      :mesa-numero="mesa?.numero ?? mesaId ?? 0"
      :origen-foco="botonSolicitar"
      :foco-alternativo="titulo"
      @cerrar="solicitando = false"
      @solicitada="alSolicitarse"
    />
  </section>
</template>

<style scoped>
.cuenta {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  min-height: 100%;
}

.cuenta__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.cuenta__titulo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--espacio-1);
}

.cuenta__titulo h2:focus {
  outline: none;
}

.cuenta__etiqueta {
  color: var(--color-muted);
  font-weight: 600;
}

.cuenta__resumen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-3);
  margin: 0;
}

.esqueletos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.cuenta__esqueleto {
  min-height: 150px;
}

.cuenta__acciones-vacio {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--espacio-3);
}

/* ---------- Pedidos ---------- */
.pedidos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pedido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  padding: var(--espacio-4);
}

.pedido__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-3);
}

.pedido__cabecera h3 {
  font-size: var(--texto-lg);
}

.pedido__hora {
  margin-right: auto;
  color: var(--color-muted);
}

.pedido__cancelado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2) var(--espacio-3);
}

.pedido__cancelado p {
  margin: 0;
  overflow-wrap: anywhere;
}

.pedido__lineas {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-border);
}

.linea {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--espacio-3);
  padding: var(--espacio-2) 0;
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

.pedido__subtotal {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  font-weight: 600;
}

.pedido__subtotal strong {
  font-size: var(--texto-lg);
}

.pedido__acciones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2) var(--espacio-3);
}

.pedido__bloqueo {
  margin: 0;
  font-weight: 600;
}

/* Cancelado: atenuado y tachado (la etiqueta "No suma al total" y el motivo siguen legibles) */
.pedido--cancelado {
  background: var(--color-bg);
  border-style: dashed;
}

.pedido--cancelado .pedido__lineas,
.pedido--cancelado .pedido__subtotal {
  color: var(--color-muted);
  text-decoration: line-through;
}

/* ---------- Barra de total y acciones ---------- */
.barra {
  position: sticky;
  bottom: calc(var(--espacio-6) * -1);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-4);
  margin: auto calc(var(--espacio-6) * -1) calc(var(--espacio-6) * -1);
  padding: var(--espacio-3) var(--espacio-6);
  border-top: 2px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: 0 -4px 12px rgb(31 41 55 / 10%);
}

.barra__total {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-size: var(--texto-sm);
}

.barra__total strong {
  order: 2;
  color: var(--color-primary-dark);
  font-size: var(--texto-2xl);
  line-height: 1.1;
}

.barra__total small {
  order: 3;
  color: var(--color-muted);
}

.barra__acciones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-3);
}

/* Con poca altura la barra de total deja de ser fija: ocuparía media pantalla */
@media (max-height: 37.5em) {
  .barra {
    position: static;
    margin: 0;
    border: 2px solid var(--color-border);
    border-radius: var(--radio);
  }
}

.barra__estado,
.barra__nota {
  flex-basis: 100%;
  margin: 0;
}

.barra__nota {
  font-weight: 600;
}
</style>
