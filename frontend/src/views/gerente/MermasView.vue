<script setup lang="ts">
// Gerente → Productos → Mermas. Registrar producto que se perdió (caducó, se dañó, error de preparación…) y ver el reporte del
// periodo: cuántas unidades y cuánto vale (a precio de venta: el sistema no maneja costos), por producto y por motivo.
// Lo que un cliente devolvió y no volvió al inventario también se suma, aparte.
import { computed, onMounted, ref, watch } from 'vue'
import BarrasRanking, { type FilaRanking } from '../../components/BarrasRanking.vue'
import MermaDialog from '../../components/MermaDialog.vue'
import ProductosPestanas from '../../components/ProductosPestanas.vue'
import SelectorPeriodo from '../../components/SelectorPeriodo.vue'
import { ErrorServicio, servicios } from '../../services'
import { ETIQUETA_MOTIVO_MERMA, type ReporteMermas } from '../../types'
import { formatearMoneda } from '../../utils/formato'
import { type Periodo, periodoQueContiene } from '../../utils/periodos'

const periodo = ref<Periodo>(periodoQueContiene('mes', new Date()))
const reporte = ref<ReporteMermas | null>(null)
const cargando = ref(true)
const error = ref('')
const dialogo = ref(false)
const botonRegistrar = ref<HTMLButtonElement | null>(null)
let consulta = 0

async function cargar() {
  const numero = ++consulta
  cargando.value = true
  error.value = ''
  try {
    const datos = await servicios.reportes.reporteMermas(periodo.value.desde, periodo.value.hasta)
    if (numero === consulta) reporte.value = datos
  } catch (e) {
    if (numero === consulta) error.value = e instanceof ErrorServicio ? e.message : 'No se pudo cargar el reporte de mermas.'
  } finally {
    if (numero === consulta) cargando.value = false
  }
}

watch(periodo, () => void cargar(), { deep: true })
onMounted(() => void cargar())

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-MX')} ${n === 1 ? uno : varios}`
const nombre = (p: { producto: string; presentacion: string | null }) => (p.presentacion ? `${p.producto} (${p.presentacion})` : p.producto)

const valorTotal = computed(() => reporte.value?.resumen.valor ?? 0)
const filasProducto = computed<FilaRanking[]>(() =>
  (reporte.value?.porProducto ?? []).map((p) => ({ clave: String(p.idProducto), nombre: nombre(p), detalle: `${p.categoria} · ${plural(p.unidades, 'unidad', 'unidades')}`, total: p.valor })),
)
const filasMotivo = computed<FilaRanking[]>(() =>
  (reporte.value?.porMotivo ?? []).map((m) => ({ clave: m.motivo, nombre: ETIQUETA_MOTIVO_MERMA[m.motivo], detalle: plural(m.unidades, 'unidad', 'unidades'), total: m.valor })),
)
const sinDatos = computed(() => (reporte.value?.resumen.registros ?? 0) === 0 && (reporte.value?.devolucionesSinReponer.unidades ?? 0) === 0)

const fecha = (f: Date) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(f)

async function alRegistrar() {
  dialogo.value = false
  await cargar()
}
</script>

