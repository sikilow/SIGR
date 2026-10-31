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

watch(
  () => route.matched.at(-1)?.path ?? route.path,
  async () => {
    await nextTick()
    contenido.value?.focus({ preventScroll: true })
  },
)

onMounted(() => contenido.value?.focus({ preventScroll: true }))

const rolVisible = computed(() => (sesion.rol ? ETIQUETA_ROL[sesion.rol] : ''))

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
        <button type="button" class="btn btn--secundario" @click="salir">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9" />
          </svg>
          Salir
        </button>
      </div>
    </header>

    <div class="avisos" role="status" aria-live="polite" aria-atomic="true">
      <p v-if="anuncios.texto" class="avisos__texto">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="m5 12 5 5 9-10" />
        </svg>
        {{ anuncios.texto }}
      </p>
    </div>

    <main id="contenido-principal" ref="contenido" class="contenido" tabindex="-1">
      <RouterView />
    </main>

    <nav class="nav" aria-label="Navegación principal">
      <RouterLink class="nav__enlace" :to="{ name: 'cocinero-cocina' }">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h16M6 7v14M18 7v14M4 12h16M9 4v3M15 4v3" />
        </svg>
        <span>Cocina</span>
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
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin: 0;
  line-height: 1.2;
}

.barra__rol {
  font-size: var(--texto-sm);
}

.barra .btn--secundario {
  border-color: var(--color-on-primary);
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
  border: 2px solid var(--color-entregado-texto);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: 0 8px 24px rgb(31 41 55 / 25%);
  color: var(--color-entregado-texto);
  font-weight: 700;
}

.avisos__texto svg {
  flex: none;
}

.contenido {
  outline: none;
  overflow-y: auto;
  padding: var(--espacio-6);
  scroll-padding-bottom: 160px;
}

.nav {
  display: grid;
  grid-template-columns: 1fr;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.nav__enlace {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--espacio-1);
  min-height: var(--tactil-min);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
  text-decoration: none;
}

.nav__enlace.router-link-active {
  color: var(--color-primary-dark);
  box-shadow: inset 0 4px 0 var(--color-primary);
  background: var(--color-bg);
}

@media (max-width: 30em) {
  .barra {
    padding-inline: var(--espacio-3);
  }

  .barra__restaurante {
    font-size: var(--texto-lg);
  }
}

/* ───────── Rediseño v2 «Madalena» ───────── */
.barra {
  position: relative;
  z-index: 3;
  background: var(--gradiente-marca);
  border-bottom: 3px solid var(--color-acento);
  box-shadow: 0 4px 16px rgb(70 30 10 / 22%);
}

.barra__restaurante {
  font-family: var(--fuente-titulo);
  font-weight: 700;
  letter-spacing: 0.01em;
}

.barra .btn--secundario {
  border-color: transparent;
  box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
}

.avisos__texto {
  border-radius: var(--radio-pill);
  box-shadow: var(--sombra-alta);
}

.nav {
  position: relative;
  z-index: 2;
  padding: 0 var(--espacio-2);
  border-top: none;
  box-shadow: 0 -8px 24px rgb(70 38 20 / 9%);
}

.nav__enlace {
  gap: 2px;
  border-radius: var(--radio-sm);
}

.nav__enlace:active {
  background: var(--color-surface-2);
}

/* Ícono dentro de una «píldora» que se tiñe en la pestaña activa */
.nav__enlace svg {
  box-sizing: content-box;
  padding: 4px 20px;
  border-radius: var(--radio-pill);
  transition: background-color 150ms ease-out;
}

/* Activo: píldora tintada + texto oscuro y en negrita (no depende solo del color) */
.nav__enlace.router-link-active {
  background: transparent;
  box-shadow: none;
  color: var(--color-primary-dark);
  font-weight: 700;
}

.nav__enlace.router-link-active svg {
  background: var(--color-primary-suave);
}
</style>
