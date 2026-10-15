<script setup lang="ts">
// Alta y edición de un producto, con su inventario (existencia y stock mínimo). `producto = null` crea.
// Al editar solo se manda lo que cambió. Cambiar el precio no altera pedidos ya hechos.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { CambioProducto, CategoriaAdmin, ProductoAdmin } from '../types'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{
  abierto: boolean
  producto: ProductoAdmin | null
  categorias: CategoriaAdmin[]
  /** Categoría preseleccionada al crear (la que tiene filtrada el gerente). */
  categoriaInicial?: number | null
  origenFoco?: HTMLElement | null
}>()

const emit = defineEmits<{ cerrar: []; guardado: [producto: ProductoAdmin, creado: boolean] }>()

const nombre = ref('')
const descripcion = ref('')
const categoriaId = ref<number | ''>('')
// Los números se editan como texto para poder validar "vacío" y "12.5" con claridad.
const precio = ref('')
const existencia = ref('0')
const stockMinimo = ref('0')
const activo = ref(true)
const tocado = ref(false)
const enCurso = ref(false)
const errorServidor = ref('')

const editando = computed(() => props.producto !== null)

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    const p = props.producto
    nombre.value = p?.nombre ?? ''
    descripcion.value = p?.descripcion ?? ''
    categoriaId.value = p?.categoriaId ?? props.categoriaInicial ?? props.categorias[0]?.id ?? ''
    precio.value = p ? String(p.precio) : ''
    existencia.value = p ? String(p.existencia) : '0'
    stockMinimo.value = p ? String(p.stockMinimo) : '0'
    activo.value = p?.activo ?? true
    tocado.value = false
    enCurso.value = false
    errorServidor.value = ''
  },
)

const aNumero = (t: string): number => (t.trim() === '' ? Number.NaN : Number(t))
const esEnteroNoNegativo = (n: number) => Number.isInteger(n) && n >= 0 && n <= 1_000_000

const errores = computed(() => {
  const e: Record<string, string> = {}
  const n = nombre.value.trim()
  if (!n) e.nombre = 'Escribe el nombre del producto.'
  else if (n.length > 100) e.nombre = 'Máximo 100 caracteres.'
  if (categoriaId.value === '') e.categoria = 'Elige una categoría.'
  const p = aNumero(precio.value)
  if (Number.isNaN(p)) e.precio = 'Escribe el precio (ejemplo: 85 o 85.50).'
  else if (p < 0) e.precio = 'El precio no puede ser negativo.'
  else if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) e.precio = 'Máximo 2 decimales.'
  else if (p > 99_999_999) e.precio = 'El precio es demasiado grande.'
  if (!esEnteroNoNegativo(aNumero(existencia.value))) e.existencia = 'Escribe un número entero de 0 en adelante.'
  if (!esEnteroNoNegativo(aNumero(stockMinimo.value))) e.stockMinimo = 'Escribe un número entero de 0 en adelante.'
  if (descripcion.value.trim().length > 255) e.descripcion = 'Máximo 255 caracteres.'
  return e
})

const campoErr = (k: string) => (tocado.value ? (errores.value[k] ?? '') : '')

function cambios(): CambioProducto {
  const p = props.producto
  if (!p) return {}
  const c: CambioProducto = {}
  if (nombre.value.trim() !== p.nombre) c.nombre = nombre.value
  if (descripcion.value.trim() !== p.descripcion) c.descripcion = descripcion.value
  if (categoriaId.value !== '' && categoriaId.value !== p.categoriaId) c.categoriaId = categoriaId.value
  if (aNumero(precio.value) !== p.precio) c.precio = aNumero(precio.value)
  if (activo.value !== p.activo) c.activo = activo.value
  if (aNumero(existencia.value) !== p.existencia) c.existencia = aNumero(existencia.value)
  if (aNumero(stockMinimo.value) !== p.stockMinimo) c.stockMinimo = aNumero(stockMinimo.value)
  return c
}

