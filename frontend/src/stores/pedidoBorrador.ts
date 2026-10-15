import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LineaCarrito } from '../utils/carrito'

const CLAVE_ALMACEN = 'sigr.borradores'

type Borradores = Record<number, LineaCarrito[]>

function leer(): Borradores {
  try {
    const texto = sessionStorage.getItem(CLAVE_ALMACEN)
    return texto ? (JSON.parse(texto) as Borradores) : {}
  } catch {
    return {}
  }
}

/** Borrador del pedido en armado, uno por mesa. Se respalda en sessionStorage. */
export const usePedidoBorradorStore = defineStore('pedidoBorrador', () => {
  const porMesa = ref<Borradores>(leer())

  function persistir() {
    try {
      sessionStorage.setItem(CLAVE_ALMACEN, JSON.stringify(porMesa.value))
    } catch {
      // Sin sessionStorage el borrador solo vive mientras la página siga abierta.
    }
  }

  function lineasDe(mesaId: number): LineaCarrito[] {
    return porMesa.value[mesaId] ?? []
  }

  function tieneBorrador(mesaId: number): boolean {
    return lineasDe(mesaId).length > 0
  }

  /** Reemplaza el carrito de la mesa; si queda vacío, elimina el borrador. */
  function establecer(mesaId: number, lineas: LineaCarrito[]) {
    if (lineas.length === 0) delete porMesa.value[mesaId]
    else porMesa.value[mesaId] = lineas
    persistir()
  }

  /** Se llama al registrar con éxito. */
  function vaciar(mesaId: number) {
    establecer(mesaId, [])
  }

  return { porMesa, lineasDe, tieneBorrador, establecer, vaciar }
})
