<script setup lang="ts">
// Gerente → Cortes y ventas → Reporte de ventas (RF-VEN-003 historial y RF-VEN-004 reporte). Botones de periodo (día,
// semana, mes, trimestre, semestre, año o un rango propio) con flechas para ir al anterior o al siguiente; resumen,
// gráfica en el tiempo, desgloses (métodos, meseros, productos, categorías, secciones, horas) y el historial de ventas
// con filtros. «Descargar Excel» exporta lo mismo, y el gerente elige qué hojas incluir.
import { computed, onMounted, ref, watch } from 'vue'
import BarrasRanking, { type FilaRanking } from '../../components/BarrasRanking.vue'
import CajaPestanas from '../../components/CajaPestanas.vue'
import GraficaVentas from '../../components/GraficaVentas.vue'
import { ErrorServicio, servicios } from '../../services'
import type { ReporteVentas } from '../../types'
import { formatearMoneda } from '../../utils/formato'
import {
  type Agrupacion,
  agrupacionSugerida,
  aDia,
  diasDelRango,
  etiquetaPeriodo,
  moverPeriodo,
  type Periodo,
  periodoEmpezado,
  periodoQueContiene,
  serieDeVentas,
  TIPOS_PERIODO,
  type TipoPeriodo,
} from '../../utils/periodos'
import { descargarVentasExcel, HOJAS_VENTAS, type HojaVentas } from '../../utils/ventasExcel'
import { vPermitir } from '../../utils/campos'

const MAX_DIAS = 731
const POR_PAGINA = 50

const hoy = new Date()
const periodo = ref<Periodo>(periodoQueContiene('mes', hoy))
const desdeTexto = ref(periodo.value.desde)
const hastaTexto = ref(periodo.value.hasta)
const reporte = ref<ReporteVentas | null>(null)
const cargando = ref(true)
const error = ref('')
let consulta = 0

const etiqueta = computed(() => etiquetaPeriodo(periodo.value))
const haySiguiente = computed(() => periodoEmpezado(moverPeriodo(periodo.value, 1), hoy))
const esActual = computed(() => periodo.value.tipo !== 'personalizado' && periodo.value.desde <= aDia(hoy) && aDia(hoy) <= periodo.value.hasta)

// ---------- Periodo ----------

function elegirTipo(tipo: TipoPeriodo) {
  if (tipo === 'personalizado') {
    // Se parte del periodo que ya se ve, para afinarlo.
    periodo.value = { tipo, desde: periodo.value.desde, hasta: periodo.value.hasta }
  } else {
    periodo.value = periodoQueContiene(tipo, hoy)
  }
}

function mover(pasos: number) {
  periodo.value = moverPeriodo(periodo.value, pasos)
}

function irAlActual() {
  periodo.value = periodoQueContiene(periodo.value.tipo, hoy)
}

const errorRango = computed(() => {
  if (!desdeTexto.value || !hastaTexto.value) return 'Elige las dos fechas.'
  if (desdeTexto.value > hastaTexto.value) return 'La fecha inicial no puede ser posterior a la final.'
  if (diasDelRango(desdeTexto.value, hastaTexto.value) > MAX_DIAS) return 'El rango no puede ser mayor a dos años.'
  return ''
})

function aplicarRango() {
  if (errorRango.value) return
  periodo.value = { tipo: 'personalizado', desde: desdeTexto.value, hasta: hastaTexto.value }
}

watch(
  periodo,
  (p) => {
    desdeTexto.value = p.desde
    hastaTexto.value = p.hasta
    agrupacion.value = agrupacionSugerida(p.desde, p.hasta)
    void cargar()
  },
  { deep: true },
)

async function cargar() {
  const numero = ++consulta
  cargando.value = true
  error.value = ''
  try {
    const datos = await servicios.caja.reporteVentas(periodo.value.desde, periodo.value.hasta)
    if (numero !== consulta) return // Llegó la respuesta de un periodo que ya no se ve.
    reporte.value = datos
    visibles.value = POR_PAGINA
  } catch (e) {
    if (numero !== consulta) return
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo cargar el reporte de ventas.'
  } finally {
    if (numero === consulta) cargando.value = false
  }
}

onMounted(() => void cargar())

// ---------- Resumen y gráfica ----------

