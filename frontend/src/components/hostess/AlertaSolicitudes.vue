<script setup lang="ts">
// Alerta en pantalla cuando llega una solicitud de reservación nueva (por ejemplo, desde el portal de clientes).
// Es persistente (no se quita sola) para que la hostess no se la pierda mientras atiende el salón.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useReservacionesStore } from '../../stores/reservaciones'
import { useSolicitudesStore } from '../../stores/solicitudes'
import { formatearFechaHoraCorta } from '../../utils/formato'
import { aDiaISO } from '../../utils/reservaciones'

const solicitudes = useSolicitudesStore()
const reservaciones = useReservacionesStore()
const router = useRouter()

const primera = computed(() => solicitudes.nuevas[0] ?? null)
const adicionales = computed(() => Math.max(0, solicitudes.nuevas.length - 1))

async function ver() {
  const r = primera.value
  if (!r) return
  // La lista es por día: se abre el de la solicitud y se filtran las pendientes.
  const dia = aDiaISO(r.fechaHora)
  if (dia !== reservaciones.dia) await reservaciones.cambiarDia(dia)
  solicitudes.descartar()
  await router.push({ name: 'hostess-reservaciones', query: { estado: 'pendiente' } })
}
</script>

<template>
  <Transition name="alerta">
    <div v-if="primera" class="alerta" role="alert">
      <svg class="alerta__icono" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      <div class="alerta__texto">
        <strong>Nueva solicitud de reservación</strong>
        <p>
          {{ primera.clienteNombre }} · {{ formatearFechaHoraCorta(primera.fechaHora) }} ·
          {{ primera.personas }} {{ primera.personas === 1 ? 'persona' : 'personas' }}
          <template v-if="adicionales > 0"> · y {{ adicionales }} {{ adicionales === 1 ? 'solicitud más' : 'solicitudes más' }}</template>
        </p>
      </div>
      <div class="alerta__acciones">
        <button type="button" class="btn btn--secundario" @click="solicitudes.descartar()">Descartar</button>
        <button type="button" class="btn" @click="ver">Ver solicitud</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.alerta {
  position: fixed;
  top: calc(var(--altura-barra-superior) + var(--espacio-8));
  left: 50%;
  z-index: 70;
  display: flex;
  align-items: center;
  gap: var(--espacio-4);
  width: min(94vw, 46rem);
  padding: var(--espacio-3) var(--espacio-4);
  transform: translateX(-50%);
  border: 2px solid var(--color-listo);
  border-radius: var(--radio);
  background: var(--color-listo-fondo);
  box-shadow: var(--sombra-alta);
  color: var(--color-text);
}

.alerta__icono {
  flex: none;
  color: var(--color-listo-texto);
}

.alerta__texto {
  flex: 1;
  min-width: 0;
}

.alerta__texto strong {
  color: var(--color-listo-texto);
}

.alerta__texto p {
  margin: var(--espacio-1) 0 0;
}

.alerta__acciones {
  display: flex;
  flex: none;
  gap: var(--espacio-2);
}

.alerta-enter-active,
.alerta-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.alerta-enter-from,
.alerta-leave-to {
  opacity: 0;
  transform: translate(-50%, -12px);
}

@media (prefers-reduced-motion: reduce) {
  .alerta-enter-active,
  .alerta-leave-active {
    transition: none;
  }
}

@media (max-width: 40em) {
  .alerta {
    flex-wrap: wrap;
  }

  .alerta__acciones {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
