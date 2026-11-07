<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AvisoGlobal from '../components/AvisoGlobal.vue'
import FranjaDemo from '../components/FranjaDemo.vue'
import LogoMarca from '../components/LogoMarca.vue'
import { useSesionStore } from '../stores/sesion'
import { ETIQUETA_ROL } from '../types'

const sesion = useSesionStore()
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
  <div class="layout">
    <a class="saltar-contenido" href="#contenido-principal">Saltar al contenido</a>
    <FranjaDemo />
    <AvisoGlobal />

    <header class="barra">
      <div class="barra__marca">
        <LogoMarca :tamano="42" invertido />
        <div class="barra__texto">
          <h1 class="barra__restaurante">La Madalena</h1>
          <p class="barra__area">Cocina</p>
        </div>
      </div>
      <div class="barra__usuario">
        <p class="barra__datos">
          <strong>{{ sesion.usuario?.nombre }}</strong>
          <span class="barra__rol">{{ rolVisible }}</span>
        </p>
        <button type="button" class="btn btn--secundario barra__salir" @click="salir">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9" />
          </svg>
          Salir
        </button>
      </div>
    </header>

    <main id="contenido-principal" ref="contenido" class="contenido" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 0;
}

.barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-4);
  padding: var(--espacio-2) var(--espacio-6);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.barra__marca,
.barra__usuario {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
}

.barra__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.barra__restaurante {
  color: var(--color-on-primary);
  font-size: var(--texto-lg);
}

.barra__area {
  margin: 2px 0 0;
  color: var(--color-primary-soft);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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

.barra__salir {
  border-color: var(--color-on-primary);
  background: transparent;
  color: var(--color-on-primary);
}

@media (hover: hover) and (pointer: fine) {
  .barra__salir:hover {
    background: rgb(255 249 243 / 14%);
    border-color: var(--color-on-primary);
    color: var(--color-on-primary);
  }
}

.contenido {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  outline: none;
  padding: var(--espacio-6);
}

@media (max-width: 40em) {
  .barra {
    padding-inline: var(--espacio-4);
  }

  .barra__datos {
    display: none;
  }

  .contenido {
    padding: var(--espacio-4);
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

.nav .nav__enlace {
  gap: 2px;
  border-radius: var(--radio-sm);
}

.nav .nav__enlace:active {
  background: var(--color-surface-2);
}

/* Ícono dentro de una «píldora» que se tiñe en la pestaña activa */
.nav .nav__enlace svg {
  box-sizing: content-box;
  padding: 4px 20px;
  border-radius: var(--radio-pill);
  transition: background-color 150ms ease-out;
}

/* Activo: píldora tintada + texto oscuro y en negrita (no depende solo del color) */
.nav .nav__enlace.router-link-active {
  background: transparent;
  box-shadow: none;
  color: var(--color-primary-dark);
  font-weight: 700;
}

.nav .nav__enlace.router-link-active svg {
  background: var(--color-primary-suave);
}
</style>