const total = computed(() => reporte.value?.resumen.total ?? 0)
const cuentas = computed(() => reporte.value?.resumen.ventas ?? 0)
const ticket = computed(() => (cuentas.value > 0 ? total.value / cuentas.value : 0))
const estrella = computed(() => reporte.value?.porProducto[0] ?? null)

const agrupacion = ref<Agrupacion>(agrupacionSugerida(periodo.value.desde, periodo.value.hasta))
const dias = computed(() => diasDelRango(periodo.value.desde, periodo.value.hasta))
const agrupaciones = computed(() =>
  (
    [
      { valor: 'dia', texto: 'Por día', disponible: dias.value <= 92 },
      { valor: 'semana', texto: 'Por semana', disponible: dias.value >= 8 },
      { valor: 'mes', texto: 'Por mes', disponible: dias.value >= 28 },
    ] as const
  ).filter((a) => a.disponible),
)
const serie = computed(() => (reporte.value ? serieDeVentas(reporte.value.porDia, reporte.value.desde, reporte.value.hasta, agrupacion.value) : []))
const verTabla = ref(false)

// ---------- Desgloses ----------

/** Importe grande del resumen: «$2,325.00» con «MXN» chico aparte, para que no se parta en dos renglones. */
const importeCorto = (n: number) => formatearMoneda(n).replace(/\s*MXN$/, '')

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-MX')} ${n === 1 ? uno : varios}`

const filasMetodos = computed<FilaRanking[]>(() =>
  (reporte.value?.porMetodo ?? []).map((m) => ({ clave: m.metodo, nombre: m.metodo, detalle: plural(m.pagos, 'pago', 'pagos'), total: m.total })),
)
const filasMeseros = computed<FilaRanking[]>(() =>
  (reporte.value?.porMesero ?? []).map((m) => ({ clave: m.mesero, nombre: m.mesero, detalle: plural(m.cuentas, 'cuenta', 'cuentas'), total: m.total })),
)
const filasProductos = computed<FilaRanking[]>(() =>
  (reporte.value?.porProducto ?? []).map((p) => ({
    clave: `${p.categoria}|${p.producto}|${p.presentacion}`,
    nombre: p.presentacion ? `${p.producto} (${p.presentacion})` : p.producto,
    detalle: `${p.categoria} · ${plural(p.cantidad, 'pieza', 'piezas')}`,
    total: p.total,
  })),
)
const filasCategorias = computed<FilaRanking[]>(() =>
  (reporte.value?.porCategoria ?? []).map((c) => ({ clave: c.categoria, nombre: c.categoria, detalle: plural(c.cantidad, 'pieza', 'piezas'), total: c.total })),
)
const filasSecciones = computed<FilaRanking[]>(() =>
  (reporte.value?.porSeccion ?? []).map((s) => ({ clave: s.seccion, nombre: s.seccion, detalle: plural(s.ventas, 'cuenta', 'cuentas'), total: s.total })),
)
const filasHoras = computed<FilaRanking[]>(() =>
  [...(reporte.value?.porHora ?? [])]
    .sort((a, b) => b.total - a.total)
    .map((h) => ({
      clave: String(h.hora),
      nombre: `${String(h.hora).padStart(2, '0')}:00 a ${String(h.hora).padStart(2, '0')}:59`,
      detalle: plural(h.ventas, 'cuenta', 'cuentas'),
      total: h.total,
    })),
)

// ---------- Historial ----------

const busqueda = ref('')
const filtroMetodo = ref('')
const filtroMesero = ref('')
const visibles = ref(POR_PAGINA)

const metodosHistorial = computed(() => [...new Set((reporte.value?.ventas ?? []).flatMap((v) => v.pagos.map((p) => p.metodo)))].sort())
const meserosHistorial = computed(() =>
  [...new Set((reporte.value?.ventas ?? []).flatMap((v) => v.meseros.split(',').map((m) => m.trim()).filter(Boolean)))].sort(),
)
const ventasFiltradas = computed(() => {
  const texto = busqueda.value.trim().replace(/^#/, '')
  return (reporte.value?.ventas ?? []).filter(
    (v) =>
      (!texto || String(v.idVenta) === texto || String(v.idCuenta) === texto || String(v.mesaNumero) === texto) &&
      (!filtroMetodo.value || v.pagos.some((p) => p.metodo === filtroMetodo.value)) &&
      (!filtroMesero.value || v.meseros.split(',').some((m) => m.trim() === filtroMesero.value)),
  )
})
const totalFiltrado = computed(() => ventasFiltradas.value.reduce((s, v) => s + Math.round(v.total * 100), 0) / 100)
watch([busqueda, filtroMetodo, filtroMesero], () => (visibles.value = POR_PAGINA))

const formatoFecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
const formatoHora = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })

