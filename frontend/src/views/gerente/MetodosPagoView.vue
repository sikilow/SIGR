<script setup lang="ts">
// Métodos de pago (/gerente/metodos-pago). Gerencia organiza los métodos por categoría (física o digital).
// Lo que está activo aquí es lo que ven el mesero (al solicitar la cuenta) y el cajero (al cobrar).
// «Eliminar» es lógico (solo el gerente): sale de la lista pero se conserva, porque los pagos anteriores lo usaron, y se
// restaura desde «Eliminados» (vuelve desactivado). El método de efectivo no se puede eliminar.
import { computed, onMounted, ref } from 'vue'
import ConfirmarAccionDialog from '../../components/ConfirmarAccionDialog.vue'
import { ErrorServicio, servicios } from '../../services'
import type { CategoriaMetodoPagoAdmin, MetodoPagoAdmin } from '../../types'
import { vPermitir } from '../../utils/campos'

type Tipo = 'fisico' | 'digital'

const TIPOS: ReadonlyArray<{ valor: Tipo; etiqueta: string; ayuda: string }> = [
  { valor: 'fisico', etiqueta: 'Físico', ayuda: 'Se cobra en persona (efectivo, vales).' },
  { valor: 'digital', etiqueta: 'Digital', ayuda: 'Tarjeta, transferencia y similares.' },
]

const categorias = ref<CategoriaMetodoPagoAdmin[]>([])
/** Lo eliminado: categorías eliminadas y métodos eliminados (agrupados en su categoría). */
const eliminados = ref<CategoriaMetodoPagoAdmin[]>([])
const verEliminados = ref(false)
const nombreCategoria = ref('')
const tipoCategoria = ref<Tipo>('digital')
const nombresMetodo = ref<Record<number, string>>({})
const metodoEfectivo = ref<Record<number, boolean>>({})
const cargando = ref(true)
const cargado = ref(false)
const guardando = ref(false)
const error = ref('')
const mensaje = ref('')

const totalEliminados = computed(() => eliminados.value.reduce((n, c) => n + (c.eliminadoEn ? 1 : 0) + c.metodos.length, 0))
const fechaCorta = (d: Date | null | undefined) => (d ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

const categoriasActivas = computed(() => categorias.value.filter((categoria) => categoria.activo).length)
const metodosActivos = computed(
  () => categorias.value.filter((categoria) => categoria.activo).flatMap((categoria) => categoria.metodos).filter((metodo) => metodo.activo).length,
)

function etiquetaTipo(tipo: Tipo): string {
  return tipo === 'fisico' ? 'Físico' : 'Digital'
}

/** Dónde aparece hoy cada método: ayuda a entender por qué un método no se ve. */
function visibilidad(categoria: CategoriaMetodoPagoAdmin, metodo: MetodoPagoAdmin): string {
  if (!categoria.activo) return 'Oculto: la categoría está desactivada'
  if (!metodo.activo) return 'Oculto para mesero y cajero'
  return `Visible en «Pago ${etiquetaTipo(categoria.tipo).toLowerCase()}»`
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [vigentes, borrados] = await Promise.all([servicios.catalogo.listarMetodosPago(), servicios.catalogo.listarMetodosPago({ eliminados: true })])
    categorias.value = vigentes
    eliminados.value = borrados
    // Si ya no queda nada eliminado, se vuelve a la lista normal.
    if (borrados.length === 0) verEliminados.value = false
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
    mensaje.value = `Se agregó la categoría «${nueva.nombre}». Agrégale al menos un método para que se pueda elegir.`
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
    mensaje.value = categoria.activo
      ? `«${nuevo.nombre}» ya está disponible para el mesero y el cajero en «Pago ${etiquetaTipo(categoria.tipo).toLowerCase()}».`
      : `Se agregó «${nuevo.nombre}», pero la categoría «${categoria.nombre}» está desactivada: actívala para que se vea.`
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
    mensaje.value = `${actualizada.nombre}: categoría ${activo ? 'activada' : 'desactivada'}.`
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo actualizar la categoría.'
  } finally {
    guardando.value = false
  }
}

