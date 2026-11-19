<script setup lang="ts">
// Devolver parte o toda una venta (diálogo modal). Se elige qué productos y cuántas unidades se devuelven, cómo se regresa el
// dinero (con los métodos que se usaron al cobrar, sin pasar de lo cobrado con cada uno) y el motivo. El cajero crea una
// SOLICITUD que queda pendiente hasta que el gerente la autorice; el gerente la registra aprobada de inmediato.
// Los reintentos tras un fallo de red reutilizan la misma Idempotency-Key.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import { useAnunciosStore } from '../stores/anuncios'
import type { Devolucion, VentaDetalle } from '../types'
import { vPermitir } from '../utils/campos'
import { capacidadDePago, disponibleDeLinea, repartirDevolucion, totalDeLineas, validarSolicitudDevolucion } from '../utils/devoluciones'
import { formatearMoneda } from '../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../utils/idempotencia'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{
  abierto: boolean
  venta: VentaDetalle | null
  /** El gerente la registra aprobada; el cajero la solicita. */
  esGerente: boolean
  origenFoco?: HTMLElement | null
}>()

const emit = defineEmits<{
  cerrar: []
  creada: [devolucion: Devolucion]
}>()

const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

/** Unidades a devolver por id_detalle. */
const cantidades = ref<Record<number, number>>({})
/** Importe a devolver por id_metodo (texto del campo). */
const montos = ref<Record<number, number | null>>({})
const montosEditados = ref(false)
const motivo = ref('')
const reponer = ref(false)
const enCurso = ref(false)
const error = ref('')
const tocado = ref(false)

const lineas = computed(() => props.venta?.lineas ?? [])
const total = computed(() => totalDeLineas(lineas.value, cantidades.value))
const hayAlgo = computed(() => total.value > 0)
const puedeElegirMetodo = computed(() => (props.venta?.pagos.length ?? 0) > 1)

const solicitud = computed(() => ({
  lineas: lineas.value.filter((l) => (cantidades.value[l.idDetalle] ?? 0) > 0).map((l) => ({ idDetalle: l.idDetalle, cantidad: cantidades.value[l.idDetalle]! })),
  pagos: (props.venta?.pagos ?? []).map((p) => ({ idMetodo: p.idMetodo, monto: Math.round((montos.value[p.idMetodo] ?? 0) * 100) / 100 })).filter((p) => p.monto > 0),
  motivo: motivo.value,
  reponerInventario: reponer.value,
}))
const problema = computed(() => (props.venta ? validarSolicitudDevolucion(props.venta, solicitud.value) : null))
const sumaMetodos = computed(() => Math.round(solicitud.value.pagos.reduce((s, p) => s + p.monto * 100, 0)) / 100)
/** Todo lo vendido sigue devolviéndose: sirve para el atajo «Devolver todo». */
const quedaAlgo = computed(() => lineas.value.some((l) => disponibleDeLinea(l) > 0))

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    cantidades.value = Object.fromEntries(lineas.value.map((l) => [l.idDetalle, 0]))
    montos.value = Object.fromEntries((props.venta?.pagos ?? []).map((p) => [p.idMetodo, null]))
    montosEditados.value = false
    motivo.value = ''
    reponer.value = false
    enCurso.value = false
    error.value = ''
    tocado.value = false
    claves.soltar()
  },
)

// Mientras no se toquen a mano, los importes por método se sugieren solos a partir del total.
watch(total, (nuevo) => {
  if (montosEditados.value || !props.venta) return
  const reparto = repartirDevolucion(nuevo, props.venta.pagos)
  montos.value = Object.fromEntries(props.venta.pagos.map((p) => [p.idMetodo, reparto.find((r) => r.idMetodo === p.idMetodo)?.monto ?? null]))
})

function cambiarCantidad(idDetalle: number, valor: number | string, maximo: number) {
  const n = Math.floor(Number(valor))
  cantidades.value[idDetalle] = Number.isFinite(n) ? Math.min(Math.max(n, 0), maximo) : 0
  error.value = ''
}

function devolverTodo() {
  for (const l of lineas.value) cantidades.value[l.idDetalle] = disponibleDeLinea(l)
  error.value = ''
}

function limpiar() {
  for (const l of lineas.value) cantidades.value[l.idDetalle] = 0
}

function cambiarMonto(idMetodo: number, valor: number | string) {
  montosEditados.value = true
  const n = Math.round(Number(valor) * 100) / 100
  montos.value[idMetodo] = Number.isFinite(n) && n > 0 ? n : null
  error.value = ''
}

function sugerirMetodos() {
  montosEditados.value = false
  if (!props.venta) return
  const reparto = repartirDevolucion(total.value, props.venta.pagos)
  montos.value = Object.fromEntries(props.venta.pagos.map((p) => [p.idMetodo, reparto.find((r) => r.idMetodo === p.idMetodo)?.monto ?? null]))
}

