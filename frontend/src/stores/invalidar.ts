// Tras una acción que cambia datos en el servidor (cancelar, enviar, entregar, solicitar cuenta)
// se recargan los stores que muestran pedidos, cuenta y mesas, para que ninguna pantalla
// quede con información anterior a la acción. Cada `invalidar()` no hace nada si su pantalla nunca cargó.
import { useCuentaStore } from './cuenta'
import { useMesasStore } from './mesas'
import { usePedidosGerenteStore } from './pedidosGerente'
import { usePedidosStore } from './pedidos'

/** Espera a que termine la recarga; un fallo de red aquí no deshace la acción ya realizada. */
export async function invalidarDatos(): Promise<void> {
  await Promise.allSettled([
    usePedidosStore().invalidar(),
    useCuentaStore().invalidar(),
    useMesasStore().invalidar(),
    usePedidosGerenteStore().invalidar(),
  ])
}