async function cambiarEstadoMetodo(metodo: MetodoPagoAdmin, activo: boolean) {
  if (guardando.value || metodo.activo === activo) return
  await actualizarMetodo(metodo, { activo }, activo ? 'activado' : 'desactivado')
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

// ---------- Eliminar / restaurar ----------
interface ObjetivoEliminar {
  tipo: 'categoria' | 'metodo'
  id: number
  nombre: string
}
const aEliminar = ref<ObjetivoEliminar | null>(null)
const origenEliminar = ref<HTMLElement | null>(null)
const eliminando = ref(false)
const errorEliminar = ref('')
const rechazoEliminar = ref('')

function pedirEliminar(objetivo: ObjetivoEliminar, e: Event) {
  aEliminar.value = objetivo
  origenEliminar.value = e.currentTarget as HTMLElement
  eliminando.value = false
  errorEliminar.value = ''
  rechazoEliminar.value = ''
}

async function confirmarEliminar() {
  const objetivo = aEliminar.value
  if (!objetivo || eliminando.value) return
  eliminando.value = true
  errorEliminar.value = ''
  try {
    if (objetivo.tipo === 'categoria') await servicios.catalogo.eliminarCategoriaMetodoPago(objetivo.id)
    else await servicios.catalogo.eliminarMetodoPago(objetivo.id)
    aEliminar.value = null
    error.value = ''
    mensaje.value = `«${objetivo.nombre}» eliminado. Puedes restaurarlo desde «Eliminados».`
    await cargar()
  } catch (e) {
    if (e instanceof ErrorServicio && e.codigo === 'red') {
      errorEliminar.value = 'No se pudo conectar con el servidor. Vuelve a intentarlo.'
    } else {
      rechazoEliminar.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
      void cargar()
    }
  } finally {
    eliminando.value = false
  }
}

async function restaurar(objetivo: ObjetivoEliminar) {
  if (guardando.value) return
  guardando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    if (objetivo.tipo === 'categoria') await servicios.catalogo.restaurarCategoriaMetodoPago(objetivo.id)
    else await servicios.catalogo.restaurarMetodoPago(objetivo.id)
    mensaje.value = `«${objetivo.nombre}» restaurado. Está desactivado: actívalo para que se vea.`
    await cargar()
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo restaurar.'
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
        <p class="encabezado__ayuda">
          Lo que actives aquí lo ven el mesero al solicitar la cuenta y el cajero al cobrar, sin recargar la página.
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
      <p class="solo-lectores" role="status">Cargando métodos de pago…</p>
    </template>
    <div v-else-if="!cargado" class="vacio" role="alert">
      <h3>No se pudieron cargar los métodos</h3>
      <button class="btn" type="button" @click="cargar">Reintentar</button>
    </div>

    <template v-else>
      <dl class="resumen" aria-label="Resumen">
        <div>
          <dt>Categorías activas</dt>
          <dd class="numero">{{ categoriasActivas }}<small> de {{ categorias.length }}</small></dd>
        </div>
        <div>
          <dt>Métodos disponibles</dt>
          <dd class="numero">{{ metodosActivos }}</dd>
        </div>
      </dl>

      <form class="nueva panel" @submit.prevent="crearCategoria">
        <h3>Nueva categoría</h3>
        <div class="nueva__fila">
          <div class="campo nueva__nombre">
            <label for="categoria-pago-nombre">Nombre</label>
            <input id="categoria-pago-nombre" v-permitir="'texto'" v-model="nombreCategoria" type="text" maxlength="40" autocomplete="off" required placeholder="Ej.: Vales de despensa" :disabled="guardando">
          </div>
          <fieldset class="tipos" :disabled="guardando">
            <legend>Tipo de cobro</legend>
            <div class="tipos__opciones">
              <label v-for="tipo in TIPOS" :key="tipo.valor" class="tipo" :class="{ 'tipo--elegido': tipoCategoria === tipo.valor }">
                <input v-model="tipoCategoria" type="radio" name="tipo-categoria" :value="tipo.valor">
                <strong>{{ tipo.etiqueta }}</strong>
                <small>{{ tipo.ayuda }}</small>
              </label>
            </div>
          </fieldset>
          <button class="btn nueva__boton" type="submit" :disabled="guardando || !nombreCategoria.trim()">Agregar categoría</button>
        </div>
      </form>

      <section class="lista" aria-labelledby="lista-metodos-titulo">
        <h3 id="lista-metodos-titulo">Categorías y métodos</h3>

        <div v-if="totalEliminados > 0" class="vistas" role="group" aria-label="Ver métodos de pago">
          <button type="button" class="chip" :class="{ 'chip--activo': !verEliminados }" :aria-pressed="!verEliminados" @click="verEliminados = false">Vigentes</button>
          <button type="button" class="chip" :class="{ 'chip--activo': verEliminados }" :aria-pressed="verEliminados" @click="verEliminados = true">
            Eliminados <span class="numero">({{ totalEliminados }})</span>
          </button>
        </div>

        <template v-if="verEliminados">
          <p class="vistas__nota">Estos métodos y categorías no se ofrecen en ningún lado. Los pagos anteriores los conservan; restáuralos para volver a usarlos (si restauras un método, su categoría debe estar vigente).</p>
          <article v-for="categoria in eliminados" :key="categoria.idCategoriaMetodoPago" class="categoria panel categoria--inactiva">
            <header class="categoria__encabezado">
              <div class="categoria__titulo">
                <h4>{{ categoria.nombre }}</h4>
                <p>
                  <span class="etiqueta">{{ etiquetaTipo(categoria.tipo) }}</span>
                  <span v-if="categoria.eliminadoEn" class="estado estado--no">Categoría eliminada el {{ fechaCorta(categoria.eliminadoEn) }}</span>
                  <span v-else class="estado estado--si">Categoría vigente</span>
                </p>
              </div>
              <button
                v-if="categoria.eliminadoEn"
                type="button"
                class="btn"
                :aria-label="`Restaurar la categoría ${categoria.nombre}`"
                :disabled="guardando"
                @click="restaurar({ tipo: 'categoria', id: categoria.idCategoriaMetodoPago, nombre: categoria.nombre })"
              >
                Restaurar categoría
              </button>
            </header>
            <ul v-if="categoria.metodos.length > 0" class="metodos">
              <li v-for="metodo in categoria.metodos" :key="metodo.idMetodo" class="metodos__inactivo">
                <div class="metodos__nombre">
                  <strong>{{ metodo.nombre }}</strong>
                  <span>Eliminado el {{ fechaCorta(metodo.eliminadoEn) }}</span>
                </div>
                <button
                  type="button"
                  class="btn"
                  :aria-label="`Restaurar ${metodo.nombre}`"
                  :disabled="guardando"
                  @click="restaurar({ tipo: 'metodo', id: metodo.idMetodo, nombre: metodo.nombre })"
                >
                  Restaurar
                </button>
              </li>
            </ul>
          </article>
        </template>

        <article
          v-for="categoria in (verEliminados ? [] : categorias)"
          :key="categoria.idCategoriaMetodoPago"
          class="categoria panel"
          :class="{ 'categoria--inactiva': !categoria.activo }"
        >
          <header class="categoria__encabezado">
            <span class="categoria__icono" :class="`categoria__icono--${categoria.tipo}`" aria-hidden="true">
              <svg v-if="categoria.tipo === 'fisico'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v.01M17.5 14.5v.01" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" />
              </svg>
            </span>
            <div class="categoria__titulo">
              <h4>{{ categoria.nombre }}</h4>
              <p>
                <span class="etiqueta">{{ etiquetaTipo(categoria.tipo) }}</span>
                <span class="estado" :class="categoria.activo ? 'estado--si' : 'estado--no'">{{ categoria.activo ? 'Activa' : 'Desactivada' }}</span>
              </p>
            </div>
            <button
              type="button"
              class="interruptor"
              role="switch"
              :aria-checked="categoria.activo"
              :aria-label="`Categoría ${categoria.nombre}: ${categoria.activo ? 'activa' : 'desactivada'}`"
              :disabled="guardando"
              @click="cambiarEstadoCategoria(categoria, !categoria.activo)"
            >
              <span class="interruptor__pista"><span class="interruptor__pulgar" /></span>
            </button>
            <button
              type="button"
              class="btn btn--peligro-suave btn--chico"
              :aria-label="`Eliminar la categoría ${categoria.nombre}`"
              :disabled="guardando || categoria.metodos.length > 0"
              :title="categoria.metodos.length > 0 ? 'Elimina primero sus métodos' : undefined"
              @click="pedirEliminar({ tipo: 'categoria', id: categoria.idCategoriaMetodoPago, nombre: categoria.nombre }, $event)"
            >
              Eliminar
            </button>
          </header>

          <ul class="metodos">
            <li v-for="metodo in categoria.metodos" :key="metodo.idMetodo" :class="{ 'metodos__inactivo': !metodo.activo || !categoria.activo }">
              <div class="metodos__nombre">
                <strong>{{ metodo.nombre }}</strong>
                <span>{{ visibilidad(categoria, metodo) }}</span>
              </div>
              <span v-if="metodo.esEfectivo" class="etiqueta etiqueta--efectivo">Efectivo para corte</span>
              <label v-if="categoria.tipo === 'fisico'" class="casilla">
                <input type="checkbox" :checked="metodo.esEfectivo" :disabled="guardando" @change="cambiarEfectivo(metodo, ($event.target as HTMLInputElement).checked)">
                Efectivo
              </label>
              <button
                type="button"
                class="interruptor"
                role="switch"
                :aria-checked="metodo.activo"
                :aria-label="`${metodo.nombre}: ${metodo.activo ? 'activo' : 'desactivado'}`"
                :disabled="guardando"
                @click="cambiarEstadoMetodo(metodo, !metodo.activo)"
              >
                <span class="interruptor__pista"><span class="interruptor__pulgar" /></span>
              </button>
              <button
                type="button"
                class="btn btn--peligro-suave btn--chico"
                :aria-label="`Eliminar ${metodo.nombre}`"
                :disabled="guardando || metodo.esEfectivo"
                :title="metodo.esEfectivo ? 'El método de efectivo no se puede eliminar: el cuadre de caja lo necesita' : undefined"
                @click="pedirEliminar({ tipo: 'metodo', id: metodo.idMetodo, nombre: metodo.nombre }, $event)"
              >
                Eliminar
              </button>
            </li>
            <li v-if="categoria.metodos.length === 0" class="metodos__vacio">
              Aún no hay métodos aquí. Agrega uno abajo para que el mesero y el cajero puedan elegirlo.
            </li>
          </ul>

          <form class="nuevo-metodo" @submit.prevent="crearMetodo(categoria)">
            <div class="campo nuevo-metodo__nombre">
              <label :for="`nuevo-metodo-${categoria.idCategoriaMetodoPago}`">Agregar método a «{{ categoria.nombre }}»</label>
              <input
                :id="`nuevo-metodo-${categoria.idCategoriaMetodoPago}`"
                v-model="nombresMetodo[categoria.idCategoriaMetodoPago]" v-permitir="'texto'"
                type="text"
                maxlength="40"
                autocomplete="off"
                required
                :disabled="guardando"
                :placeholder="categoria.tipo === 'fisico' ? 'Ej.: Vales de despensa' : 'Ej.: Tarjeta'"
              >
            </div>
            <label v-if="categoria.tipo === 'fisico'" class="casilla">
              <input v-model="metodoEfectivo[categoria.idCategoriaMetodoPago]" type="checkbox" :disabled="guardando">
              Cuenta como efectivo
            </label>
            <button class="btn btn--secundario" type="submit" :disabled="guardando || !(nombresMetodo[categoria.idCategoriaMetodoPago] ?? '').trim()">
              Agregar
            </button>
          </form>
        </article>
      </section>
    </template>

    <ConfirmarAccionDialog
      :abierto="aEliminar !== null"
      id-base="eliminar-pago"
      :titulo="`¿Eliminar ${aEliminar?.tipo === 'categoria' ? 'la categoría' : 'el método'} «${aEliminar?.nombre}»?`"
      :descripcion="aEliminar?.tipo === 'categoria'
        ? 'Dejará de aparecer en esta lista y no se ofrecerá en ningún lado. Podrás restaurarla desde «Eliminados» (volverá desactivada).'
        : 'Dejará de aparecer y ya no se ofrecerá al mesero ni al cajero. Los pagos anteriores lo conservan y podrás restaurarlo desde «Eliminados» (volverá desactivado).'"
      texto-confirmar="Eliminar"
      :en-curso="eliminando"
      :error-reintentable="errorEliminar"
      :rechazo="rechazoEliminar"
      :origen-foco="origenEliminar"
      @confirmar="confirmarEliminar"
      @cerrar="aEliminar = null"
    />
  </section>
</template>

<style scoped>
.vistas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.vistas__nota {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.btn--chico {
  min-height: 40px;
  padding: 0 var(--espacio-3);
}

.pagina {
  display: grid;
  gap: var(--espacio-5);
  max-width: 880px;
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
  max-width: 46ch;
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
}

/* Avisos (antes sin estilo): ícono por color + texto, nunca solo color */
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

/* Resumen */
.resumen {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--espacio-3);
  margin: 0;
}

.resumen > div {
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
}

.resumen dt {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.resumen dd {
  margin: 0;
  font-size: var(--texto-xl);
  font-weight: 700;
  line-height: 1.2;
}

.resumen dd small {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 500;
}

/* Nueva categoría */
.nueva h3 {
  margin: 0 0 var(--espacio-3);
}

.nueva__fila {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--espacio-4);
  align-items: end;
}

.nueva__nombre input {
  width: 100%;
}

.tipos {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  grid-column: 1 / -1;
}

.tipos legend {
  padding: 0;
  margin-bottom: var(--espacio-2);
  font-weight: 650;
}

.tipos__opciones {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--espacio-3);
}

.tipo {
  display: grid;
  grid-template-columns: 22px 1fr;
  column-gap: var(--espacio-3);
  align-items: center;
  min-height: 60px;
  padding: var(--espacio-2) var(--espacio-4);
  border: 1.5px solid var(--color-borde-control);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  cursor: pointer;
}

.tipo input {
  grid-row: 1 / span 2;
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--color-primary-dark);
}

