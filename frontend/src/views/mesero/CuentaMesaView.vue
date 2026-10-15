<script setup lang="ts">
// Cuenta de mesa (/mesero/mesas/:mesaId/cuenta): consulta los pedidos y el total de la cuenta
// activa y permite solicitar el pago (físico en caja o digital). Al solicitarlo, la cuenta
// pasa a "por pagar" y la mesa ya no acepta pedidos nuevos.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DialogoModal from '../../components/DialogoModal.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { servicios } from '../../services'
import { useMesasStore } from '../../stores/mesas'
import { ETIQUETA_ESTADO_PEDIDO, type Cuenta, type TipoPago } from '../../types'
import { formatearHora, formatearMoneda } from '../../utils/formato'

const route = useRoute()
const mesasStore = useMesasStore()

const cuenta = ref<Cuenta | null>(null)
const cargando = ref(true)
const error = ref('')

const mesaId = computed<number | null>(() => {
  const valor = route.params.mesaId
  return typeof valor === 'string' && /^[1-9]\d*$/.test(valor) ? Number(valor) : null
})
const numeroMesa = computed(() => mesasStore.mesas.find((m) => m.id === mesaId.value)?.numero ?? mesaId.value)

async function cargar() {
  cargando.value = true
  error.value = ''
  cuenta.value = null
  if (mesaId.value === null) {
    cargando.value = false
    return
  }
  try {
    await mesasStore.cargar()
    cuenta.value = await servicios.cuentas.obtenerPorMesa(mesaId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar la cuenta.'
  } finally {
    cargando.value = false
  }
}

watch(() => route.params.mesaId, () => void cargar(), { immediate: true })

/** Pedidos no cancelados (los cancelados se muestran tachados y no suman). */
const pedidosVigentes = computed(() => cuenta.value?.pedidos.filter((p) => p.estado !== 'cancelado') ?? [])
const porPagar = computed(() => cuenta.value?.estado === 'por_pagar')

// ---------- Solicitar el pago ----------
const tipo = ref<TipoPago>('fisico')
const confirmando = ref(false)
const solicitando = ref(false)
const errorPago = ref('')

async function solicitarPago() {
  if (!cuenta.value || solicitando.value) return
  solicitando.value = true
  errorPago.value = ''
  try {
    cuenta.value = await servicios.cuentas.solicitarPago(cuenta.value.id, tipo.value)
    confirmando.value = false
    void mesasStore.cargar()
  } catch (e) {
    errorPago.value = e instanceof Error ? e.message : 'No se pudo solicitar la cuenta.'
  } finally {
    solicitando.value = false
  }
}
</script>

<template>
  <section class="tarjeta cuenta" aria-labelledby="cuenta-titulo">
    <header class="cuenta__cabecera">
      <h2 id="cuenta-titulo">Cuenta · Mesa {{ numeroMesa }}</h2>
      <InsigniaEstado v-if="porPagar" tono="cuenta" texto="Cuenta solicitada" />
    </header>

    <p v-if="cargando" class="cuenta__meta">Cargando cuenta…</p>
    <p v-else-if="error" class="texto-error" role="alert">{{ error }}</p>
    <p v-else-if="!cuenta" class="cuenta__meta">Esta mesa no tiene una cuenta activa todavía.</p>

    <template v-else>
      <p v-if="pedidosVigentes.length === 0" class="cuenta__meta">La cuenta aún no tiene pedidos.</p>

      <ul class="cuenta__pedidos">
        <li v-for="pedido in cuenta.pedidos" :key="pedido.id" :class="{ 'cuenta__pedido--cancelado': pedido.estado === 'cancelado' }">
          <div class="cuenta__pedido-cabecera">
            <strong>Pedido #{{ pedido.id }}</strong>
            <span class="cuenta__meta">{{ formatearHora(pedido.creadoEn) }} · {{ ETIQUETA_ESTADO_PEDIDO[pedido.estado] }}</span>
          </div>
          <ul class="cuenta__lineas">
            <li v-for="linea in pedido.detalle" :key="linea.productoId">
              <span>{{ linea.cantidad }} × {{ linea.nombreProducto }}</span>
              <span class="numero">{{ formatearMoneda(linea.cantidad * linea.precioUnitario) }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <p class="cuenta__total">
        Total <strong class="numero">{{ formatearMoneda(cuenta.total) }}</strong>
      </p>

      <p v-if="porPagar" class="cuenta__meta">
        Pago solicitado: {{ cuenta.tipoPagoSolicitado === 'digital' ? 'digital' : 'en caja' }}. Ya no se pueden agregar pedidos.
      </p>

      <fieldset v-else class="cuenta__tipo">
        <legend>¿Cómo va a pagar el cliente?</legend>
        <button type="button" class="chip" :class="{ 'chip--activo': tipo === 'fisico' }" :aria-pressed="tipo === 'fisico'" @click="tipo = 'fisico'">
          En caja
        </button>
        <button type="button" class="chip" :class="{ 'chip--activo': tipo === 'digital' }" :aria-pressed="tipo === 'digital'" @click="tipo = 'digital'">
          Pago digital
        </button>
      </fieldset>
    </template>

    <div class="cuenta__acciones">
      <RouterLink class="btn btn--secundario" :to="{ name: 'mesero-mesas' }">Volver al panel de mesas</RouterLink>
      <button
        v-if="cuenta && !porPagar"
        type="button"
        class="btn"
        :disabled="pedidosVigentes.length === 0"
        @click="confirmando = true"
      >
        Solicitar cuenta
      </button>
    </div>

    <DialogoModal :abierto="confirmando" etiqueta-id="pago-titulo" :cerrable="!solicitando" @cerrar="confirmando = false">
      <div v-if="cuenta" class="cuenta__confirmar">
        <h2 id="pago-titulo">¿Solicitar la cuenta de la mesa {{ numeroMesa }}?</h2>
        <p>
          Total a cobrar: <strong class="numero">{{ formatearMoneda(cuenta.total) }}</strong>
          ({{ tipo === 'digital' ? 'pago digital' : 'en caja' }}). Después ya no podrás agregar pedidos a esta mesa.
        </p>
        <p v-if="errorPago" class="texto-error" role="alert">{{ errorPago }}</p>
        <div class="cuenta__acciones">
          <button type="button" class="btn btn--secundario" :disabled="solicitando" @click="confirmando = false">Volver</button>
          <button type="button" class="btn" :disabled="solicitando" autofocus @click="solicitarPago">
            {{ solicitando ? 'Solicitando…' : 'Sí, solicitar' }}
          </button>
        </div>
      </div>
    </DialogoModal>
  </section>
</template>

<style scoped>
.cuenta {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  max-width: 720px;
}

.cuenta__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--espacio-3);
}

.cuenta__meta {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.cuenta__pedidos,
.cuenta__lineas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cuenta__pedidos > li {
  padding-bottom: var(--espacio-3);
  border-bottom: 1px solid var(--color-border);
}

.cuenta__pedido-cabecera {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.cuenta__lineas li {
  display: flex;
  justify-content: space-between;
  gap: var(--espacio-3);
}

/* Cancelado: tachado Y con el estado escrito (no solo estilo) */
.cuenta__pedido--cancelado .cuenta__lineas {
  color: var(--color-muted);
  text-decoration: line-through;
}

.cuenta__total {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font-size: var(--texto-xl);
}

.cuenta__tipo {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  border: none;
}

.cuenta__tipo legend {
  width: 100%;
  margin-bottom: var(--espacio-2);
  font-weight: 700;
}

.cuenta__acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--espacio-3);
}

.cuenta__confirmar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}
</style>
