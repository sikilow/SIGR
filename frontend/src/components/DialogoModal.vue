<script setup lang="ts">
// Diálogo modal reutilizable sobre <dialog> nativo. Aporta:
//  - fondo inerte y cierre con Escape (si `cerrable`),
//  - foco atrapado (Tab y Shift+Tab dan la vuelta),
//  - al cerrar, el foco vuelve al elemento que lo abrió (o a `origenFoco`),
//  - tocar el fondo oscuro cierra (si `cerrable`).
// El contenido del slot solo existe mientras el diálogo está abierto. Para que el foco inicial
// caiga en una acción concreta, ponle `autofocus` a ese elemento.
import { computed, nextTick, ref, watch } from 'vue'
import { useCompacto } from '../composables/useCompacto'

const props = withDefaults(
  defineProps<{
    abierto: boolean
    /** id del encabezado que da nombre al diálogo (aria-labelledby). */
    etiquetaId: string
    /** `auto`: hoja en teléfono/tablet vertical y centro en tablet horizontal/escritorio. */
    variante?: 'auto' | 'hoja' | 'centro'
    /** `false` mientras hay una operación en curso: Escape y el fondo no cierran. */
    cerrable?: boolean
    /** Elemento al que se devuelve el foco; por defecto, el que lo tenía al abrir. */
    origenFoco?: HTMLElement | null
    /** Si el origen ya no existe al cerrar (p. ej. su botón desapareció), el foco va aquí. */
    focoAlternativo?: HTMLElement | null
  }>(),
  { variante: 'auto', cerrable: true, origenFoco: null, focoAlternativo: null },
)

const compacto = useCompacto()
const varianteEfectiva = computed(() =>
  props.variante === 'auto' ? (compacto.value ? 'hoja' : 'centro') : props.variante,
)

const emit = defineEmits<{ cerrar: [] }>()

const dialogo = ref<HTMLDialogElement | null>(null)
let elementoOrigen: HTMLElement | null = null

const SELECTOR_ENFOCABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

watch(
  () => props.abierto,
  async (ahoraAbierto) => {
    const el = dialogo.value
    if (!el) return
    if (ahoraAbierto && !el.open) {
      elementoOrigen = props.origenFoco ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      await nextTick()
      el.showModal()
    } else if (!ahoraAbierto && el.open) {
      el.close()
    }
  },
  { flush: 'post' },
)

/** Se dispara al cerrar (Escape, botón o código): devuelve el foco y avisa al padre. */
function alCerrar() {
  const destino = props.origenFoco ?? elementoOrigen
  if (destino?.isConnected) destino.focus()
  else props.focoAlternativo?.focus()
  elementoOrigen = null
  if (props.abierto) emit('cerrar')
}

/** Escape: si hay una operación en curso, no se cierra. */
function alCancelar(evento: Event) {
  if (!props.cerrable) evento.preventDefault()
}

/** Tocar el fondo (el propio <dialog>, fuera de su contenido) cierra. */
function alTocarFondo(evento: MouseEvent) {
  if (props.cerrable && evento.target === dialogo.value) dialogo.value?.close()
}

/** Atrapa el foco: de la última acción vuelve a la primera y viceversa. */
function alPulsarTecla(evento: KeyboardEvent) {
  if (evento.key !== 'Tab' || !dialogo.value) return
  const enfocables = Array.from(dialogo.value.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE)).filter(
    (e) => e.offsetParent !== null || e === document.activeElement,
  )
  const primero = enfocables[0]
  const ultimo = enfocables[enfocables.length - 1]
  if (!primero || !ultimo) return
  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault()
    ultimo.focus()
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault()
    primero.focus()
  }
}

defineExpose({ cerrar: () => dialogo.value?.close() })
</script>

<template>
  <dialog
    ref="dialogo"
    class="dialogo"
    :class="`dialogo--${varianteEfectiva}`"
    :aria-labelledby="etiquetaId"
    @close="alCerrar"
    @cancel="alCancelar"
    @click="alTocarFondo"
    @keydown="alPulsarTecla"
  >
    <slot v-if="abierto" />
  </dialog>
</template>

<style scoped>
.dialogo {
  padding: var(--espacio-6);
  border: none;
  background: var(--color-surface);
  color: var(--color-text);
  overflow-y: auto;
}

.dialogo::backdrop {
  background: rgb(31 41 55 / 55%);
}

/* Hoja anclada abajo, centrada y con ancho de lectura cómodo en tablet */
.dialogo--hoja {
  width: min(100%, 640px);
  max-width: 100%;
  max-height: 85dvh;
  margin: auto auto 0;
  border-radius: var(--radio) var(--radio) 0 0;
  box-shadow: 0 -8px 24px rgb(31 41 55 / 25%);
}

/* Diálogo centrado para revisión y confirmaciones */
.dialogo--centro {
  width: min(720px, calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  margin: auto;
  border-radius: var(--radio);
  box-shadow: 0 8px 32px rgb(31 41 55 / 35%);
}

@media (prefers-reduced-motion: no-preference) {
  .dialogo[open] {
    animation: aparecer-dialogo 200ms ease-out;
  }
}

@keyframes aparecer-dialogo {
  from {
    transform: translateY(32px);
    opacity: 0;
  }
}
</style>