function textoPagos(pagos: ReadonlyArray<{ metodo: string; monto: number }>): string {
  return pagos.length === 1 ? pagos[0]!.metodo : pagos.map((p) => `${p.metodo} ${formatearMoneda(p.monto)}`).join(' + ')
}

// ---------- Excel ----------

const hojas = ref<Set<HojaVentas>>(new Set(HOJAS_VENTAS.map((h) => h.hoja)))
const descargando = ref(false)
const errorExcel = ref('')

function alternarHoja(hoja: HojaVentas, incluir: boolean) {
  const nuevas = new Set(hojas.value)
  if (incluir) nuevas.add(hoja)
  else nuevas.delete(hoja)
  hojas.value = nuevas
}

async function descargar() {
  if (!reporte.value || descargando.value) return
  descargando.value = true
  errorExcel.value = ''
  try {
    await descargarVentasExcel(reporte.value, { etiqueta: etiqueta.value, agrupacion: agrupacion.value, hojas: hojas.value })
  } catch {
    errorExcel.value = 'No se pudo generar el Excel. Vuelve a intentarlo.'
  } finally {
    descargando.value = false
  }
}
</script>

<template>
  <section class="pagina ventas" aria-labelledby="ventas-titulo">
    <header class="encabezado">
      <div>
        <p class="sobretitulo">Gerencia</p>
        <h2 id="ventas-titulo">Reporte de ventas</h2>
        <p>Lo vendido en el periodo que elijas: totales, qué se vendió, quién lo vendió y el historial de cada cobro.</p>
      </div>
    </header>

    <CajaPestanas />

    <!-- Periodo -->
    <section class="panel periodo" aria-label="Periodo del reporte">
      <div class="periodo__tipos" role="group" aria-label="Tipo de periodo">
        <button
          v-for="t in TIPOS_PERIODO"
          :key="t.tipo"
          type="button"
          class="chip"
          :class="{ 'chip--activo': periodo.tipo === t.tipo }"
          :aria-pressed="periodo.tipo === t.tipo"
          @click="elegirTipo(t.tipo)"
        >
          {{ t.texto }}
        </button>
      </div>

      <div class="periodo__barra">
        <div class="periodo__navegar">
          <button type="button" class="btn btn--secundario btn--icono" aria-label="Periodo anterior" @click="mover(-1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <p class="periodo__etiqueta" aria-live="polite">{{ etiqueta }}</p>
          <button type="button" class="btn btn--secundario btn--icono" aria-label="Periodo siguiente" :disabled="!haySiguiente" @click="mover(1)">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <button v-if="periodo.tipo !== 'personalizado' && !esActual" type="button" class="btn btn--secundario" @click="irAlActual">
            {{ { dia: 'Hoy', semana: 'Esta semana', mes: 'Este mes', trimestre: 'Este trimestre', semestre: 'Este semestre', anio: 'Este año' }[periodo.tipo] }}
          </button>
        </div>

        <div class="periodo__excel">
          <button type="button" class="btn" :disabled="!reporte || cargando || descargando || cuentas === 0" @click="descargar">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            {{ descargando ? 'Generando…' : 'Descargar Excel' }}
          </button>
        </div>
      </div>

      <form v-if="periodo.tipo === 'personalizado'" class="periodo__rango" novalidate @submit.prevent="aplicarRango">
        <div class="campo">
          <label for="ventas-desde">Desde</label>
          <input id="ventas-desde" v-model="desdeTexto" type="date" :max="hastaTexto || undefined" :aria-invalid="errorRango ? 'true' : undefined" aria-describedby="ventas-rango-error" />
        </div>
        <div class="campo">
          <label for="ventas-hasta">Hasta</label>
          <input id="ventas-hasta" v-model="hastaTexto" type="date" :min="desdeTexto || undefined" :aria-invalid="errorRango ? 'true' : undefined" aria-describedby="ventas-rango-error" />
        </div>
        <button class="btn" type="submit" :disabled="!!errorRango">Ver rango</button>
        <p id="ventas-rango-error" class="texto-error periodo__error">{{ errorRango }}</p>
      </form>

      <details class="periodo__hojas">
        <summary>Elegir qué incluye el Excel ({{ hojas.size + 1 }} hojas)</summary>
        <p class="periodo__ayuda">La hoja «Resumen» siempre va. Quita las que no necesites.</p>
        <div class="periodo__casillas">
          <label v-for="h in HOJAS_VENTAS" :key="h.hoja" class="casilla">
            <input type="checkbox" :checked="hojas.has(h.hoja)" @change="alternarHoja(h.hoja, ($event.target as HTMLInputElement).checked)" />
            <span>{{ h.texto }}</span>
          </label>
        </div>
      </details>
      <p v-if="errorExcel" class="texto-error" role="alert">{{ errorExcel }}</p>
    </section>

    <div v-if="error" class="aviso aviso--error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="btn btn--secundario" @click="cargar">Reintentar</button>
    </div>

    <template v-if="cargando && !reporte">
      <div class="kpis">
        <div v-for="n in 4" :key="n" class="esqueleto kpi" aria-hidden="true" />
      </div>
      <p class="solo-lectores" role="status">Cargando reporte…</p>
    </template>

    <template v-else-if="reporte">
      <div class="contenido" :class="{ 'contenido--cargando': cargando }" :aria-busy="cargando">
        <!-- Resumen -->
        <div class="kpis">
          <div class="panel kpi">
            <span class="kpi__titulo">Total vendido</span>
            <strong class="kpi__valor numero">{{ importeCorto(total) }}<small class="kpi__moneda">MXN</small></strong>
          </div>
          <div class="panel kpi">
            <span class="kpi__titulo">Cuentas cobradas</span>
            <strong class="kpi__valor numero">{{ cuentas.toLocaleString('es-MX') }}</strong>
          </div>
          <div class="panel kpi">
            <span class="kpi__titulo">Ticket promedio</span>
            <strong class="kpi__valor numero">{{ importeCorto(ticket) }}<small class="kpi__moneda">MXN</small></strong>
          </div>
          <div class="panel kpi">
            <span class="kpi__titulo">Lo más vendido</span>
            <strong class="kpi__valor kpi__valor--texto">{{ estrella ? estrella.producto : '—' }}</strong>
            <span v-if="estrella" class="kpi__detalle">{{ plural(estrella.cantidad, 'pieza', 'piezas') }} · {{ formatearMoneda(estrella.total) }}</span>
          </div>
        </div>

        <!-- Devoluciones aprobadas en el periodo (migración 034): el total vendido no las descuenta; el neto sí. -->
        <p v-if="reporte.resumen.devoluciones > 0" class="aviso aviso--info devoluciones-periodo" role="status">
          {{ plural(reporte.resumen.devoluciones, 'devolución aprobada', 'devoluciones aprobadas') }} en el periodo por
          <strong class="numero">{{ formatearMoneda(reporte.resumen.devuelto) }}</strong> · Neto (vendido menos devuelto):
          <strong class="numero">{{ formatearMoneda(reporte.resumen.neto) }}</strong>
        </p>

        <div v-if="cuentas === 0" class="vacio panel">
          <h3>Sin ventas en {{ etiqueta.toLowerCase() }}</h3>
          <p>Aquí aparecen las cuentas que el cajero cobra. Prueba con otro periodo.</p>
        </div>

        <template v-else>
          <!-- Ventas en el tiempo -->
          <section class="panel bloque" aria-labelledby="ventas-tiempo">
            <header class="bloque__cabecera">
              <h3 id="ventas-tiempo">Ventas en el tiempo</h3>
              <div class="bloque__acciones">
                <div v-if="agrupaciones.length > 1" class="segmentado" role="group" aria-label="Agrupar la gráfica">
                  <button
                    v-for="a in agrupaciones"
                    :key="a.valor"
                    type="button"
                    :aria-pressed="agrupacion === a.valor"
                    :class="{ 'segmentado--activo': agrupacion === a.valor }"
                    @click="agrupacion = a.valor"
                  >
                    {{ a.texto }}
                  </button>
                </div>
                <button type="button" class="btn btn--secundario" :aria-expanded="verTabla" @click="verTabla = !verTabla">
                  {{ verTabla ? 'Ver gráfica' : 'Ver como tabla' }}
                </button>
              </div>
            </header>
            <GraficaVentas v-if="!verTabla" :puntos="serie" />
            <div v-else class="tabla-contenedor">
              <table class="tabla">
                <thead>
                  <tr><th scope="col">Periodo</th><th scope="col" class="num">Cuentas</th><th scope="col" class="num">Total</th></tr>
                </thead>
                <tbody>
                  <tr v-for="p in serie" :key="p.clave">
                    <td>{{ p.etiqueta }}</td>
                    <td class="num numero">{{ p.ventas }}</td>
                    <td class="num numero">{{ formatearMoneda(p.total) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Desgloses -->
          <div class="rejilla">
            <section class="panel bloque" aria-labelledby="ventas-metodos">
              <h3 id="ventas-metodos">Métodos de pago</h3>
              <BarrasRanking :filas="filasMetodos" :total-general="total" />
            </section>
            <section class="panel bloque" aria-labelledby="ventas-meseros">
              <h3 id="ventas-meseros">Meseros</h3>
              <p class="bloque__nota">Importe de los productos que pidió cada uno.</p>
              <BarrasRanking :filas="filasMeseros" :total-general="total" />
            </section>
            <section class="panel bloque bloque--ancho" aria-labelledby="ventas-productos">
              <h3 id="ventas-productos">Productos más vendidos</h3>
              <BarrasRanking :filas="filasProductos" :total-general="total" :limite="10" numerada />
            </section>
            <section class="panel bloque" aria-labelledby="ventas-categorias">
              <h3 id="ventas-categorias">Categorías</h3>
              <BarrasRanking :filas="filasCategorias" :total-general="total" />
            </section>
            <section class="panel bloque" aria-labelledby="ventas-secciones">
              <h3 id="ventas-secciones">Secciones</h3>
              <p class="bloque__nota">Salón, terraza, para llevar… según la mesa de cada cuenta.</p>
              <BarrasRanking :filas="filasSecciones" :total-general="total" />
            </section>
            <section class="panel bloque bloque--ancho" aria-labelledby="ventas-horas">
              <h3 id="ventas-horas">Horas con más venta</h3>
              <BarrasRanking :filas="filasHoras" :total-general="total" :limite="6" />
            </section>
          </div>

          <!-- Historial -->
          <section class="panel bloque" aria-labelledby="ventas-historial">
            <header class="bloque__cabecera">
              <h3 id="ventas-historial">Historial de ventas</h3>
              <p class="bloque__nota" role="status">
                {{ plural(ventasFiltradas.length, 'venta', 'ventas') }} · {{ formatearMoneda(totalFiltrado) }}
              </p>
            </header>
            <p v-if="reporte.ventasTruncadas" class="aviso">
              Este periodo tiene {{ cuentas.toLocaleString('es-MX') }} ventas; el historial muestra las {{ reporte.ventas.length.toLocaleString('es-MX') }}
              más recientes. Los totales y desgloses sí cuentan todas. Elige un periodo más corto para ver el resto.
            </p>
            <form class="historial__filtros" role="search" aria-label="Filtrar historial" @submit.prevent>
              <div class="campo">
                <label for="ventas-buscar">Venta, cuenta o mesa</label>
                <input id="ventas-buscar" v-permitir="'digitos'" v-model="busqueda" type="search" inputmode="numeric" placeholder="Ej. 128" />
              </div>
              <div class="campo">
                <label for="ventas-metodo">Método de pago</label>
                <select id="ventas-metodo" v-model="filtroMetodo">
                  <option value="">Todos</option>
                  <option v-for="m in metodosHistorial" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>
              <div class="campo">
                <label for="ventas-mesero">Mesero</label>
                <select id="ventas-mesero" v-model="filtroMesero">
                  <option value="">Todos</option>
                  <option v-for="m in meserosHistorial" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>
            </form>

            <p v-if="ventasFiltradas.length === 0" class="bloque__nota">Ninguna venta coincide con los filtros.</p>
            <div v-else class="tabla-contenedor">
              <table class="tabla historial">
                <thead>
                  <tr>
                    <th scope="col">Venta</th>
                    <th scope="col">Fecha y hora</th>
                    <th scope="col">Mesa</th>
                    <th scope="col">Mesero(s)</th>
                    <th scope="col">Pago</th>
                    <th scope="col" class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="v in ventasFiltradas.slice(0, visibles)" :key="v.idVenta">
                    <td class="numero">#{{ v.idVenta }}<span class="historial__sub">Cuenta {{ v.idCuenta }}</span></td>
                    <td class="historial__fecha">{{ formatoFecha.format(v.fechaHora) }}<span class="historial__sub">{{ formatoHora.format(v.fechaHora) }} · {{ v.cajero }}</span></td>
                    <td>
                      Mesa {{ v.mesaNumero }}
                      <span class="historial__sub">{{ v.canal ? `Para llevar · ${v.canal}` : (v.seccion ?? '') }}</span>
                    </td>
                    <td>{{ v.meseros || '—' }}</td>
                    <td>{{ textoPagos(v.pagos) }}</td>
                    <td class="num numero historial__total"><strong>{{ formatearMoneda(v.total) }}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button v-if="ventasFiltradas.length > visibles" type="button" class="btn btn--secundario historial__mas" @click="visibles += POR_PAGINA">
              Mostrar {{ Math.min(POR_PAGINA, ventasFiltradas.length - visibles) }} más (de {{ ventasFiltradas.length - visibles }})
            </button>
          </section>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ventas {
  max-width: 1200px;
}

.encabezado h2 {
  font-size: clamp(1.9rem, 1.4rem + 1.8vw, 2.6rem);
}

/* ---------- Periodo ---------- */
.periodo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.periodo__tipos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.chip {
  min-height: 44px;
  padding: 0 var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.chip:hover {
  border-color: var(--color-primary);
}

.chip:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 2px;
}

.chip--activo {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.periodo__barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.periodo__navegar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-2);
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

.periodo__rango {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--espacio-3);
}

.periodo__rango .campo {
  flex: 1 1 170px;
}

.periodo__error {
  flex-basis: 100%;
  margin: 0;
}

.periodo__error:empty {
  display: none;
}

.periodo__hojas summary {
  color: var(--color-primary-dark);
  font-weight: 650;
  cursor: pointer;
}

.periodo__ayuda {
  margin: var(--espacio-2) 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.periodo__casillas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: var(--espacio-2);
}

.casilla {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: 44px;
  cursor: pointer;
}

.casilla input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-primary);
}

