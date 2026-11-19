<script setup lang="ts">
// Tickets pasados, reimpresión y devoluciones (migración 034). La usan el cajero (/cajero/tickets) y el gerente
// (/gerente/tickets, como una pestaña más de «Cortes y ventas»):
//  - Tickets: ventas ya cobradas por fecha o número de ticket/mesa; se abre el ticket, se reimprime (queda constancia de quién
//    y cuándo) y se puede devolver parte o toda la venta.
//  - Devoluciones: el cajero SOLICITA; el gerente autoriza o rechaza (con la nota que corresponda). El efectivo devuelto sale del
//    corte del cajero que la pidió. El gerente también guarda la referencia para el contador de cada venta (sin factura).
import { computed, nextTick, onMounted, ref } from 'vue'
import CajaPestanas from '../../components/CajaPestanas.vue'
import DevolucionDialog from '../../components/DevolucionDialog.vue'
import DialogoModal from '../../components/DialogoModal.vue'
import ReferenciaFiscalDialog from '../../components/ReferenciaFiscalDialog.vue'
import TicketVenta from '../../components/TicketVenta.vue'
import { usePolling } from '../../composables/usePolling'
import { ErrorServicio, servicios } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useSesionStore } from '../../stores/sesion'
import {
  ETIQUETA_DEVOLUCION_VENTA,
  ETIQUETA_ESTADO_DEVOLUCION,
  type Devolucion,
  type EstadoDevolucion,
  type ReferenciaFiscal,
  type VentaDetalle,
  type VentaListado,
} from '../../types'
import { vPermitir } from '../../utils/campos'
import { disponibleDeLinea } from '../../utils/devoluciones'
import { formatearMoneda } from '../../utils/formato'

const sesion = useSesionStore()
const anuncios = useAnunciosStore()
const esGerente = computed(() => sesion.rol === 'gerente')

type Vista = 'tickets' | 'devoluciones'
const vista = ref<Vista>('tickets')

/** Fecha local AAAA-MM-DD para los campos de fecha. */
function diaLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}
const hoy = new Date()
const desde = ref(diaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6)))
const hasta = ref(diaLocal(hoy))
const numero = ref('')
const rangoInvalido = computed(() => !!desde.value && !!hasta.value && desde.value > hasta.value)

const fecha = (f: Date) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(f)

// ---------- Tickets ----------
const ventas = ref<VentaListado[]>([])
const cargandoVentas = ref(true)
const errorVentas = ref('')
const seleccionada = ref<VentaDetalle | null>(null)
const cargandoDetalle = ref(false)
const errorDetalle = ref('')
const imprimiendo = ref(false)

const totalListado = computed(() => ventas.value.reduce((s, v) => s + Math.round(v.total * 100), 0) / 100)

async function cargarVentas() {
  if (rangoInvalido.value) {
    errorVentas.value = 'La fecha inicial no puede ser posterior a la final.'
    return
  }
  cargandoVentas.value = true
  errorVentas.value = ''
  try {
    ventas.value = await servicios.caja.listarVentas({ desde: desde.value || undefined, hasta: hasta.value || undefined, q: numero.value.trim() || undefined })
  } catch (e) {
    errorVentas.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar los tickets.'
  } finally {
    cargandoVentas.value = false
  }
}

const panelDetalle = ref<HTMLElement | null>(null)

async function abrirVenta(idVenta: number) {
  cargandoDetalle.value = true
  errorDetalle.value = ''
  try {
    seleccionada.value = await servicios.caja.obtenerVenta(idVenta)
    // En pantallas angostas el ticket queda debajo de la lista: se lleva a la vista.
    await nextTick()
    if (window.matchMedia('(max-width: 52em)').matches) panelDetalle.value?.scrollIntoView({ block: 'start' })
  } catch (e) {
    errorDetalle.value = e instanceof ErrorServicio ? e.message : 'No se pudo abrir el ticket.'
  } finally {
    cargandoDetalle.value = false
  }
}

