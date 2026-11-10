<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ErrorServicio, servicios } from '../../services'
import type { CategoriaMetodoPagoAdmin, MetodoPagoAdmin } from '../../types'

const categorias = ref<CategoriaMetodoPagoAdmin[]>([])
const nombreCategoria = ref('')
const tipoCategoria = ref<'fisico' | 'digital'>('digital')
const nombresMetodo = ref<Record<number, string>>({})
const metodoEfectivo = ref<Record<number, boolean>>({})
const cargando = ref(true)
const cargado = ref(false)
const guardando = ref(false)
const error = ref('')
const mensaje = ref('')
const categoriasActivas = computed(() => categorias.value.filter((categoria) => categoria.activo).length)
const metodosActivos = computed(() => categorias.value.flatMap((categoria) => categoria.metodos).filter((metodo) => metodo.activo).length)

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    categorias.value = await servicios.catalogo.listarMetodosPago()
    cargado.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar los métodos de pago.'
  } finally {
    cargando.value = false
  }
}

async function crearCategoria() {
  const limpio = nombreCategoria.value.trim()
  if (guardando.value || !limpio) return
  if (limpio.length > 40) {
    error.value = 'El nombre de la categoría admite hasta 40 caracteres.'
    return
  }
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const nueva = await servicios.catalogo.crearCategoriaMetodoPago(limpio, tipoCategoria.value)
    categorias.value = [...categorias.value, nueva]
    nombreCategoria.value = ''
    mensaje.value = `Se agregó la categoría «${nueva.nombre}».`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo agregar la categoría.'
  } finally {
    guardando.value = false
  }
}

async function crearMetodo(categoria: CategoriaMetodoPagoAdmin) {
  const limpio = (nombresMetodo.value[categoria.idCategoriaMetodoPago] ?? '').trim()
  const esEfectivo = metodoEfectivo.value[categoria.idCategoriaMetodoPago] ?? false
  if (guardando.value || !limpio) return
  if (limpio.length > 40) {
    error.value = 'El nombre del método admite hasta 40 caracteres.'
    return
  }
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const nuevo = await servicios.catalogo.crearMetodoPago(limpio, categoria.idCategoriaMetodoPago, esEfectivo)
    categorias.value = categorias.value.map((actual) => actual.idCategoriaMetodoPago === categoria.idCategoriaMetodoPago
      ? { ...actual, metodos: [...actual.metodos, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }
      : actual)
    nombresMetodo.value[categoria.idCategoriaMetodoPago] = ''
    metodoEfectivo.value[categoria.idCategoriaMetodoPago] = false
    mensaje.value = `Se agregó «${nuevo.nombre}» a «${categoria.nombre}».`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo agregar el método de pago.'
  } finally {
    guardando.value = false
  }
}

async function cambiarEstadoCategoria(categoria: CategoriaMetodoPagoAdmin, activo: boolean) {
  if (guardando.value || categoria.activo === activo) return
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const actualizada = await servicios.catalogo.actualizarCategoriaMetodoPago(categoria.idCategoriaMetodoPago, { activo })
    categorias.value = categorias.value.map((actual) => actual.idCategoriaMetodoPago === actualizada.idCategoriaMetodoPago ? actualizada : actual)
    mensaje.value = `${actualizada.nombre}: categoría ${activo ? 'disponible' : 'desactivada'}.`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo actualizar la categoría.'
  } finally {
    guardando.value = false
  }
}

async function cambiarEstadoMetodo(metodo: MetodoPagoAdmin, activo: boolean) {
  if (guardando.value || metodo.activo === activo) return
  await actualizarMetodo(metodo, { activo }, activo ? 'disponible' : 'desactivado')
}

async function cambiarEfectivo(metodo: MetodoPagoAdmin, esEfectivo: boolean) {
  if (guardando.value || metodo.esEfectivo === esEfectivo) return
  await actualizarMetodo(metodo, { esEfectivo }, esEfectivo ? 'marcado como efectivo' : 'ya no cuenta como efectivo')
}