.tipo small {
  color: var(--color-muted);
}

.tipo--elegido {
  border-color: var(--color-primary-dark);
  background: var(--color-primary-suave);
  box-shadow: inset 0 0 0 1px var(--color-primary-dark);
}

.tipo:has(input:focus-visible) {
  outline: 3px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.nueva__boton {
  grid-column: 2;
  grid-row: 1;
}

/* Lista */
.lista {
  display: grid;
  gap: var(--espacio-4);
}

.lista h3 {
  margin: 0;
}

.categoria {
  display: grid;
  gap: var(--espacio-4);
  padding: var(--espacio-5);
}

.categoria--inactiva {
  background: var(--color-deshabilitado-fondo);
}

.categoria__encabezado {
  display: flex;
  align-items: center;
  gap: var(--espacio-4);
}

.categoria__icono {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radio-sm);
}

.categoria__icono--fisico {
  background: var(--color-maiz-fondo);
  color: var(--color-maiz-texto);
}

.categoria__icono--digital {
  background: var(--color-secondary-soft);
  color: var(--color-secondary-dark);
}

.categoria__titulo {
  flex: 1;
  min-width: 0;
}

.categoria__titulo h4 {
  margin: 0;
  font-size: var(--texto-lg);
}

.categoria__titulo p {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
  margin: var(--espacio-1) 0 0;
}

