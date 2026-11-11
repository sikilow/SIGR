<script setup lang="ts">
import { computed } from 'vue'
import type { CorteDetalle } from '../types'
import { coincideConVentas, resumirDesglose } from '../utils/corteVista'

const props = defineProps<{
  corte: CorteDetalle
  /** Solo gerencia: compara el efectivo esperado con el contado. */
  mostrarCuadre?: boolean
}>()

const resumen = computed(() => resumirDesglose(props.corte.desglose))
const totalesCoinciden = computed(() => coincideConVentas(resumen.value.totalCobrado, props.corte.totalVentas))

const resultado = computed(() => {
  const diferencia = props.corte.diferencia
  if (diferencia === null) return null
  if (Math.abs(diferencia) < 0.005) return { texto: 'Cuadra', clase: 'cuadre__resultado--cuadra' }
  return diferencia < 0
    ? { texto: 'Faltante', clase: 'cuadre__resultado--faltante' }
    : { texto: 'Sobrante', clase: 'cuadre__resultado--sobrante' }
})

function moneda(cantidad: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad)
}
</script>

<template>
  <!-- Solo en pantalla: lo que se imprime es el ticket (ResumenCorte). -->
  <section class="vista-corte panel no-imprimir" :aria-label="`Resumen del corte ${corte.idCorte}`">
    <p v-if="mostrarCuadre && !totalesCoinciden" class="aviso aviso--error" role="alert">
      <span>
        Las ventas registradas suman {{ moneda(corte.totalVentas) }} y los pagos {{ moneda(resumen.totalCobrado) }}.
        Revisa este corte.
      </span>
    </p>

    <div class="vista-corte__principal">
      <div class="total">
        <p class="total__etiqueta">Total cobrado</p>
        <strong class="total__monto numero">{{ moneda(resumen.totalCobrado) }}</strong>
        <p class="total__meta">
          <span class="numero">{{ corte.cobros }}</span> {{ corte.cobros === 1 ? 'cobro' : 'cobros' }} · {{ corte.cajeroNombre }}
        </p>
      </div>

      <div class="desglose">
        <p class="desglose__titulo">Por método de pago</p>
        <ul class="desglose__lista">
          <li v-for="fila in resumen.filas" :key="fila.metodo" class="metodo">
            <span class="metodo__nombre">{{ fila.metodo }}</span>
            <span class="metodo__pagos"><span class="numero">{{ fila.cobros }}</span> {{ fila.cobros === 1 ? 'pago' : 'pagos' }}</span>
            <strong class="metodo__monto numero">{{ moneda(fila.monto) }}</strong>
            <span class="metodo__pista" aria-hidden="true">
              <span class="metodo__barra" :style="{ width: `${fila.proporcion * 100}%` }" />
            </span>
          </li>
        </ul>
      </div>
    </div>

    <template v-if="mostrarCuadre">
      <dl v-if="corte.efectivoContado !== null && resultado && corte.diferencia !== null" class="cuadre">
        <div class="cuadre__dato">
          <dt>Efectivo esperado</dt>
          <dd class="numero">{{ moneda(corte.efectivoEsperado) }}</dd>
          <dd class="cuadre__detalle">
            Fondo <span class="numero">{{ moneda(corte.fondoInicial) }}</span> + efectivo
            <span class="numero">{{ moneda(resumen.efectivoCobrado) }}</span>
          </dd>
        </div>
        <div class="cuadre__dato">
          <dt>Efectivo contado</dt>
          <dd class="numero">{{ moneda(corte.efectivoContado) }}</dd>
        </div>
        <div class="cuadre__dato cuadre__resultado" :class="resultado.clase">
          <dt>Diferencia</dt>
          <dd class="numero">{{ moneda(Math.abs(corte.diferencia)) }}</dd>
          <dd class="cuadre__detalle">{{ resultado.texto }}</dd>
        </div>
      </dl>
      <p v-else class="conteo__nota">Este corte es anterior al conteo de efectivo.</p>
    </template>

    <!-- Mismo mensaje haya o no diferencia: el texto no debe delatar el resultado del conteo. -->
    <div v-else-if="corte.efectivoContado !== null" class="conteo">
      <p class="conteo__dato">
        <span>Efectivo que contaste</span>
        <strong class="numero">{{ moneda(corte.efectivoContado) }}</strong>
      </p>
      <p class="conteo__nota">Conteo registrado. Pendiente de revisión por gerencia.</p>
    </div>
  </section>
