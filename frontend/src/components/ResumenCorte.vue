<script setup lang="ts">
import { computed } from 'vue'
import type { CorteDetalle } from '../types'

const props = defineProps<{ corte: CorteDetalle }>()

const efectivoCobrado = computed(
  () => props.corte.desglose.find((fila) => fila.metodo.toLowerCase() === 'efectivo')?.monto ?? 0,
)

const resultado = computed(() => {
  const diferencia = props.corte.diferencia
  if (diferencia === null) return null
  if (Math.abs(diferencia) < 0.005) return { texto: 'Cuadra', clase: 'corte-ticket__resultado--cuadra' }
  return diferencia < 0
    ? { texto: 'Faltante', clase: 'corte-ticket__resultado--faltante' }
    : { texto: 'Sobrante', clase: 'corte-ticket__resultado--sobrante' }
})

function moneda(cantidad: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad)
}

function fecha(fechaHora: Date): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(fechaHora)
}
</script>

<template>
  <!-- Corte de 80 mm, mismo formato que el ticket de venta -->
  <div class="corte-ticket">
    <div class="corte-ticket__marca">
      <strong>La Madalena</strong>
      <span>SIGR · Corte de caja</span>
    </div>

    <dl class="corte-ticket__datos">
      <div><dt>Corte</dt><dd>#{{ corte.idCorte }}</dd></div>
      <div><dt>Cajero</dt><dd>{{ corte.cajeroNombre }}</dd></div>
      <div><dt>Apertura</dt><dd>{{ fecha(corte.inicio) }}</dd></div>
      <div><dt>Cierre</dt><dd>{{ fecha(corte.fin) }}</dd></div>
      <div><dt>Cobros</dt><dd class="numero">{{ corte.cobros }}</dd></div>
    </dl>

    <table class="corte-ticket__tabla">
      <caption class="corte-ticket__titulo">Ventas por método</caption>
      <thead>
        <tr><th scope="col">Método</th><th scope="col">Pagos</th><th scope="col">Importe</th></tr>
      </thead>
      <tbody>
        <tr v-for="fila in corte.desglose" :key="fila.metodo">
          <td>{{ fila.metodo }}</td>
          <td class="numero">{{ fila.cobros }}</td>
          <td class="numero">{{ moneda(fila.monto) }}</td>
        </tr>
      </tbody>
    </table>

    <p class="corte-ticket__total"><span>Total vendido</span><strong class="numero">{{ moneda(corte.totalVentas) }}</strong></p>

    <p class="corte-ticket__titulo">Efectivo en caja</p>
    <dl class="corte-ticket__cuadre">
      <div><dt>Fondo inicial</dt><dd class="numero">{{ moneda(corte.fondoInicial) }}</dd></div>
      <div><dt>+ Cobrado en efectivo</dt><dd class="numero">{{ moneda(efectivoCobrado) }}</dd></div>
      <div class="corte-ticket__fuerte"><dt>= Esperado</dt><dd class="numero">{{ moneda(corte.efectivoEsperado) }}</dd></div>
      <template v-if="corte.efectivoContado !== null">
        <div><dt>Contado</dt><dd class="numero">{{ moneda(corte.efectivoContado) }}</dd></div>
        <div v-if="resultado && corte.diferencia !== null" class="corte-ticket__resultado" :class="resultado.clase">
          <dt>{{ resultado.texto }}</dt>
          <dd class="numero">{{ moneda(Math.abs(corte.diferencia)) }}</dd>
        </div>
      </template>
    </dl>
    <p v-if="corte.efectivoContado === null" class="corte-ticket__nota">
      Corte anterior al conteo de efectivo<template v-if="corte.totalReportado !== null">: se reportaron {{ moneda(corte.totalReportado) }} en ventas</template>.
    </p>

    <div class="corte-ticket__firmas">
      <span>Firma cajero</span>
      <span>Firma gerente</span>
    </div>
  </div>
</template>

<style scoped>
.corte-ticket {
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

.corte-ticket__marca {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1mm;
  padding-bottom: 3mm;
  border-bottom: 1px dashed #555;
  text-align: center;
}

.corte-ticket__marca strong {
  font-family: var(--fuente-titulo);
  font-size: 18px;
  letter-spacing: -0.02em;
}

.corte-ticket__marca span,
.corte-ticket__titulo {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.corte-ticket__titulo {
  margin: 3mm 0 1mm;
  font-weight: 700;
  text-align: left;
}

.corte-ticket__datos,
.corte-ticket__cuadre {
  display: grid;
  gap: 1mm;
  margin: 3mm 0;
}

.corte-ticket__datos {
  padding-bottom: 3mm;
  border-bottom: 1px dashed #555;
}

.corte-ticket__datos div,
.corte-ticket__cuadre div {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}

.corte-ticket__datos dt,
.corte-ticket__datos dd,
.corte-ticket__cuadre dt,
.corte-ticket__cuadre dd {
  margin: 0;
}

.corte-ticket__datos dt {
  color: #555;
}

.corte-ticket__tabla {
  width: 100%;
  margin: 0 0 3mm;
  border-collapse: collapse;
  font-size: 10.5px;
}

.corte-ticket__tabla th,
.corte-ticket__tabla td {
  padding: 1.2mm 0;
  text-align: left;
  border-bottom: 1px dotted #aaa;
}

.corte-ticket__tabla th:not(:first-child),
.corte-ticket__tabla td:not(:first-child) {
  padding-left: 1.5mm;
  text-align: right;
  white-space: nowrap;
}

.corte-ticket__total {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
  margin: 0;
  padding: 2mm 0;
  border-top: 2px solid #111;
  border-bottom: 1px dashed #555;
  font-size: 13px;
}

.corte-ticket__fuerte {
  padding-top: 1mm;
  border-top: 1px solid #111;
  font-weight: 700;
}

.corte-ticket__resultado {
  padding: 1mm 1.5mm;
  border: 1.5px solid currentColor;
  font-weight: 700;
}

.corte-ticket__resultado--cuadra {
  color: #1f4a2f;
}

.corte-ticket__resultado--faltante {
  color: #7a1818;
}

.corte-ticket__resultado--sobrante {
  color: #6e4000;
}

.corte-ticket__nota {
  margin: 0 0 3mm;
  color: #555;
  font-size: 10px;
}

.corte-ticket__firmas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm;
  margin-top: 10mm;
  text-align: center;
  font-size: 9.5px;
}

.corte-ticket__firmas span {
  padding-top: 1mm;
  border-top: 1px solid #111;
}

@media print {
  .corte-ticket {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0;
    box-shadow: none;
    font-size: 10.5px;
    line-height: 1.35;
  }

  .corte-ticket__resultado {
    color: #111;
  }
}
</style>
