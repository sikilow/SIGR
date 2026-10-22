<script setup lang="ts">
// Mesas (/gerente/mesas): registrar mesas nuevas (número, cantidad de personas, sección), editarlas y marcarlas
// como disponibles o no disponibles. Una mesa no disponible NO aparece para la hostess ni para el mesero.
// Las mesas no se borran (tienen cuentas y reservaciones ligadas).
import { computed, onMounted, ref } from 'vue'
import ConfirmarAccionDialog from '../../components/ConfirmarAccionDialog.vue'
import FormularioMesaDialog from '../../components/FormularioMesaDialog.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { ErrorServicio, servicios } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { ETIQUETA_ESTADO_MESA, type MesaAdmin } from '../../types'

const anuncios = useAnunciosStore()

const mesas = ref<MesaAdmin[]>([])
const cargando = ref(true)
const error = ref('')

type Disponibilidad = 'todas' | 'disponibles' | 'no_disponibles'
const disponibilidad = ref<Disponibilidad>('todas')
const SIN_SECCION = '__sin_seccion__'
const seccionFiltro = ref<string>('todas')
const busqueda = ref('')

const secciones = computed(() => [...new Set(mesas.value.map((m) => m.zona).filter((z): z is string => z !== null))].sort((a, b) => a.localeCompare(b, 'es')))
const haySinSeccion = computed(() => mesas.value.some((m) => m.zona === null))
const siguienteNumero = computed(() => Math.max(0, ...mesas.value.map((m) => m.numero)) + 1)

