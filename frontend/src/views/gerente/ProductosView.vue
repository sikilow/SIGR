<script setup lang="ts">
// Productos e inventario (/gerente/productos): consultar, crear, editar (precio, categoría, existencia,
// stock mínimo) y activar/desactivar. Los productos no se borran (hay pedidos que los usan): se desactivan.
import { computed, onMounted, ref } from 'vue'
import CategoriasDialog from '../../components/CategoriasDialog.vue'
import ConfirmarAccionDialog from '../../components/ConfirmarAccionDialog.vue'
import FormularioProductoDialog from '../../components/FormularioProductoDialog.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { ErrorServicio, servicios } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import type { CategoriaAdmin, ProductoAdmin } from '../../types'
import { formatearMoneda } from '../../utils/formato'

const anuncios = useAnunciosStore()

const productos = ref<ProductoAdmin[]>([])
const categorias = ref<CategoriaAdmin[]>([])
const cargando = ref(true)
const error = ref('')

type Estado = 'todos' | 'activos' | 'inactivos' | 'poco_stock'
const estado = ref<Estado>('todos')
const categoriaFiltro = ref<number | 'todas'>('todas')
const busqueda = ref('')

const pocoStock = (p: ProductoAdmin) => p.activo && p.existencia > 0 && p.existencia <= p.stockMinimo

const lista = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return productos.value.filter((p) => {
    if (estado.value === 'activos' && !p.activo) return false
    if (estado.value === 'inactivos' && p.activo) return false
    if (estado.value === 'poco_stock' && !(pocoStock(p) || (p.activo && p.existencia === 0))) return false
    if (categoriaFiltro.value !== 'todas' && p.idCategoria !== categoriaFiltro.value) return false
    if (q && !`${p.nombre} ${p.descripcion}`.toLowerCase().includes(q)) return false
    return true
  })
})

const cuenta = computed(() => ({
  todos: productos.value.length,
  activos: productos.value.filter((p) => p.activo).length,
  inactivos: productos.value.filter((p) => !p.activo).length,
  poco_stock: productos.value.filter((p) => p.activo && (p.existencia === 0 || pocoStock(p))).length,
}))

async function cargar(conEsqueleto = false) {
  if (conEsqueleto) cargando.value = true
  try {
    const [prods, cats] = await Promise.all([servicios.catalogo.listarProductos(), servicios.catalogo.listarCategorias()])
    productos.value = prods
    categorias.value = cats
    // Si la categoría filtrada ya no existe (se borró), se vuelve a "todas".
    if (categoriaFiltro.value !== 'todas' && !cats.some((c) => c.idCategoria === categoriaFiltro.value)) categoriaFiltro.value = 'todas'
    error.value = ''
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar los productos.'
  } finally {
    cargando.value = false
  }
}

onMounted(() => void cargar(true))

// ---------- Crear / editar ----------
const formAbierto = ref(false)
const enEdicion = ref<ProductoAdmin | null>(null)
const origenForm = ref<HTMLElement | null>(null)

