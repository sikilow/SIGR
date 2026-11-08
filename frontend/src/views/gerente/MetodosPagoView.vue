<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import type { MetodoPagoAdmin } from '../../types'

const metodos = ref<MetodoPagoAdmin[]>([])
const nombre = ref('')
const cargando = ref(true)
const cargado = ref(false)
const guardando = ref(false)
const error = ref('')
const mensaje = ref('')
const activos = computed(() => metodos.value.filter((metodo) => metodo.activo).length)

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    metodos.value = await servicios.catalogo.listarMetodosPago()
    cargado.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar los métodos de pago.'
  } finally {
    cargando.value = false
  }
}

async function crear() {
  const limpio = nombre.value.trim()
  if (guardando.value || !limpio) return
  if (limpio.length > 40) {
    error.value = 'El nombre admite hasta 40 caracteres.'
    return
  }
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const nuevo = await servicios.catalogo.crearMetodoPago(limpio)
    metodos.value = [...metodos.value, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    nombre.value = ''
    mensaje.value = `Se agregó «${nuevo.nombre}».`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo agregar el método de pago.'
  } finally {
    guardando.value = false
  }
}

async function cambiarEstado(metodo: MetodoPagoAdmin, activo: boolean) {
  if (guardando.value || metodo.activo === activo) return
  if (!activo && activos.value <= 1) {
    error.value = 'Debe quedar al menos un método de pago activo.'
    return
  }
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const actualizado = await servicios.catalogo.actualizarMetodoPago(metodo.idMetodo, { activo })
    metodos.value = metodos.value.map((actual) => actual.idMetodo === actualizado.idMetodo ? actualizado : actual)
    mensaje.value = `${actualizado.nombre}: ${activo ? 'disponible' : 'desactivado'}.`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo actualizar el método de pago.'
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
        <h2>Métodos de pago</h2>
        <p>Configura las formas que aparecerán en Caja.</p>
      </div>
      <button class="btn btn--secundario" type="button" :disabled="cargando || guardando" @click="cargar">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
        Actualizar
      </button>
    </header>

    <p v-if="error" class="aviso aviso--error" role="alert">{{ error }}</p>
    <p v-if="mensaje" class="aviso aviso--exito" role="status">{{ mensaje }}</p>

    <template v-if="cargando && !cargado">
      <div class="esqueleto" aria-hidden="true" />
      <p class="solo-lectores" role="status">Cargando métodos de pago…</p>
    </template>
    <div v-else-if="!cargado" class="vacio" role="alert">
      <h3>No se pudieron cargar los métodos</h3>
      <button class="btn" type="button" @click="cargar">Reintentar</button>
    </div>
    <template v-else>
      <form class="nuevo panel" @submit.prevent="crear">
        <div class="campo">
          <label for="metodo-pago-nombre">Nuevo método</label>
          <input id="metodo-pago-nombre" v-model="nombre" type="text" maxlength="40" autocomplete="off" required placeholder="Ej.: Aplicación bancaria" :disabled="guardando">
        </div>
        <button class="btn" type="submit" :disabled="guardando || !nombre.trim()">Agregar método</button>
      </form>

      <section class="lista panel" aria-labelledby="lista-metodos-titulo">
        <div class="lista__encabezado">
          <h3 id="lista-metodos-titulo">Disponibles en Caja</h3>
          <span>{{ activos }} activos</span>
        </div>
        <p class="lista__ayuda">Los métodos desactivados dejan de aparecer en nuevos cobros; las ventas anteriores se conservan.</p>
        <ul>
          <li v-for="metodo in metodos" :key="metodo.idMetodo">
            <div>
              <strong>{{ metodo.nombre }}</strong>
              <span>{{ metodo.activo ? 'Activo' : 'Inactivo' }}</span>
            </div>
            <label class="interruptor">
              <span class="solo-lectores">{{ metodo.activo ? 'Desactivar' : 'Activar' }} {{ metodo.nombre }}</span>
              <input type="checkbox" :checked="metodo.activo" :disabled="guardando" @change="cambiarEstado(metodo, ($event.target as HTMLInputElement).checked)">
            </label>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.pagina {
  display: grid;
  gap: var(--espacio-5);
  max-width: 860px;
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

.encabezado p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

.nuevo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--espacio-3);
}

.nuevo .campo {
  flex: 1 1 16rem;
}

.nuevo input {
  width: 100%;
}

.lista__encabezado {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--espacio-3);
}

.lista__encabezado span,
.lista__ayuda,
.lista li span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.lista__ayuda {
  margin: var(--espacio-2) 0 var(--espacio-3);
}

.lista ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lista li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
  min-height: 56px;
  border-top: 1px solid var(--color-border);
}

.lista li > div {
  display: grid;
}

.interruptor {
  display: grid;
  place-items: center;
  min-width: 48px;
  min-height: 48px;
}

.interruptor input {
  width: 24px;
  height: 24px;
  accent-color: var(--color-primary);
}

@media (max-width: 30em) {
  .nuevo .btn {
    width: 100%;
  }
}
</style>