async function guardar() {
  if (enCurso.value) return
  tocado.value = true
  const primero = ['nombre', 'categoria', 'precio', 'existencia', 'stockMinimo', 'descripcion'].find((k) => errores.value[k])
  if (primero) {
    document.getElementById(`prod-${primero}`)?.focus()
    return
  }
  errorServidor.value = ''
  enCurso.value = true
  try {
    if (props.producto) {
      const c = cambios()
      if (Object.keys(c).length === 0) {
        emit('cerrar')
        return
      }
      emit('guardado', await servicios.catalogo.actualizarProducto(props.producto.id, c), false)
    } else {
      emit(
        'guardado',
        await servicios.catalogo.crearProducto({
          categoriaId: categoriaId.value as number,
          nombre: nombre.value,
          descripcion: descripcion.value,
          precio: aNumero(precio.value),
          activo: activo.value,
          existencia: aNumero(existencia.value),
          stockMinimo: aNumero(stockMinimo.value),
        }),
        true,
      )
    }
  } catch (e) {
    errorServidor.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="form-producto-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <form class="form" novalidate @submit.prevent="guardar">
      <h2 id="form-producto-titulo">{{ editando ? `Editar ${producto?.nombre}` : 'Nuevo producto' }}</h2>

      <div class="campo">
        <label for="prod-nombre">Nombre</label>
        <input id="prod-nombre" v-model="nombre" type="text" autocomplete="off" autofocus maxlength="100"
          :aria-invalid="campoErr('nombre') ? 'true' : undefined" :aria-describedby="campoErr('nombre') ? 'prod-nombre-e' : undefined" />
        <p v-if="campoErr('nombre')" id="prod-nombre-e" class="texto-error form__error">{{ campoErr('nombre') }}</p>
      </div>

      <div class="campo">
        <label for="prod-descripcion">Descripción <span class="form__opcional">(opcional)</span></label>
        <input id="prod-descripcion" v-model="descripcion" type="text" autocomplete="off" maxlength="255"
          :aria-invalid="campoErr('descripcion') ? 'true' : undefined" :aria-describedby="campoErr('descripcion') ? 'prod-descripcion-e' : undefined" />
        <p v-if="campoErr('descripcion')" id="prod-descripcion-e" class="texto-error form__error">{{ campoErr('descripcion') }}</p>
      </div>

      <div class="form__fila">
        <div class="campo">
          <label for="prod-categoria">Categoría</label>
          <select id="prod-categoria" v-model="categoriaId" :aria-invalid="campoErr('categoria') ? 'true' : undefined">
            <option v-if="categorias.length === 0" value="" disabled>Primero crea una categoría</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <p v-if="campoErr('categoria')" class="texto-error form__error">{{ campoErr('categoria') }}</p>
        </div>

        <div class="campo">
          <label for="prod-precio">Precio (MXN)</label>
          <input id="prod-precio" v-model="precio" type="text" inputmode="decimal" autocomplete="off"
            :aria-invalid="campoErr('precio') ? 'true' : undefined" :aria-describedby="campoErr('precio') ? 'prod-precio-e' : undefined" />
          <p v-if="campoErr('precio')" id="prod-precio-e" class="texto-error form__error">{{ campoErr('precio') }}</p>
        </div>
      </div>

      <fieldset class="form__inventario">
        <legend>Inventario</legend>
        <div class="form__fila">
          <div class="campo">
            <label for="prod-existencia">Existencia</label>
            <input id="prod-existencia" v-model="existencia" type="text" inputmode="numeric" autocomplete="off"
              :aria-invalid="campoErr('existencia') ? 'true' : undefined" :aria-describedby="campoErr('existencia') ? 'prod-existencia-e' : undefined" />
            <p v-if="campoErr('existencia')" id="prod-existencia-e" class="texto-error form__error">{{ campoErr('existencia') }}</p>
          </div>
          <div class="campo">
            <label for="prod-stockMinimo">Stock mínimo (para avisar)</label>
            <input id="prod-stockMinimo" v-model="stockMinimo" type="text" inputmode="numeric" autocomplete="off"
              :aria-invalid="campoErr('stockMinimo') ? 'true' : undefined" :aria-describedby="campoErr('stockMinimo') ? 'prod-stockMinimo-e' : undefined" />
            <p v-if="campoErr('stockMinimo')" id="prod-stockMinimo-e" class="texto-error form__error">{{ campoErr('stockMinimo') }}</p>
          </div>
        </div>
        <p class="form__ayuda">Con existencia 0 el mesero lo ve como agotado. La existencia se descuenta sola al enviar un pedido a cocina, y se bloquea el envío si no alcanza.</p>
      </fieldset>

      <label class="form__casilla">
        <input v-model="activo" type="checkbox" />
        <span>Activo en el menú <span class="form__opcional">(si lo desmarcas, el mesero lo ve como agotado)</span></span>
      </label>

      <div v-if="errorServidor" class="form__alerta" role="alert">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
        <p>{{ errorServidor }}</p>
      </div>

      <p class="solo-lectores" role="status">{{ enCurso ? 'Guardando…' : '' }}</p>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Cancelar</button>
        <button type="submit" class="btn" :aria-disabled="enCurso ? 'true' : undefined">
          {{ enCurso ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear producto' }}
        </button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--espacio-3); }
.form__fila { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--espacio-3); }

.campo select {
  min-height: var(--tactil-min);
  padding: 0 var(--espacio-4);
  border: 2px solid var(--color-muted);
  border-radius: var(--radio-sm);
  background: var(--color-surface);
  font-weight: 400;
}

.campo input[aria-invalid='true'],
.campo select[aria-invalid='true'] { border-color: var(--color-peligro); }

.form__inventario { margin: 0; padding: var(--espacio-3) var(--espacio-4) var(--espacio-4); border: 1px solid var(--color-border); border-radius: var(--radio); background: var(--color-bg); }
.form__inventario legend { padding: 0 var(--espacio-2); font-weight: 700; }
.form__opcional, .form__ayuda { color: var(--color-muted); font-size: var(--texto-sm); font-weight: 400; }
.form__ayuda, .form__error { margin: var(--espacio-2) 0 0; }
.form__error { margin: 0; font-size: var(--texto-sm); }

.form__casilla { display: flex; align-items: center; gap: var(--espacio-3); min-height: var(--tactil-min); font-weight: 600; cursor: pointer; }
.form__casilla input { flex: none; width: 24px; height: 24px; accent-color: var(--color-primary-dark); }

.form__alerta { display: flex; gap: var(--espacio-3); padding: var(--espacio-3) var(--espacio-4); border: 2px solid var(--color-peligro); border-radius: var(--radio); background: var(--color-peligro-fondo); color: var(--color-peligro-texto); }
.form__alerta svg { flex: none; margin-top: var(--espacio-1); }
.form__alerta p { margin: 0; color: var(--color-text); font-weight: 600; }
</style>