/** Vuelve a pedir la venta abierta (cambió una devolución) y la lista, sin perder el lugar. */
async function refrescar() {
  const id = seleccionada.value?.idVenta
  await Promise.all([cargarVentas(), cargarDevoluciones(true), id ? abrirVenta(id) : Promise.resolve()])
}

async function imprimir() {
  const venta = seleccionada.value
  if (!venta || imprimiendo.value) return
  imprimiendo.value = true
  errorDetalle.value = ''
  try {
    // Queda constancia de quién reimprimió y cuándo antes de imprimir.
    const r = await servicios.caja.registrarReimpresion(venta.idVenta)
    venta.reimpresiones = r.reimpresiones
    venta.ultimaReimpresion = r.ultimaReimpresion
    await nextTick()
    window.print()
  } catch (e) {
    errorDetalle.value = e instanceof ErrorServicio ? e.message : 'No se pudo registrar la reimpresión.'
  } finally {
    imprimiendo.value = false
  }
}

function etiquetaVenta(v: VentaListado): { texto: string; clase: string } | null {
  if (v.devolucionesPendientes > 0) return { texto: `${v.devolucionesPendientes} por autorizar`, clase: 'pastilla--pendiente' }
  if (v.estadoDevolucion === 'total') return { texto: ETIQUETA_DEVOLUCION_VENTA.total, clase: 'pastilla--rechazada' }
  if (v.estadoDevolucion === 'parcial') return { texto: ETIQUETA_DEVOLUCION_VENTA.parcial, clase: 'pastilla--pendiente' }
  return null
}

const puedeDevolver = computed(() => !!seleccionada.value && seleccionada.value.lineas.some((l) => disponibleDeLinea(l) > 0))

// ---------- Devoluciones ----------
const devoluciones = ref<Devolucion[]>([])
const filtroEstado = ref<'pendiente' | 'todas'>(esGerente.value ? 'pendiente' : 'todas')
const cargandoDev = ref(true)
const errorDev = ref('')
const pendientes = ref(0)

async function cargarDevoluciones(silencioso = false) {
  if (!silencioso) cargandoDev.value = true
  try {
    const todas = await servicios.caja.listarDevoluciones({ estado: filtroEstado.value })
    devoluciones.value = todas
    pendientes.value =
      filtroEstado.value === 'pendiente' ? todas.length : todas.filter((d) => d.estado === 'pendiente').length
    if (!silencioso) errorDev.value = ''
  } catch (e) {
    if (!silencioso) errorDev.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar las devoluciones.'
  } finally {
    if (!silencioso) cargandoDev.value = false
  }
}

function cambiarFiltro(estado: 'pendiente' | 'todas') {
  filtroEstado.value = estado
  void cargarDevoluciones()
}

const claseEstado = (e: EstadoDevolucion) => `pastilla--${e}`

async function verTicketDe(d: Devolucion) {
  vista.value = 'tickets'
  await abrirVenta(d.idVenta)
}

// Resolver (gerente): aprobar con nota opcional o rechazar con nota obligatoria.
const resolviendo = ref<{ devolucion: Devolucion; accion: 'aprobar' | 'rechazar' } | null>(null)
const nota = ref('')
const enCursoResolver = ref(false)
const errorResolver = ref('')

function pedirResolver(devolucion: Devolucion, accion: 'aprobar' | 'rechazar') {
  resolviendo.value = { devolucion, accion }
  nota.value = ''
  errorResolver.value = ''
}

async function resolver() {
  const r = resolviendo.value
  if (!r || enCursoResolver.value) return
  if (r.accion === 'rechazar' && !nota.value.trim()) {
    errorResolver.value = 'Escribe por qué se rechaza la devolución.'
    return
  }
  enCursoResolver.value = true
  errorResolver.value = ''
  try {
    if (r.accion === 'aprobar') await servicios.caja.aprobarDevolucion(r.devolucion.idDevolucion, nota.value.trim() || undefined)
    else await servicios.caja.rechazarDevolucion(r.devolucion.idDevolucion, nota.value.trim())
    void anuncios.anunciar(r.accion === 'aprobar' ? 'Devolución aprobada' : 'Devolución rechazada')
    resolviendo.value = null
    await refrescar()
  } catch (e) {
    errorResolver.value = e instanceof ErrorServicio ? e.message : 'No se pudo resolver la devolución.'
    // Si otro gerente ya la resolvió, la lista debe mostrarlo.
    if (e instanceof ErrorServicio && e.estadoHttp === 409) void refrescar()
  } finally {
    enCursoResolver.value = false
  }
}