async function actualizarMetodo(
  metodo: MetodoPagoAdmin,
  cambio: { activo?: boolean; esEfectivo?: boolean },
  resultado: string,
) {
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    const actualizado = await servicios.catalogo.actualizarMetodoPago(metodo.idMetodo, cambio)
    categorias.value = categorias.value.map((categoria) => ({
      ...categoria,
      metodos: categoria.metodos.map((actual) => actual.idMetodo === actualizado.idMetodo ? actualizado : actual),
    }))
    mensaje.value = `${actualizado.nombre}: ${resultado}.`
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
        <p>Organiza los métodos por categoría. Las categorías principales son físicas y digitales.</p>
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
      <form class="nuevo panel" @submit.prevent="crearCategoria">
        <h3>Nueva categoría</h3>
        <div class="campo">
          <label for="categoria-pago-nombre">Nombre</label>
          <input id="categoria-pago-nombre" v-model="nombreCategoria" type="text" maxlength="40" autocomplete="off" required placeholder="Ej.: Vales" :disabled="guardando">
        </div>
        <div class="campo">
          <label for="categoria-pago-tipo">Tipo</label>
          <select id="categoria-pago-tipo" v-model="tipoCategoria" :disabled="guardando">
            <option value="fisico">Físico</option>
            <option value="digital">Digital</option>
          </select>
        </div>
        <button class="btn" type="submit" :disabled="guardando || !nombreCategoria.trim()">Agregar categoría</button>
      </form>

      <section class="lista panel" aria-labelledby="lista-metodos-titulo">
        <div class="lista__encabezado">
          <h3 id="lista-metodos-titulo">Categorías y métodos</h3>
          <span>{{ categoriasActivas }} categorías · {{ metodosActivos }} métodos activos</span>
        </div>
        <p class="lista__ayuda">Al desactivar una categoría se ocultan todos sus métodos. También puedes desactivar métodos individuales; las ventas anteriores se conservan.</p>
        <article v-for="categoria in categorias" :key="categoria.idCategoriaMetodoPago" class="categoria">
          <header class="categoria__encabezado">
            <div>
              <h4>{{ categoria.nombre }}</h4>
              <span>{{ categoria.tipo === 'fisico' ? 'Física' : 'Digital' }} · {{ categoria.activo ? 'Activa' : 'Inactiva' }}</span>
            </div>
            <label class="interruptor">
              <span class="solo-lectores">{{ categoria.activo ? 'Desactivar' : 'Activar' }} categoría {{ categoria.nombre }}</span>
              <input type="checkbox" :checked="categoria.activo" :disabled="guardando" @change="cambiarEstadoCategoria(categoria, ($event.target as HTMLInputElement).checked)">
            </label>
          </header>

          <form class="nuevo-metodo" @submit.prevent="crearMetodo(categoria)">
            <div class="campo">
              <label :for="`nuevo-metodo-${categoria.idCategoriaMetodoPago}`">Agregar método</label>
              <input
                :id="`nuevo-metodo-${categoria.idCategoriaMetodoPago}`"
                v-model="nombresMetodo[categoria.idCategoriaMetodoPago]"
                type="text"
                maxlength="40"
                autocomplete="off"
                required
                :disabled="guardando"
                placeholder="Ej.: Tarjeta"
              >
            </div>
            <label v-if="categoria.tipo === 'fisico'" class="opcion-efectivo">
              <input v-model="metodoEfectivo[categoria.idCategoriaMetodoPago]" type="checkbox" :disabled="guardando">
              Cuenta como efectivo
            </label>
            <button class="btn btn--secundario" type="submit" :disabled="guardando || !(nombresMetodo[categoria.idCategoriaMetodoPago] ?? '').trim()">Agregar</button>
          </form>

          <ul class="metodos">
            <li v-for="metodo in categoria.metodos" :key="metodo.idMetodo">
              <div>
                <strong>{{ metodo.nombre }}</strong>
                <span>{{ metodo.activo ? 'Activo' : 'Inactivo' }}<template v-if="metodo.esEfectivo"> · efectivo para corte</template></span>
              </div>
              <label v-if="categoria.tipo === 'fisico'" class="opcion-efectivo">
                <input type="checkbox" :checked="metodo.esEfectivo" :disabled="guardando" @change="cambiarEfectivo(metodo, ($event.target as HTMLInputElement).checked)">
                Efectivo
              </label>
              <label class="interruptor">
                <span class="solo-lectores">{{ metodo.activo ? 'Desactivar' : 'Activar' }} {{ metodo.nombre }}</span>
                <input type="checkbox" :checked="metodo.activo" :disabled="guardando" @change="cambiarEstadoMetodo(metodo, ($event.target as HTMLInputElement).checked)">
              </label>
            </li>
            <li v-if="categoria.metodos.length === 0" class="metodos__vacio">Aún no hay métodos en esta categoría.</li>
          </ul>
        </article>
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

.categoria {
  margin-top: var(--espacio-4);
  padding: var(--espacio-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radio-md);
}

.categoria__encabezado,
.metodos li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.categoria__encabezado h4 {
  margin: 0;
}

.categoria__encabezado span,
.metodos li span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.nuevo-metodo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--espacio-3);
  margin-top: var(--espacio-3);
  padding-bottom: var(--espacio-3);
  border-bottom: 1px solid var(--color-border);
}

.nuevo-metodo .campo {
  flex: 1 1 14rem;
}

.nuevo-metodo input[type='text'] {
  width: 100%;
}

.opcion-efectivo {
  display: inline-flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: 44px;
}

.opcion-efectivo input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-primary);
}

.metodos {
  margin: 0;
  padding: 0;
  list-style: none;
}

.metodos li {
  min-height: 56px;
  border-top: 1px solid var(--color-border);
}

.metodos li > div {
  display: grid;
}

.metodos .metodos__vacio {
  color: var(--color-muted);
  justify-content: flex-start;
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