function abrirNuevo(e: Event) {
  enEdicion.value = null
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

function abrirEdicion(p: ProductoAdmin, e: Event) {
  enEdicion.value = p
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

async function alGuardar(p: ProductoAdmin, creado: boolean) {
  formAbierto.value = false
  void anuncios.anunciar(creado ? `Producto «${p.nombre}» creado` : `Cambios de «${p.nombre}» guardados`)
  await cargar()
}

// ---------- Categorías ----------
const catAbierto = ref(false)
const origenCat = ref<HTMLElement | null>(null)

function abrirCategorias(e: Event) {
  origenCat.value = e.currentTarget as HTMLElement
  catAbierto.value = true
}

// ---------- Activar / desactivar ----------
const objetivo = ref<ProductoAdmin | null>(null)
const origenConfirmar = ref<HTMLElement | null>(null)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')

function pedirCambioEstado(p: ProductoAdmin, e: Event) {
  objetivo.value = p
  origenConfirmar.value = e.currentTarget as HTMLElement
  enCurso.value = false
  errorReintentable.value = ''
  rechazo.value = ''
}

async function confirmarCambioEstado() {
  const p = objetivo.value
  if (!p || enCurso.value) return
  enCurso.value = true
  errorReintentable.value = ''
  try {
    const nuevo = await servicios.catalogo.actualizarProducto(p.idProducto, { activo: !p.activo })
    objetivo.value = null
    void anuncios.anunciar(nuevo.activo ? `«${nuevo.nombre}» activado` : `«${nuevo.nombre}» desactivado`)
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

const ESTADOS: Array<{ clave: Estado; texto: string }> = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'activos', texto: 'Activos' },
  { clave: 'inactivos', texto: 'Inactivos' },
  { clave: 'poco_stock', texto: 'Poco stock o agotados' },
]
</script>

<template>
  <section class="pantalla" aria-labelledby="productos-titulo">
    <header class="pantalla__cabecera">
      <h2 id="productos-titulo">Productos e inventario</h2>
      <div class="pantalla__acciones">
        <button type="button" class="btn btn--secundario" @click="abrirCategorias">Categorías</button>
        <button type="button" class="btn" @click="abrirNuevo">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo producto
        </button>
      </div>
    </header>

    <div class="filtros">
      <div class="filtros__chips" role="group" aria-label="Estado">
        <button
          v-for="f in ESTADOS"
          :key="f.clave"
          type="button"
          class="chip"
          :class="{ 'chip--activo': estado === f.clave }"
          :aria-pressed="estado === f.clave"
          @click="estado = f.clave"
        >
          {{ f.texto }} <span class="numero">({{ cuenta[f.clave] }})</span>
        </button>
      </div>
      <div class="filtros__campos">
        <div class="campo">
          <label for="prod-buscar">Buscar</label>
          <input id="prod-buscar" v-model="busqueda" type="search" placeholder="Nombre o descripción" autocomplete="off" />
        </div>
        <div class="campo">
          <label for="prod-filtro-cat">Categoría</label>
          <select id="prod-filtro-cat" v-model="categoriaFiltro">
            <option value="todas">Todas las categorías</option>
            <option v-for="c in categorias" :key="c.idCategoria" :value="c.idCategoria">{{ c.nombre }} ({{ c.totalProductos }})</option>
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
      <p class="solo-lectores" role="status">Cargando productos…</p>
    </div>

    <div v-else-if="!error && lista.length === 0" class="vacio">
      <p v-if="productos.length === 0">Todavía no hay productos. Crea una categoría y luego tu primer producto.</p>
      <p v-else>Ningún producto coincide con los filtros.</p>
    </div>

    <ul v-else class="lista">
      <li v-for="p in lista" :key="p.idProducto" class="fila tarjeta" :class="{ 'fila--inactiva': !p.activo }">
        <div class="fila__datos">
          <h3>{{ p.nombre }}</h3>
          <p class="fila__linea fila__meta">{{ p.categoria }}<template v-if="p.descripcion"> · {{ p.descripcion }}</template></p>
          <p class="fila__precio numero">{{ formatearMoneda(p.precio) }}</p>
          <p class="fila__linea">
            Existencia: <strong class="numero">{{ p.existencia }}</strong>
            <span class="fila__meta"> · mínimo {{ p.stockMinimo }}</span>
          </p>
        </div>

        <div class="fila__lado">
          <div class="fila__insignias">
            <InsigniaEstado :tono="p.activo ? 'disponible' : 'cancelado'" :texto="p.activo ? 'Activo' : 'Inactivo'" />
            <InsigniaEstado v-if="p.activo && p.existencia === 0" tono="agotado" texto="Agotado" />
            <InsigniaEstado v-else-if="pocoStock(p)" tono="listo" texto="Poco stock" />
          </div>
          <div class="fila__acciones">
            <button type="button" class="btn btn--secundario" :aria-label="`Editar ${p.nombre}`" @click="abrirEdicion(p, $event)">Editar</button>
            <button
              v-if="p.activo"
              type="button"
              class="btn btn--peligro-suave"
              :aria-label="`Desactivar ${p.nombre}`"
              @click="pedirCambioEstado(p, $event)"
            >
              Desactivar
            </button>
            <button v-else type="button" class="btn" :aria-label="`Activar ${p.nombre}`" @click="pedirCambioEstado(p, $event)">Activar</button>
          </div>
        </div>
      </li>
    </ul>

    <FormularioProductoDialog
      :abierto="formAbierto"
      :producto="enEdicion"
      :categorias="categorias"
      :categoria-inicial="categoriaFiltro === 'todas' ? null : categoriaFiltro"
      :origen-foco="origenForm"
      @cerrar="formAbierto = false"
      @guardado="alGuardar"
    />

    <CategoriasDialog :abierto="catAbierto" :origen-foco="origenCat" @cerrar="catAbierto = false" @cambio="cargar()" />

    <ConfirmarAccionDialog
      :abierto="objetivo !== null"
      id-base="estado-producto"
      :titulo="objetivo?.activo ? `¿Desactivar «${objetivo?.nombre}»?` : `¿Activar «${objetivo?.nombre}»?`"
      :descripcion="
        objetivo?.activo
          ? 'Los meseros lo verán como agotado y no podrán agregarlo a pedidos nuevos. Los pedidos ya hechos no cambian.'
          : 'Volverá a estar disponible en el menú (siempre que tenga existencia).'
      "
      :texto-confirmar="objetivo?.activo ? 'Desactivar' : 'Activar'"
      :en-curso="enCurso"
      :error-reintentable="errorReintentable"
      :rechazo="rechazo"
      :origen-foco="origenConfirmar"
      @confirmar="confirmarCambioEstado"
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
.fila__datos { flex: 1 1 280px; min-width: 0; }
.fila__datos h3 { overflow-wrap: anywhere; }
.fila__linea { margin: var(--espacio-1) 0 0; overflow-wrap: anywhere; }
.fila__precio { margin: var(--espacio-1) 0 0; font-size: var(--texto-lg); font-weight: 700; }
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
