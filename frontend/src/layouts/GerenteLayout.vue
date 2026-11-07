<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AvisoGlobal from '../components/AvisoGlobal.vue'
import FranjaDemo from '../components/FranjaDemo.vue'
import LogoMarca from '../components/LogoMarca.vue'
import { useCompacto } from '../composables/useCompacto'
import { usandoMock } from '../services'
import { useSesionStore } from '../stores/sesion'
import { ETIQUETA_ROL } from '../types'

const sesion = useSesionStore()
const router = useRouter()
const route = useRoute()
const compacto = useCompacto()

const contenido = ref<HTMLElement | null>(null)

// Al cambiar de pantalla el foco pasa al contenido, para teclado y lectores de pantalla.
// Se compara el registro de la ruta (no la ruta completa): abrir un pedido dentro de "Pedidos"
// no es cambiar de pantalla y no debe quitarle el foco a la fila que se acaba de tocar.
watch(
  () => route.matched.at(-1)?.path ?? route.path,
  async () => {
    await nextTick()
    contenido.value?.focus({ preventScroll: true })
  },
)

onMounted(() => contenido.value?.focus({ preventScroll: true }))

const rolVisible = computed(() => (sesion.rol ? ETIQUETA_ROL[sesion.rol] : ''))
const inicial = computed(() => (sesion.usuario?.nombre?.trim().charAt(0) ?? 'G').toUpperCase())

const enlaces = [
  { nombre: 'gerente-usuarios', texto: 'Usuarios', icono: 'usuarios' },
  { nombre: 'gerente-productos', texto: 'Productos', icono: 'productos' },
  { nombre: 'gerente-mesas', texto: 'Mesas', icono: 'mesas' },
  { nombre: 'gerente-reservaciones', texto: 'Reservaciones', icono: 'reservaciones' },
  { nombre: 'gerente-pedidos', texto: 'Pedidos', icono: 'pedidos' },
] as const

async function salir() {
  await sesion.cerrarSesion()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="layout" :class="{ 'layout--demo': usandoMock }">
    <a class="saltar-contenido" href="#contenido-principal">Saltar al contenido</a>

    <!-- Escritorio: navegación lateral fija. En tablet/teléfono se usa la barra inferior. -->
    <aside v-if="!compacto" class="sidebar" aria-label="Navegación de gerencia">
      <div class="sidebar__marca">
        <LogoMarca :tamano="46" />
        <div>
          <h1 class="sidebar__restaurante">La Madalena</h1>
          <p class="sidebar__rol">Gerencia</p>
        </div>
      </div>

      <nav class="sidebar__nav" aria-label="Secciones de gerencia">
        <RouterLink v-for="enlace in enlaces" :key="enlace.nombre" class="nav__enlace" :to="{ name: enlace.nombre }">
          <svg v-if="enlace.icono === 'usuarios'" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5a3.5 3.5 0 0 1 0 7M18 14.5c2.2.7 3.5 2.6 3.5 5.5" />
          </svg>
          <svg v-else-if="enlace.icono === 'productos'" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
            <path d="M3 8l9 5 9-5M12 13v8" />
          </svg>
          <svg v-else-if="enlace.icono === 'mesas'" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="4" rx="1.5" />
            <path d="M6 10v9M18 10v9M3 19h3M18 19h3" />
          </svg>
          <svg v-else-if="enlace.icono === 'reservaciones'" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h7" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
            <path d="M9 8h6M9 12h6M9 16h3" />
          </svg>
          <span>{{ enlace.texto }}</span>
        </RouterLink>
      </nav>

      <RouterLink class="sidebar__sistema" :to="{ name: 'gerente-sistema' }">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18M3 12h18M5.6 5.6c2 2.4 4.1 3.9 6.4 3.9s4.4-1.5 6.4-3.9M5.6 18.4c2-2.4 4.1-3.9 6.4-3.9s4.4 1.5 6.4 3.9" />
        </svg>
        Sistema de diseño
      </RouterLink>

      <div class="sidebar__pie">
        <div class="sidebar__usuario">
          <span class="sidebar__avatar" aria-hidden="true">{{ inicial }}</span>
          <p class="sidebar__datos">
            <strong>{{ sesion.usuario?.nombre }}</strong>
            <span>{{ rolVisible }}</span>
          </p>
        </div>
        <button type="button" class="btn btn--secundario sidebar__salir" @click="salir">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9" />
          </svg>
          Salir
        </button>
      </div>
    </aside>

    <div class="marco">
      <FranjaDemo />
      <AvisoGlobal />

      <!-- Tablet/teléfono: barra superior compacta -->
      <header v-if="compacto" class="barra">
        <div class="barra__marca">
          <LogoMarca :tamano="40" invertido />
          <h1 class="barra__restaurante">La Madalena</h1>
        </div>
        <div class="barra__usuario">
          <p class="barra__datos">
            <strong>{{ sesion.usuario?.nombre }}</strong>
            <span class="barra__rol">{{ rolVisible }}</span>
          </p>
          <RouterLink class="btn btn--icono barra__sistema" :to="{ name: 'gerente-sistema' }" aria-label="Sistema de diseño" title="Sistema de diseño">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 0 0 0 18M3 12h18" />
            </svg>
          </RouterLink>
          <button type="button" class="btn btn--icono barra__salir" aria-label="Salir" title="Salir" @click="salir">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <main id="contenido-principal" ref="contenido" class="contenido" tabindex="-1">
        <RouterView />
      </main>

      <nav v-if="compacto" class="nav" aria-label="Navegación principal">
        <RouterLink v-for="enlace in enlaces" :key="enlace.nombre" class="nav__enlace" :to="{ name: enlace.nombre }">
          <svg v-if="enlace.icono === 'usuarios'" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5a3.5 3.5 0 0 1 0 7M18 14.5c2.2.7 3.5 2.6 3.5 5.5" />
          </svg>
          <svg v-else-if="enlace.icono === 'productos'" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
            <path d="M3 8l9 5 9-5M12 13v8" />
          </svg>
          <svg v-else-if="enlace.icono === 'mesas'" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="4" rx="1.5" />
            <path d="M6 10v9M18 10v9M3 19h3M18 19h3" />
          </svg>
          <svg v-else-if="enlace.icono === 'reservaciones'" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h7" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
            <path d="M9 8h6M9 12h6M9 16h3" />
          </svg>
          <span>{{ enlace.texto }}</span>
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100dvh;
  min-height: 0;
  background: var(--color-bg);
}

