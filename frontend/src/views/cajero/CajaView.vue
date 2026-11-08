<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { servicios } from '../../services'
import { descargarCorteExcel } from '../../utils/corteExcel'
import {
  ETIQUETA_ESTADO_PEDIDO,
  type CuentaCaja,
  type EstadoCaja,
  type PagoCajaEntrada,
  type TipoCierreCaja,
  type VentaCaja,
} from '../../types'

interface LineaTicket {
  cantidad: number
  nombreProducto: string
  importe: number
}

const estado = ref<EstadoCaja | null>(null)
const seleccionadaId = ref<number | null>(null)
const pagos = ref<PagoCajaEntrada[]>([])
const efectivoInicial = ref<number | null>(null)
const efectivoContado = ref<number | null>(null)
const ventaReciente = ref<VentaCaja | null>(null)
const corteReciente = ref<import('../../types').CorteCaja | null>(null)
const lineasTicket = ref<LineaTicket[]>([])
const meseroTicket = ref('')
const error = ref<string | null>(null)
const cargando = ref(true)
const procesando = ref(false)
const confirmacionCambioMetodo = ref(false)
const modoImpresion = ref<'venta' | 'corte' | null>(null)

const cuentaSeleccionada = computed(
  () => estado.value?.cuentas.find((item) => item.cuenta.idCuenta === seleccionadaId.value) ?? null,
)
const totalAplicado = computed(() => pagos.value.reduce((suma, pago) => suma + pago.monto, 0))
const faltante = computed(() => Math.round(((cuentaSeleccionada.value?.cuenta.total ?? 0) - totalAplicado.value) * 100) / 100)
const cambio = computed(() => Math.round(pagos.value.reduce((suma, pago) => suma + Math.max(0, pago.montoRecibido - pago.monto), 0) * 100) / 100)
const cumpleMetodoSolicitado = computed(() => {
  const solicitado = cuentaSeleccionada.value?.cuenta.tipoPagoSolicitado
  if (!solicitado) return true
  const nombres = pagos.value.map((pago) => nombreMetodo(pago.idMetodo).toLowerCase())
  return solicitado === 'fisico' ? nombres.includes('efectivo') : nombres.some((nombre) => nombre !== 'efectivo')
})
const requiereConfirmacionCambio = computed(() => !!cuentaSeleccionada.value && !cumpleMetodoSolicitado.value)
const efectivoContadoValido = computed(
  () => efectivoContado.value !== null && Number.isFinite(efectivoContado.value) && efectivoContado.value >= 0,
)
const puedeCobrar = computed(
  () =>
    !!estado.value?.corte &&
    !!cuentaSeleccionada.value &&
    cuentaSeleccionada.value.pedidosSinEntregar.length === 0 &&
    Math.abs(faltante.value) < 0.005 &&
    pagos.value.length > 0 &&
    pagos.value.every((pago) => pago.monto > 0 && pago.montoRecibido >= pago.monto) &&
    (!requiereConfirmacionCambio.value || confirmacionCambioMetodo.value),
)

function moneda(cantidad: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad)
}

function fecha(fechaHora: Date): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(fechaHora)
}

function tipoPago(item: CuentaCaja): string {
  if (item.cuenta.tipoPagoSolicitado === 'digital') return 'Pago digital · seleccionar método'
  if (item.cuenta.tipoPagoSolicitado === 'fisico') return 'Pago en efectivo'
  return 'Forma de pago no indicada'
}

