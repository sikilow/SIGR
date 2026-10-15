<script setup lang="ts">
// Administra las categorías del menú: crear, renombrar y borrar (solo las vacías).
// Cada cambio se guarda de inmediato; al cerrar, la pantalla recarga sus listas.
import { nextTick, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { CategoriaAdmin } from '../types'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{ abierto: boolean; origenFoco?: HTMLElement | null }>()
const emit = defineEmits<{ cerrar: []; cambio: [] }>()

const categorias = ref<CategoriaAdmin[]>([])
const cargando = ref(false)
const nueva = ref('')
const editandoId = ref<number | null>(null)
const nombreEditado = ref('')
const aBorrar = ref<CategoriaAdmin | null>(null)
const enCurso = ref(false)
const error = ref('')
const campoNueva = ref<HTMLInputElement | null>(null)

async function cargar() {
  cargando.value = true
  try {
    categorias.value = await servicios.catalogo.listarCategorias()
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar las categorías.'
  } finally {
    cargando.value = false
  }
}

watch(
  () => props.abierto,
  async (abierto) => {
    if (!abierto) return
    nueva.value = ''
    editandoId.value = null
    aBorrar.value = null
    error.value = ''
    await cargar()
  },
)

/** Ejecuta una acción, muestra el error del servidor si falla y recarga la lista si salió bien. */
async function correr(accion: () => Promise<unknown>): Promise<boolean> {
  if (enCurso.value) return false
  enCurso.value = true
  error.value = ''
  try {
    await accion()
    await cargar()
    emit('cambio')
    return true
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
    return false
  } finally {
    enCurso.value = false
  }
}

async function crear() {
  const texto = nueva.value.trim()
  if (!texto) {
    error.value = 'Escribe el nombre de la categoría.'
    campoNueva.value?.focus()
    return
  }
  if (await correr(() => servicios.catalogo.crearCategoria(texto))) {
    nueva.value = ''
    await nextTick()
    campoNueva.value?.focus()
  }
}

function empezarEdicion(c: CategoriaAdmin) {
  editandoId.value = c.id
  nombreEditado.value = c.nombre
  aBorrar.value = null
  error.value = ''
}

async function guardarEdicion() {
  const id = editandoId.value
  const texto = nombreEditado.value.trim()
  if (id === null) return
  if (!texto) {
    error.value = 'El nombre no puede quedar vacío.'
    return
  }
  if (await correr(() => servicios.catalogo.renombrarCategoria(id, texto))) editandoId.value = null
}

async function borrar() {
  const c = aBorrar.value
  if (!c) return
  await correr(() => servicios.catalogo.eliminarCategoria(c.id))
  aBorrar.value = null
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="cat-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <div class="cat">
      <h2 id="cat-titulo">Categorías del menú</h2>

      <form class="cat__nueva" novalidate @submit.prevent="crear">
        <div class="campo">
          <label for="cat-nueva">Nueva categoría</label>
          <input id="cat-nueva" ref="campoNueva" v-model="nueva" type="text" maxlength="80" autocomplete="off" autofocus />
        </div>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">Agregar</button>
      </form>

      <div v-if="error" class="cat__alerta" role="alert"><p>{{ error }}</p></div>

      <p v-if="cargando && categorias.length === 0" class="cat__vacio">Cargando…</p>
      <p v-else-if="categorias.length === 0" class="cat__vacio">Todavía no hay categorías.</p>

      <ul v-else class="cat__lista">
        <li v-for="c in categorias" :key="c.id" class="cat__fila">
          <template v-if="editandoId === c.id">
            <form class="cat__edicion" novalidate @submit.prevent="guardarEdicion">
              <label class="solo-lectores" :for="`cat-edit-${c.id}`">Nuevo nombre de {{ c.nombre }}</label>
              <input :id="`cat-edit-${c.id}`" v-model="nombreEditado" type="text" maxlength="80" autocomplete="off" autofocus />
              <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">Guardar</button>
              <button type="button" class="btn btn--secundario" @click="editandoId = null">Cancelar</button>
            </form>
          </template>
          <template v-else-if="aBorrar?.id === c.id">
            <p class="cat__confirmar" role="alert">
              ¿Borrar «{{ c.nombre }}»? No se puede deshacer.
            </p>
            <div class="cat__acciones">
              <button type="button" class="btn btn--peligro" :aria-disabled="enCurso ? 'true' : undefined" @click="borrar">Sí, borrar</button>
              <button type="button" class="btn btn--secundario" autofocus @click="aBorrar = null">No borrar</button>
            </div>
          </template>
          <template v-else>
            <div class="cat__datos">
              <strong>{{ c.nombre }}</strong>
              <span class="cat__cuenta numero">{{ c.totalProductos }} {{ c.totalProductos === 1 ? 'producto' : 'productos' }}</span>
            </div>
            <div class="cat__acciones">
              <button type="button" class="btn btn--secundario" :aria-label="`Renombrar ${c.nombre}`" @click="empezarEdicion(c)">Renombrar</button>
              <button
                type="button"
                class="btn btn--peligro-suave"
                :aria-label="`Borrar ${c.nombre}`"
                :aria-disabled="c.totalProductos > 0 ? 'true' : undefined"
                :title="c.totalProductos > 0 ? 'Solo se pueden borrar categorías sin productos' : undefined"
                @click="c.totalProductos === 0 ? (aBorrar = c) : (error = `«${c.nombre}» tiene productos. Muévelos a otra categoría o desactívalos antes de borrarla.`)"
              >
                Borrar
              </button>
            </div>
          </template>
        </li>
      </ul>

      <div class="fila-botones">
        <button type="button" class="btn" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Listo</button>
      </div>
    </div>
  </DialogoModal>
</template>

<style scoped>
.cat { display: flex; flex-direction: column; gap: var(--espacio-3); }
.cat__nueva { display: flex; align-items: flex-end; gap: var(--espacio-3); }
.cat__nueva .campo { flex: 1; min-width: 0; }
.cat__lista { margin: 0; padding: 0; list-style: none; border: 1px solid var(--color-border); border-radius: var(--radio); }
.cat__fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-3); padding: var(--espacio-3) var(--espacio-4); }
.cat__fila + .cat__fila { border-top: 1px solid var(--color-border); }
.cat__datos { display: flex; flex-direction: column; }
.cat__cuenta { color: var(--color-muted); font-size: var(--texto-sm); }
.cat__acciones { display: flex; flex-wrap: wrap; gap: var(--espacio-2); }
.cat__edicion { display: flex; flex: 1; flex-wrap: wrap; gap: var(--espacio-2); }
.cat__edicion input { flex: 1; min-width: 160px; min-height: var(--tactil-min); padding: 0 var(--espacio-4); border: 2px solid var(--color-muted); border-radius: var(--radio-sm); background: var(--color-surface); }
.cat__confirmar { margin: 0; color: var(--color-peligro-texto); font-weight: 700; }
.cat__vacio { margin: 0; color: var(--color-muted); text-align: center; }
.cat__alerta { padding: var(--espacio-3) var(--espacio-4); border: 2px solid var(--color-peligro); border-radius: var(--radio); background: var(--color-peligro-fondo); }
.cat__alerta p { margin: 0; color: var(--color-peligro-texto); font-weight: 600; }
</style>
