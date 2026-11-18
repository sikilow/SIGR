<script setup lang="ts">
// Catálogo de características de mesa (Gerente → Mesas → Características): «Planta baja», «Junto a la ventana»,
// «Terraza techada»… Gerencia las crea, renombra, desactiva o borra; después las marca en cada mesa. El portal de
// clientes y la hostess ofrecen las que tiene al menos una mesa. Mismo estilo que el diálogo de Secciones.
import { nextTick, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { CaracteristicaAdmin } from '../types'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{ abierto: boolean; origenFoco?: HTMLElement | null }>()
const emit = defineEmits<{ cerrar: []; cambio: [] }>()

const lista = ref<CaracteristicaAdmin[]>([])
const cargando = ref(false)
const nueva = ref('')
const editando = ref<number | null>(null)
const nombreEditado = ref('')
const aBorrar = ref<number | null>(null)
const enCurso = ref(false)
const error = ref('')
const campoNueva = ref<HTMLInputElement | null>(null)

const SUGERENCIAS = ['Junto a la ventana', 'Terraza techada', 'Área infantil cerca', 'Silla para bebé', 'Zona tranquila', 'Vista al jardín']

async function cargar() {
  cargando.value = true
  try {
    lista.value = await servicios.catalogo.listarCaracteristicas()
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar las características.'
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

async function crear(texto = nueva.value.trim()) {
  if (!texto) {
    error.value = 'Escribe el nombre de la característica.'
    campoNueva.value?.focus()
    return
  }
  if (await correr(() => servicios.catalogo.crearCaracteristica(texto))) {
    nueva.value = ''
    await nextTick()
    campoNueva.value?.focus()
  }
}

function empezarEdicion(c: CaracteristicaAdmin) {
  editando.value = c.idCaracteristica
  nombreEditado.value = c.nombre
  aBorrar.value = null
  error.value = ''
}

async function guardarEdicion() {
  const id = editando.value
  const texto = nombreEditado.value.trim()
  if (id === null) return
  if (!texto) {
    error.value = 'El nombre no puede quedar vacío.'
    return
  }
  if (await correr(() => servicios.catalogo.actualizarCaracteristica(id, { nombre: texto }))) editando.value = null
}

async function alternarActiva(c: CaracteristicaAdmin) {
  await correr(() => servicios.catalogo.actualizarCaracteristica(c.idCaracteristica, { activa: !c.activa }))
}

function pedirBorrado(c: CaracteristicaAdmin) {
  if (c.totalMesas > 0 || c.totalReservaciones > 0) {
    error.value = `«${c.nombre}» está en uso (${c.totalMesas} ${c.totalMesas === 1 ? 'mesa' : 'mesas'}, ${c.totalReservaciones} ${c.totalReservaciones === 1 ? 'reservación' : 'reservaciones'}). Quítala de las mesas o desactívala.`
    return
  }
  aBorrar.value = c.idCaracteristica
  editando.value = null
  error.value = ''
}

async function borrar() {
  const id = aBorrar.value
  if (id === null) return
  if (await correr(() => servicios.catalogo.eliminarCaracteristica(id))) aBorrar.value = null
}

const sugerenciasLibres = () => SUGERENCIAS.filter((s) => !lista.value.some((c) => c.nombre.toLocaleLowerCase('es') === s.toLocaleLowerCase('es')))
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="caracteristicas-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <div class="caracteristicas">
      <h2 id="caracteristicas-titulo">Características de mesa</h2>
      <p class="caracteristicas__ayuda">
        Lo que puede tener una mesa y pedir un cliente al reservar: acceso, ubicación, comodidades… Después márcalas en cada
        mesa (botón «Editar»). El portal y la hostess solo ofrecen las que tiene al menos una mesa disponible.
      </p>

      <form class="caracteristicas__nueva" novalidate @submit.prevent="crear()">
        <div class="campo">
          <label for="caracteristica-nueva">Nueva característica</label>
          <input id="caracteristica-nueva" ref="campoNueva" v-model="nueva" type="text" maxlength="40" autocomplete="off" placeholder="Ej. Junto a la ventana" />
        </div>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">Agregar</button>
      </form>
      <div v-if="sugerenciasLibres().length" class="caracteristicas__sugerencias">
        <span>Ideas:</span>
        <button v-for="s in sugerenciasLibres()" :key="s" type="button" class="chip" :aria-disabled="enCurso ? 'true' : undefined" @click="crear(s)">+ {{ s }}</button>
      </div>

      <div v-if="error" class="caracteristicas__alerta" role="alert"><p>{{ error }}</p></div>

      <p v-if="cargando && lista.length === 0" class="caracteristicas__vacio">Cargando…</p>
      <p v-else-if="lista.length === 0" class="caracteristicas__vacio">Todavía no hay características.</p>
      <ul v-else class="caracteristicas__lista">
        <li v-for="c in lista" :key="c.idCaracteristica" class="caracteristicas__fila">
          <template v-if="editando === c.idCaracteristica">
            <form class="caracteristicas__edicion" novalidate @submit.prevent="guardarEdicion">
              <label class="solo-lectores" :for="`caracteristica-edit-${c.idCaracteristica}`">Nuevo nombre de {{ c.nombre }}</label>
              <input :id="`caracteristica-edit-${c.idCaracteristica}`" v-model="nombreEditado" type="text" maxlength="40" autocomplete="off" autofocus />
              <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">Guardar</button>
              <button type="button" class="btn btn--secundario" @click="editando = null">Cancelar</button>
            </form>
          </template>
          <template v-else-if="aBorrar === c.idCaracteristica">
            <p class="caracteristicas__confirmar" role="alert">¿Borrar «{{ c.nombre }}»? No se puede deshacer.</p>
            <div class="caracteristicas__acciones">
              <button type="button" class="btn btn--peligro" :aria-disabled="enCurso ? 'true' : undefined" @click="borrar">Sí, borrar</button>
              <button type="button" class="btn btn--secundario" @click="aBorrar = null">No borrar</button>
            </div>
          </template>
          <template v-else>
            <div class="caracteristicas__datos">
              <strong>{{ c.nombre }}</strong>
              <span class="caracteristicas__cuenta numero">
                {{ c.totalMesas }} {{ c.totalMesas === 1 ? 'mesa' : 'mesas' }} · {{ c.totalReservaciones }}
                {{ c.totalReservaciones === 1 ? 'reservación' : 'reservaciones' }}
              </span>
              <span class="caracteristicas__estado" :class="{ 'caracteristicas__estado--inactiva': !c.activa }">
                {{ c.activa ? 'Activa' : 'Desactivada: no se ofrece' }}
              </span>
            </div>
            <div class="caracteristicas__acciones">
              <button type="button" class="btn btn--secundario" :aria-label="`Renombrar ${c.nombre}`" @click="empezarEdicion(c)">Renombrar</button>
              <button
                type="button"
                class="btn btn--secundario"
                :aria-label="`${c.activa ? 'Desactivar' : 'Activar'} ${c.nombre}`"
                @click="alternarActiva(c)"
              >
                {{ c.activa ? 'Desactivar' : 'Activar' }}
              </button>
              <button type="button" class="btn btn--peligro-suave" :aria-label="`Borrar ${c.nombre}`" @click="pedirBorrado(c)">Borrar</button>
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
.caracteristicas { display: flex; flex-direction: column; gap: var(--espacio-3); }
.caracteristicas__ayuda { margin: 0; color: var(--color-muted); }
.caracteristicas__nueva { display: flex; align-items: flex-end; gap: var(--espacio-3); }
.caracteristicas__nueva .campo { flex: 1; min-width: 0; }
.caracteristicas__sugerencias { display: flex; flex-wrap: wrap; align-items: center; gap: var(--espacio-2); color: var(--color-muted); font-size: var(--texto-sm); }
.chip { min-height: 36px; padding: 0 var(--espacio-3); border: 1.5px dashed var(--color-border); border-radius: 999px; background: var(--color-surface); color: var(--color-primary-dark); font: inherit; font-size: var(--texto-sm); font-weight: 650; cursor: pointer; }
.chip:hover { border-color: var(--color-primary); }
.chip:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }
.caracteristicas__lista { margin: 0; padding: 0; list-style: none; border: 1px solid var(--color-border); border-radius: var(--radio); }
.caracteristicas__fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-3); padding: var(--espacio-3) var(--espacio-4); }
.caracteristicas__fila + .caracteristicas__fila { border-top: 1px solid var(--color-border); }
.caracteristicas__datos { display: flex; flex-direction: column; gap: var(--espacio-1); }
.caracteristicas__cuenta { color: var(--color-muted); font-size: var(--texto-sm); }
.caracteristicas__estado { color: var(--color-muted); font-size: var(--texto-sm); font-weight: 700; }
.caracteristicas__estado--inactiva { color: var(--color-peligro-texto); }
.caracteristicas__acciones { display: flex; flex-wrap: wrap; gap: var(--espacio-2); }
.caracteristicas__edicion { display: flex; flex: 1; flex-wrap: wrap; gap: var(--espacio-2); }
.caracteristicas__edicion input { flex: 1; min-width: 160px; min-height: var(--tactil-min); padding: 0 var(--espacio-4); border: 1.5px solid var(--color-borde-control); border-radius: var(--radio-sm); background: var(--color-surface); }
.caracteristicas__confirmar { margin: 0; color: var(--color-peligro-texto); font-weight: 700; }
.caracteristicas__vacio { margin: 0; color: var(--color-muted); text-align: center; }
.caracteristicas__alerta { padding: var(--espacio-3) var(--espacio-4); border: 2px solid var(--color-peligro); border-radius: var(--radio); background: var(--color-peligro-fondo); }
.caracteristicas__alerta p { margin: 0; color: var(--color-peligro-texto); font-weight: 600; }
</style>