async function cargar() {
  cargando.value = true
  try {
    estado.value = await servicios.caja.obtenerEstado()
    if (!estado.value.corte) efectivoContado.value = null
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
  const metodoInicial = item.cuenta.tipoPagoSolicitado === 'digital' ? null : efectivo
  pagos.value = metodoInicial
    ? [{ idMetodo: metodoInicial.idMetodo, monto: item.cuenta.total, montoRecibido: item.cuenta.total }]
    : []
  confirmacionCambioMetodo.value = false
  ventaReciente.value = null
  error.value = null
}

function iniciarPago(idMetodo: number) {
  const cuenta = cuentaSeleccionada.value
  if (!cuenta) return
  pagos.value = [{ idMetodo, monto: cuenta.cuenta.total, montoRecibido: cuenta.cuenta.total }]
  confirmacionCambioMetodo.value = false
}

function agregarMetodo() {
  const metodo = estado.value?.metodosPago.find((opcion) => !pagos.value.some((pago) => pago.idMetodo === opcion.idMetodo))
  if (!metodo) return
  const importe = Math.max(0, Math.round(faltante.value * 100) / 100)
  pagos.value.push({ idMetodo: metodo.idMetodo, monto: importe, montoRecibido: importe })
  confirmacionCambioMetodo.value = false
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
  confirmacionCambioMetodo.value = false
}

function quitarMetodo(idMetodo: number) {
  pagos.value = pagos.value.filter((pago) => pago.idMetodo !== idMetodo)
  confirmacionCambioMetodo.value = false
}

function esEfectivo(idMetodo: number): boolean {
  return estado.value?.metodosPago.find((metodo) => metodo.idMetodo === idMetodo)?.nombre.toLowerCase() === 'efectivo'
}

function nombreMetodo(idMetodo: number): string {
  return estado.value?.metodosPago.find((metodo) => metodo.idMetodo === idMetodo)?.nombre ?? 'Método'
}

async function abrirCorte() {
  const inicial = efectivoInicial.value
  if (inicial === null || !Number.isFinite(inicial) || inicial < 0) return
  procesando.value = true
  error.value = null
  try {
    await servicios.caja.abrirCorte(inicial)
    efectivoInicial.value = null
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo abrir el corte.'
  } finally {
    procesando.value = false
  }
}

async function cerrarCorte(tipoCierre: TipoCierreCaja) {
  const contado = efectivoContado.value
  if (!estado.value?.corte || contado === null || !Number.isFinite(contado) || contado < 0) return
  procesando.value = true
  error.value = null
  try {
    corteReciente.value = await servicios.caja.cerrarCorte(contado, tipoCierre)
    efectivoContado.value = null
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
  lineasTicket.value = cuenta.cuenta.pedidos.flatMap((pedido) =>
    pedido.estado === 'cancelado'
      ? []
      : pedido.detalle.map((linea) => ({
          cantidad: linea.cantidad,
          nombreProducto: linea.nombreProducto,
          importe: linea.cantidad * linea.precioUnitario,
        })),
  )
  meseroTicket.value = cuenta.meseroNombre
  try {
    ventaReciente.value = await servicios.caja.cobrar(
      cuenta.cuenta.idCuenta,
      pagos.value,
      window.crypto.randomUUID(),
      confirmacionCambioMetodo.value,
    )
    seleccionadaId.value = null
    pagos.value = []
    confirmacionCambioMetodo.value = false
    await cargar()
  } catch (e) {
    lineasTicket.value = []
    error.value = e instanceof Error ? e.message : 'No se pudo completar el cobro.'
  } finally {
    procesando.value = false
  }
}

async function imprimir(modo: 'venta' | 'corte') {
  modoImpresion.value = modo
  await nextTick()
  window.addEventListener('afterprint', () => { modoImpresion.value = null }, { once: true })
  window.print()
}

function imprimirTicket() {
  void imprimir('venta')
}

function imprimirCorte() {
  void imprimir('corte')
}

async function exportarCorte() {
  if (!corteReciente.value) return
  await descargarCorteExcel(corteReciente.value)
}

onMounted(cargar)
</script>

<template>
  <div class="caja pagina" :class="{ 'imprimir-corte': modoImpresion === 'corte', 'imprimir-venta': modoImpresion === 'venta' }">
    <header class="pagina__encabezado">
      <div>
        <p class="sobretitulo">Punto de venta</p>
        <h2>Caja</h2>
        <p>Cuentas solicitadas por el mesero y corte del turno.</p>
      </div>
      <button class="btn btn--secundario no-imprimir" type="button" :disabled="cargando || procesando" @click="cargar">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
        Actualizar
      </button>
    </header>

    <div v-if="error" class="aviso aviso--error no-imprimir" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="btn btn--secundario" :disabled="cargando || procesando" @click="cargar">Reintentar</button>
    </div>
    <template v-if="cargando && !estado">
      <div class="esqueletos" aria-hidden="true">
        <div class="esqueleto esqueleto--corte" />
        <div class="esqueleto" />
        <div class="esqueleto" />
      </div>
      <p class="solo-lectores" role="status">Cargando caja…</p>
    </template>

    <template v-else-if="estado">
      <section class="corte panel" aria-labelledby="corte-titulo">
        <div class="corte__info">
          <div class="corte__titulo">
            <h3 id="corte-titulo">Corte de caja</h3>
            <InsigniaEstado
              :tono="estado.corte ? 'cuenta_abierta' : 'desconocido'"
              :texto="estado.corte ? 'Abierto' : 'Sin abrir'"
            />
          </div>
          <p v-if="estado.corte" class="corte__meta">Abierto desde {{ fecha(estado.corte.inicio) }}</p>
          <p v-else class="corte__meta">Registra el efectivo que recibes para iniciar el turno.</p>

          <div class="corte__cifras">
            <div class="corte__cifra">
              <span>Ventas cobradas</span>
              <strong class="numero">{{ moneda(estado.corte?.totalVentas ?? 0) }}</strong>
            </div>
            <div class="corte__cifra">
              <span>Cuentas por cobrar</span>
              <strong class="numero">{{ estado.cuentas.length }}</strong>
            </div>
            <div v-if="estado.corte" class="corte__cifra">
              <span>Efectivo esperado en caja</span>
              <strong class="numero">{{ moneda(estado.corte.efectivoEsperado) }}</strong>
            </div>
          </div>

          <dl v-if="estado.corte" class="metodos-corte">
            <div v-for="metodo in estado.corte.metodosPago" :key="metodo.idMetodo">
              <dt>{{ metodo.nombre }}</dt>
              <dd class="numero">{{ moneda(metodo.monto) }}</dd>
            </div>
          </dl>
        </div>

        <div class="corte__acciones">
          <form v-if="!estado.corte" class="form-corte" @submit.prevent="abrirCorte">
            <div class="campo">
              <label for="efectivo-inicial">Fondo inicial en efectivo</label>
              <input id="efectivo-inicial" v-model.number="efectivoInicial" type="number" min="0" step="0.01" required>
              <p class="campo__ayuda">Cuenta el efectivo recibido. Tarjeta y transferencia no forman parte del cajón.</p>
            </div>
            <div class="form-corte__acciones">
              <button class="btn btn--grande" type="submit" :disabled="procesando">Abrir caja</button>
            </div>
          </form>
          <div v-else class="form-corte">
            <div class="campo">
              <label for="efectivo-contado">Efectivo contado para el corte</label>
              <input id="efectivo-contado" v-model.number="efectivoContado" type="number" min="0" step="0.01" required>
              <p class="campo__ayuda">
                Esperado: {{ moneda(estado.corte.efectivoInicial) }} de fondo + {{ moneda(estado.corte.metodosPago.find((m) => m.nombre.toLowerCase() === 'efectivo')?.monto ?? 0) }} en efectivo.
                Tarjeta y transferencia se reportan por separado.
              </p>
            </div>
            <div class="form-corte__acciones">
              <button class="btn btn--secundario" type="button" :disabled="procesando || !efectivoContadoValido" @click="cerrarCorte('parcial')">
                Corte parcial
              </button>
              <button class="btn" type="button" :disabled="procesando || !efectivoContadoValido" @click="cerrarCorte('final')">
                Cierre final
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="columnas">
        <section class="panel cuentas" aria-labelledby="cuentas-titulo">
          <div class="titulo-seccion">
            <h3 id="cuentas-titulo">Cuentas por cobrar</h3>
            <span class="contador numero">{{ estado.cuentas.length }}</span>
          </div>

          <div v-if="!estado.cuentas.length" class="vacio">
            <h4>Todo cobrado</h4>
            <p>Cuando un mesero solicite la cuenta, aparecerá aquí.</p>
          </div>

          <ul v-else class="lista-cuentas">
            <li v-for="item in estado.cuentas" :key="item.cuenta.idCuenta">
              <button
                class="cuenta"
                :class="{ 'cuenta--seleccionada': seleccionadaId === item.cuenta.idCuenta }"
                type="button"
                :aria-pressed="seleccionadaId === item.cuenta.idCuenta"
                @click="seleccionar(item)"
              >
                <span class="cuenta__cabecera">
                  <span class="cuenta__mesa">Mesa {{ item.mesaNumero }}</span>
                  <strong class="cuenta__total numero">{{ moneda(item.cuenta.total) }}</strong>
                </span>
                <span class="cuenta__meta">
                  {{ item.cuenta.pedidos.length }} {{ item.cuenta.pedidos.length === 1 ? 'pedido' : 'pedidos' }}
                  <template v-if="item.meseroNombre"> · {{ item.meseroNombre }}</template>
                </span>
                <span class="cuenta__insignias">
                  <InsigniaEstado tono="cuenta_por_pagar" texto="Por cobrar" />
                  <InsigniaEstado
                    :tono="item.cuenta.tipoPagoSolicitado === 'digital' ? 'cuenta_abierta' : 'cuenta_pagada'"
                    :texto="tipoPago(item)"
                  />
                  <InsigniaEstado
                    v-if="item.pedidosSinEntregar.length"
                    tono="agotado"
                    :texto="`${item.pedidosSinEntregar.length} sin entregar`"
                  />
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section class="panel detalle" aria-labelledby="detalle-titulo">
          <h3 id="detalle-titulo">Detalle del cobro</h3>

          <template v-if="cuentaSeleccionada">
            <div class="detalle__cabecera">
              <div>
                <p class="sobretitulo">Cuenta #{{ cuentaSeleccionada.cuenta.idCuenta }}</p>
                <h4>Mesa {{ cuentaSeleccionada.mesaNumero }}</h4>
                <p class="detalle__meta">
                  <template v-if="cuentaSeleccionada.meseroNombre">Atendió: {{ cuentaSeleccionada.meseroNombre }}</template>
                  <template v-else>Sin mesero registrado</template>
                </p>
              </div>
              <strong class="detalle__total numero">{{ moneda(cuentaSeleccionada.cuenta.total) }}</strong>
            </div>

            <div class="detalle__insignias">
              <InsigniaEstado
                :tono="cuentaSeleccionada.cuenta.tipoPagoSolicitado === 'digital' ? 'cuenta_abierta' : 'cuenta_pagada'"
                :texto="tipoPago(cuentaSeleccionada)"
              />
              <InsigniaEstado
                v-if="cuentaSeleccionada.pedidosSinEntregar.length"
                tono="agotado"
                :texto="`${cuentaSeleccionada.pedidosSinEntregar.length} pedido(s) sin entregar`"
                ajustar
              />
            </div>

            <div v-if="pagos.length === 0" class="campo metodo-inicial">
              <label for="metodo-inicial">Método recibido</label>
              <select id="metodo-inicial" :value="''" @change="iniciarPago(Number(($event.target as HTMLSelectElement).value))">
                <option value="" disabled>Selecciona tarjeta o transferencia</option>
                <option v-for="metodo in estado.metodosPago" :key="metodo.idMetodo" :value="metodo.idMetodo">
                  {{ metodo.nombre }}
                </option>
              </select>
            </div>

            <div v-if="requiereConfirmacionCambio" class="aviso aviso--error aviso-metodo" role="alert">
              <p>La forma de pago seleccionada no coincide con la que indicó el mesero ({{ tipoPago(cuentaSeleccionada) }}).</p>
              <label>
                <input v-model="confirmacionCambioMetodo" type="checkbox">
                Confirmo que el cliente cambió la forma de pago.
              </label>
            </div>

            <ul class="pedidos">
              <li v-for="pedido in cuentaSeleccionada.cuenta.pedidos" :key="pedido.idPedido" class="pedido">
                <div class="pedido__titulo">
                  <strong>Pedido #{{ pedido.idPedido }}</strong>
                  <span class="pedido__estado">{{ ETIQUETA_ESTADO_PEDIDO[pedido.estado] }}</span>
                </div>
                <ul class="lineas">
                  <li v-for="(linea, i) in pedido.detalle" :key="`${pedido.idPedido}-${linea.idProducto}-${i}`">
                    <span><span class="lineas__cantidad numero">{{ linea.cantidad }}×</span> {{ linea.nombreProducto }}</span>
                    <span class="numero">{{ moneda(linea.cantidad * linea.precioUnitario) }}</span>
                  </li>
                </ul>
              </li>
            </ul>

            <p v-if="cuentaSeleccionada.pedidosSinEntregar.length" class="aviso aviso--error" role="status">
              <span>No se puede cobrar hasta que todos los pedidos estén entregados.</span>
            </p>

            <fieldset class="pagos" :disabled="procesando">
              <legend>Forma de pago</legend>
              <div v-for="pago in pagos" :key="pago.idMetodo" class="pago">
                <div class="pago__fila">
                  <div class="campo">
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
                  </div>
                  <div class="campo">
                    <label :for="`pago-${pago.idMetodo}`">Importe aplicado</label>
                    <input
                      :id="`pago-${pago.idMetodo}`"
                      :value="pago.monto"
                      type="number"
                      min="0.01"
                      step="0.01"
                      :aria-label="`Importe aplicado: ${nombreMetodo(pago.idMetodo)}`"
                      @input="cambiarMonto(pago, Number(($event.target as HTMLInputElement).value))"
                    >
                  </div>
                  <button
                    v-if="pagos.length > 1"
                    class="btn btn--icono quitar-pago"
                    type="button"
                    :aria-label="`Quitar ${nombreMetodo(pago.idMetodo)}`"
                    @click="quitarMetodo(pago.idMetodo)"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                      <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
                    </svg>
                  </button>
                </div>

                <div v-if="esEfectivo(pago.idMetodo)" class="pago__efectivo">
                  <div class="campo">
                    <label :for="`recibido-${pago.idMetodo}`">Efectivo recibido</label>
                    <input
                      :id="`recibido-${pago.idMetodo}`"
                      v-model.number="pago.montoRecibido"
                      type="number"
                      :min="pago.monto"
                      step="0.01"
                      aria-label="Efectivo recibido"
                    >
                  </div>
                  <button
                    type="button"
                    class="btn btn--secundario"
                    :disabled="pago.montoRecibido === pago.monto"
                    @click="pago.montoRecibido = pago.monto"
                  >
                    Exacto
                  </button>
                </div>
              </div>

              <button
                v-if="pagos.length > 0 && pagos.length < estado.metodosPago.length && pagos.length < 3"
                class="btn btn--secundario"
                type="button"
                @click="agregarMetodo"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Agregar método de pago
              </button>
            </fieldset>

            <div class="resumen-pago" aria-live="polite">
              <p><span>Aplicado</span><strong class="numero">{{ moneda(totalAplicado) }}</strong></p>
              <p :class="{ 'resumen-pago__alerta': Math.abs(faltante) >= 0.005 }">
                <span>{{ faltante >= 0 ? 'Por aplicar' : 'Excedente' }}</span>
                <strong class="numero">{{ moneda(Math.abs(faltante)) }}</strong>
              </p>
              <p v-if="cambio > 0" class="resumen-pago__cambio">
                <span>Cambio</span><strong class="numero">{{ moneda(cambio) }}</strong>
              </p>
            </div>

            <button class="btn btn--grande btn-cobrar" type="button" :disabled="!puedeCobrar || procesando" @click="cobrar">
              {{ procesando ? 'Procesando cobro…' : 'Cobrar y cerrar cuenta' }}
            </button>
          </template>

          <div v-else class="vacio">
            <h4>Elige una cuenta</h4>
            <p>Selecciona una cuenta solicitada para revisar el detalle y cobrar.</p>
          </div>
        </section>
      </div>
    </template>

    <section v-else class="vacio no-imprimir" role="alert">
      <h3>No se pudo mostrar la caja</h3>
      <p>Revisa la conexión e inténtalo de nuevo.</p>
      <button type="button" class="btn" @click="cargar">Reintentar</button>
    </section>

    <section v-if="corteReciente" class="ticket-panel corte-ticket-panel" aria-labelledby="corte-ticket-titulo">
      <div class="ticket-panel__barra no-imprimir">
        <div>
          <p class="sobretitulo">Corte guardado</p>
          <h3 id="corte-ticket-titulo">{{ corteReciente.tipoCierre === 'parcial' ? 'Corte parcial' : 'Cierre final' }} · #{{ corteReciente.idCorte }}</h3>
          <p>{{ corteReciente.cajeroNombre }} · {{ fecha(corteReciente.inicio) }} a {{ corteReciente.fin ? fecha(corteReciente.fin) : 'en curso' }}</p>
        </div>
        <div class="ticket-panel__acciones">
          <button class="btn btn--secundario" type="button" @click="imprimirCorte">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
              <path d="M6 14h12v7H6z" />
            </svg>
            Imprimir corte
          </button>
          <button class="btn" type="button" @click="exportarCorte">
            Descargar Excel
          </button>
        </div>
      </div>

      <div class="ticket corte-ticket">
        <div class="ticket__marca">
          <strong>La Madalena</strong>
          <span>SIGR · {{ corteReciente.tipoCierre === 'parcial' ? 'Corte parcial' : 'Cierre final' }}</span>
        </div>
        <dl class="ticket__datos">
          <div><dt>Corte</dt><dd>#{{ corteReciente.idCorte }}</dd></div>
          <div><dt>Cajero</dt><dd>{{ corteReciente.cajeroNombre }}</dd></div>
          <div><dt>Inicio</dt><dd>{{ fecha(corteReciente.inicio) }}</dd></div>
          <div><dt>Cierre</dt><dd>{{ corteReciente.fin ? fecha(corteReciente.fin) : 'En curso' }}</dd></div>
          <div><dt>Fondo inicial</dt><dd>{{ moneda(corteReciente.efectivoInicial) }}</dd></div>
        </dl>
        <ul class="ticket__pagos">
          <li v-for="metodo in corteReciente.metodosPago" :key="metodo.idMetodo">
            <span>{{ metodo.nombre }} ({{ metodo.cantidadPagos }})</span>
            <span class="numero">{{ moneda(metodo.monto) }}</span>
          </li>
        </ul>
        <p class="ticket__total"><span>Total ventas</span><strong class="numero">{{ moneda(corteReciente.totalVentas) }}</strong></p>
        <dl class="ticket__datos ticket__efectivo">
          <div><dt>Efectivo esperado</dt><dd>{{ moneda(corteReciente.efectivoEsperado) }}</dd></div>
          <div v-if="corteReciente.efectivoContado !== null"><dt>Efectivo contado</dt><dd>{{ moneda(corteReciente.efectivoContado) }}</dd></div>
          <div v-if="corteReciente.diferenciaEfectivo !== null">
            <dt>{{ corteReciente.diferenciaEfectivo < 0 ? 'Faltante' : 'Sobrante' }}</dt>
            <dd>{{ moneda(Math.abs(corteReciente.diferenciaEfectivo)) }}</dd>
          </div>
        </dl>
        <ol class="cuentas-corte" aria-label="Cuentas cobradas en este corte">
          <li v-for="venta in corteReciente.ventas" :key="venta.idVenta">
            <strong>Cuenta #{{ venta.idCuenta }} · Mesa {{ venta.mesaNumero }}</strong>
            <span>{{ fecha(venta.fechaHora) }} · {{ venta.cajeroNombre }}<template v-if="venta.meseroNombre"> · Mesero: {{ venta.meseroNombre }}</template></span>
            <span>{{ venta.pagos.map((pago) => `${pago.metodo} ${moneda(pago.monto)}`).join(' + ') }}</span>
            <strong class="numero">{{ moneda(venta.total) }}</strong>
          </li>
        </ol>
      </div>
    </section>

    <section v-if="ventaReciente" class="ticket-panel" aria-labelledby="ticket-titulo">
      <div class="ticket-panel__barra no-imprimir">
        <div>
          <p class="sobretitulo">Cobro completado</p>
          <h3 id="ticket-titulo">Ticket · Venta #{{ ventaReciente.idVenta }}</h3>
          <p>Mesa {{ ventaReciente.mesaNumero }} · {{ fecha(ventaReciente.fechaHora) }}</p>
        </div>
        <div class="ticket-panel__acciones">
          <button class="btn btn--secundario" type="button" @click="ventaReciente = null">Cerrar</button>
          <button class="btn" type="button" @click="imprimirTicket">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
              <path d="M6 14h12v7H6z" />
            </svg>
            Imprimir ticket
          </button>
        </div>
      </div>

      <!-- Ticket de 80 mm: en pantalla se muestra como papel; al imprimir solo sale esto -->
      <div class="ticket">
        <div class="ticket__marca">
          <strong>La Madalena</strong>
          <span>SIGR · Comprobante de venta</span>
        </div>

        <dl class="ticket__datos">
          <div><dt>Ticket</dt><dd>#{{ ventaReciente.idVenta }}</dd></div>
          <div><dt>Mesa</dt><dd>{{ ventaReciente.mesaNumero }}</dd></div>
          <div><dt>Fecha</dt><dd>{{ fecha(ventaReciente.fechaHora) }}</dd></div>
          <div v-if="meseroTicket"><dt>Mesero</dt><dd>{{ meseroTicket }}</dd></div>
        </dl>

        <table class="ticket__tabla">
          <thead>
            <tr><th scope="col">Cant</th><th scope="col">Producto</th><th scope="col">Importe</th></tr>
          </thead>
          <tbody>
            <tr v-for="(linea, i) in lineasTicket" :key="i">
              <td class="numero">{{ linea.cantidad }}</td>
              <td>{{ linea.nombreProducto }}</td>
              <td class="numero">{{ moneda(linea.importe) }}</td>
            </tr>
          </tbody>
        </table>

        <p class="ticket__total"><span>Total</span><strong class="numero">{{ moneda(ventaReciente.total) }}</strong></p>

        <ul class="ticket__pagos">
          <li v-for="(pago, i) in ventaReciente.pagos" :key="i">
            <span>{{ pago.metodo }}</span>
            <span class="numero">{{ moneda(pago.monto) }}</span>
          </li>
        </ul>
        <p v-if="ventaReciente.cambio" class="ticket__cambio">
          <span>Cambio</span><strong class="numero">{{ moneda(ventaReciente.cambio) }}</strong>
        </p>

        <p class="ticket__gracias">¡Gracias por su visita!</p>
        <p class="ticket__nota">Conserve este comprobante.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.caja {
  max-width: 1200px;
}

.caja h2 {
  font-size: clamp(1.9rem, 1.4rem + 1.8vw, 2.6rem);
}

.esqueletos {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: var(--espacio-5);
}

.esqueleto--corte {
  grid-column: 1 / -1;
  min-height: 180px;
}

.esqueletos .esqueleto {
  min-height: 340px;
}

.corte {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
  align-items: center;
  gap: var(--espacio-6);
  border-top: 6px solid var(--color-primary);
}

.corte__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-3);
}

