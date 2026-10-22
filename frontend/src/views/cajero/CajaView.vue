<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { servicios } from '../../services'
import type { CuentaCaja, EstadoCaja, PagoCajaEntrada, VentaCaja } from '../../types'

const estado = ref<EstadoCaja | null>(null)
const seleccionadaId = ref<number | null>(null)
const pagos = ref<PagoCajaEntrada[]>([])
const recibidoReporte = ref<number | null>(null)
const ventaReciente = ref<VentaCaja | null>(null)
const error = ref<string | null>(null)
const cargando = ref(true)
const procesando = ref(false)
const diferenciaCorte = ref<number | null>(null)

const cuentaSeleccionada = computed(
  () => estado.value?.cuentas.find((item) => item.cuenta.idCuenta === seleccionadaId.value) ?? null,
)
const totalAplicado = computed(() => pagos.value.reduce((suma, pago) => suma + pago.monto, 0))
const faltante = computed(() => Math.round(((cuentaSeleccionada.value?.cuenta.total ?? 0) - totalAplicado.value) * 100) / 100)
const cambio = computed(() => Math.round(pagos.value.reduce((suma, pago) => suma + Math.max(0, pago.montoRecibido - pago.monto), 0) * 100) / 100)
const puedeCobrar = computed(
  () =>
    !!estado.value?.corte &&
    !!cuentaSeleccionada.value &&
    cuentaSeleccionada.value.pedidosSinEntregar.length === 0 &&
    Math.abs(faltante.value) < 0.005 &&
    pagos.value.length > 0 &&
    pagos.value.every((pago) => pago.monto > 0 && pago.montoRecibido >= pago.monto),
)

function moneda(cantidad: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad)
}

function fecha(fechaHora: Date): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(fechaHora)
}

async function cargar() {
  cargando.value = true
  try {
    estado.value = await servicios.caja.obtenerEstado()
    if (!estado.value.corte) recibidoReporte.value = null
    if (seleccionadaId.value && !estado.value.cuentas.some((item) => item.cuenta.idCuenta === seleccionadaId.value)) {
      seleccionadaId.value = null
      pagos.value = []
    }
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar la caja.'
  } finally {
    cargando.value = false
  }
}

function seleccionar(item: CuentaCaja) {
  seleccionadaId.value = item.cuenta.idCuenta
  const efectivo = estado.value?.metodosPago.find((metodo) => metodo.nombre.toLowerCase() === 'efectivo')
  pagos.value = efectivo ? [{ idMetodo: efectivo.idMetodo, monto: item.cuenta.total, montoRecibido: item.cuenta.total }] : []
  ventaReciente.value = null
  error.value = null
}

function agregarMetodo() {
  const metodo = estado.value?.metodosPago.find((opcion) => !pagos.value.some((pago) => pago.idMetodo === opcion.idMetodo))
  if (!metodo) return
  const importe = Math.max(0, Math.round(faltante.value * 100) / 100)
  pagos.value.push({ idMetodo: metodo.idMetodo, monto: importe, montoRecibido: importe })
}

function cambiarMonto(pago: PagoCajaEntrada, monto: number) {
  pago.monto = Number.isFinite(monto) ? Math.max(0, Math.round(monto * 100) / 100) : 0
  const metodo = estado.value?.metodosPago.find((item) => item.idMetodo === pago.idMetodo)
  if (!metodo || metodo.nombre.toLowerCase() !== 'efectivo' || pago.montoRecibido < pago.monto) {
    pago.montoRecibido = pago.monto
  }
}

function cambiarMetodo(pago: PagoCajaEntrada, idMetodo: number) {
  pago.idMetodo = idMetodo
  pago.montoRecibido = pago.monto
}

function esEfectivo(idMetodo: number): boolean {
  return estado.value?.metodosPago.find((metodo) => metodo.idMetodo === idMetodo)?.nombre.toLowerCase() === 'efectivo'
}

async function abrirCorte() {
  procesando.value = true
  error.value = null
  try {
    await servicios.caja.abrirCorte()
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo abrir el corte.'
  } finally {
    procesando.value = false
  }
}

async function cerrarCorte() {
  if (!estado.value?.corte || recibidoReporte.value === null) return
  procesando.value = true
  error.value = null
  try {
    const corte = await servicios.caja.cerrarCorte(recibidoReporte.value)
    diferenciaCorte.value = corte.diferencia ?? 0
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cerrar el corte.'
  } finally {
    procesando.value = false
  }
}