// ---------- Diálogos de devolver y de referencia fiscal ----------
const devolviendo = ref(false)
const fiscalAbierto = ref(false)
const botonDevolver = ref<HTMLButtonElement | null>(null)
const botonFiscal = ref<HTMLButtonElement | null>(null)

async function alCrearDevolucion(d: Devolucion) {
  devolviendo.value = false
  vista.value = d.estado === 'pendiente' && !esGerente.value ? 'tickets' : vista.value
  await refrescar()
}

async function alGuardarFiscal(_ref: ReferenciaFiscal | null) {
  fiscalAbierto.value = false
  void anuncios.anunciar(_ref ? 'Referencia para el contador guardada' : 'Referencia para el contador quitada')
  await refrescar()
}

const polling = usePolling(() => cargarDevoluciones(true))
onMounted(() => {
  void cargarVentas()
  void cargarDevoluciones().finally(() => polling.iniciar())
})
</script>

<template>
  <section class="pagina tickets" aria-labelledby="tickets-titulo">
    <header class="encabezado no-imprimir">
      <div>
        <p class="sobretitulo">{{ esGerente ? 'Gerencia' : 'Punto de venta' }}</p>
        <h2 id="tickets-titulo">Tickets y devoluciones</h2>
        <p>
          Consulta cualquier venta ya cobrada, reimprime su ticket y devuelve parte o toda la venta.
          {{ esGerente ? 'Tú autorizas las devoluciones que piden los cajeros.' : 'El gerente autoriza cada devolución que solicites.' }}
        </p>
      </div>
    </header>

    <CajaPestanas v-if="esGerente" />

    <div class="vistas no-imprimir" role="tablist" aria-label="Qué ver">
      <button id="tab-tickets" type="button" class="pestana" role="tab" :aria-selected="vista === 'tickets'" aria-controls="panel-tickets" @click="vista = 'tickets'">
        Tickets
      </button>
      <button id="tab-devoluciones" type="button" class="pestana" role="tab" :aria-selected="vista === 'devoluciones'" aria-controls="panel-devoluciones" @click="vista = 'devoluciones'">
        Devoluciones
        <span v-if="pendientes > 0" class="insignia" :aria-label="`${pendientes} por autorizar`">{{ pendientes }}</span>
      </button>
    </div>

    <!-- ============ TICKETS ============ -->
    <div v-show="vista === 'tickets'" id="panel-tickets" role="tabpanel" aria-labelledby="tab-tickets" class="tickets__cuerpo">
      <form class="filtros panel no-imprimir" role="search" aria-label="Buscar tickets" @submit.prevent="cargarVentas">
        <div class="campo">
          <label for="tk-desde">Desde</label>
          <input id="tk-desde" v-model="desde" type="date" :max="hasta || undefined" :aria-invalid="rangoInvalido ? 'true' : undefined" />
        </div>
        <div class="campo">
          <label for="tk-hasta">Hasta</label>
          <input id="tk-hasta" v-model="hasta" type="date" :min="desde || undefined" :aria-invalid="rangoInvalido ? 'true' : undefined" />
        </div>
        <div class="campo">
          <label for="tk-numero">Ticket o mesa</label>
          <input id="tk-numero" v-model="numero" v-permitir="'digitos'" type="text" inputmode="numeric" maxlength="10" placeholder="Ej. 125" autocomplete="off" />
        </div>
        <button class="btn" type="submit" :disabled="cargandoVentas">Buscar</button>
      </form>

      <div v-if="errorVentas" class="aviso aviso--error no-imprimir" role="alert"><p>{{ errorVentas }}</p></div>

      <div class="paneles">
        <section class="lista no-imprimir" aria-label="Ventas cobradas">
          <template v-if="cargandoVentas">
            <div v-for="n in 4" :key="n" class="esqueleto" aria-hidden="true" />
            <p class="solo-lectores" role="status">Cargando tickets…</p>
          </template>

          <div v-else-if="ventas.length === 0" class="vacio">
            <h3>Sin tickets en estas fechas</h3>
            <p>Prueba con otro periodo o quita el número de ticket o mesa.</p>
          </div>

          <template v-else>
            <p class="lista__resumen" role="status">
              {{ ventas.length }} {{ ventas.length === 1 ? 'ticket' : 'tickets' }} · {{ formatearMoneda(totalListado) }}
              <template v-if="ventas.length >= 200"> · se muestran los 200 más recientes</template>
            </p>
            <ul class="filas">
              <li v-for="v in ventas" :key="v.idVenta">
                <button
                  type="button"
                  class="fila"
                  :class="{ 'fila--seleccionada': seleccionada?.idVenta === v.idVenta }"
                  :aria-pressed="seleccionada?.idVenta === v.idVenta"
                  @click="abrirVenta(v.idVenta)"
                >
                  <span class="fila__cabecera">
                    <strong class="numero">Ticket #{{ v.idVenta }}</strong>
                    <span v-if="etiquetaVenta(v)" class="pastilla" :class="etiquetaVenta(v)!.clase">{{ etiquetaVenta(v)!.texto }}</span>
                  </span>
                  <span class="fila__meta">Mesa {{ v.mesaNumero }} · {{ fecha(v.fechaHora) }} · {{ v.cajero }}</span>
                  <span class="fila__pie">
                    <span>{{ v.metodos }}<template v-if="v.conReferenciaFiscal"> · con referencia fiscal</template></span>
                    <strong class="numero">{{ formatearMoneda(v.total) }}</strong>
                  </span>
                  <span v-if="v.devuelto > 0" class="fila__devuelto">Devuelto {{ formatearMoneda(v.devuelto) }}</span>
                </button>
              </li>
            </ul>
          </template>
        </section>

        <section ref="panelDetalle" class="detalle" aria-label="Ticket" :aria-busy="cargandoDetalle">
          <div v-if="errorDetalle" class="aviso aviso--error no-imprimir" role="alert"><p>{{ errorDetalle }}</p></div>
          <div v-if="!seleccionada" class="vacio no-imprimir">
            <h3>Elige un ticket</h3>
            <p>Verás el comprobante, las devoluciones de esa venta y podrás reimprimirlo.</p>
          </div>
          <template v-else>
            <div class="detalle__barra no-imprimir">
              <button class="btn btn--secundario" type="button" @click="seleccionada = null">Cerrar</button>
              <button v-if="esGerente" ref="botonFiscal" class="btn btn--secundario" type="button" @click="fiscalAbierto = true">
                {{ seleccionada.referenciaFiscal ? 'Referencia fiscal' : 'Agregar referencia fiscal' }}
              </button>
              <button ref="botonDevolver" class="btn btn--secundario" type="button" :disabled="!puedeDevolver" @click="devolviendo = true">
                {{ esGerente ? 'Registrar devolución' : 'Solicitar devolución' }}
              </button>
              <button class="btn" type="button" :disabled="imprimiendo" @click="imprimir">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
                  <path d="M6 14h12v7H6z" />
                </svg>
                Reimprimir ticket
              </button>
            </div>

            <TicketVenta :venta="seleccionada" reimpresion />

            <div class="notas panel no-imprimir">
              <p v-if="seleccionada.reimpresiones > 0" class="notas__linea">
                Se ha reimpreso {{ seleccionada.reimpresiones }} {{ seleccionada.reimpresiones === 1 ? 'vez' : 'veces' }}<template v-if="seleccionada.ultimaReimpresion"> (la última, {{ fecha(seleccionada.ultimaReimpresion) }})</template>.
              </p>

              <template v-if="esGerente && seleccionada.referenciaFiscal">
                <h3>Referencia para el contador</h3>
                <dl class="fiscal-resumen">
                  <div><dt>Referencia</dt><dd class="numero">{{ seleccionada.referenciaFiscal.referenciaContador }}</dd></div>
                  <div v-if="seleccionada.referenciaFiscal.rfc"><dt>RFC</dt><dd class="numero">{{ seleccionada.referenciaFiscal.rfc }}</dd></div>
                  <div v-if="seleccionada.referenciaFiscal.razonSocial"><dt>Razón social</dt><dd>{{ seleccionada.referenciaFiscal.razonSocial }}</dd></div>
                  <div v-if="seleccionada.referenciaFiscal.correo"><dt>Correo</dt><dd>{{ seleccionada.referenciaFiscal.correo }}</dd></div>
                  <div><dt>Guardó</dt><dd>{{ seleccionada.referenciaFiscal.registradoPor }}</dd></div>
                </dl>
              </template>

              <h3>Devoluciones de esta venta</h3>
              <p v-if="seleccionada.devoluciones.length === 0" class="notas__linea">Esta venta no tiene devoluciones.</p>
              <ul v-else class="devs">
                <li v-for="d in seleccionada.devoluciones" :key="d.idDevolucion">
                  <div class="devs__cabecera">
                    <strong>Devolución #{{ d.idDevolucion }} · {{ formatearMoneda(d.total) }}</strong>
                    <span class="pastilla" :class="claseEstado(d.estado)">{{ ETIQUETA_ESTADO_DEVOLUCION[d.estado] }}</span>
                  </div>
                  <p class="devs__detalle">{{ d.lineas.map((l) => `${l.cantidad}× ${l.producto}`).join(', ') }}</p>
                  <p class="devs__detalle">Motivo: {{ d.motivo }}</p>
                  <p class="devs__detalle">
                    Pidió {{ d.solicitante }} · {{ fecha(d.solicitadoEn) }}
                    <template v-if="d.resolutor && d.resueltoEn"> · {{ d.estado === 'aprobada' ? 'Aprobó' : 'Rechazó' }} {{ d.resolutor }} ({{ fecha(d.resueltoEn) }})</template>
                  </p>
                  <p v-if="d.notaResolucion" class="devs__detalle">Nota: {{ d.notaResolucion }}</p>
                  <div v-if="esGerente && d.estado === 'pendiente'" class="devs__acciones">
                    <button type="button" class="btn" @click="pedirResolver(d, 'aprobar')">Aprobar</button>
                    <button type="button" class="btn btn--peligro-suave" @click="pedirResolver(d, 'rechazar')">Rechazar</button>
                  </div>
                </li>
              </ul>
            </div>
          </template>
        </section>
      </div>
    </div>

    <!-- ============ DEVOLUCIONES ============ -->
    <div v-show="vista === 'devoluciones'" id="panel-devoluciones" role="tabpanel" aria-labelledby="tab-devoluciones" class="tickets__cuerpo no-imprimir">
      <div class="chips" role="group" aria-label="Filtrar devoluciones">
        <button type="button" class="chip" :class="{ 'chip--activo': filtroEstado === 'pendiente' }" :aria-pressed="filtroEstado === 'pendiente'" @click="cambiarFiltro('pendiente')">
          Por autorizar
        </button>
        <button type="button" class="chip" :class="{ 'chip--activo': filtroEstado === 'todas' }" :aria-pressed="filtroEstado === 'todas'" @click="cambiarFiltro('todas')">
          Todas (30 días)
        </button>
      </div>

      <div v-if="errorDev" class="aviso aviso--error" role="alert"><p>{{ errorDev }}</p></div>

      <template v-if="cargandoDev">
        <div v-for="n in 3" :key="n" class="esqueleto" aria-hidden="true" />
        <p class="solo-lectores" role="status">Cargando devoluciones…</p>
      </template>
      <div v-else-if="devoluciones.length === 0" class="vacio">
        <h3>{{ filtroEstado === 'pendiente' ? 'Nada por autorizar' : 'Sin devoluciones' }}</h3>
        <p v-if="esGerente">Cuando un cajero solicite una devolución aparecerá aquí.</p>
        <p v-else>Abre un ticket y usa «Solicitar devolución».</p>
      </div>
      <ul v-else class="tarjetas">
        <li v-for="d in devoluciones" :key="d.idDevolucion" class="panel tarjeta">
          <div class="devs__cabecera">
            <strong>Devolución #{{ d.idDevolucion }} · {{ formatearMoneda(d.total) }}</strong>
            <span class="pastilla" :class="claseEstado(d.estado)">{{ ETIQUETA_ESTADO_DEVOLUCION[d.estado] }}</span>
          </div>
          <p class="devs__detalle">Ticket #{{ d.idVenta }} · Mesa {{ d.mesaNumero }} · venta de {{ formatearMoneda(d.totalVenta) }}</p>
          <ul class="tarjeta__lineas">
            <li v-for="l in d.lineas" :key="l.idDetalle">
              <span>{{ l.cantidad }}× {{ l.producto }}<template v-if="l.presentacion"> ({{ l.presentacion }})</template></span>
              <span class="numero">{{ formatearMoneda(l.importe) }}</span>
            </li>
          </ul>
          <p class="devs__detalle">
            Se devuelve con: {{ d.pagos.map((p) => `${p.metodo} ${formatearMoneda(p.monto)}`).join(' · ') }}<template v-if="d.reponerInventario"> · repone inventario</template>
          </p>
          <p class="devs__detalle">Motivo: {{ d.motivo }}</p>
          <p class="devs__detalle">
            Pidió {{ d.solicitante }} · {{ fecha(d.solicitadoEn) }}
            <template v-if="d.resolutor && d.resueltoEn"> · {{ d.estado === 'aprobada' ? 'Aprobó' : 'Rechazó' }} {{ d.resolutor }} ({{ fecha(d.resueltoEn) }})</template>
          </p>
          <p v-if="d.notaResolucion" class="devs__detalle">Nota: {{ d.notaResolucion }}</p>
          <div class="devs__acciones">
            <button type="button" class="btn btn--secundario" @click="verTicketDe(d)">Ver ticket</button>
            <template v-if="esGerente && d.estado === 'pendiente'">
              <button type="button" class="btn" @click="pedirResolver(d, 'aprobar')">Aprobar</button>
              <button type="button" class="btn btn--peligro-suave" @click="pedirResolver(d, 'rechazar')">Rechazar</button>
            </template>
          </div>
        </li>
      </ul>
    </div>

    <!-- ============ DIÁLOGOS ============ -->
    <DevolucionDialog :abierto="devolviendo" :venta="seleccionada" :es-gerente="esGerente" :origen-foco="botonDevolver" @cerrar="devolviendo = false" @creada="alCrearDevolucion" />
    <ReferenciaFiscalDialog v-if="esGerente" :abierto="fiscalAbierto" :venta="seleccionada" :origen-foco="botonFiscal" @cerrar="fiscalAbierto = false" @guardada="alGuardarFiscal" />

    <DialogoModal :abierto="!!resolviendo" etiqueta-id="resolver-titulo" variante="centro" :cerrable="!enCursoResolver" @cerrar="resolviendo = null">
      <form v-if="resolviendo" class="resolver" novalidate @submit.prevent="resolver">
        <h2 id="resolver-titulo">
          {{ resolviendo.accion === 'aprobar' ? 'Aprobar' : 'Rechazar' }} devolución #{{ resolviendo.devolucion.idDevolucion }}
        </h2>
        <p class="devs__detalle">
          {{ formatearMoneda(resolviendo.devolucion.total) }} del ticket #{{ resolviendo.devolucion.idVenta }}, pedida por {{ resolviendo.devolucion.solicitante }}.
          <template v-if="resolviendo.accion === 'aprobar' && resolviendo.devolucion.pagos.some((p) => p.esEfectivo)">
            El efectivo se descuenta de la caja de {{ resolviendo.devolucion.solicitante }}: debe tener la caja iniciada.
          </template>
        </p>
        <div class="campo">
          <label for="resolver-nota">
            Nota <span class="resolver__req">({{ resolviendo.accion === 'aprobar' ? 'opcional' : 'obligatoria: se la verá el cajero' }})</span>
          </label>
          <textarea id="resolver-nota" v-model="nota" v-permitir="'nota'" maxlength="200" rows="2" :readonly="enCursoResolver" autofocus />
        </div>
        <div v-if="errorResolver" class="aviso aviso--error" role="alert"><p>{{ errorResolver }}</p></div>
        <div class="fila-botones">
          <button type="button" class="btn btn--secundario" :aria-disabled="enCursoResolver ? 'true' : undefined" @click="!enCursoResolver && (resolviendo = null)">Cancelar</button>
          <button type="submit" class="btn" :class="{ 'btn--peligro': resolviendo.accion === 'rechazar' }" :disabled="enCursoResolver">
            {{ enCursoResolver ? 'Guardando…' : resolviendo.accion === 'aprobar' ? 'Aprobar devolución' : 'Rechazar devolución' }}
          </button>
        </div>
      </form>
    </DialogoModal>
  </section>
