<script setup lang="ts">
// Preferencias de mesa de un grupo: sección preferida y características del catálogo que administra Gerencia
// («Planta baja», «Junto a la ventana»…). Lo usan Nueva/Editar reservación y Asignar mesa de la lista de espera. No
// bloquea nada: solo ordena las mesas sugeridas (primero las que coinciden) y, en una reservación, se guarda para verlo
// al confirmar y al sentar al grupo.
import { computed } from 'vue'
import type { CaracteristicaMesa, PreferenciasReservacion } from '../../types'

const props = defineProps<{
  /** Prefijo de los `id` (hay más de un formulario en la app). */
  idPrefijo: string
  /** Secciones que se pueden elegir. */
  zonas: string[]
  /** Características que se pueden pedir (las que tienen las mesas). */
  opciones: CaracteristicaMesa[]
  deshabilitado?: boolean
  /** Texto de la leyenda. */
  leyenda?: string
}>()

const modelo = defineModel<PreferenciasReservacion>({ required: true })

/**
 * Lo que se ofrece: las características de las mesas y, además, las que ya estaban pedidas aunque ninguna mesa las
 * tenga ahora (así no se pierden al editar).
 */
const visibles = computed(() => {
  const mapa = new Map(props.opciones.map((c) => [c.idCaracteristica, c]))
  for (const c of modelo.value.caracteristicas) if (!mapa.has(c.idCaracteristica)) mapa.set(c.idCaracteristica, c)
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
})

function marcada(c: CaracteristicaMesa): boolean {
  return modelo.value.caracteristicas.some((x) => x.idCaracteristica === c.idCaracteristica)
}

function alternar(c: CaracteristicaMesa, activa: boolean) {
  const otras = modelo.value.caracteristicas.filter((x) => x.idCaracteristica !== c.idCaracteristica)
  modelo.value = { ...modelo.value, caracteristicas: activa ? [...otras, c] : otras }
}

function cambiarZona(zona: string) {
  modelo.value = { ...modelo.value, zona: zona || null }
}
</script>

<template>
  <fieldset class="preferencias" :disabled="deshabilitado">
    <legend>{{ leyenda ?? 'Preferencias de mesa' }}</legend>
    <div class="preferencias__campo">
      <label :for="`${idPrefijo}-zona`">Sección preferida</label>
      <select :id="`${idPrefijo}-zona`" :value="modelo.zona ?? ''" @change="cambiarZona(($event.target as HTMLSelectElement).value)">
        <option value="">Cualquier sección</option>
        <option v-for="zona in zonas" :key="zona" :value="zona">{{ zona }}</option>
      </select>
    </div>
    <div v-if="visibles.length" class="preferencias__opciones">
      <label v-for="c in visibles" :key="c.idCaracteristica" class="opcion-acceso">
        <input type="checkbox" :checked="marcada(c)" @change="alternar(c, ($event.target as HTMLInputElement).checked)" />
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{{ c.nombre }}</span>
      </label>
    </div>
    <p v-else class="preferencias__vacio">
      Ninguna mesa tiene características registradas. Gerencia las asigna en Mesas.
    </p>
  </fieldset>
</template>

<style scoped>
.preferencias {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4) var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface-2);
}

.preferencias legend {
  padding-inline: var(--espacio-1);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.preferencias__campo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-1);
}

.preferencias__campo label {
  font-weight: 700;
}

.preferencias__campo select {
  min-height: var(--tactil-min);
}

.preferencias__opciones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--espacio-2);
}

.preferencias__vacio {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.opcion-acceso {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: var(--tactil-min);
  padding: var(--espacio-2) var(--espacio-3);
  border: 2px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-size: var(--texto-sm);
  font-weight: 600;
  cursor: pointer;
}

.opcion-acceso input {
  flex: none;
  width: 22px;
  height: 22px;
  accent-color: var(--color-primary);
}

/* La palomita solo se ve cuando está marcada (además de la casilla): no depende solo del color. */
.opcion-acceso svg {
  flex: none;
  color: var(--color-primary-dark);
  visibility: hidden;
}

.opcion-acceso:has(input:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

.opcion-acceso:has(input:checked) svg {
  visibility: visible;
}

.opcion-acceso:has(input:focus-visible) {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 2px;
}
</style>
