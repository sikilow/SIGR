<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { SeccionAdmin } from '../types'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{ abierto: boolean; origenFoco?: HTMLElement | null }>()
const emit = defineEmits<{ cerrar: []; cambio: [] }>()

const secciones = ref<SeccionAdmin[]>([])
const cargando = ref(false)
const nueva = ref('')
const editando = ref<string | null>(null)
const nombreEditado = ref('')
const aBorrar = ref<string | null>(null)
const aInhabilitar = ref<string | null>(null)
const enCurso = ref(false)
const error = ref('')
const campoNueva = ref<HTMLInputElement | null>(null)

async function cargar() {
  cargando.value = true
  try {
    secciones.value = await servicios.catalogo.listarSecciones()
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar las secciones.'
  } finally {
    cargando.value = false
  }
}

watch(
  () => props.abierto,
  async (abierto) => {
    if (!abierto) return
    nueva.value = ''
    editando.value = null
    aBorrar.value = null
    aInhabilitar.value = null
    error.value = ''
    await cargar()
  },
)

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
    error.value = 'Escribe el nombre de la sección.'
    campoNueva.value?.focus()
    return
  }
  if (await correr(() => servicios.catalogo.crearSeccion(texto))) {
    nueva.value = ''
    await nextTick()
    campoNueva.value?.focus()
  }
}

function empezarEdicion(seccion: SeccionAdmin) {
  editando.value = seccion.nombre
  nombreEditado.value = seccion.nombre
  aBorrar.value = null
  aInhabilitar.value = null
  error.value = ''
}

async function guardarEdicion() {
  const nombre = editando.value
  const texto = nombreEditado.value.trim()
  if (nombre === null) return
  if (!texto) {
    error.value = 'El nombre no puede quedar vacío.'
    return
  }
  if (await correr(() => servicios.catalogo.renombrarSeccion(nombre, texto))) editando.value = null
}

async function cambiarDisponibilidad(seccion: SeccionAdmin) {
  if (seccion.activa) {
    aInhabilitar.value = seccion.nombre
    aBorrar.value = null
    editando.value = null
    error.value = ''
    return
  }
  await correr(() => servicios.catalogo.actualizarSeccion(seccion.nombre, { activa: true }))
}

async function confirmarInhabilitacion() {
  const nombre = aInhabilitar.value
  if (nombre === null) return
  if (await correr(() => servicios.catalogo.actualizarSeccion(nombre, { activa: false }))) aInhabilitar.value = null
}