</template>

<style scoped>
.tickets {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  max-width: 1200px;
}

.tickets__cuerpo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.encabezado h2 {
  font-size: clamp(1.9rem, 1.4rem + 1.8vw, 2.6rem);
}

.encabezado p:last-child {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.vistas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
  padding: var(--espacio-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  align-self: flex-start;
}

.insignia {
  min-width: 1.6rem;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-cancelado);
  color: #fff;
  font-size: var(--texto-sm);
  font-weight: 700;
  text-align: center;
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--espacio-3);
}

.filtros .campo {
  flex: 1 1 150px;
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

.filas,
.tarjetas,
.devs {
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
.fila__pie,
.devs__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2);
}

.fila__meta,
.fila__pie span,
.devs__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.fila__devuelto {
  color: var(--color-cancelado-texto);
  font-size: var(--texto-sm);
  font-weight: 650;
}

.devs__detalle {
  margin: var(--espacio-1) 0 0;
}

.pastilla {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--texto-sm);
  font-weight: 700;
  white-space: nowrap;
}

.pastilla--pendiente {
  background: var(--color-advertencia-fondo);
  color: var(--color-advertencia-texto);
}

.pastilla--aprobada {
  background: var(--color-cuenta-pagada-fondo);
  color: var(--color-cuenta-pagada-texto);
}

