<script setup lang="ts">
// Registrar una merma (producto que se pierde). El gerente elige el producto, cuántas unidades, el motivo y una nota opcional.
// Si el producto controla existencia, se descuenta del inventario (y no puede pasar de lo que hay); si se prepara al
// momento, solo queda el registro. Los reintentos tras un fallo de red reutilizan la misma Idempotency-Key.
import { computed, ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import { useAnunciosStore } from '../stores/anuncios'
import { ETIQUETA_MOTIVO_MERMA, MOTIVOS_MERMA, type Merma, type MotivoMerma, type ProductoAdmin } from '../types'
import { vPermitir } from '../utils/campos'
import { formatearMoneda } from '../utils/formato'
import { crearClaveIdempotencia, esFalloReintentable } from '../utils/idempotencia'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{ abierto: boolean; origenFoco?: HTMLElement | null }>()
const emit = defineEmits<{ cerrar: []; registrada: [merma: Merma] }>()

const anuncios = useAnunciosStore()
const claves = crearClaveIdempotencia()

const productos = ref<ProductoAdmin[]>([])
const cargandoProductos = ref(false)
const idProducto = ref<number | null>(null)
const busqueda = ref('')
const cantidad = ref<number | null>(1)
const motivo = ref<MotivoMerma>('caducado')
const nota = ref('')
const enCurso = ref(false)
const error = ref('')

const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const filtrados = computed(() => {
  const q = normalizar(busqueda.value.trim())
  return productos.value.filter((p) => !q || normalizar(`${p.nombre} ${p.presentacion} ${p.categoria}`).includes(q))
})
const producto = computed(() => productos.value.find((p) => p.idProducto === idProducto.value) ?? null)
const valor = computed(() => (producto.value && cantidad.value ? Math.round(producto.value.precio * cantidad.value * 100) / 100 : 0))
const texto = (p: ProductoAdmin) => `${p.nombre}${p.presentacion ? ` (${p.presentacion})` : ''}`
const quedan = computed(() => (producto.value?.controlaExistencia ? producto.value.existencia : null))
const cantidadValida = computed(() => Number.isInteger(cantidad.value) && (cantidad.value ?? 0) >= 1 && (quedan.value === null || (cantidad.value ?? 0) <= quedan.value))

watch(
  () => props.abierto,
  async (abierto) => {
    if (!abierto) return
    idProducto.value = null
    busqueda.value = ''
    cantidad.value = 1
    motivo.value = 'caducado'
    nota.value = ''
    enCurso.value = false
    error.value = ''
    claves.soltar()
    cargandoProductos.value = true
    try {
      productos.value = (await servicios.catalogo.listarProductos()).filter((p) => !p.eliminadoEn)
    } catch (e) {
      error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar los productos.'
    } finally {
      cargandoProductos.value = false
    }
  },
)

async function registrar() {
  if (enCurso.value) return
  if (!producto.value) {
    error.value = 'Elige el producto.'
    return
  }
  if (!cantidadValida.value) {
    error.value =
      quedan.value !== null && (cantidad.value ?? 0) > quedan.value
        ? `Solo quedan ${quedan.value} en el inventario.`
        : 'Indica cuántas unidades se perdieron (un número entero de 1 o más).'
    return
  }
  enCurso.value = true
  error.value = ''
  const datos = { idProducto: producto.value.idProducto, cantidad: cantidad.value!, motivo: motivo.value, nota: nota.value.trim() || undefined }
  const clave = claves.para(`merma|${JSON.stringify(datos)}`)
  try {
    const merma = await servicios.reportes.registrarMerma(datos, clave)
    claves.soltar()
    void anuncios.anunciar(`Merma registrada: ${merma.cantidad} de ${merma.producto}`)
    emit('registrada', merma)
  } catch (e) {
    if (esFalloReintentable(e)) {
      error.value = 'No se pudo conectar con el servidor. Lo que escribiste se conservó: vuelve a intentarlo.'
    } else {
      claves.soltar()
      error.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
    }
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="merma-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <form class="merma" novalidate @submit.prevent="registrar">
      <header>
        <h2 id="merma-titulo">Registrar merma</h2>
        <p class="merma__ayuda">Producto que se perdió. Si controla existencia, se descuenta del inventario.</p>
      </header>

      <div class="campo">
        <label for="merma-buscar">Producto</label>
        <input id="merma-buscar" v-model="busqueda" v-permitir="'busqueda'" type="search" placeholder="Buscar por nombre o categoría" autocomplete="off" :disabled="enCurso" autofocus />
      </div>
      <div class="campo">
        <label for="merma-producto" class="solo-lectores">Elige el producto</label>
        <select id="merma-producto" v-model="idProducto" size="6" :disabled="enCurso || cargandoProductos" :aria-busy="cargandoProductos" @change="error = ''">
          <option v-for="p in filtrados" :key="p.idProducto" :value="p.idProducto">
            {{ texto(p) }} · {{ p.categoria }}{{ p.controlaExistencia ? ` · quedan ${p.existencia}` : '' }}
          </option>
        </select>
        <p v-if="!cargandoProductos && filtrados.length === 0" class="merma__ayuda">Ningún producto coincide.</p>
      </div>

      <div class="merma__par">
        <div class="campo">
          <label for="merma-cantidad">Unidades perdidas</label>
          <input id="merma-cantidad" v-model.number="cantidad" type="number" inputmode="numeric" min="1" step="1" :max="quedan ?? undefined" :disabled="enCurso" :aria-invalid="!cantidadValida && cantidad !== null ? 'true' : undefined" />
        </div>
        <div class="campo">
          <label for="merma-motivo">Motivo</label>
          <select id="merma-motivo" v-model="motivo" :disabled="enCurso">
            <option v-for="m in MOTIVOS_MERMA" :key="m" :value="m">{{ ETIQUETA_MOTIVO_MERMA[m] }}</option>
          </select>
        </div>
      </div>

      <p v-if="producto" class="merma__resumen" role="status">
        {{ texto(producto) }}: {{ cantidad || 0 }} × {{ formatearMoneda(producto.precio) }} = <strong class="numero">{{ formatearMoneda(valor) }}</strong> a precio de venta.
        <template v-if="producto.controlaExistencia">Quedarían {{ Math.max(producto.existencia - (cantidad || 0), 0) }} en inventario.</template>
        <template v-else>Se prepara al momento: no baja ningún inventario.</template>
      </p>

      <div class="campo">
        <label for="merma-nota">Nota <span class="merma__ayuda">(opcional)</span></label>
        <textarea id="merma-nota" v-model="nota" v-permitir="'nota'" maxlength="200" rows="2" :readonly="enCurso" />
      </div>

      <div v-if="error" class="aviso aviso--error" role="alert"><p>{{ error }}</p></div>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Cancelar</button>
        <button type="submit" class="btn" :disabled="enCurso || !producto">{{ enCurso ? 'Registrando…' : 'Registrar merma' }}</button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.merma {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.merma__ayuda {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 400;
}

.merma__par {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--espacio-3);
}

.merma__resumen {
  margin: 0;
  padding: var(--espacio-2) var(--espacio-3);
  border-radius: var(--radio-sm);
  background: var(--color-info-fondo);
  color: var(--color-info-texto);
  font-size: var(--texto-sm);
}

select[size] {
  height: auto;
  min-height: 11rem;
  padding: var(--espacio-1);
}
</style>