async function borrar() {
  const nombre = aBorrar.value
  if (nombre === null) return
  if (await correr(() => servicios.catalogo.eliminarSeccion(nombre))) aBorrar.value = null
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="secciones-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <div class="secciones">
      <h2 id="secciones-titulo">Secciones de mesas</h2>
      <p class="secciones__ayuda">
        Las secciones inhabilitadas y sus mesas dejan de aparecer para meseros y hostess. Para inhabilitar una sección,
        sus mesas deben estar libres y sin cuentas ni reservaciones vigentes.
      </p>

      <form class="secciones__nueva" novalidate @submit.prevent="crear">
        <div class="campo">
          <label for="seccion-nueva">Nueva sección</label>
          <input id="seccion-nueva" ref="campoNueva" v-model="nueva" type="text" maxlength="40" autocomplete="off" />
        </div>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">Agregar</button>
      </form>

      <div v-if="error" class="secciones__alerta" role="alert"><p>{{ error }}</p></div>

      <p v-if="cargando && secciones.length === 0" class="secciones__vacio">Cargando…</p>
      <p v-else-if="secciones.length === 0" class="secciones__vacio">Todavía no hay secciones.</p>

      <ul v-else class="secciones__lista">
        <li v-for="seccion in secciones" :key="seccion.nombre" class="secciones__fila">
          <template v-if="editando === seccion.nombre">
            <form class="secciones__edicion" novalidate @submit.prevent="guardarEdicion">
              <label class="solo-lectores" :for="`seccion-edit-${seccion.nombre}`">Nuevo nombre de {{ seccion.nombre }}</label>
              <input :id="`seccion-edit-${seccion.nombre}`" v-model="nombreEditado" type="text" maxlength="40" autocomplete="off" autofocus />
              <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">Guardar</button>
              <button type="button" class="btn btn--secundario" @click="editando = null">Cancelar</button>
            </form>
          </template>
          <template v-else-if="aBorrar === seccion.nombre">
            <p class="secciones__confirmar" role="alert">¿Borrar «{{ seccion.nombre }}»? No se puede deshacer.</p>
            <div class="secciones__acciones">
              <button type="button" class="btn btn--peligro" :aria-disabled="enCurso ? 'true' : undefined" @click="borrar">Sí, borrar</button>
              <button type="button" class="btn btn--secundario" @click="aBorrar = null">No borrar</button>
            </div>
          </template>
          <template v-else-if="aInhabilitar === seccion.nombre">
            <p class="secciones__confirmar" role="alert">
              ¿Inhabilitar «{{ seccion.nombre }}»? Sus mesas dejarán de aparecer para meseros y hostess.
            </p>
            <div class="secciones__acciones">
              <button type="button" class="btn btn--peligro" :aria-disabled="enCurso ? 'true' : undefined" @click="confirmarInhabilitacion">Sí, inhabilitar</button>
              <button type="button" class="btn btn--secundario" @click="aInhabilitar = null">Cancelar</button>
            </div>
          </template>
          <template v-else>
            <div class="secciones__datos">
              <strong>{{ seccion.nombre }}</strong>
              <span class="secciones__cuenta numero">{{ seccion.totalMesas }} {{ seccion.totalMesas === 1 ? 'mesa' : 'mesas' }}</span>
              <span class="secciones__estado" :class="{ 'secciones__estado--inactiva': !seccion.activa }">
                {{ seccion.activa ? 'Activa' : 'Inhabilitada' }}
              </span>
            </div>
            <div class="secciones__acciones">
              <button type="button" class="btn btn--secundario" :aria-label="`Renombrar ${seccion.nombre}`" @click="empezarEdicion(seccion)">Renombrar</button>
              <button type="button" class="btn btn--secundario" :aria-label="`${seccion.activa ? 'Inhabilitar' : 'Habilitar'} ${seccion.nombre}`" @click="cambiarDisponibilidad(seccion)">
                {{ seccion.activa ? 'Inhabilitar' : 'Habilitar' }}
              </button>
              <button
                type="button"
                class="btn btn--peligro-suave"
                :aria-label="`Borrar ${seccion.nombre}`"
                :aria-disabled="seccion.totalMesas > 0 ? 'true' : undefined"
                :title="seccion.totalMesas > 0 ? 'Solo se pueden borrar secciones sin mesas asignadas' : undefined"
                @click="seccion.totalMesas === 0 ? (aBorrar = seccion.nombre) : (error = `«${seccion.nombre}» tiene mesas asignadas. Muévelas a otra sección antes de borrarla.`)"
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
.secciones { display: flex; flex-direction: column; gap: var(--espacio-3); }
.secciones__ayuda { margin: 0; color: var(--color-muted); }
.secciones__nueva { display: flex; align-items: flex-end; gap: var(--espacio-3); }
.secciones__nueva .campo { flex: 1; min-width: 0; }
.secciones__lista { margin: 0; padding: 0; list-style: none; border: 1px solid var(--color-border); border-radius: var(--radio); }
.secciones__fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-3); padding: var(--espacio-3) var(--espacio-4); }
.secciones__fila + .secciones__fila { border-top: 1px solid var(--color-border); }
.secciones__datos { display: flex; flex-direction: column; gap: var(--espacio-1); }
.secciones__cuenta, .secciones__estado { color: var(--color-muted); font-size: var(--texto-sm); }
.secciones__estado { color: var(--color-muted); font-weight: 700; }
.secciones__estado--inactiva { color: var(--color-peligro-texto); }
.secciones__acciones { display: flex; flex-wrap: wrap; gap: var(--espacio-2); }
.secciones__edicion { display: flex; flex: 1; flex-wrap: wrap; gap: var(--espacio-2); }
.secciones__edicion input { flex: 1; min-width: 160px; min-height: var(--tactil-min); padding: 0 var(--espacio-4); border: 1.5px solid var(--color-borde-control); border-radius: var(--radio-sm); background: var(--color-surface); }
.secciones__confirmar { margin: 0; color: var(--color-peligro-texto); font-weight: 700; }
.secciones__vacio { margin: 0; color: var(--color-muted); text-align: center; }
.secciones__alerta { padding: var(--espacio-3) var(--espacio-4); border: 2px solid var(--color-peligro); border-radius: var(--radio); background: var(--color-peligro-fondo); }
.secciones__alerta p { margin: 0; color: var(--color-peligro-texto); font-weight: 600; }
</style>
