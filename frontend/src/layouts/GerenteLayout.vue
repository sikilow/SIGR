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

// Al cambiar de pantalla el foco pasa al contenido, para teclado y lectores de pantalla.
// Se compara el registro de la ruta (no la ruta completa): abrir un pedido dentro de "Mis pedidos"
// no es cambiar de pantalla y no debe quitarle el foco a la fila que se acaba de tocar.
watch(
  () => route.matched.at(-1)?.path ?? route.path,
  async () => {
    await nextTick()
    contenido.value?.focus({ preventScroll: true })
  },
)

// El layout se monta DESPUÉS de cambiar de ruta (p. ej. al iniciar sesión), así que el watch de arriba no
// se dispara la primera vez: se enfoca el contenido también al montarse.
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

    <!-- Avisos breves ("Pedido #5 cancelado", "Pedido #8, mesa 5: listo"): visibles y anunciados, sin quitar el foco -->
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
      <RouterLink class="nav__enlace" :to="{ name: 'gerente-usuarios' }">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5a3.5 3.5 0 0 1 0 7M18 14.5c2.2.7 3.5 2.6 3.5 5.5" />
        </svg>
        <span>Usuarios</span>
      </RouterLink>
      <RouterLink class="nav__enlace" :to="{ name: 'gerente-productos' }">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
          <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
        <span>Productos</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  /* minmax(0, 1fr): ningún hijo puede ensanchar la página (sin scroll horizontal con zoom alto) */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(var(--altura-barra-superior), auto) minmax(0, 1fr) var(--altura-nav-inferior);
  height: 100dvh;
  min-height: 0;
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

/* Con la franja "Modo demo" arriba se agrega una fila automática */
.layout--demo {
  grid-template-rows: auto minmax(var(--altura-barra-superior), auto) minmax(0, 1fr) var(--altura-nav-inferior);
}

.barra__marca {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
}

@media (max-width: 30em) {
  .barra {
    padding-inline: var(--espacio-3);
  }

  .barra__restaurante {
    font-size: var(--texto-lg);
  }
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
  /* Barras fijas al fondo de una pantalla no deben tapar el control enfocado con el teclado */
  scroll-padding-bottom: 160px;
}

/* Aviso breve, arriba y centrado (no tapa las acciones del fondo); no recibe toques */
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

@media (prefers-reduced-motion: no-preference) {
  .avisos__texto {
    animation: entrar-aviso 200ms ease-out;
  }
}

@keyframes entrar-aviso {
  from {
    transform: translateY(-12px);
    opacity: 0;
  }
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