.pastilla--rechazada {
  background: var(--color-cancelado-fondo);
  color: var(--color-cancelado-texto);
}

.esqueleto {
  min-height: 96px;
}

.detalle {
  position: sticky;
  top: var(--espacio-4);
  /* El ticket y las devoluciones de la venta pueden ser más altos que la pantalla: el panel se desplaza por dentro. */
  max-height: calc(100dvh - 8rem);
  overflow-y: auto;
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

.notas {
  width: 100%;
}

.notas h3 {
  margin: var(--espacio-3) 0 var(--espacio-2);
  font-size: var(--texto-lg);
}

.notas__linea {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.fiscal-resumen {
  display: grid;
  gap: var(--espacio-1);
  margin: 0;
}

.fiscal-resumen div {
  display: flex;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.fiscal-resumen dt {
  color: var(--color-muted);
}

.fiscal-resumen dd {
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
}

.devs li {
  padding: var(--espacio-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-bg);
}

.devs__acciones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
  margin-top: var(--espacio-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.tarjeta {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-1);
}

.tarjeta__lineas {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: var(--espacio-2) 0;
  padding: 0;
  list-style: none;
}

.tarjeta__lineas li {
  display: flex;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.resolver {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.resolver__req {
  color: var(--color-muted);
  font-weight: 400;
}

@media (max-width: 52em) {
  .paneles {
    grid-template-columns: minmax(0, 1fr);
  }

  .detalle {
    position: static;
    max-height: none;
    overflow: visible;
  }
}

@media print {
  @page {
    size: 80mm auto;
    margin: 3mm;
  }

  .tickets,
  .tickets__cuerpo,
  .paneles,
  .detalle {
    display: block;
    max-width: none;
    max-height: none;
    overflow: visible;
  }
}
</style>