const lista = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return mesas.value.filter((m) => {
    if (disponibilidad.value === 'disponibles' && !m.activa) return false
    if (disponibilidad.value === 'no_disponibles' && m.activa) return false
    if (seccionFiltro.value === SIN_SECCION && m.zona !== null) return false
    if (seccionFiltro.value !== 'todas' && seccionFiltro.value !== SIN_SECCION && m.zona !== seccionFiltro.value) return false
    if (q && !`mesa ${m.numero} ${m.zona ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
})

const cuenta = computed(() => ({
  todas: mesas.value.length,
  disponibles: mesas.value.filter((m) => m.activa).length,
  no_disponibles: mesas.value.filter((m) => !m.activa).length,
}))

async function cargar(conEsqueleto = false) {
  if (conEsqueleto) cargando.value = true
  try {
    mesas.value = await servicios.catalogo.listarMesas()
    // Si la sección filtrada ya no existe (se renombró o se quitó), se vuelve a «todas».
    const f = seccionFiltro.value
    if (f !== 'todas' && f !== SIN_SECCION && !mesas.value.some((m) => m.zona === f)) seccionFiltro.value = 'todas'
    if (f === SIN_SECCION && !haySinSeccion.value) seccionFiltro.value = 'todas'
    error.value = ''
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar las mesas.'
  } finally {
    cargando.value = false
  }
}

onMounted(() => void cargar(true))

// ---------- Crear / editar ----------
const formAbierto = ref(false)
const enEdicion = ref<MesaAdmin | null>(null)
const origenForm = ref<HTMLElement | null>(null)

function abrirNueva(e: Event) {
  enEdicion.value = null
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

function abrirEdicion(m: MesaAdmin, e: Event) {
  enEdicion.value = m
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

async function alGuardar(m: MesaAdmin, creada: boolean) {
  formAbierto.value = false
  void anuncios.anunciar(creada ? `Mesa ${m.numero} creada` : `Cambios de la mesa ${m.numero} guardados`)
  await cargar()
}

// ---------- Disponible / no disponible ----------
const objetivo = ref<MesaAdmin | null>(null)
const origenConfirmar = ref<HTMLElement | null>(null)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')

function pedirCambioDisponibilidad(m: MesaAdmin, e: Event) {
  objetivo.value = m
  origenConfirmar.value = e.currentTarget as HTMLElement
  enCurso.value = false
  errorReintentable.value = ''
  rechazo.value = ''
}

async function confirmarCambioDisponibilidad() {
  const m = objetivo.value
  if (!m || enCurso.value) return
  enCurso.value = true
  errorReintentable.value = ''
  try {
    const nueva = await servicios.catalogo.actualizarMesa(m.idMesa, { activa: !m.activa })
    objetivo.value = null
    void anuncios.anunciar(nueva.activa ? `Mesa ${nueva.numero} disponible` : `Mesa ${nueva.numero} no disponible`)
    await cargar()
  } catch (e) {
    if (e instanceof ErrorServicio && e.codigo === 'red') {
      errorReintentable.value = 'No se pudo conectar con el servidor. Vuelve a intentarlo.'
    } else {
      rechazo.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
      void cargar()
    }
  } finally {
    enCurso.value = false
  }
}

const DISPONIBILIDADES: Array<{ clave: Disponibilidad; texto: string }> = [
  { clave: 'todas', texto: 'Todas' },
  { clave: 'disponibles', texto: 'Disponibles' },
  { clave: 'no_disponibles', texto: 'No disponibles' },
]

const personas = (n: number) => (n === 1 ? '1 persona' : `${n} personas`)
</script>

<template>
  <section class="pantalla" aria-labelledby="mesas-titulo">
    <header class="pantalla__cabecera">
      <h2 id="mesas-titulo">Mesas</h2>
      <div class="pantalla__acciones">
        <button type="button" class="btn" @click="abrirNueva">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva mesa
        </button>
      </div>
    </header>

    <div class="filtros">
      <div class="filtros__chips" role="group" aria-label="Disponibilidad">
        <button
          v-for="f in DISPONIBILIDADES"
          :key="f.clave"
          type="button"
          class="chip"
          :class="{ 'chip--activo': disponibilidad === f.clave }"
          :aria-pressed="disponibilidad === f.clave"
          @click="disponibilidad = f.clave"
        >
          {{ f.texto }} <span class="numero">({{ cuenta[f.clave] }})</span>
        </button>
      </div>
      <div class="filtros__campos">
        <div class="campo">
          <label for="mesa-buscar">Buscar</label>
          <input id="mesa-buscar" v-model="busqueda" type="search" placeholder="Número o sección" autocomplete="off" />
        </div>
        <div class="campo">
          <label for="mesa-filtro-seccion">Sección</label>
          <select id="mesa-filtro-seccion" v-model="seccionFiltro">
            <option value="todas">Todas las secciones</option>
            <option v-for="s in secciones" :key="s" :value="s">{{ s }}</option>
            <option v-if="haySinSeccion" :value="SIN_SECCION">Sin sección</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="error" class="aviso" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>{{ error }}</p>
      <button type="button" class="btn btn--secundario" @click="cargar(true)">Reintentar</button>
    </div>

    <div v-if="cargando" class="lista" aria-busy="true">
      <div v-for="n in 4" :key="n" class="esqueleto" />
      <p class="solo-lectores" role="status">Cargando mesas…</p>
    </div>

    <div v-else-if="!error && lista.length === 0" class="vacio">
      <p v-if="mesas.length === 0">Todavía no hay mesas. Registra la primera con «Nueva mesa».</p>
      <p v-else>Ninguna mesa coincide con los filtros.</p>
    </div>

    <ul v-else class="lista">
      <li v-for="m in lista" :key="m.idMesa" class="fila tarjeta" :class="{ 'fila--inactiva': !m.activa }">
        <div class="fila__datos">
          <h3>Mesa {{ m.numero }}</h3>
          <p class="fila__linea numero">{{ personas(m.capacidad) }}</p>
          <p class="fila__linea fila__meta">{{ m.zona ? `Sección: ${m.zona}` : 'Sin sección' }}</p>
        </div>

        <div class="fila__lado">
          <div class="fila__insignias">
            <InsigniaEstado :tono="m.activa ? 'activo' : 'cancelado'" :texto="m.activa ? 'Disponible' : 'No disponible'" />
            <InsigniaEstado v-if="m.activa" :tono="m.estado" :texto="ETIQUETA_ESTADO_MESA[m.estado]" />
          </div>
          <div class="fila__acciones">
            <button type="button" class="btn btn--secundario" :aria-label="`Editar mesa ${m.numero}`" @click="abrirEdicion(m, $event)">Editar</button>
            <button
              v-if="m.activa"
              type="button"
              class="btn btn--peligro-suave"
              :aria-label="`Marcar la mesa ${m.numero} como no disponible`"
              @click="pedirCambioDisponibilidad(m, $event)"
            >
              No disponible
            </button>
            <button v-else type="button" class="btn" :aria-label="`Marcar la mesa ${m.numero} como disponible`" @click="pedirCambioDisponibilidad(m, $event)">Disponible</button>
          </div>
        </div>
      </li>
    </ul>

    <FormularioMesaDialog
      :abierto="formAbierto"
      :mesa="enEdicion"
      :zonas="secciones"
      :siguiente-numero="siguienteNumero"
      :origen-foco="origenForm"
      @cerrar="formAbierto = false"
      @guardado="alGuardar"
    />

    <ConfirmarAccionDialog
      :abierto="objetivo !== null"
      id-base="disponibilidad-mesa"
      :titulo="objetivo?.activa ? `¿Marcar la mesa ${objetivo?.numero} como no disponible?` : `¿Marcar la mesa ${objetivo?.numero} como disponible?`"
      :descripcion="
        objetivo?.activa
          ? 'Dejará de aparecer en el Salón y en el Panel de mesas: la hostess y los meseros no podrán verla, sentar a nadie ni reservarla. Las cuentas y reservaciones anteriores no cambian.'
          : 'Volverá a aparecer en el Salón y en el Panel de mesas.'
      "
      :texto-confirmar="objetivo?.activa ? 'No disponible' : 'Disponible'"
      :en-curso="enCurso"
      :error-reintentable="errorReintentable"
      :rechazo="rechazo"
      :origen-foco="origenConfirmar"
      @confirmar="confirmarCambioDisponibilidad"
      @cerrar="objetivo = null"
    />
  </section>
</template>

<style scoped>
.pantalla { display: flex; flex-direction: column; gap: var(--espacio-4); max-width: 1000px; margin: 0 auto; }
.pantalla__cabecera { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-3); }
.pantalla__acciones { display: flex; flex-wrap: wrap; gap: var(--espacio-2); }
.filtros { display: flex; flex-direction: column; gap: var(--espacio-3); }
.filtros__chips { display: flex; flex-wrap: wrap; gap: var(--espacio-2); }
.filtros__campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--espacio-3); }
.campo select { min-height: var(--tactil-min); padding: 0 var(--espacio-4); border: 2px solid var(--color-muted); border-radius: var(--radio-sm); background: var(--color-surface); font-weight: 400; }
.campo input[type='search'] { min-height: var(--tactil-min); }

.lista { display: flex; flex-direction: column; gap: var(--espacio-3); margin: 0; padding: 0; list-style: none; }
.fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-4); padding: var(--espacio-4) var(--espacio-5); }
.fila--inactiva { background: var(--color-bg); }
.fila--inactiva .fila__datos { opacity: 0.85; }
.fila__datos { flex: 1 1 240px; min-width: 0; }
.fila__linea { margin: var(--espacio-1) 0 0; overflow-wrap: anywhere; }
.fila__meta { color: var(--color-muted); font-size: var(--texto-sm); }
.fila__lado { display: flex; flex: 0 1 auto; flex-direction: column; align-items: flex-end; gap: var(--espacio-3); }
.fila__insignias { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--espacio-2); }
.fila__acciones { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--espacio-2); }

@media (max-width: 40em) {
  .fila__lado { align-items: stretch; width: 100%; }
  .fila__insignias, .fila__acciones { justify-content: flex-start; }
  .fila__acciones .btn { flex: 1 1 140px; }
}
</style>
