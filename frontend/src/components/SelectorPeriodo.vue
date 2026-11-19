<script setup lang="ts">
// Selector de periodo de los reportes del gerente (reservaciones, mermas): día, semana, mes, trimestre, semestre, año o un
// rango propio, con flechas para ir al anterior o al siguiente. Es el mismo del reporte de ventas, para usarse con v-model.
// Cuando termina de armar un periodo, cambia `modelValue` (el padre carga el reporte).
import { computed, ref, watch } from 'vue'
import {
  aDia,
  diasDelRango,
  etiquetaPeriodo,
  moverPeriodo,
  type Periodo,
  periodoEmpezado,
  periodoQueContiene,
  TIPOS_PERIODO,
  type TipoPeriodo,
} from '../utils/periodos'

const props = withDefaults(defineProps<{ modelValue: Periodo; idBase: string; maxDias?: number }>(), { maxDias: 731 })
const emit = defineEmits<{ 'update:modelValue': [periodo: Periodo] }>()

const hoy = new Date()
const desdeTexto = ref(props.modelValue.desde)
const hastaTexto = ref(props.modelValue.hasta)

watch(
  () => props.modelValue,
  (p) => {
    desdeTexto.value = p.desde
    hastaTexto.value = p.hasta
  },
  { deep: true },
)

const etiqueta = computed(() => etiquetaPeriodo(props.modelValue))
const haySiguiente = computed(() => periodoEmpezado(moverPeriodo(props.modelValue, 1), hoy))
const esActual = computed(() => props.modelValue.tipo !== 'personalizado' && props.modelValue.desde <= aDia(hoy) && aDia(hoy) <= props.modelValue.hasta)

const errorRango = computed(() => {
  if (!desdeTexto.value || !hastaTexto.value) return 'Elige las dos fechas.'
  if (desdeTexto.value > hastaTexto.value) return 'La fecha inicial no puede ser posterior a la final.'
  if (diasDelRango(desdeTexto.value, hastaTexto.value) > props.maxDias) return 'El rango no puede ser mayor a dos años.'
  return ''
})

function elegirTipo(tipo: TipoPeriodo) {
  // «Personalizado» parte del periodo que ya se ve, para afinarlo.
  emit('update:modelValue', tipo === 'personalizado' ? { tipo, desde: props.modelValue.desde, hasta: props.modelValue.hasta } : periodoQueContiene(tipo, hoy))
}

const mover = (pasos: number) => emit('update:modelValue', moverPeriodo(props.modelValue, pasos))
const irAlActual = () => emit('update:modelValue', periodoQueContiene(props.modelValue.tipo, hoy))

function aplicarRango() {
  if (errorRango.value) return
  emit('update:modelValue', { tipo: 'personalizado', desde: desdeTexto.value, hasta: hastaTexto.value })
}

const textoActual: Record<Exclude<TipoPeriodo, 'personalizado'>, string> = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  trimestre: 'Este trimestre',
  semestre: 'Este semestre',
  anio: 'Este año',
}
</script>

<template>
  <section class="panel periodo" aria-label="Periodo del reporte">
    <div class="periodo__tipos" role="group" aria-label="Tipo de periodo">
      <button
        v-for="t in TIPOS_PERIODO"
        :key="t.tipo"
        type="button"
        class="chip"
        :class="{ 'chip--activo': modelValue.tipo === t.tipo }"
        :aria-pressed="modelValue.tipo === t.tipo"
        @click="elegirTipo(t.tipo)"
      >
        {{ t.texto }}
      </button>
    </div>

    <div class="periodo__navegar">
      <button type="button" class="btn btn--secundario btn--icono" aria-label="Periodo anterior" @click="mover(-1)">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <p class="periodo__etiqueta" aria-live="polite">{{ etiqueta }}</p>
      <button type="button" class="btn btn--secundario btn--icono" aria-label="Periodo siguiente" :disabled="!haySiguiente" @click="mover(1)">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      <button v-if="modelValue.tipo !== 'personalizado' && !esActual" type="button" class="btn btn--secundario" @click="irAlActual">
        {{ textoActual[modelValue.tipo as Exclude<TipoPeriodo, 'personalizado'>] }}
      </button>
    </div>

    <form v-if="modelValue.tipo === 'personalizado'" class="periodo__rango" novalidate @submit.prevent="aplicarRango">
      <div class="campo">
        <label :for="`${idBase}-desde`">Desde</label>
        <input :id="`${idBase}-desde`" v-model="desdeTexto" type="date" :max="hastaTexto || undefined" :aria-invalid="errorRango ? 'true' : undefined" :aria-describedby="`${idBase}-rango-error`" />
      </div>
      <div class="campo">
        <label :for="`${idBase}-hasta`">Hasta</label>
        <input :id="`${idBase}-hasta`" v-model="hastaTexto" type="date" :min="desdeTexto || undefined" :aria-invalid="errorRango ? 'true' : undefined" :aria-describedby="`${idBase}-rango-error`" />
      </div>
      <button class="btn" type="submit" :disabled="!!errorRango">Ver rango</button>
      <p :id="`${idBase}-rango-error`" class="texto-error periodo__error">{{ errorRango }}</p>
    </form>
  </section>
</template>

<style scoped>
.periodo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.periodo__tipos,
.periodo__navegar,
.periodo__rango {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.periodo__navegar {
  align-items: center;
}

.periodo__rango {
  align-items: flex-end;
  gap: var(--espacio-3);
}

.periodo__rango .campo {
  flex: 1 1 170px;
}

.periodo__etiqueta {
  min-width: 11rem;
  margin: 0;
  font-size: var(--texto-lg);
  font-weight: 700;
  text-align: center;
}

.periodo__etiqueta::first-letter {
  text-transform: uppercase;
}

.periodo__error {
  flex-basis: 100%;
  margin: 0;
}

.periodo__error:empty {
  display: none;
}
</style>
