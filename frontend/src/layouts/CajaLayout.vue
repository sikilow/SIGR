<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FranjaDemo from '../components/FranjaDemo.vue'
import LogoMarca from '../components/LogoMarca.vue'
import { usandoMock } from '../services'
import { useAnunciosStore } from '../stores/anuncios'
import { useSesionStore } from '../stores/sesion'
import { ETIQUETA_ROL } from '../types'

const sesion = useSesionStore()
const anuncios = useAnunciosStore()
const router = useRouter()
const route = useRoute()
const contenido = ref<HTMLElement | null>(null)
const rolVisible = computed(() => (sesion.rol ? ETIQUETA_ROL[sesion.rol] : ''))

watch(
  () => route.matched.at(-1)?.path ?? route.path,
  async () => {
    await nextTick()
    contenido.value?.focus({ preventScroll: true })
  },
)

onMounted(() => contenido.value?.focus({ preventScroll: true }))

async function salir() {
  await sesion.cerrarSesion()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="layout" :class="{ 'layout--demo': usandoMock }">
    <a class="saltar-contenido" href="#contenido-principal">Saltar al contenido</a>
    <FranjaDemo />
    <header class="barra">
      <div class="barra__marca">
        <LogoMarca :tamano="40" invertido />
        <h1 class="barra__restaurante">La Madalena</h1>
      </div>
      <div class="barra__usuario">
        <p class="barra__datos">
          <strong>{{ sesion.usuario?.nombre }}</strong>
          <span class="barra__rol">{{ rolVisible }}</span>
        </p>
        <button type="button" class="btn btn--secundario" @click="salir">Salir</button>
      </div>
    </header>
    <div class="avisos" role="status" aria-live="polite" aria-atomic="true">
      <p v-if="anuncios.texto" class="avisos__texto">{{ anuncios.texto }}</p>
    </div>
    <main id="contenido-principal" ref="contenido" class="contenido" tabindex="-1">
      <RouterView />
    </main>
    <nav class="nav" aria-label="Navegación principal">
      <RouterLink class="nav__enlace" :to="{ name: 'cajero-caja' }">
        <span>Caja</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(var(--altura-barra-superior), auto) minmax(0, 1fr) var(--altura-nav-inferior);
  height: 100dvh;
  min-height: 0;
}

.layout--demo {
  grid-template-rows: auto minmax(var(--altura-barra-superior), auto) minmax(0, 1fr) var(--altura-nav-inferior);
}

.barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-1) var(--espacio-4);
  padding: var(--espacio-1) var(--espacio-6);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.barra__marca,
.barra__usuario {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
}

.barra__restaurante {
  font-size: var(--texto-xl);
}

.barra__datos {
  display: grid;
  margin: 0;
}

.barra__rol {
  font-size: var(--texto-sm);
}

.avisos {
  position: fixed;
  top: calc(var(--altura-barra-superior) + var(--espacio-3));
  left: 50%;
  z-index: 50;
  width: max-content;
  max-width: calc(100% - var(--espacio-8));
  transform: translateX(-50%);
  pointer-events: none;
}

.avisos__texto {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  margin: 0;
  padding: var(--espacio-3) var(--espacio-5);
  border: 2px solid var(--color-primary-dark);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: 0 8px 24px rgb(31 41 55 / 25%);
  color: var(--color-primary-dark);
  font-weight: 700;
}

.contenido {
  min-height: 0;
  overflow: auto;
  padding: var(--espacio-6);
}

.nav {
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.nav__enlace {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: var(--espacio-2) var(--espacio-6);
  color: var(--color-primary);
  font-weight: 700;
  text-decoration: none;
}

@media print {
  .layout > :not(.contenido) {
    display: none;
  }

  .layout,
  .contenido {
    display: block;
    height: auto;
    overflow: visible;
  }
}
</style>