.corte__titulo h3 {
  font-size: var(--texto-xl);
}

.corte__meta {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.corte__cifras {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-6);
  margin-top: var(--espacio-4);
}

.metodos-corte {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--espacio-2) var(--espacio-4);
  margin: var(--espacio-4) 0 0;
}

.metodos-corte div {
  display: flex;
  justify-content: space-between;
  gap: var(--espacio-2);
  padding-bottom: var(--espacio-1);
  border-bottom: 1px solid var(--color-border);
}

.metodos-corte dt {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.metodos-corte dd {
  margin: 0;
  font-weight: 700;
}

.corte__cifra {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.corte__cifra span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.corte__cifra strong {
  font-family: var(--fuente-titulo);
  font-size: var(--texto-2xl);
  line-height: 1;
  letter-spacing: -0.02em;
}

.form-corte {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
}

.form-corte input {
  width: 100%;
}

.form-corte__acciones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2);
}

.form-corte__acciones .btn:last-child {
  flex: 1;
}

.columnas {
  display: grid;
  grid-template-columns: minmax(17rem, 0.85fr) minmax(24rem, 1.15fr);
  align-items: start;
  gap: var(--espacio-5);
}

.cuentas,
.detalle {
  min-width: 0;
}

.titulo-seccion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
  margin-bottom: var(--espacio-4);
}

