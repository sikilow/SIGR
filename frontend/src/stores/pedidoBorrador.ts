import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LineaCarrito } from '../utils/carrito'

// La forma de las líneas cambió (`idProducto`, `indicaciones`): por eso la clave lleva versión y la anterior
// se elimina para que un borrador viejo no se lea con los nombres nuevos.
const CLAVE_ALMACEN = 'sigr.borradores.v2'
const CLAVE_ALMACEN_ANTERIOR = 'sigr.borradores'

type Borradores = Record<number, LineaCarrito[]>

function leer(): Borradores {
  try {
    sessionStorage.removeItem(CLAVE_ALMACEN_ANTERIOR)
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

  function lineasDe(idMesa: number): LineaCarrito[] {
    return porMesa.value[idMesa] ?? []
  }

  function tieneBorrador(idMesa: number): boolean {
    return lineasDe(idMesa).length > 0
  }

  /** Reemplaza el carrito de la mesa; si queda vacío, elimina el borrador. */
  function establecer(idMesa: number, lineas: LineaCarrito[]) {
    if (lineas.length === 0) delete porMesa.value[idMesa]
    else porMesa.value[idMesa] = lineas
    persistir()
  }

  /** Se llama al registrar con éxito. */
  function vaciar(idMesa: number) {
    establecer(idMesa, [])
  }

  return { porMesa, lineasDe, tieneBorrador, establecer, vaciar }
})
