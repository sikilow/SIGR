<script setup lang="ts">
// Gerente → Reservaciones → Reporte e inasistencias. De las reservaciones del periodo: cuántas llegaron, cuántas no llegaron
// (inasistencia: pasó la tolerancia y se marcaron vencidas), cuántas se cancelaron y cuántas siguen por llegar; en qué día de
// la semana, a qué hora y en qué sección fallan más, y los clientes con 2 o más inasistencias.
import { computed, onMounted, ref, watch } from 'vue'
import ReservacionesPestanas from '../../components/ReservacionesPestanas.vue'
import SelectorPeriodo from '../../components/SelectorPeriodo.vue'
import { ErrorServicio, servicios } from '../../services'
import type { ConteoReservaciones, ReporteReservaciones } from '../../types'
import { DIAS_SEMANA, tasaCancelacion, tasaInasistencia, textoHora, textoPorcentaje } from '../../utils/reporteReservaciones'
import { type Periodo, periodoQueContiene } from '../../utils/periodos'

const periodo = ref<Periodo>(periodoQueContiene('mes', new Date()))
const reporte = ref<ReporteReservaciones | null>(null)
const cargando = ref(true)
const error = ref('')
let consulta = 0

async function cargar() {
  const numero = ++consulta
  cargando.value = true
  error.value = ''
  try {
    const datos = await servicios.reportes.reporteReservaciones(periodo.value.desde, periodo.value.hasta)
    if (numero === consulta) reporte.value = datos
  } catch (e) {
    if (numero === consulta) error.value = e instanceof ErrorServicio ? e.message : 'No se pudo cargar el reporte de reservaciones.'
  } finally {
    if (numero === consulta) cargando.value = false
  }
}

watch(periodo, () => void cargar(), { deep: true })
onMounted(() => void cargar())

const resumen = computed(() => reporte.value?.resumen ?? null)
const sinDatos = computed(() => (resumen.value?.total ?? 0) === 0)

/** Filas de un desglose con su tasa de inasistencia, para la tabla. */
function conTasa<T extends ConteoReservaciones>(filas: T[]) {
  return filas.map((f) => ({ ...f, inasistencia: tasaInasistencia(f) }))
}

const filasSemana = computed(() => conTasa(reporte.value?.porDiaSemana ?? []).map((f) => ({ ...f, etiqueta: DIAS_SEMANA[f.diaSemana] ?? String(f.diaSemana) })))
const filasHora = computed(() => conTasa(reporte.value?.porHora ?? []).map((f) => ({ ...f, etiqueta: textoHora(f.hora) })))
const filasSeccion = computed(() => conTasa(reporte.value?.porSeccion ?? []).map((f) => ({ ...f, etiqueta: f.seccion })))
const filasDia = computed(() => conTasa(reporte.value?.porDia ?? []).map((f) => ({ ...f, etiqueta: f.dia.split('-').reverse().join('/') })))

/** El día de la semana, la hora o la sección con más inasistencias (la lectura rápida del reporte). */
function peor<T extends ConteoReservaciones & { etiqueta: string }>(filas: T[]): T | null {
  const candidatas = filas.filter((f) => f.llegaron + f.vencidas >= 3 && f.vencidas > 0)
  if (!candidatas.length) return null
  return candidatas.reduce((a, b) => ((tasaInasistencia(b) ?? 0) > (tasaInasistencia(a) ?? 0) ? b : a))
}
const peorDia = computed(() => peor(filasSemana.value))
const peorHora = computed(() => peor(filasHora.value))

const pct = (parte: number, total: number): string => (total > 0 ? `${(parte / total) * 100}%` : '0%')
const num = (n: number) => n.toLocaleString('es-MX')
</script>