.sidebar {
  display: flex;
  flex: 0 0 var(--ancho-sidebar);
  flex-direction: column;
  gap: var(--espacio-6);
  width: var(--ancho-sidebar);
  padding: var(--espacio-6) var(--espacio-4);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.sidebar__marca {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  padding-inline: var(--espacio-2);
}

.sidebar__restaurante {
  font-size: var(--texto-lg);
  line-height: 1.1;
}

.sidebar__rol {
  margin: 2px 0 0;
  color: var(--color-primary-dark);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sidebar__nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--espacio-1);
}

.nav__enlace {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-3);
  border-radius: var(--radio-sm);
  color: var(--color-muted);
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color var(--duracion-rapida) ease,
    color var(--duracion-rapida) ease;
}

.sidebar__nav .nav__enlace.router-link-active {
  background: var(--color-primary-soft);
  box-shadow: inset 4px 0 0 var(--color-primary);
  color: var(--color-primary-dark);
  font-weight: 700;
}

@media (hover: hover) and (pointer: fine) {
  .sidebar__nav .nav__enlace:hover {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
}

.sidebar__sistema {
  display: flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-3);
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 600;
  text-decoration: none;
}

.sidebar__sistema.router-link-active {
  color: var(--color-primary-dark);
}

.sidebar__pie {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  padding-top: var(--espacio-4);
  border-top: 1px solid var(--color-border);
}

.sidebar__usuario {
  display: flex;
  align-items: center;
  gap: var(--espacio-3);
  padding-inline: var(--espacio-2);
}

.sidebar__avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-secondary-soft);
  color: var(--color-secondary-dark);
  font-family: var(--fuente-titulo);
  font-size: var(--texto-lg);
  font-weight: 600;
}

.sidebar__datos {
  display: flex;
  min-width: 0;
  flex-direction: column;
  margin: 0;
  line-height: 1.25;
}

.sidebar__datos strong,
.sidebar__datos span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__datos span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.sidebar__salir {
  width: 100%;
}

.marco {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-4);
  padding: var(--espacio-2) var(--espacio-4);
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
  color: var(--color-on-primary);
  font-size: var(--texto-lg);
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

.barra .btn--icono {
  border-color: rgb(255 249 243 / 45%);
  background: transparent;
  color: var(--color-on-primary);
}

.barra .btn--icono:hover {
  background: rgb(255 249 243 / 14%);
  border-color: var(--color-on-primary);
  color: var(--color-on-primary);
}

.contenido {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  outline: none;
  padding: var(--espacio-8);
  scroll-padding-bottom: 160px;
}

.nav {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.nav .nav__enlace {
  flex-direction: column;
  justify-content: center;
  gap: var(--espacio-1);
  padding: var(--espacio-1) var(--espacio-1);
  border-radius: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  text-align: center;
}

.nav .nav__enlace.router-link-active {
  background: var(--color-bg);
  box-shadow: inset 0 4px 0 var(--color-primary);
  color: var(--color-primary-dark);
}

.nav .nav__enlace:active {
  background: var(--color-surface-2);
}

@media (max-width: 30em) {
  .barra {
    padding-inline: var(--espacio-3);
  }

  .barra__restaurante {
    font-size: var(--texto-base);
  }

  .barra__datos {
    display: none;
  }

  .contenido {
    padding: var(--espacio-4);
  }
}

@media print {
  .sidebar,
  .barra,
  .nav {
    display: none !important;
  }

  .layout,
  .marco,
  .contenido {
    display: block;
    height: auto;
    overflow: visible;
  }

  .contenido {
    padding: 0;
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

/* La navegación lateral de escritorio ya la define el rediseño A (`.sidebar`). */
</style>
