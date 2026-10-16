<script setup lang="ts">
// Menú del restaurante: chips de categoría (aria-pressed), búsqueda por nombre en TODAS las
// categorías y cuadrícula de productos. No conoce el carrito: recibe cuántas unidades lleva
// cada producto y avisa cuando se toca uno para agregar.
import { computed, ref } from 'vue'
import type { CategoriaMenu, Producto } from '../types'
import ProductoCard from './ProductoCard.vue'

const props = defineProps<{
  categorias: CategoriaMenu[]
  /** Unidades por producto que ya están en el pedido (idProducto → cantidad). */
  cantidades: Record<number, number>
}>()

defineEmits<{ agregar: [producto: Producto] }>()

const seleccionada = ref<number | null>(null)
const busqueda = ref('')

/** La primera categoría queda seleccionada por defecto. */
const categoriaActiva = computed(() => seleccionada.value ?? props.categorias[0]?.idCategoria ?? null)
const buscando = computed(() => busqueda.value.trim() !== '')

/** Minúsculas y sin acentos, para que "cafe" encuentre "Café". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const productos = computed<Producto[]>(() => {
  if (buscando.value) {
    const consulta = normalizar(busqueda.value.trim())
    return props.categorias.flatMap((c) => c.productos).filter((p) => normalizar(p.nombre).includes(consulta))
  }
  return props.categorias.find((c) => c.idCategoria === categoriaActiva.value)?.productos ?? []
})

function elegirCategoria(idCategoria: number) {
  busqueda.value = ''
  seleccionada.value = idCategoria
}
</script>

<template>
  <section class="menu" aria-label="Menú">
    <div class="menu__herramientas">
      <div class="campo menu__buscar">
        <label for="menu-busqueda">Buscar producto</label>
        <input
          id="menu-busqueda"
          v-model="busqueda"
          type="search"
          autocomplete="off"
          placeholder="Nombre del producto"
        />
      </div>

      <div class="menu__categorias" role="group" aria-label="Categorías del menú">
        <button
          v-for="categoria in categorias"
          :key="categoria.idCategoria"
          type="button"
          class="chip"
          :class="{ 'chip--activo': !buscando && categoria.idCategoria === categoriaActiva }"
          :aria-pressed="!buscando && categoria.idCategoria === categoriaActiva"
          @click="elegirCategoria(categoria.idCategoria)"
        >
          <svg
            v-if="!buscando && categoria.idCategoria === categoriaActiva"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
          {{ categoria.nombre }}
        </button>
      </div>
    </div>

    <p class="menu__resultados" role="status">
      <template v-if="buscando">
        {{ productos.length }} {{ productos.length === 1 ? 'resultado' : 'resultados' }} en todas las categorías
      </template>
    </p>

    <ul v-if="productos.length > 0" class="menu__cuadricula">
      <li v-for="producto in productos" :key="producto.idProducto">
        <ProductoCard :producto="producto" :en-pedido="cantidades[producto.idProducto] ?? 0" @agregar="$emit('agregar', $event)" />
      </li>
    </ul>

    <div v-else class="menu__vacio">
      <p>
        <template v-if="buscando">No se encontró ningún producto con «{{ busqueda.trim() }}».</template>
        <template v-else>Esta categoría no tiene productos.</template>
      </p>
      <button v-if="buscando" type="button" class="btn btn--secundario" @click="busqueda = ''">Borrar búsqueda</button>
    </div>
  </section>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  min-width: 0;
}

.menu__herramientas {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.menu__buscar input {
  width: 100%;
}

.menu__categorias {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
}

.menu__resultados {
  margin: 0;
  min-height: 1.5em;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.menu__cuadricula {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.menu__vacio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--espacio-3);
  padding: var(--espacio-8) var(--espacio-4);
  border: 2px dashed var(--color-muted);
  border-radius: var(--radio);
  text-align: center;
}

.menu__vacio p {
  margin: 0;
}
</style>