/* ---------- Contenido ---------- */
.contenido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  transition: opacity 0.15s;
}

.contenido--cargando {
  opacity: 0.55;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--espacio-3);
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-1);
  min-height: 104px;
}

.kpi__titulo {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
}

.kpi__valor {
  font-size: clamp(1.4rem, 1.1rem + 1vw, 1.9rem);
  line-height: 1.15;
  /* El importe no se parte (no tiene espacios); si «MXN» no cabe al lado, baja a la línea siguiente */
  white-space: normal;
}

.kpi__moneda {
  display: inline-block;
  margin-left: 0.3em;
  white-space: nowrap;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 650;
}

.kpi__valor--texto {
  font-size: var(--texto-lg);
  white-space: normal;
  overflow-wrap: anywhere;
}

.kpi__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.bloque {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
}

.bloque h3 {
  margin: 0;
}

.bloque__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.bloque__acciones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.bloque__nota {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.segmentado {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface-2);
}

.segmentado button {
  min-height: 40px;
  padding: 0 var(--espacio-3);
  border: 0;
  border-radius: calc(var(--radio-sm) - 2px);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.segmentado button:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 1px;
}

.segmentado .segmentado--activo {
  background: var(--color-surface);
  color: var(--color-primary-dark);
  box-shadow: 0 1px 3px rgb(38 28 22 / 0.12);
}

.rejilla {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--espacio-4);
}

.bloque--ancho {
  grid-column: 1 / -1;
}

.tabla-contenedor {
  overflow-x: auto;
}

.num {
  text-align: right;
}

.historial__filtros {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-3);
}

.historial__filtros .campo {
  flex: 1 1 180px;
}

.historial {
  min-width: 720px;
  font-size: var(--texto-sm);
}

.historial th,
.historial td {
  padding: var(--espacio-2) var(--espacio-3);
  vertical-align: top;
}

.historial__fecha,
.historial__total {
  white-space: nowrap;
}

.historial__sub {
  display: block;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.historial__mas {
  align-self: center;
}

@media (max-width: 52em) {
  .rejilla {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
