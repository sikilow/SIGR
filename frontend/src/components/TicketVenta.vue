<script setup lang="ts">
// Ticket de 80 mm de una venta ya cobrada. En pantalla se ve como papel; al imprimir solo sale esto. Una reimpresión lleva
// la marca «REIMPRESIÓN» (y cuántas van), para que no se confunda con el original. Si la venta tiene devoluciones aprobadas,
// se listan debajo del total con el importe neto.
import { computed } from 'vue'
import type { VentaDetalle } from '../types'

const props = defineProps<{
  venta: VentaDetalle
  /** Marca el ticket como copia (se reimprimió). */
  reimpresion?: boolean
}>()

const aprobadas = computed(() => props.venta.devoluciones.filter((d) => d.estado === 'aprobada'))
const cambio = computed(() => Math.round(props.venta.pagos.reduce((s, p) => s + p.cambio * 100, 0)) / 100)
const neto = computed(() => Math.round((props.venta.total - props.venta.devuelto) * 100) / 100)

/** Importes del ticket sin «MXN»: el papel es angosto (como el ticket del cobro). */
function formatearMoneda(cantidad: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad)
}

function fecha(f: Date): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(f)
}

function nombre(l: { producto: string; presentacion: string | null }): string {
  return l.presentacion ? `${l.producto} (${l.presentacion})` : l.producto
}
</script>

<template>
  <div class="ticket">
    <div class="ticket__marca">
      <strong>La Madalena</strong>
      <span>SIGR · Comprobante de venta</span>
      <span v-if="reimpresion" class="ticket__copia">*** REIMPRESIÓN<template v-if="venta.reimpresiones > 0"> #{{ venta.reimpresiones }}</template> ***</span>
    </div>

    <dl class="ticket__datos">
      <div><dt>Ticket</dt><dd>#{{ venta.idVenta }}</dd></div>
      <div><dt>Mesa</dt><dd>{{ venta.mesaNumero }}</dd></div>
      <div><dt>Fecha</dt><dd>{{ fecha(venta.fechaHora) }}</dd></div>
      <div v-if="venta.meseros"><dt>Mesero</dt><dd>{{ venta.meseros }}</dd></div>
      <div><dt>Cajero</dt><dd>{{ venta.cajero }}</dd></div>
    </dl>

    <table class="ticket__tabla">
      <thead>
        <tr><th scope="col">Cant</th><th scope="col">Producto</th><th scope="col">Importe</th></tr>
      </thead>
      <tbody>
        <tr v-for="linea in venta.lineas" :key="linea.idDetalle">
          <td class="numero">{{ linea.cantidad }}</td>
          <td>{{ nombre(linea) }}</td>
          <td class="numero">{{ formatearMoneda(linea.importe) }}</td>
        </tr>
      </tbody>
    </table>

    <p class="ticket__total"><span>Total</span><strong class="numero">{{ formatearMoneda(venta.total) }}</strong></p>

    <ul class="ticket__pagos">
      <li v-for="pago in venta.pagos" :key="pago.idMetodo">
        <span>{{ pago.metodo }}</span>
        <span class="numero">{{ formatearMoneda(pago.monto) }}</span>
      </li>
    </ul>
    <p v-if="cambio" class="ticket__fila"><span>Cambio</span><strong class="numero">{{ formatearMoneda(cambio) }}</strong></p>

    <template v-if="aprobadas.length">
      <p class="ticket__titulo">Devoluciones</p>
      <ul class="ticket__pagos">
        <li v-for="d in aprobadas" :key="d.idDevolucion">
          <span>Dev. #{{ d.idDevolucion }} · {{ d.lineas.map((l) => `${l.cantidad}× ${l.producto}`).join(', ') }}</span>
          <span class="numero">−{{ formatearMoneda(d.total) }}</span>
        </li>
      </ul>
      <p class="ticket__total ticket__total--neto"><span>Neto</span><strong class="numero">{{ formatearMoneda(neto) }}</strong></p>
    </template>

    <p class="ticket__gracias">¡Gracias por su visita!</p>
    <p class="ticket__nota">
      Conserve este comprobante.<template v-if="reimpresion"> Copia: no es un nuevo cobro.</template>
    </p>
  </div>
</template>

<style scoped>
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

.ticket__marca span,
.ticket__titulo {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ticket__copia {
  margin-top: 1mm;
  padding: 0.5mm 2mm;
  border: 1.5px solid #111;
  font-weight: 700;
}

.ticket__titulo {
  margin: 3mm 0 1mm;
  font-weight: 700;
}

.ticket__datos {
  display: grid;
  gap: 1mm;
  margin: 3mm 0;
  padding-bottom: 3mm;
  border-bottom: 1px dashed #555;
}

.ticket__datos div,
.ticket__pagos li,
.ticket__fila,
.ticket__total {
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
  border-bottom: 1px dotted #aaa;
}

.ticket__tabla th:first-child,
.ticket__tabla td:first-child {
  width: 9mm;
}

.ticket__tabla th:last-child,
.ticket__tabla td:last-child {
  padding-left: 1.5mm;
  text-align: right;
  white-space: nowrap;
}

.ticket__total {
  margin: 0;
  padding: 2mm 0;
  border-top: 2px solid #111;
  border-bottom: 1px dashed #555;
  font-size: 13px;
}

.ticket__total--neto {
  border-top-width: 1px;
}

.ticket__pagos {
  display: grid;
  gap: 1mm;
  margin: 2mm 0;
  padding: 0;
  list-style: none;
}

.ticket__pagos li span:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ticket__pagos li span:last-child {
  white-space: nowrap;
}

.ticket__fila {
  margin: 0 0 2mm;
}

.ticket__gracias {
  margin: 4mm 0 0;
  text-align: center;
  font-weight: 700;
}

.ticket__nota {
  margin: 1mm 0 0;
  color: #555;
  font-size: 10px;
  text-align: center;
}

@media print {
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
}
</style>