.titulo-seccion h3 {
  margin: 0;
}

.contador {
  display: grid;
  place-items: center;
  min-width: 40px;
  min-height: 40px;
  padding: 0 var(--espacio-2);
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 700;
}

.lista-cuentas {
  display: grid;
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cuenta {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  width: 100%;
  padding: var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-bg);
  color: var(--color-text);
  text-align: left;
  touch-action: manipulation;
  transition:
    border-color var(--duracion-rapida) ease,
    background-color var(--duracion-rapida) ease,
    transform var(--duracion-rapida) var(--curva-salida);
}

.cuenta:active {
  transform: scale(0.99);
}

@media (hover: hover) and (pointer: fine) {
  .cuenta:hover {
    border-color: var(--color-borde-fuerte);
    background: var(--color-surface-2);
  }
}

.cuenta--seleccionada {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: inset 4px 0 0 var(--color-primary);
}

.cuenta__cabecera {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.cuenta__mesa {
  font-family: var(--fuente-titulo);
  font-size: var(--texto-xl);
  font-weight: 600;
}

.cuenta__total {
  color: var(--color-primary-dark);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.cuenta__meta {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  overflow-wrap: anywhere;
}

.cuenta__insignias {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-1) var(--espacio-2);
}

.detalle__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--espacio-3);
  margin-top: var(--espacio-3);
}