</template>

<style scoped>
.vista-corte {
  display: grid;
  gap: var(--espacio-4);
  width: 100%;
  min-width: 0;
  container-type: inline-size;
}

.vista-corte p,
.vista-corte dl,
.vista-corte dd {
  margin: 0;
}

.vista-corte__principal {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  align-items: stretch;
  gap: var(--espacio-5);
}

.total {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--espacio-1);
  min-width: 0;
  padding: var(--espacio-5);
  border-radius: var(--radio);
  background: var(--color-primary-suave);
}

.total__etiqueta {
  font-size: var(--texto-lg);
  font-weight: 700;
}

.total__monto {
  font-family: var(--fuente-titulo);
  font-size: clamp(2.25rem, 8cqi, 3.75rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.total__meta {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  overflow-wrap: anywhere;
}

.desglose {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--espacio-3);
  min-width: 0;
}

.desglose__titulo {
  font-size: var(--texto-lg);
  font-weight: 700;
}

.desglose__lista {
  display: grid;
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.metodo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  column-gap: var(--espacio-3);
}

.metodo__nombre {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.metodo__pagos {
  grid-row: 2;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.metodo__monto {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  font-size: var(--texto-xl);
}

.metodo__pista {
  grid-column: 1 / -1;
  height: 8px;
  margin-top: var(--espacio-1);
  overflow: hidden;
  border-radius: 4px;
  background: var(--color-surface-2);
}

.metodo__barra {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--color-primary);
}

.cuadre {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--espacio-3);
  padding-top: var(--espacio-4);
  border-top: 1px solid var(--color-border);
}

.cuadre__dato {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--espacio-3);
  border-radius: var(--radio-sm);
  background: var(--color-surface-2);
}

.cuadre__dato dt {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.cuadre__dato dd {
  font-size: var(--texto-xl);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.cuadre__dato .cuadre__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 500;
}

.cuadre__resultado--cuadra {
  background: var(--color-cuenta-pagada-fondo);
}

.cuadre__resultado--faltante {
  background: var(--color-cancelado-fondo);
}

.cuadre__resultado--sobrante {
  background: var(--color-advertencia-fondo);
}

.cuadre__resultado--cuadra dt,
.cuadre__resultado--cuadra dd,
.cuadre__resultado--cuadra .cuadre__detalle {
  color: var(--color-cuenta-pagada-texto);
}

.cuadre__resultado--faltante dt,
.cuadre__resultado--faltante dd,
.cuadre__resultado--faltante .cuadre__detalle {
  color: var(--color-cancelado-texto);
}

.cuadre__resultado--sobrante dt,
.cuadre__resultado--sobrante dd,
.cuadre__resultado--sobrante .cuadre__detalle {
  color: var(--color-advertencia-texto);
}

.cuadre__resultado .cuadre__detalle {
  font-weight: 700;
}

.conteo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-5);
  padding-top: var(--espacio-4);
  border-top: 1px solid var(--color-border);
}

.conteo__dato {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--espacio-3);
}

.conteo__dato span {
  color: var(--color-muted);
  font-weight: 600;
}

.conteo__dato strong {
  font-size: var(--texto-xl);
}

.conteo__nota {
  color: var(--color-muted);
}

@container (max-width: 30rem) {
  .vista-corte__principal,
  .cuadre {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
