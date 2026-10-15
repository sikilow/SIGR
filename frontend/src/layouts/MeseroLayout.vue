<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMesasStore } from '../stores/mesas'
import { useSesionStore } from '../stores/sesion'
import { ETIQUETA_ROL } from '../types'

const sesion = useSesionStore()
const mesas = useMesasStore()
const router = useRouter()
const route = useRoute()

const contenido = ref<HTMLElement | null>(null)

// Al cambiar de pantalla el foco pasa al contenido, para teclado y lectores de pantalla.
watch(
  () => route.path,
  async () => {
    await nextTick()
    contenido.value?.focus({ preventScroll: true })
  },
)

// "Mesas" sigue activa en las pantallas de una mesa (/mesero/mesas/:id/...)
const enMesas = computed(() => route.path.startsWith('/mesero/mesas'))

const rolVisible = computed(() => (sesion.rol ? ETIQUETA_ROL[sesion.rol] : ''))

async function salir() {
  await sesion.cerrarSesion()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="layout">
    <a class="saltar-contenido" href="#contenido-principal">Saltar al contenido</a>
    <header class="barra">
      <h1 class="barra__restaurante">La Madalena</h1>
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

    <!-- Región en vivo persistente: anuncia los avisos que dejan otras pantallas (p. ej. al ser redirigido) -->
    <p class="solo-lectores" role="status" aria-live="polite">{{ mesas.aviso }}</p>

    <main id="contenido-principal" ref="contenido" class="contenido" tabindex="-1">
      <RouterView />
    </main>

    <nav class="nav" aria-label="Navegación principal">
      <RouterLink class="nav__enlace" :class="{ 'router-link-active': enMesas }" :to="{ name: 'mesero-mesas' }">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="5" rx="1.5" />
          <path d="M6 10v9M18 10v9" />
        </svg>
        <span>Mesas</span>
      </RouterLink>
      <RouterLink class="nav__enlace" :to="{ name: 'mesero-pedidos' }">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 3h6v3H9zM9 11h6M9 15h6" />
        </svg>
        <span>Pedidos</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-rows: var(--altura-barra-superior) 1fr var(--altura-nav-inferior);
  height: 100dvh;
  min-height: 0;
}

.barra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
  padding: 0 var(--espacio-6);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.barra__restaurante {
  font-size: var(--texto-xl);
}

.barra__usuario {
  display: flex;
  align-items: center;
  gap: var(--espacio-4);
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

/* El botón "Salir" sobre fondo primario: se invierte para mantener contraste */
.barra .btn--secundario {
  border-color: var(--color-on-primary);
}

.contenido {
  outline: none;
  overflow-y: auto;
  padding: var(--espacio-6);
}

.nav {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
  touch-action: manipulation;
  transition: background-color 150ms ease-out;
}

.nav__enlace:active {
  background: var(--color-border);
}

/* Activo: color + borde superior + texto (no solo color) */
.nav__enlace.router-link-active {
  color: var(--color-primary-dark);
  box-shadow: inset 0 4px 0 var(--color-primary);
  background: var(--color-bg);
}
</style>