.detalle__cabecera h4 {
  margin: 0;
  font-family: var(--fuente-titulo);
  font-size: var(--texto-xl);
  font-weight: 600;
}

.detalle__meta {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.detalle__total {
  color: var(--color-primary-dark);
  font-size: var(--texto-2xl);
  line-height: 1;
}

.detalle__insignias {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
  margin-top: var(--espacio-3);
}

.pedidos {
  display: grid;
  gap: var(--espacio-3);
  margin: var(--espacio-4) 0;
  padding: 0;
  list-style: none;
}

.pedido {
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface-2);
}

.pedido__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--espacio-2);
}

.pedido__estado {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.lineas {
  display: grid;
  gap: var(--espacio-1);
  margin: var(--espacio-2) 0 0;
  padding: 0;
  list-style: none;
}

.lineas li {
  display: flex;
  justify-content: space-between;
  gap: var(--espacio-3);
  font-size: var(--texto-sm);
}

.lineas__cantidad {
  display: inline-block;
  min-width: 1.8rem;
  color: var(--color-primary-dark);
  font-weight: 700;
}

.pagos {
  display: grid;
  gap: var(--espacio-3);
  margin: var(--espacio-4) 0;
  padding: var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface-2);
}

.pagos legend {
  padding-inline: var(--espacio-1);
  font-size: var(--texto-lg);
  font-weight: 700;
}

