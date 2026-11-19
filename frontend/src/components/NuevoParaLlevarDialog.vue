<script setup lang="ts">
// Abrir un pedido para llevar (diálogo modal). El mesero elige el canal (mostrador, teléfono, plataforma…) y, si quiere,
// un nombre o folio para entregarlo. El servidor ocupa la primera mesa virtual libre de «Para llevar» y devuelve la mesa:
// después se piden los productos como en cualquier mesa.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { AperturaParaLlevar, CanalPedido } from '../types'
import { crearClaveIdempotencia, esFalloReintentable } from '../utils/idempotencia'
import DialogoModal from './DialogoModal.vue'
import { vPermitir } from '../utils/campos'

const props = defineProps<{
  abierto: boolean
  origenFoco?: HTMLElement | null
}>()

const emit = defineEmits<{
  cerrar: []
  abierto: [apertura: AperturaParaLlevar]
}>()

const REFERENCIA_MAX = 60

const claves = crearClaveIdempotencia()
const canales = ref<CanalPedido[]>([])
const idCanal = ref<number | null>(null)
const referencia = ref('')
const cargando = ref(false)
const enCurso = ref(false)
const intentado = ref(false)
const errorCarga = ref('')
const errorReintentable = ref('')
const rechazo = ref('')

const errorCanal = computed(() => (intentado.value && idCanal.value === null ? 'Elige de dónde viene el pedido.' : ''))
const errorReferencia = computed(() => (referencia.value.trim().length > REFERENCIA_MAX ? `Máximo ${REFERENCIA_MAX} caracteres.` : ''))

async function cargarCanales() {
  cargando.value = true
  errorCarga.value = ''
  try {
    canales.value = await servicios.catalogo.listarCanalesDisponibles()
  } catch (e) {
    errorCarga.value = e instanceof Error ? e.message : 'No se pudieron cargar los canales.'
  } finally {
    cargando.value = false
  }
}

// Cada vez que se abre se empieza de cero (intención nueva, clave nueva).
watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    idCanal.value = null
    referencia.value = ''
    intentado.value = false
    enCurso.value = false
    errorReintentable.value = ''
    rechazo.value = ''
    claves.soltar()
    void cargarCanales()
  },
)

async function abrir() {
  if (enCurso.value) return
  intentado.value = true
  if (idCanal.value === null || errorReferencia.value) return

  enCurso.value = true
  errorReintentable.value = ''
  rechazo.value = ''
  const clave = claves.para(`para-llevar|${idCanal.value}|${referencia.value.trim()}`)
  try {
    const apertura = await servicios.mesas.abrirParaLlevar(idCanal.value, referencia.value.trim() || null, clave)
    claves.soltar()
    emit('abierto', apertura)
  } catch (e) {
    if (esFalloReintentable(e)) {
      errorReintentable.value =
        e instanceof ErrorServicio && e.codigo === 'red'
          ? 'No se pudo conectar con el servidor. Vuelve a intentarlo: no se abrirá dos veces.'
          : 'El servidor no respondió como se esperaba. Vuelve a intentarlo: no se abrirá dos veces.'
    } else {
      claves.soltar()
      rechazo.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
    }
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal
    :abierto="abierto"
    etiqueta-id="llevar-titulo"
    variante="centro"
    :cerrable="!enCurso"
    :origen-foco="origenFoco ?? null"
    @cerrar="emit('cerrar')"
  >
    <form class="llevar" novalidate @submit.prevent="abrir">
      <header>
        <h2 id="llevar-titulo">Pedido para llevar</h2>
        <p class="llevar__sub">Se le asigna una mesa virtual de «Para llevar» y la cocina lo atiende en orden de llegada.</p>
      </header>

      <p v-if="cargando" class="campo__ayuda" role="status">Cargando canales…</p>
      <div v-else-if="errorCarga" class="llevar__alerta" role="alert">
        <p>{{ errorCarga }}</p>
        <button type="button" class="btn btn--secundario" @click="cargarCanales">Reintentar</button>
      </div>
      <p v-else-if="canales.length === 0" class="campo__ayuda">Gerencia aún no ha activado ningún canal de pedido.</p>

      <fieldset v-else class="canales" :aria-describedby="errorCanal ? 'llevar-canal-error' : undefined">
        <legend>¿De dónde viene? <span class="llevar__requerido">(obligatorio)</span></legend>
        <label v-for="canal in canales" :key="canal.idCanal" class="canal" :class="{ 'canal--elegido': idCanal === canal.idCanal }">
          <input v-model.number="idCanal" type="radio" name="canal-pedido" :value="canal.idCanal" :disabled="enCurso" />
          <span>{{ canal.nombre }}</span>
        </label>
        <p v-if="errorCanal" id="llevar-canal-error" class="texto-error" role="alert">{{ errorCanal }}</p>
      </fieldset>

      <div class="campo">
        <label for="llevar-referencia">Nombre o folio <span class="llevar__requerido">(opcional)</span></label>
        <input
          id="llevar-referencia" v-permitir="'texto'"
          v-model="referencia"
          type="text"
          autocomplete="off"
          :maxlength="REFERENCIA_MAX"
          placeholder="Ej.: Juan P. o folio de la plataforma"
          :disabled="enCurso"
          :aria-invalid="errorReferencia ? 'true' : undefined"
        />
        <p v-if="errorReferencia" class="texto-error" role="alert">{{ errorReferencia }}</p>
        <p v-else class="campo__ayuda">Sirve para entregar el pedido a quien corresponde.</p>
      </div>

      <div v-if="rechazo" class="llevar__alerta" role="alert">
        <strong>No se pudo abrir el pedido</strong>
        <p>{{ rechazo }}</p>
      </div>
      <div v-if="errorReintentable" class="llevar__alerta" role="alert">
        <p>{{ errorReintentable }}</p>
      </div>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">
          Cancelar
        </button>
        <button type="submit" class="btn" :aria-disabled="enCurso || canales.length === 0 ? 'true' : undefined">
          {{ enCurso ? 'Abriendo…' : errorReintentable ? 'Reintentar' : 'Abrir pedido' }}
        </button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.llevar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.llevar__sub {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.llevar__requerido {
  color: var(--color-muted);
  font-weight: 400;
}

.canales {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  border: none;
}

.canales legend {
  grid-column: 1 / -1;
  padding: 0;
  margin-bottom: var(--espacio-1);
  font-weight: 700;
}

.canales .texto-error {
  grid-column: 1 / -1;
  margin: 0;
}

/* Cada canal es una tarjeta táctil de 56 px; el elegido lleva borde grueso además del color */
.canal {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  min-height: 56px;
  padding: var(--espacio-2) var(--espacio-3);
  border: 1.5px solid var(--color-borde-control);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.canal input {
  flex: none;
  width: 22px;
  height: 22px;
  margin: 0;
  accent-color: var(--color-primary-dark);
}

.canal--elegido {
  border-color: var(--color-primary-dark);
  background: var(--color-bg);
  box-shadow: inset 0 0 0 2px var(--color-primary-dark);
}

.canal:has(input:focus-visible) {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.llevar__alerta {
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-peligro);
  border-radius: var(--radio-sm);
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
}

.llevar__alerta p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-text);
}
</style>
