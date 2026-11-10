<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ResumenCorte from '../../components/ResumenCorte.vue'
import { ErrorServicio, servicios } from '../../services'
import type { CorteDetalle, CorteResumen } from '../../types'

/** Fecha local AAAA-MM-DD para los campos de fecha. */
function diaLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

const hoy = new Date()
const haceUnaSemana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6)

const desde = ref(diaLocal(haceUnaSemana))
const hasta = ref(diaLocal(hoy))
const cortes = ref<CorteResumen[]>([])
const seleccionado = ref<CorteDetalle | null>(null)
const cargando = ref(true)
const cargandoDetalle = ref(false)
const error = ref('')

const rangoInvalido = computed(() => !!desde.value && !!hasta.value && desde.value > hasta.value)
const totalVendido = computed(() => cortes.value.reduce((suma, corte) => suma + Math.round(corte.totalVentas * 100), 0) / 100)
const faltantes = computed(() => cortes.value.filter((corte) => (corte.diferencia ?? 0) <= -0.005).length)

function moneda(cantidad: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad)
}

function fecha(fechaHora: Date): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(fechaHora)
}

function resultado(corte: CorteResumen): { texto: string; clase: string } {
  if (corte.diferencia === null) return { texto: 'Sin conteo', clase: 'pastilla--neutra' }
  if (Math.abs(corte.diferencia) < 0.005) return { texto: 'Cuadra', clase: 'pastilla--cuadra' }
  return corte.diferencia < 0
    ? { texto: `Faltan ${moneda(-corte.diferencia)}`, clase: 'pastilla--faltante' }
    : { texto: `Sobran ${moneda(corte.diferencia)}`, clase: 'pastilla--sobrante' }
}

async function cargar() {
  if (rangoInvalido.value) {
    error.value = 'La fecha inicial no puede ser posterior a la final.'
    return
  }
  cargando.value = true
  error.value = ''
  try {
    cortes.value = await servicios.caja.listarCortes({ desde: desde.value || undefined, hasta: hasta.value || undefined })
    if (seleccionado.value && !cortes.value.some((corte) => corte.idCorte === seleccionado.value?.idCorte)) {
      seleccionado.value = null
    }
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar los cortes.'
  } finally {
    cargando.value = false
  }
}

async function ver(corte: CorteResumen) {
  cargandoDetalle.value = true
  error.value = ''
  try {
    seleccionado.value = await servicios.caja.obtenerCorte(corte.idCorte)
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo abrir el corte.'
  } finally {
    cargandoDetalle.value = false
  }
}

function imprimir() {
  window.print()
}

onMounted(() => void cargar())
</script>

