// Tras una acción que cambia datos en el servidor (cancelar, enviar, entregar, solicitar cuenta)
// se recargan los tres stores que muestran pedidos, cuenta y mesas, para que ninguna pantalla
// quede con información anterior a la acción.
import { useCuentaStore } from './cuenta'
import { useMesasStore } from './mesas'
import { usePedidosStore } from './pedidos'

/** Espera a que termine la recarga; un fallo de red aquí no deshace la acción ya realizada. */
export async function invalidarDatos(): Promise<void> {
  await Promise.allSettled([usePedidosStore().invalidar(), useCuentaStore().invalidar(), useMesasStore().invalidar()])
}