async function cobrar() {
  const cuenta = cuentaSeleccionada.value
  if (!cuenta || !puedeCobrar.value) return
  procesando.value = true
  error.value = null
  try {
    ventaReciente.value = await servicios.caja.cobrar(
      cuenta.cuenta.idCuenta,
      pagos.value,
      window.crypto.randomUUID(),
    )
    seleccionadaId.value = null
    pagos.value = []
    recibidoReporte.value = null
    diferenciaCorte.value = null
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo completar el cobro.'
  } finally {
    procesando.value = false
  }
}

function imprimirTicket() {
  window.print()
}

onMounted(cargar)
</script>

<template>
  <div class="caja">
    <header class="encabezado">
      <div>
        <p class="sobrelinea">Punto de venta</p>
        <h2>Caja</h2>
        <p class="subtitulo">Cuentas solicitadas por el mesero y corte de turno.</p>
      </div>
      <button class="btn btn--secundario" type="button" :disabled="cargando || procesando" @click="cargar">
        Actualizar
      </button>
    </header>

    <p v-if="error" class="alerta alerta--error" role="alert">{{ error }}</p>
    <p v-if="diferenciaCorte !== null" class="alerta" role="status">
      Corte cerrado. Diferencia reportada: <strong>{{ moneda(diferenciaCorte) }}</strong>
    </p>
    <p v-if="cargando" class="estado-carga" role="status">Cargando caja…</p>

    <template v-else-if="estado">
      <section class="corte panel" aria-labelledby="corte-titulo">
        <div>
          <h3 id="corte-titulo">Corte de caja</h3>
          <template v-if="estado.corte">
            <p>Abierto desde {{ fecha(estado.corte.inicio) }}</p>
            <p class="total-corte">Ventas del turno: <strong>{{ moneda(estado.corte.totalVentas) }}</strong></p>
          </template>
          <p v-else>No hay un corte abierto. Abre uno para registrar cobros.</p>
        </div>
        <button v-if="!estado.corte" class="btn" type="button" :disabled="procesando" @click="abrirCorte">
          Abrir corte
        </button>
        <form v-else class="form-corte" @submit.prevent="cerrarCorte">
          <label for="total-reportado">Total de ventas reportado</label>
          <input id="total-reportado" v-model.number="recibidoReporte" type="number" min="0" step="0.01" required>
          <button class="btn btn--secundario" type="submit" :disabled="procesando">Cerrar corte</button>
        </form>
      </section>

      <div class="columnas">
        <section class="panel cuentas" aria-labelledby="cuentas-titulo">
          <div class="titulo-seccion">
            <h3 id="cuentas-titulo">Cuentas por cobrar</h3>
            <span class="contador">{{ estado.cuentas.length }}</span>
          </div>
          <p v-if="!estado.cuentas.length" class="vacio">No hay cuentas solicitadas para cobrar.</p>
          <ul v-else class="lista-cuentas">
            <li v-for="item in estado.cuentas" :key="item.cuenta.idCuenta">
              <button
                class="cuenta"
                :class="{ 'cuenta--seleccionada': seleccionadaId === item.cuenta.idCuenta }"
                type="button"
                @click="seleccionar(item)"
              >
                <span class="cuenta__mesa">Mesa {{ item.mesaNumero }}</span>
                <span>{{ item.cuenta.pedidos.length }} pedidos</span>
                <strong>{{ moneda(item.cuenta.total) }}</strong>
                <span v-if="item.pedidosSinEntregar.length" class="bloqueada">
                  {{ item.pedidosSinEntregar.length }} pedido(s) sin entregar
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section class="panel detalle" aria-labelledby="detalle-titulo">
          <h3 id="detalle-titulo">Detalle del cobro</h3>
          <template v-if="cuentaSeleccionada">
            <p class="total-cuenta">Mesa {{ cuentaSeleccionada.mesaNumero }} · Cuenta #{{ cuentaSeleccionada.cuenta.idCuenta }}</p>
            <ul class="pedidos">
              <li v-for="pedido in cuentaSeleccionada.cuenta.pedidos" :key="pedido.idPedido">
                <div class="pedido-titulo">
                  <strong>Pedido #{{ pedido.idPedido }}</strong>
                  <span>{{ pedido.estado }}</span>
                </div>
                <ul class="lineas">
                  <li v-for="(linea, i) in pedido.detalle" :key="`${pedido.idPedido}-${linea.idProducto}-${i}`">
                    <span>{{ linea.cantidad }} × {{ linea.nombreProducto }}</span>
                    <span>{{ moneda(linea.cantidad * linea.precioUnitario) }}</span>
                  </li>
                </ul>
              </li>
            </ul>
            <p v-if="cuentaSeleccionada.pedidosSinEntregar.length" class="alerta alerta--error" role="status">
              No se puede cobrar hasta que todos los pedidos estén entregados.
            </p>
            <p class="total-cuenta">Total: <strong>{{ moneda(cuentaSeleccionada.cuenta.total) }}</strong></p>

            <fieldset class="pagos">
              <legend>Forma de pago</legend>
              <div v-for="pago in pagos" :key="pago.idMetodo" class="fila-pago">
                <label :for="`metodo-${pago.idMetodo}`">Método</label>
                <select
                  :id="`metodo-${pago.idMetodo}`"
                  :value="pago.idMetodo"
                  @change="cambiarMetodo(pago, Number(($event.target as HTMLSelectElement).value))"
                >
                  <option
                    v-for="metodo in estado.metodosPago.filter((item) =>
                      item.idMetodo === pago.idMetodo || !pagos.some((otro) => otro.idMetodo === item.idMetodo),
                    )"
                    :key="metodo.idMetodo"
                    :value="metodo.idMetodo"
                  >
                    {{ metodo.nombre }}
                  </option>
                </select>
                <label :for="`pago-${pago.idMetodo}`">Aplicado</label>
                <input
                  :id="`pago-${pago.idMetodo}`"
                  :value="pago.monto"
                  type="number"
                  min="0.01"
                  step="0.01"
                  :aria-label="`Importe aplicado: ${estado.metodosPago.find((metodo) => metodo.idMetodo === pago.idMetodo)?.nombre}`"
                  @input="cambiarMonto(pago, Number(($event.target as HTMLInputElement).value))"
                >
                <button
                  v-if="pagos.length > 1"
                  class="btn btn--secundario quitar-pago"
                  type="button"
                  :aria-label="`Quitar ${estado.metodosPago.find((metodo) => metodo.idMetodo === pago.idMetodo)?.nombre}`"
                  @click="pagos = pagos.filter((item) => item.idMetodo !== pago.idMetodo)"
                >
                  Quitar
                </button>
                <label v-if="esEfectivo(pago.idMetodo)" :for="`recibido-${pago.idMetodo}`">Recibido</label>
                <input
                  v-if="esEfectivo(pago.idMetodo)"
                  :id="`recibido-${pago.idMetodo}`"
                  v-model.number="pago.montoRecibido"
                  type="number"
                  :min="pago.monto"
                  step="0.01"
                  aria-label="Efectivo recibido"
                >
              </div>
              <button
                v-if="pagos.length < estado.metodosPago.length && pagos.length < 3"
                class="btn btn--secundario"
                type="button"
                @click="agregarMetodo"
              >
                Agregar método
              </button>
            </fieldset>
            <p class="resumen-pago">Por aplicar: <strong>{{ moneda(faltante) }}</strong></p>
            <p class="resumen-pago">Cambio: <strong>{{ moneda(cambio) }}</strong></p>
            <button class="btn btn-cobrar" type="button" :disabled="!puedeCobrar || procesando" @click="cobrar">
              Cobrar y cerrar cuenta
            </button>
          </template>
          <p v-else class="vacio">Selecciona una cuenta solicitada para revisar el detalle.</p>
        </section>
      </div>
    </template>

    <section v-if="ventaReciente" class="ticket panel" aria-labelledby="ticket-titulo">
      <div>
        <p class="sobrelinea">Cobro completado</p>
        <h3 id="ticket-titulo">Ticket · Venta #{{ ventaReciente.idVenta }}</h3>
        <p>Mesa {{ ventaReciente.mesaNumero }} · {{ fecha(ventaReciente.fechaHora) }}</p>
        <p>Total: <strong>{{ moneda(ventaReciente.total) }}</strong></p>
        <ul>
          <li v-for="(pago, i) in ventaReciente.pagos" :key="i">
            {{ pago.metodo }}: {{ moneda(pago.monto) }}
            <span v-if="pago.metodo.toLowerCase() === 'efectivo'">
              · recibido {{ moneda(pago.montoRecibido) }} · cambio {{ moneda(pago.cambio) }}
            </span>
          </li>
        </ul>
        <p v-if="ventaReciente.cambio">Cambio total: <strong>{{ moneda(ventaReciente.cambio) }}</strong></p>
      </div>
      <button class="btn btn--secundario no-imprimir" type="button" @click="imprimirTicket">Imprimir ticket</button>
    </section>
    <section v-else-if="!estado && !cargando" class="panel" role="status">
      No se pudo mostrar la caja. Revisa la conexión e inténtalo de nuevo.
    </section>
  </div>