<template>
  <section class="pagina cortes" aria-labelledby="cortes-titulo">
    <header class="encabezado no-imprimir">
      <div>
        <p class="sobretitulo">Gerencia</p>
        <h2 id="cortes-titulo">Cortes de caja</h2>
        <p>Revisa cada cierre de turno: lo vendido por método de pago y si el efectivo cuadró.</p>
      </div>
    </header>

    <form class="filtros panel no-imprimir" role="search" aria-label="Filtrar cortes" @submit.prevent="cargar">
      <div class="campo">
        <label for="cortes-desde">Desde</label>
        <input id="cortes-desde" v-model="desde" type="date" :max="hasta || undefined" :aria-invalid="rangoInvalido ? 'true' : undefined" />
      </div>
      <div class="campo">
        <label for="cortes-hasta">Hasta</label>
        <input id="cortes-hasta" v-model="hasta" type="date" :min="desde || undefined" :aria-invalid="rangoInvalido ? 'true' : undefined" />
      </div>
      <button class="btn" type="submit" :disabled="cargando">Buscar</button>
    </form>

    <div v-if="error" class="aviso aviso--error no-imprimir" role="alert">
      <p>{{ error }}</p>
    </div>

    <div class="paneles">
      <section class="lista no-imprimir" aria-label="Cortes cerrados">
        <template v-if="cargando">
          <div v-for="n in 4" :key="n" class="esqueleto" aria-hidden="true" />
          <p class="solo-lectores" role="status">Cargando cortes…</p>
        </template>

        <div v-else-if="cortes.length === 0" class="vacio">
          <h3>Sin cortes en estas fechas</h3>
          <p>Los cortes aparecen aquí cuando el cajero cierra su turno.</p>
        </div>

        <template v-else>
          <p class="lista__resumen" role="status">
            {{ cortes.length }} {{ cortes.length === 1 ? 'corte' : 'cortes' }} ·
            {{ moneda(totalVendido) }} vendidos<template v-if="faltantes"> · {{ faltantes }} con faltante</template>
          </p>
          <ul class="filas">
            <li v-for="corte in cortes" :key="corte.idCorte">
              <button
                type="button"
                class="fila"
                :class="{ 'fila--seleccionada': seleccionado?.idCorte === corte.idCorte }"
                :aria-pressed="seleccionado?.idCorte === corte.idCorte"
                @click="ver(corte)"
              >
                <span class="fila__cabecera">
                  <strong class="numero">Corte #{{ corte.idCorte }}</strong>
                  <span class="pastilla" :class="resultado(corte).clase">{{ resultado(corte).texto }}</span>
                </span>
                <span class="fila__meta">{{ corte.cajeroNombre }} · {{ fecha(corte.inicio) }}</span>
                <span class="fila__pie">
                  <span>{{ corte.cobros }} {{ corte.cobros === 1 ? 'cobro' : 'cobros' }}</span>
                  <strong class="numero">{{ moneda(corte.totalVentas) }}</strong>
                </span>
              </button>
            </li>
          </ul>
        </template>
      </section>

      <section class="detalle" aria-label="Detalle del corte" :aria-busy="cargandoDetalle">
        <div v-if="!seleccionado" class="vacio no-imprimir">
          <h3>Elige un corte</h3>
          <p>Verás el desglose por método de pago y el cuadre de efectivo, listo para imprimir.</p>
        </div>
        <template v-else>
          <div class="detalle__barra no-imprimir">
            <button class="btn btn--secundario" type="button" @click="seleccionado = null">Cerrar</button>
            <button class="btn" type="button" @click="imprimir">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
                <path d="M6 14h12v7H6z" />
              </svg>
              Imprimir corte
            </button>
          </div>
          <ResumenCorte :corte="seleccionado" />
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.cortes {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  max-width: 1200px;
}

.encabezado h2 {
  font-size: clamp(1.9rem, 1.4rem + 1.8vw, 2.6rem);
}

.encabezado p:last-child {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--espacio-3);
}

.filtros .campo {
  flex: 1 1 170px;
}

.paneles {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--espacio-5);
}

.lista {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
}

.lista__resumen {
  margin: 0;
  color: var(--color-muted);
  font-weight: 600;
}

.filas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.fila {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-1);
  width: 100%;
  padding: var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.fila:hover {
  border-color: var(--color-borde-fuerte);
}

.fila:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 2px;
}

.fila--seleccionada {
  border-color: var(--color-primary);
  background: var(--color-primary-suave);
}

.fila__cabecera,
.fila__pie {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2);
}

.fila__meta,
.fila__pie span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.pastilla {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--texto-sm);
  font-weight: 700;
  white-space: nowrap;
}

.pastilla--cuadra {
  background: var(--color-cuenta-pagada-fondo);
  color: var(--color-cuenta-pagada-texto);
}

.pastilla--faltante {
  background: var(--color-cancelado-fondo);
  color: var(--color-cancelado-texto);
}

.pastilla--sobrante {
  background: var(--color-advertencia-fondo);
  color: var(--color-advertencia-texto);
}

.pastilla--neutra {
  background: var(--color-deshabilitado-fondo);
  color: var(--color-deshabilitado-texto);
}

.esqueleto {
  min-height: 96px;
}

.detalle {
  position: sticky;
  top: var(--espacio-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--espacio-4);
  min-width: 0;
}

.detalle__barra {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--espacio-2);
  width: 100%;
}

@media (max-width: 52em) {
  .paneles {
    grid-template-columns: minmax(0, 1fr);
  }

  .detalle {
    position: static;
  }
}

@media print {
  @page {
    size: 80mm auto;
    margin: 3mm;
  }

  .cortes,
  .paneles,
  .detalle {
    display: block;
    max-width: none;
  }
}
</style>