.pago {
  padding: var(--espacio-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
}

.pago__fila {
  display: grid;
  grid-template-columns: minmax(9rem, 1.2fr) minmax(7rem, 0.8fr) auto;
  align-items: end;
  gap: var(--espacio-2);
}

.pago__fila .campo input,
.pago__fila .campo select {
  width: 100%;
}

.pago__efectivo {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--espacio-2);
  margin-top: var(--espacio-2);
  padding-top: var(--espacio-2);
  border-top: 1px dashed var(--color-border);
}

.pago__efectivo .campo {
  flex: 1 1 10rem;
}

.quitar-pago {
  margin-bottom: 1px;
}

.resumen-pago {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-5);
  margin-top: var(--espacio-4);
  padding: var(--espacio-3) var(--espacio-4);
  border-radius: var(--radio-sm);
  background: var(--color-surface-2);
}

.resumen-pago p {
  display: flex;
  align-items: baseline;
  gap: var(--espacio-2);
  margin: 0;
}

.resumen-pago span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.resumen-pago strong {
  font-size: var(--texto-lg);
}

.resumen-pago__alerta strong,
.resumen-pago__alerta span {
  color: var(--color-peligro-texto);
}

.resumen-pago__cambio strong {
  color: var(--color-exito-texto);
}

.btn-cobrar {
  width: 100%;
  margin-top: var(--espacio-3);
}

