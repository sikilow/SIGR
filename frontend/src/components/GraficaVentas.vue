<script setup lang="ts">
// Gráfica de barras de lo vendido en el tiempo (una serie, un color). Al pasar el puntero o enfocar una barra con el
// teclado se ve el detalle (periodo, total y cuentas). Las etiquetas del eje X se espacian para que no se encimen. La
// misma información está en la tabla «Ver como tabla» y en la hoja «Ventas en el tiempo» del Excel.
import { computed, ref } from 'vue'
import { formatearMoneda } from '../utils/formato'
import type { PuntoSerie } from '../utils/periodos'

const props = defineProps<{ puntos: PuntoSerie[] }>()

const activo = ref<number | null>(null)

/** Tope del eje: el máximo redondeado hacia arriba a un número «bonito» (1, 2, 2.5 o 5 × 10ⁿ). */
const tope = computed(() => {
  const maximo = Math.max(...props.puntos.map((p) => p.total), 0)
  if (maximo <= 0) return 1
  const potencia = 10 ** Math.floor(Math.log10(maximo))
  const paso = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= maximo) ?? 10
  return paso * potencia
})
const lineas = computed(() => [1, 0.5, 0].map((f) => ({ fraccion: f, valor: tope.value * f })))
/** Cada cuántas barras se escribe la etiqueta del eje X (como máximo ~12 etiquetas). */
const cadaCuantas = computed(() => Math.max(1, Math.ceil(props.puntos.length / 12)))
const puntoActivo = computed(() => (activo.value === null ? null : (props.puntos[activo.value] ?? null)))

/** El recuadro se centra en la barra, pero en las orillas se alinea hacia adentro para no salirse. */
const estiloTooltip = computed(() => {
  if (activo.value === null) return {}
  const posicion = (activo.value + 0.5) / props.puntos.length
  const desplazar = posicion < 0.15 ? '0%' : posicion > 0.85 ? '-100%' : '-50%'
  return { left: `${posicion * 100}%`, transform: `translateX(${desplazar})` }
})

function compacto(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 }).format(valor)
}

function etiquetaBarra(p: PuntoSerie): string {
  return `${p.etiqueta}: ${formatearMoneda(p.total)}, ${p.ventas} ${p.ventas === 1 ? 'cuenta' : 'cuentas'}`
}
</script>

<template>
  <div class="grafica" @mouseleave="activo = null">
    <div class="grafica__eje-y" aria-hidden="true">
      <span v-for="l in lineas" :key="l.fraccion" class="grafica__marca" :style="{ bottom: `${l.fraccion * 100}%` }">{{ compacto(l.valor) }}</span>
    </div>
    <div class="grafica__area">
      <span v-for="l in lineas" :key="l.fraccion" class="grafica__linea" :style="{ bottom: `${l.fraccion * 100}%` }" aria-hidden="true" />
      <ol class="grafica__barras" :style="{ gap: puntos.length > 60 ? '1px' : '2px' }">
        <li
          v-for="(p, i) in puntos"
          :key="p.clave"
          class="grafica__columna"
          tabindex="0"
          :aria-label="etiquetaBarra(p)"
          @mouseenter="activo = i"
          @focus="activo = i"
          @blur="activo = null"
        >
          <span
            class="grafica__barra"
            :class="{ 'grafica__barra--activa': activo === i, 'grafica__barra--cero': p.total === 0 }"
            :style="{ height: `${(p.total / tope) * 100}%` }"
          />
        </li>
      </ol>
      <div v-if="puntoActivo" class="grafica__tooltip" role="status" :style="estiloTooltip">
        <strong>{{ puntoActivo.etiqueta }}</strong>
        <span class="numero">{{ formatearMoneda(puntoActivo.total) }}</span>
        <span>{{ puntoActivo.ventas }} {{ puntoActivo.ventas === 1 ? 'cuenta' : 'cuentas' }}</span>
      </div>
    </div>
    <div class="grafica__eje-x" aria-hidden="true">
      <span
        v-for="(p, i) in puntos"
        :key="p.clave"
        class="grafica__etiqueta"
        :style="{ visibility: i % cadaCuantas === 0 ? 'visible' : 'hidden' }"
      >{{ p.etiqueta }}</span>
    </div>
  </div>
</template>

<style scoped>
.grafica {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 220px auto;
  column-gap: var(--espacio-2);
}

.grafica__eje-y {
  position: relative;
  min-width: 3.5rem;
}

.grafica__marca {
  position: absolute;
  right: 0;
  transform: translateY(50%);
  color: var(--color-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.grafica__area {
  position: relative;
}

.grafica__linea {
  position: absolute;
  inset-inline: 0;
  border-top: 1px solid var(--color-border);
}

.grafica__barras {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  margin: 0;
  padding: 0;
  list-style: none;
}

.grafica__columna {
  display: flex;
  flex: 1 1 0;
  align-items: flex-end;
  height: 100%;
  min-width: 0;
  cursor: default;
}

.grafica__columna:focus-visible {
  outline: 2px solid var(--color-primary-dark);
  outline-offset: 1px;
}

.grafica__barra {
  display: block;
  width: 100%;
  max-width: 48px;
  margin-inline: auto;
  border-radius: 4px 4px 0 0;
  background: var(--color-primary);
}

.grafica__barra--activa {
  background: var(--color-primary-dark);
}

/* Un periodo sin ventas se marca con una línea fina, para distinguirlo de «sin datos». */
.grafica__barra--cero {
  height: 2px !important;
  background: var(--color-border);
}

.grafica__tooltip {
  position: absolute;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 9rem;
  padding: var(--espacio-2) var(--espacio-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  box-shadow: 0 4px 14px rgb(38 28 22 / 0.14);
  font-size: var(--texto-sm);
  pointer-events: none;
}

.grafica__eje-x {
  grid-column: 2;
  display: flex;
  margin-top: var(--espacio-2);
}

.grafica__etiqueta {
  flex: 1 1 0;
  min-width: 0;
  overflow: visible;
  color: var(--color-muted);
  font-size: 0.75rem;
  text-align: center;
  white-space: nowrap;
}
</style>
