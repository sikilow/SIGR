<script setup lang="ts">
// Canales de pedido (/gerente/canales): de dónde vienen los pedidos para llevar (mostrador, teléfono, plataformas…).
// El mesero elige uno de los canales ACTIVOS al abrir un pedido para llevar. Los canales no se borran: se desactivan,
// porque las cuentas anteriores los conservan.
import { computed, onMounted, ref } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import type { CanalPedido } from '../../types'

const canales = ref<CanalPedido[]>([])
const nombre = ref('')
const cargando = ref(true)
const cargado = ref(false)
const guardando = ref(false)
const error = ref('')
const mensaje = ref('')

const activos = computed(() => canales.value.filter((canal) => canal.activo).length)

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    canales.value = await servicios.catalogo.listarCanales()
    cargado.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar los canales.'
  } finally {
    cargando.value = false
  }
}

async function crear() {
  const limpio = nombre.value.trim()
  if (guardando.value || !limpio) return
  if (limpio.length > 40) {
    error.value = 'El nombre del canal admite hasta 40 caracteres.'
    return
  }
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const nuevo = await servicios.catalogo.crearCanal(limpio)
    canales.value = [...canales.value, nuevo]
    nombre.value = ''
    mensaje.value = `«${nuevo.nombre}» ya está disponible para los pedidos para llevar.`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo agregar el canal.'
  } finally {
    guardando.value = false
  }
}

async function cambiarEstado(canal: CanalPedido, activo: boolean) {
  if (guardando.value || canal.activo === activo) return
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const actualizado = await servicios.catalogo.actualizarCanal(canal.idCanal, { activo })
    canales.value = canales.value.map((actual) => (actual.idCanal === actualizado.idCanal ? actualizado : actual))
    mensaje.value = `${actualizado.nombre}: ${activo ? 'activado' : 'desactivado'}.`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo actualizar el canal.'
  } finally {
    guardando.value = false
  }
}

onMounted(() => void cargar())
</script>

<template>
  <section class="pagina">
    <header class="encabezado">
      <div>
        <p class="sobretitulo">Gerencia</p>
        <h2>Canales de pedido</h2>
        <p class="encabezado__ayuda">
          De dónde vienen los pedidos para llevar. El mesero elige uno al abrir el pedido, y cada pedido usa una mesa virtual de la sección «Para llevar».
        </p>
      </div>
      <button class="btn btn--secundario" type="button" :disabled="cargando || guardando" @click="cargar">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
        Actualizar
      </button>
    </header>

    <p v-if="error" class="aviso aviso--error" role="alert">{{ error }}</p>
    <p v-else-if="mensaje" class="aviso aviso--exito" role="status">{{ mensaje }}</p>

    <template v-if="cargando && !cargado">
      <div class="esqueleto" aria-hidden="true" />
      <p class="solo-lectores" role="status">Cargando canales…</p>
    </template>
    <div v-else-if="!cargado" class="vacio" role="alert">
      <h3>No se pudieron cargar los canales</h3>
      <button class="btn" type="button" @click="cargar">Reintentar</button>
    </div>

    <template v-else>
      <form class="nuevo panel" @submit.prevent="crear">
        <div class="campo nuevo__nombre">
          <label for="canal-nombre">Nuevo canal</label>
          <input id="canal-nombre" v-model="nombre" type="text" maxlength="40" autocomplete="off" required placeholder="Ej.: Cornershop" :disabled="guardando">
        </div>
        <button class="btn" type="submit" :disabled="guardando || !nombre.trim()">Agregar canal</button>
      </form>

      <section class="lista panel" aria-labelledby="lista-canales-titulo">
        <div class="lista__encabezado">
          <h3 id="lista-canales-titulo">Canales</h3>
          <span>{{ activos }} activos de {{ canales.length }}</span>
        </div>
        <ul class="canales">
          <li v-for="canal in canales" :key="canal.idCanal" :class="{ 'canales__inactivo': !canal.activo }">
            <div class="canales__nombre">
              <strong>{{ canal.nombre }}</strong>
              <span>{{ canal.activo ? 'El mesero puede elegirlo' : 'Oculto para el mesero' }}</span>
            </div>
            <span class="estado" :class="canal.activo ? 'estado--si' : 'estado--no'">{{ canal.activo ? 'Activo' : 'Desactivado' }}</span>
            <button
              type="button"
              class="interruptor"
              role="switch"
              :aria-checked="canal.activo"
              :aria-label="`${canal.nombre}: ${canal.activo ? 'activo' : 'desactivado'}`"
              :disabled="guardando"
              @click="cambiarEstado(canal, !canal.activo)"
            >
              <span class="interruptor__pista"><span class="interruptor__pulgar" /></span>
            </button>
          </li>
        </ul>
        <p class="lista__nota">
          ¿Hacen falta más pedidos para llevar al mismo tiempo? Agrega mesas en <strong>Mesas</strong> dentro de la sección «Para llevar».
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.pagina {
  display: grid;
  gap: var(--espacio-5);
  max-width: 720px;
}

.encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.encabezado h2 {
  margin-top: var(--espacio-1);
}

.encabezado__ayuda {
  max-width: 50ch;
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.aviso {
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4);
  border: 1.5px solid;
  border-radius: var(--radio-sm);
  font-weight: 600;
}

.aviso--error {
  border-color: var(--color-peligro);
  background: var(--color-peligro-fondo);
  color: var(--color-peligro-texto);
}

.aviso--exito {
  border-color: var(--color-secondary);
  background: var(--color-secondary-soft);
  color: var(--color-secondary-dark);
}

.nuevo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--espacio-4);
}

.nuevo__nombre {
  flex: 1 1 16rem;
}

.nuevo__nombre input {
  width: 100%;
}

.lista__encabezado {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--espacio-3);
  margin-bottom: var(--espacio-3);
}

.lista__encabezado h3 {
  margin: 0;
}

.lista__encabezado span,
.lista__nota {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.lista__nota {
  margin: var(--espacio-4) 0 0;
}

.canales {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  overflow: hidden;
}

.canales li {
  display: flex;
  align-items: center;
  gap: var(--espacio-4);
  min-height: 60px;
  padding: var(--espacio-2) var(--espacio-4);
  background: var(--color-surface);
}

.canales li + li {
  border-top: 1px solid var(--color-border);
}

.canales__nombre {
  display: grid;
  flex: 1;
  min-width: 0;
}

.canales__nombre span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.canales__inactivo .canales__nombre strong {
  color: var(--color-muted);
}

.estado {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 var(--espacio-3);
  border-radius: var(--radio-pill);
  font-size: var(--texto-sm);
  font-weight: 650;
}

.estado--si {
  background: var(--color-secondary-soft);
  color: var(--color-secondary-dark);
}

.estado--no {
  background: var(--color-deshabilitado-borde);
  color: var(--color-deshabilitado-texto);
}

/* Interruptor accesible (mismo diseño que Métodos de pago) */
.interruptor {
  display: grid;
  flex: none;
  place-items: center;
  min-width: 56px;
  min-height: 48px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.interruptor__pista {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: var(--radio-pill);
  background: var(--color-borde-control);
  transition: background 0.15s;
}

.interruptor__pulgar {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
  transition: transform 0.15s;
}

.interruptor[aria-checked='true'] .interruptor__pista {
  background: var(--color-secondary);
}

.interruptor[aria-checked='true'] .interruptor__pulgar {
  transform: translateX(20px);
}

.interruptor:focus-visible .interruptor__pista {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 3px;
}

.interruptor:disabled {
  cursor: progress;
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .interruptor__pista,
  .interruptor__pulgar {
    transition: none;
  }
}

@media (max-width: 40em) {
  .canales li {
    flex-wrap: wrap;
  }
}
</style>
