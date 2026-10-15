<script setup lang="ts">
// Confirmación breve de una acción sobre un pedido ("Enviar a cocina", "Marcar como entregado").
// Solo pinta el diálogo: quien lo usa hace la llamada, decide las claves de idempotencia y rellena
// `errorReintentable` (fallo de red: se puede reintentar) o `rechazo` (el servidor la negó: solo cerrar).
import { nextTick, ref, watch } from 'vue'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{
  abierto: boolean
  /** Sufijo para los ids del encabezado (evita ids repetidos). */
  idBase: string
  titulo: string
  descripcion: string
  textoConfirmar: string
  enCurso: boolean
  errorReintentable: string
  rechazo: string
  origenFoco?: HTMLElement | null
  focoAlternativo?: HTMLElement | null
}>()

const emit = defineEmits<{ confirmar: []; cerrar: [] }>()

const botonCerrar = ref<HTMLButtonElement | null>(null)

// Si el servidor rechaza la acción, solo queda "Entendido": el foco pasa ahí.
watch(
  () => props.rechazo,
  async (texto) => {
    if (!texto) return
    await nextTick()
    botonCerrar.value?.focus()
  },
)
</script>

<template>
  <DialogoModal
    :abierto="abierto"
    :etiqueta-id="`confirmar-${idBase}`"
    variante="centro"
    :cerrable="!enCurso"
    :origen-foco="origenFoco ?? null"
    :foco-alternativo="focoAlternativo ?? null"
    @cerrar="emit('cerrar')"
  >
    <div class="confirmar">
      <h2 :id="`confirmar-${idBase}`">{{ titulo }}</h2>

      <div v-if="rechazo" class="confirmar__alerta" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <div>
          <strong>No se pudo completar la acción</strong>
          <p>{{ rechazo }}</p>
          <p>La información de la pantalla ya se actualizó.</p>
        </div>
      </div>
      <template v-else>
        <p class="confirmar__texto">{{ descripcion }}</p>
        <div v-if="errorReintentable" class="confirmar__alerta" role="alert">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.01" />
          </svg>
          <p>{{ errorReintentable }}</p>
        </div>
      </template>

      <p class="solo-lectores" role="status">{{ enCurso ? 'Procesando…' : '' }}</p>

      <div class="fila-botones">
        <button v-if="rechazo" ref="botonCerrar" type="button" class="btn" @click="emit('cerrar')">Entendido</button>
        <template v-else>
          <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">
            Volver
          </button>
          <button type="button" class="btn" autofocus :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('confirmar')">
            {{ enCurso ? 'Procesando…' : errorReintentable ? 'Reintentar' : textoConfirmar }}
          </button>
        </template>
      </div>
    </div>
  </DialogoModal>
</template>

<style scoped>
.confirmar {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.confirmar__texto {
  margin: 0;
}

.confirmar__alerta {
  display: flex;
  gap: var(--espacio-3);
  padding: var(--espacio-3) var(--espacio-4);
  border: 2px solid var(--color-peligro);
  border-radius: var(--radio);
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
}

.confirmar__alerta svg {
  flex: none;
  margin-top: var(--espacio-1);
}

.confirmar__alerta p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-text);
}

.confirmar__alerta strong {
  color: var(--color-peligro-texto);
}

</style>