<template>
  <section class="pagina mermas" aria-labelledby="mermas-titulo">
    <header class="encabezado">
      <div>
        <p class="sobretitulo">Gerencia</p>
        <h2 id="mermas-titulo">Mermas</h2>
        <p>Producto que se perdió: cuánto, por qué y cuánto vale a precio de venta.</p>
      </div>
      <button ref="botonRegistrar" type="button" class="btn" @click="dialogo = true">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        Registrar merma
      </button>
    </header>

    <ProductosPestanas />
    <SelectorPeriodo v-model="periodo" id-base="mermas" />

    <div v-if="error" class="aviso aviso--error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="btn btn--secundario" @click="cargar">Reintentar</button>
    </div>

    <template v-if="cargando && !reporte">
      <div class="kpis"><div v-for="n in 3" :key="n" class="esqueleto kpi" aria-hidden="true" /></div>
      <p class="solo-lectores" role="status">Cargando reporte…</p>
    </template>

    <div v-else-if="reporte" class="contenido" :class="{ 'contenido--cargando': cargando }" :aria-busy="cargando">
      <div v-if="sinDatos" class="vacio panel">
        <h3>Sin mermas en este periodo</h3>
        <p>Usa «Registrar merma» cuando se pierda producto.</p>
      </div>

      <template v-else>
        <div class="kpis">
          <div class="panel kpi">
            <span class="kpi__titulo">Valor perdido (estimado)</span>
            <strong class="kpi__valor numero">{{ formatearMoneda(valorTotal) }}</strong>
            <span class="kpi__detalle">a precio de venta</span>
          </div>
          <div class="panel kpi">
            <span class="kpi__titulo">Unidades perdidas</span>
            <strong class="kpi__valor numero">{{ reporte.resumen.unidades.toLocaleString('es-MX') }}</strong>
            <span class="kpi__detalle">{{ plural(reporte.resumen.registros, 'registro', 'registros') }}</span>
          </div>
          <div class="panel kpi">
            <span class="kpi__titulo">Devoluciones sin reponer</span>
            <strong class="kpi__valor numero">{{ formatearMoneda(reporte.devolucionesSinReponer.valor) }}</strong>
            <span class="kpi__detalle">{{ plural(reporte.devolucionesSinReponer.unidades, 'unidad', 'unidades') }} en {{ plural(reporte.devolucionesSinReponer.devoluciones, 'devolución', 'devoluciones') }} · no se suman al valor perdido</span>
          </div>
        </div>

        <div class="desgloses">
          <section class="panel" aria-labelledby="mer-producto">
            <h3 id="mer-producto">Por producto</h3>
            <BarrasRanking :filas="filasProducto" :total-general="valorTotal" :limite="8" numerada vacio="Sin mermas registradas." />
          </section>
          <section class="panel" aria-labelledby="mer-motivo">
            <h3 id="mer-motivo">Por motivo</h3>
            <BarrasRanking :filas="filasMotivo" :total-general="valorTotal" vacio="Sin mermas registradas." />
          </section>
        </div>

        <section class="panel" aria-labelledby="mer-detalle">
          <h3 id="mer-detalle">Registros</h3>
          <p v-if="reporte.mermas.length === 0" class="nota">No hay registros en este periodo.</p>
          <div v-else class="tabla-scroll">
            <table class="tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Producto</th>
                  <th scope="col" class="num">Cant.</th>
                  <th scope="col">Motivo</th>
                  <th scope="col" class="num">Valor</th>
                  <th scope="col">Registró</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in reporte.mermas" :key="m.idMerma">
                  <td>{{ fecha(m.fechaHora) }}</td>
                  <th scope="row">
                    {{ nombre(m) }}
                    <span v-if="m.nota" class="nota nota--chica">{{ m.nota }}</span>
                  </th>
                  <td class="num numero">{{ m.cantidad }}</td>
                  <td>{{ ETIQUETA_MOTIVO_MERMA[m.motivo] }}</td>
                  <td class="num numero">{{ formatearMoneda(m.valor) }}</td>
                  <td>{{ m.registradoPor }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="reporte.mermasTruncadas" class="nota">Se muestran las 500 más recientes; los totales cuentan todas.</p>
        </section>
      </template>
    </div>

    <MermaDialog :abierto="dialogo" :origen-foco="botonRegistrar" @cerrar="dialogo = false" @registrada="alRegistrar" />
  </section>
</template>

<style scoped>
.mermas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  max-width: 1200px;
}

.encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--espacio-3);
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
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--espacio-4);
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-1);
}

.kpi__titulo,
.kpi__detalle,
.nota {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.kpi__valor {
  font-size: clamp(1.8rem, 1.4rem + 1.4vw, 2.4rem);
  line-height: 1.1;
}

.desgloses {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
  gap: var(--espacio-4);
  align-items: start;
}

h3 {
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

.nota {
  margin: 0;
}

.nota--chica {
  display: block;
  font-weight: 400;
}
</style>