async function enviar() {
  const venta = props.venta
  if (!venta || enCurso.value) return
  tocado.value = true
  if (problema.value) {
    error.value = problema.value
    return
  }
  enCurso.value = true
  error.value = ''
  const clave = claves.para(`devolver|${venta.idVenta}|${JSON.stringify(solicitud.value)}`)
  try {
    const devolucion = await servicios.caja.solicitarDevolucion(venta.idVenta, solicitud.value, clave)
    claves.soltar()
    void anuncios.anunciar(
      devolucion.estado === 'aprobada'
        ? `Devolución de ${formatearMoneda(devolucion.total)} registrada`
        : `Devolución de ${formatearMoneda(devolucion.total)} solicitada: espera la autorización del gerente`,
    )
    emit('creada', devolucion)
  } catch (e) {
    if (esFalloReintentable(e)) {
      error.value = 'No se pudo conectar con el servidor. Lo que escribiste se conservó: vuelve a intentarlo.'
    } else {
      claves.soltar()
      error.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
    }
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal
    :abierto="abierto"
    etiqueta-id="devolucion-titulo"
    variante="centro"
    :cerrable="!enCurso"
    :origen-foco="origenFoco ?? null"
    @cerrar="emit('cerrar')"
  >
    <form v-if="venta" class="devolucion" novalidate @submit.prevent="enviar">
      <header>
        <h2 id="devolucion-titulo">{{ esGerente ? 'Registrar devolución' : 'Solicitar devolución' }} · Ticket #{{ venta.idVenta }}</h2>
        <p class="devolucion__meta">
          Mesa {{ venta.mesaNumero }} · {{ formatearMoneda(venta.total) }} cobrados
          <template v-if="venta.devuelto > 0"> · ya se devolvieron {{ formatearMoneda(venta.devuelto) }}</template>
        </p>
        <p class="devolucion__aviso">
          <template v-if="esGerente">Se registra aprobada de inmediato: baja el efectivo del corte si se devuelve en efectivo.</template>
          <template v-else>Queda <strong>pendiente</strong> hasta que el gerente la autorice. Hasta entonces no sale dinero de la caja.</template>
        </p>
      </header>

      <section aria-labelledby="dev-productos">
        <div class="devolucion__titulo">
          <h3 id="dev-productos">¿Qué se devuelve?</h3>
          <div class="devolucion__atajos">
            <button type="button" class="btn btn--texto" :disabled="!quedaAlgo || enCurso" @click="devolverTodo">Devolver todo</button>
            <button type="button" class="btn btn--texto" :disabled="!hayAlgo || enCurso" @click="limpiar">Limpiar</button>
          </div>
        </div>
        <ul class="devolucion__lineas">
          <li v-for="l in lineas" :key="l.idDetalle" :class="{ 'devolucion__linea--agotada': disponibleDeLinea(l) === 0 }">
            <div class="devolucion__producto">
              <strong>{{ l.producto }}<template v-if="l.presentacion"> ({{ l.presentacion }})</template></strong>
              <span class="devolucion__detalle">
                {{ l.cantidad }} × {{ formatearMoneda(l.precioUnitario) }}
                <template v-if="l.devuelta > 0"> · {{ l.devuelta }} ya devuelto(s)</template>
                <template v-if="l.pendiente > 0"> · {{ l.pendiente }} en solicitud pendiente</template>
              </span>
            </div>
            <div class="devolucion__cantidad">
              <label :for="`dev-cant-${l.idDetalle}`" class="solo-lectores">Unidades de {{ l.producto }} a devolver</label>
              <button type="button" class="btn btn--secundario btn--icono" aria-label="Una menos" :disabled="enCurso || (cantidades[l.idDetalle] ?? 0) <= 0" @click="cambiarCantidad(l.idDetalle, (cantidades[l.idDetalle] ?? 0) - 1, disponibleDeLinea(l))">−</button>
              <input
                :id="`dev-cant-${l.idDetalle}`"
                type="number"
                inputmode="numeric"
                min="0"
                :max="disponibleDeLinea(l)"
                step="1"
                :value="cantidades[l.idDetalle] ?? 0"
                :disabled="enCurso || disponibleDeLinea(l) === 0"
                @input="cambiarCantidad(l.idDetalle, ($event.target as HTMLInputElement).value, disponibleDeLinea(l))"
              />
              <button type="button" class="btn btn--secundario btn--icono" aria-label="Una más" :disabled="enCurso || (cantidades[l.idDetalle] ?? 0) >= disponibleDeLinea(l)" @click="cambiarCantidad(l.idDetalle, (cantidades[l.idDetalle] ?? 0) + 1, disponibleDeLinea(l))">+</button>
              <span class="devolucion__de">de {{ disponibleDeLinea(l) }}</span>
            </div>
          </li>
        </ul>
        <p class="devolucion__total"><span>Total a devolver</span><strong class="numero">{{ formatearMoneda(total) }}</strong></p>
      </section>

      <section aria-labelledby="dev-metodos">
        <h3 id="dev-metodos">¿Con qué se devuelve el dinero?</h3>
        <p v-if="!puedeElegirMetodo && venta.pagos[0]" class="devolucion__detalle">
          Con {{ venta.pagos[0].metodo }}, el mismo método del cobro<template v-if="venta.pagos[0].esEfectivo"> (sale de la caja)</template>.
        </p>
        <ul v-else class="devolucion__metodos">
          <li v-for="p in venta.pagos" :key="p.idMetodo">
            <label :for="`dev-met-${p.idMetodo}`">
              <strong>{{ p.metodo }}</strong>
              <span class="devolucion__detalle">pueden devolverse hasta {{ formatearMoneda(capacidadDePago(p)) }}</span>
            </label>
            <input
              :id="`dev-met-${p.idMetodo}`"
              v-permitir="'decimal'"
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              :value="montos[p.idMetodo] ?? ''"
              :disabled="enCurso || capacidadDePago(p) === 0"
              @input="cambiarMonto(p.idMetodo, ($event.target as HTMLInputElement).value)"
            />
          </li>
          <li class="devolucion__suma">
            <span :class="{ 'devolucion__suma--mal': hayAlgo && Math.round(sumaMetodos * 100) !== Math.round(total * 100) }">
              Suman {{ formatearMoneda(sumaMetodos) }} de {{ formatearMoneda(total) }}
            </span>
            <button type="button" class="btn btn--texto" :disabled="enCurso" @click="sugerirMetodos">Repartir automático</button>
          </li>
        </ul>
      </section>

      <div class="campo">
        <label for="dev-motivo">Motivo <span class="devolucion__req">(obligatorio, 5 a 200 caracteres)</span></label>
        <textarea
          id="dev-motivo"
          v-model="motivo"
          v-permitir="'nota'"
          maxlength="200"
          rows="2"
          :aria-invalid="tocado && motivo.trim().length < 5 ? 'true' : undefined"
          :readonly="enCurso"
          @input="error = ''"
        />
      </div>

      <label class="interruptor">
        <input v-model="reponer" type="checkbox" :disabled="enCurso" />
        <span>Reponer al inventario <small class="devolucion__detalle">(solo productos que controlan existencia; no lo marques si el producto se tiró)</small></span>
      </label>

      <div v-if="error" class="aviso aviso--error" role="alert"><p>{{ error }}</p></div>
      <p class="solo-lectores" role="status">{{ enCurso ? 'Enviando la devolución…' : '' }}</p>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Cancelar</button>
        <button type="submit" class="btn" :disabled="enCurso || !hayAlgo">
          {{ enCurso ? 'Enviando…' : esGerente ? `Registrar ${formatearMoneda(total)}` : `Solicitar ${formatearMoneda(total)}` }}
        </button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.devolucion {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.devolucion h3 {
  margin: 0;
  font-size: var(--texto-lg);
}

.devolucion__meta,
.devolucion__detalle {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 400;
}

.devolucion__aviso {
  margin: var(--espacio-2) 0 0;
  padding: var(--espacio-2) var(--espacio-3);
  border-radius: var(--radio-sm);
  background: var(--color-info-fondo);
  color: var(--color-info-texto);
  font-size: var(--texto-sm);
}

.devolucion__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2);
}

.devolucion__atajos {
  display: flex;
  gap: var(--espacio-2);
}

.devolucion__lineas,
.devolucion__metodos {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: var(--espacio-2) 0 0;
  padding: 0;
  list-style: none;
}

.devolucion__lineas li,
.devolucion__metodos li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-3);
  padding: var(--espacio-2) var(--espacio-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.devolucion__linea--agotada {
  opacity: 0.6;
}

.devolucion__producto,
.devolucion__metodos label {
  display: flex;
  flex: 1 1 12rem;
  flex-direction: column;
  min-width: 0;
}

.devolucion__cantidad {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
}

.devolucion__cantidad input,
.devolucion__metodos input {
  width: 5rem;
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-2);
  border: 2px solid var(--color-borde-fuerte);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  text-align: center;
}

.devolucion__metodos input {
  width: 7rem;
  text-align: right;
}

.devolucion__cantidad input:focus-visible,
.devolucion__metodos input:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 1px;
}

.devolucion__de {
  min-width: 3.5rem;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.devolucion__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: var(--espacio-3) 0 0;
  font-weight: 700;
}

.devolucion__total strong {
  font-size: var(--texto-xl, 1.4rem);
}

.devolucion__metodos .devolucion__suma {
  border-style: dashed;
}

.devolucion__suma--mal {
  color: var(--color-cancelado-texto);
  font-weight: 700;
}

.devolucion__req {
  color: var(--color-muted);
  font-weight: 400;
}

.campo textarea[aria-invalid='true'] {
  border-color: var(--color-cancelado);
}
</style>