.detalle > .vacio {
  margin-top: var(--espacio-3);
}

/* ---------- Ticket 80 mm ---------- */
.ticket-panel {
  display: grid;
  gap: var(--espacio-4);
  justify-items: center;
  padding-top: var(--espacio-2);
}

.ticket-panel__barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
  width: 100%;
  padding: var(--espacio-4);
  border: 2px solid var(--color-exito);
  border-radius: var(--radio);
  background: var(--color-exito-fondo);
}

.ticket-panel__barra h3 {
  margin: 0;
}

.ticket-panel__barra p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-exito-texto);
}

.ticket-panel__acciones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.aviso-metodo {
  margin-top: var(--espacio-3);
}

.aviso-metodo label {
  display: flex;
  align-items: flex-start;
  gap: var(--espacio-2);
}

.metodo-inicial {
  margin-top: var(--espacio-4);
}

.cuentas-corte {
  display: grid;
  gap: 2mm;
  margin: 3mm 0 0;
  padding: 0;
  list-style: none;
}

.cuentas-corte li {
  display: grid;
  gap: 1mm;
  padding: 2mm 0;
  border-top: 1px dashed #777;
}

.cuentas-corte span {
  overflow-wrap: anywhere;
}

.ticket__efectivo {
  margin-bottom: 0;
  padding-top: 2mm;
  border-top: 1px dashed #555;
}