.etiqueta,
.estado {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 var(--espacio-3);
  border-radius: var(--radio-pill);
  background: var(--color-surface-2);
  color: var(--color-text);
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

.etiqueta--efectivo {
  background: var(--color-maiz-fondo);
  color: var(--color-maiz-texto);
}

/* Métodos */
.metodos {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radio-sm);
  overflow: hidden;
}

.metodos li {
  display: flex;
  align-items: center;
  gap: var(--espacio-4);
  min-height: 60px;
  padding: var(--espacio-2) var(--espacio-4);
  background: var(--color-surface);
}

.metodos li + li {
  border-top: 1px solid var(--color-border);
}

.metodos__nombre {
  display: grid;
  flex: 1;
  min-width: 0;
}

.metodos__nombre span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.metodos__inactivo .metodos__nombre strong {
  color: var(--color-muted);
}

.metodos .metodos__vacio {
  color: var(--color-muted);
  background: var(--color-bg);
}

/* Alta de método */
.nuevo-metodo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--espacio-3) var(--espacio-4);
}

.nuevo-metodo__nombre {
  flex: 1 1 15rem;
}

.nuevo-metodo__nombre input {
  width: 100%;
}

.casilla {
  display: inline-flex;
  align-items: center;
  gap: var(--espacio-2);
  min-height: 48px;
  font-weight: 600;
  cursor: pointer;
}

.casilla input {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--color-primary-dark);
}

/* Interruptor propio (reemplaza al checkbox nativo que se veía recortado) */
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
  .nueva__fila {
    grid-template-columns: 1fr;
  }

  .nueva__boton {
    grid-column: 1;
    grid-row: auto;
    width: 100%;
  }

  .tipos__opciones {
    grid-template-columns: 1fr;
  }

  .metodos li {
    flex-wrap: wrap;
  }

  /* El nombre ocupa toda la línea; el interruptor y «Eliminar» pasan debajo */
  .metodos__nombre {
    flex: 1 1 100%;
  }

  /* Encabezado de la categoría: título completo y los controles (interruptor, «Eliminar») en su propia línea */
  .categoria__encabezado {
    flex-wrap: wrap;
  }

  .categoria__titulo {
    flex: 1 1 calc(100% - 44px - var(--espacio-4));
  }
}
</style>