<template>
  <section class="pagina reporte" aria-labelledby="rep-res-titulo">
    <header class="encabezado">
      <div>
        <p class="sobretitulo">Gerencia</p>
        <h2 id="rep-res-titulo">Reservaciones e inasistencias</h2>
        <p>Cuántas reservaciones llegaron, cuántas no, y cuándo y con quién fallan más. Cuenta por la fecha de la reservación.</p>
      </div>
    </header>

    <ReservacionesPestanas />
    <SelectorPeriodo v-model="periodo" id-base="rep-res" />

    <div v-if="error" class="aviso aviso--error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="btn btn--secundario" @click="cargar">Reintentar</button>
    </div>

    <template v-if="cargando && !reporte">
      <div class="kpis"><div v-for="n in 4" :key="n" class="esqueleto kpi" aria-hidden="true" /></div>
      <p class="solo-lectores" role="status">Cargando reporte…</p>
    </template>

    <div v-else-if="reporte && resumen" class="contenido" :class="{ 'contenido--cargando': cargando }" :aria-busy="cargando">
      <div v-if="sinDatos" class="vacio panel">
        <h3>Sin reservaciones en este periodo</h3>
        <p>Prueba con otro periodo.</p>
      </div>

      <template v-else>
        <div class="kpis">
          <div class="panel kpi">
            <span class="kpi__titulo">Reservaciones</span>
            <strong class="kpi__valor numero">{{ num(resumen.total) }}</strong>
            <span class="kpi__detalle">{{ num(resumen.personas) }} personas · {{ num(resumen.porLlegar) }} por llegar</span>
          </div>
          <div class="panel kpi">
            <span class="kpi__titulo">Llegaron</span>
            <strong class="kpi__valor numero">{{ num(resumen.llegaron) }}</strong>
            <span class="kpi__detalle">{{ num(resumen.personasLlegaron) }} personas</span>
          </div>
          <div class="panel kpi kpi--alerta">
            <span class="kpi__titulo">No llegaron (inasistencia)</span>
            <strong class="kpi__valor numero">{{ num(resumen.vencidas) }}</strong>
            <span class="kpi__detalle">{{ textoPorcentaje(tasaInasistencia(resumen)) }} de las que ya se resolvieron · {{ num(resumen.personasVencidas) }} personas</span>
          </div>
          <div class="panel kpi">
            <span class="kpi__titulo">Canceladas</span>
            <strong class="kpi__valor numero">{{ num(resumen.canceladas) }}</strong>
            <span class="kpi__detalle">{{ textoPorcentaje(tasaCancelacion(resumen)) }} del total</span>
          </div>
        </div>

        <div v-if="peorDia || peorHora" class="aviso aviso--info" role="status">
          <p>
            <template v-if="peorDia">Los <strong>{{ peorDia.etiqueta.toLowerCase() }}</strong> fallan más ({{ textoPorcentaje(peorDia.inasistencia) }}).</template>
            <template v-if="peorHora"> A las <strong>{{ peorHora.etiqueta }}</strong> es la hora con más inasistencia ({{ textoPorcentaje(peorHora.inasistencia) }}).</template>
          </p>
        </div>

        <div class="desgloses">
          <section v-for="bloque in [
            { id: 'semana', titulo: 'Por día de la semana', filas: filasSemana },
            { id: 'hora', titulo: 'Por hora de la reservación', filas: filasHora },
            { id: 'seccion', titulo: 'Por sección pedida', filas: filasSeccion },
          ]" :key="bloque.id" class="panel desglose" :aria-labelledby="`rep-${bloque.id}`">
            <h3 :id="`rep-${bloque.id}`">{{ bloque.titulo }}</h3>
            <div class="tabla-scroll">
              <table class="tabla">
                <thead>
                  <tr>
                    <th scope="col">{{ bloque.id === 'semana' ? 'Día' : bloque.id === 'hora' ? 'Hora' : 'Sección' }}</th>
                    <th scope="col" class="num">Total</th>
                    <th scope="col" class="num">Llegaron</th>
                    <th scope="col" class="num">No llegaron</th>
                    <th scope="col" class="num">Cancel.</th>
                    <th scope="col" class="num">Inasistencia</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in bloque.filas" :key="f.etiqueta">
                    <th scope="row">
                      {{ f.etiqueta }}
                      <span class="barra" role="img" :aria-label="`${f.llegaron} llegaron, ${f.vencidas} no llegaron, ${f.canceladas} canceladas`">
                        <span class="barra__llego" :style="{ width: pct(f.llegaron, f.total) }" />
                        <span class="barra__vencida" :style="{ width: pct(f.vencidas, f.total) }" />
                        <span class="barra__cancelada" :style="{ width: pct(f.canceladas, f.total) }" />
                      </span>
                    </th>
                    <td class="num numero">{{ f.total }}</td>
                    <td class="num numero">{{ f.llegaron }}</td>
                    <td class="num numero">{{ f.vencidas }}</td>
                    <td class="num numero">{{ f.canceladas }}</td>
                    <td class="num numero">{{ textoPorcentaje(f.inasistencia) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section class="panel desglose" aria-labelledby="rep-clientes">
          <h3 id="rep-clientes">Clientes con 2 o más inasistencias</h3>
          <p v-if="reporte.clientesConInasistencias.length === 0" class="nota">Nadie faltó dos veces o más en este periodo.</p>
          <template v-else>
            <p class="nota">Conviene llamarles para confirmar antes de apartarles mesa.</p>
            <ul class="clientes">
              <li v-for="c in reporte.clientesConInasistencias" :key="c.idCliente">
                <span><strong>{{ c.nombre }}</strong><template v-if="c.telefono"> · {{ c.telefono }}</template></span>
                <span class="numero">{{ c.inasistencias }} de {{ c.reservaciones }} no llegaron</span>
              </li>
            </ul>
          </template>
        </section>

        <details class="panel por-dia">
          <summary>Ver por día ({{ filasDia.length }} {{ filasDia.length === 1 ? 'día' : 'días' }})</summary>
          <div class="tabla-scroll">
            <table class="tabla">
              <thead>
                <tr>
                  <th scope="col">Día</th>
                  <th scope="col" class="num">Total</th>
                  <th scope="col" class="num">Llegaron</th>
                  <th scope="col" class="num">No llegaron</th>
                  <th scope="col" class="num">Cancel.</th>
                  <th scope="col" class="num">Inasistencia</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in filasDia" :key="f.dia">
                  <th scope="row">{{ f.etiqueta }}</th>
                  <td class="num numero">{{ f.total }}</td>
                  <td class="num numero">{{ f.llegaron }}</td>
                  <td class="num numero">{{ f.vencidas }}</td>
                  <td class="num numero">{{ f.canceladas }}</td>
                  <td class="num numero">{{ textoPorcentaje(f.inasistencia) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>

        <ul class="leyenda" aria-label="Qué significa cada barra">
          <li><span class="muestra muestra--llego" /> Llegaron</li>
          <li><span class="muestra muestra--vencida" /> No llegaron</li>
          <li><span class="muestra muestra--cancelada" /> Canceladas</li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.reporte {
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
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--espacio-4);
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-1);
}

.kpi__titulo {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 650;
}

.kpi__valor {
  font-size: clamp(1.8rem, 1.4rem + 1.4vw, 2.4rem);
  line-height: 1.1;
}

.kpi__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.kpi--alerta {
  border-color: var(--color-cancelado);
}

.desgloses {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr));
  gap: var(--espacio-4);
  align-items: start;
}

.desglose h3 {
  margin: 0 0 var(--espacio-3);
  font-size: var(--texto-lg);
}

.tabla-scroll {
  overflow-x: auto;
}

.num {
  text-align: right;
  white-space: nowrap;
}

/* Barra apilada: la proporción de cada estado dentro de la fila (el detalle está en la tabla y en el aria-label). */
.barra {
  display: flex;
  min-width: 5rem;
  height: 6px;
  margin-top: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-deshabilitado-fondo);
}

.barra__llego,
.muestra--llego {
  background: var(--color-cuenta-pagada);
}

.barra__vencida,
.muestra--vencida {
  background: var(--color-cancelado);
}

.barra__cancelada,
.muestra--cancelada {
  background: var(--color-borde-fuerte);
}

.leyenda {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-4);
  margin: 0;
  padding: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  list-style: none;
}

.leyenda li {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
}

.muestra {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.nota {
  margin: 0 0 var(--espacio-2);
  color: var(--color-muted);
}

.clientes {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.clientes li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--espacio-1) var(--espacio-3);
  padding: var(--espacio-2) var(--espacio-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-bg);
}

.por-dia summary {
  color: var(--color-primary-dark);
  font-weight: 650;
  cursor: pointer;
}
</style>