</template>

<style scoped>
.caja {
  max-width: 78rem;
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2rem);
  color: var(--color-text);
}

.encabezado,
.corte,
.titulo-seccion,
.ticket {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.encabezado h2 {
  margin: 0.2rem 0;
  font-size: clamp(1.7rem, 5vw, 2.3rem);
}

.sobrelinea {
  margin: 0;
  color: var(--color-primary);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.subtitulo,
.corte p,
.ticket p {
  margin: 0.35rem 0;
}

.panel {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.85rem;
  background: var(--color-surface);
  box-shadow: 0 2px 8px rgb(0 0 0 / 5%);
}

.corte h3,
.detalle h3,
.cuentas h3,
.ticket h3 {
  margin: 0 0 0.45rem;
}

.form-corte {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.6rem;
}

.form-corte label {
  width: 100%;
}

.form-corte input,
.fila-pago input {
  min-height: 2.7rem;
  width: 8.5rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  background: var(--color-bg);
  color: var(--color-text);
}

.fila-pago select {
  min-height: 2.7rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  background: var(--color-bg);
  color: var(--color-text);
}

.columnas {
  display: grid;
  grid-template-columns: minmax(15rem, 0.8fr) minmax(20rem, 1.2fr);
  gap: 1rem;
  align-items: start;
}

.cuentas,
.detalle {
  min-width: 0;
}

.contador {
  min-width: 1.8rem;
  padding: 0.15rem 0.5rem;
  border-radius: 2rem;
  background: var(--color-primary);
  color: var(--color-on-primary);
  text-align: center;
}

.lista-cuentas,
.pedidos,
.lineas,
.ticket ul {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cuenta {
  display: grid;
  width: 100%;
  grid-template-columns: 1fr auto;
  gap: 0.2rem 0.5rem;
  padding: 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 0.65rem;
  background: var(--color-bg);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.cuenta--seleccionada {
  border: 2px solid var(--color-primary);
}

.cuenta__mesa {
  font-weight: 700;
}

.bloqueada {
  grid-column: 1 / -1;
  color: var(--color-danger, #a12b1f);
  font-size: 0.9rem;
  font-weight: 700;
}

.pedido-titulo,
.lineas li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.pedidos > li {
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--color-border);
}

.lineas {
  margin-top: 0.45rem;
  font-size: 0.94rem;
}

.total-cuenta {
  display: flex;
  justify-content: space-between;
  margin: 1rem 0;
  font-size: 1.15rem;
}

.pagos {
  display: grid;
  gap: 0.65rem;
  margin: 1rem 0;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
}

.pagos legend {
  padding: 0 0.3rem;
  font-weight: 700;
}

.fila-pago {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.fila-pago label {
  font-size: 0.9rem;
  font-weight: 600;
}

.quitar-pago {
  min-height: 2.7rem;
  min-width: auto;
  padding-inline: 0.65rem;
}

.resumen-pago {
  display: flex;
  justify-content: space-between;
  margin: 0.4rem 0;
}

.btn-cobrar {
  width: 100%;
  margin-top: 0.75rem;
}

.vacio,
.estado-carga {
  padding: 1rem 0;
  color: var(--color-text-muted, #5c6068);
}

.alerta {
  margin: 0.75rem 0;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: var(--color-surface-variant, #f4f1eb);
}

.alerta--error {
  border: 1px solid #a12b1f;
  color: #7e1c14;
}

.ticket {
  align-items: start;
}

@media (max-width: 46rem) {
  .encabezado {
    align-items: flex-start;
    flex-direction: column;
  }

  .columnas {
    grid-template-columns: 1fr;
  }

  .corte,
  .ticket {
    align-items: stretch;
    flex-direction: column;
  }
}

@media print {
  .encabezado,
  .corte,
  .columnas,
  .alerta,
  .no-imprimir {
    display: none !important;
  }

  .caja {
    max-width: none;
    padding: 0;
  }

  .ticket {
    display: block;
    border: 0;
    box-shadow: none;
  }
}
</style>