.ticket {
  width: 80mm;
  max-width: 100%;
  padding: 5mm 4mm;
  border-radius: var(--radio-sm);
  background: #fff;
  box-shadow: var(--sombra-elevada);
  color: #111;
  font-family: ui-monospace, 'Cascadia Mono', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.4;
}

.ticket__marca {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1mm;
  padding-bottom: 3mm;
  border-bottom: 1px dashed #555;
  text-align: center;
}

.ticket__marca strong {
  font-family: var(--fuente-titulo);
  font-size: 18px;
  letter-spacing: -0.02em;
}

.ticket__marca span {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ticket__datos {
  display: grid;
  gap: 1mm;
  margin: 3mm 0;
  padding-bottom: 3mm;
  border-bottom: 1px dashed #555;
}

.ticket__datos div {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}

.ticket__datos dt,
.ticket__datos dd {
  margin: 0;
}

.ticket__datos dt {
  color: #555;
}

.ticket__tabla {
  width: 100%;
  margin: 0 0 3mm;
  border-collapse: collapse;
  font-size: 10.5px;
}

.ticket__tabla th,
.ticket__tabla td {
  padding: 1.2mm 0;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px dotted #aaa;
}

.ticket__tabla th:nth-child(1),
.ticket__tabla td:nth-child(1) {
  width: 8mm;
  padding-right: 1.5mm;
}

.ticket__tabla th:nth-child(2),
.ticket__tabla td:nth-child(2) {
  padding-right: 2mm;
}

.ticket__tabla th:last-child,
.ticket__tabla td:last-child {
  width: 22mm;
  padding-left: 1.5mm;
  text-align: right;
  white-space: nowrap;
}

.ticket__total {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
  margin: 0;
  padding: 2mm 0;
  border-top: 2px solid #111;
  border-bottom: 1px dashed #555;
  font-size: 14px;
}

.ticket__pagos {
  display: grid;
  gap: 1mm;
  margin: 2mm 0 0;
  padding: 0;
  list-style: none;
}

.ticket__pagos li,
.ticket__cambio {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}

.ticket__cambio {
  margin: 1mm 0 0;
  font-weight: 700;
}

.ticket__gracias {
  margin: 4mm 0 0;
  padding-top: 3mm;
  border-top: 1px dashed #555;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
}

.ticket__nota {
  margin: 1mm 0 0;
  color: #555;
  text-align: center;
  font-size: 9.5px;
}

@media (max-width: 64em) {
  .corte {
    grid-template-columns: minmax(0, 1fr);
  }

  .columnas {
    grid-template-columns: minmax(17rem, 0.9fr) minmax(20rem, 1.1fr);
  }
}

@media (max-width: 52em) {
  .columnas,
  .esqueletos {
    grid-template-columns: minmax(0, 1fr);
  }

  .esqueletos .esqueleto {
    min-height: 180px;
  }
}

@media (max-width: 30em) {
  .pago__fila {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .pago__fila .campo:first-child {
    grid-column: 1 / -1;
  }
}

@media print {
  @page {
    size: 80mm auto;
    margin: 3mm;
  }

  .caja.imprimir-venta > :not(.ticket-panel),
  .caja.imprimir-corte > :not(.corte-ticket-panel) {
    display: none !important;
  }

  .caja:not(.imprimir-venta):not(.imprimir-corte) > * {
    display: none !important;
  }

  .ticket-panel {
    display: block !important;
    width: 100% !important;
    padding: 0 !important;
  }

  .ticket {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0;
    box-shadow: none;
    font-size: 10.5px;
    line-height: 1.35;
  }

  .ticket__tabla {
    table-layout: fixed;
    font-size: 10px;
  }

  .ticket__tabla th,
  .ticket__tabla td {
    padding: 1mm 0;
  }

  .ticket__tabla th:nth-child(1),
  .ticket__tabla td:nth-child(1) {
    width: 7mm;
  }

  .ticket__tabla th:last-child,
  .ticket__tabla td:last-child {
    width: 20mm;
  }

  .ticket__tabla td:nth-child(2) {
    overflow-wrap: anywhere;
  }
}
</style>
