// Simula el paso del tiempo en el mock: cocina avanza algunos pedidos para que el
// Panel de mesas muestre cambios sin intervención. Solo se usa con VITE_USE_MOCK=true.
import type { EstadoPedido } from '../../types'
import { baseDatos } from './baseDatos'

/** Cambia el estado del pedido tras `enMs`, solo si sigue en el estado esperado. */
function avanzar(pedidoId: number, desde: EstadoPedido, hacia: EstadoPedido, enMs: number): void {
  setTimeout(() => {
    const pedido = baseDatos.pedidos.find((p) => p.id === pedidoId)
    if (pedido?.estado === desde) pedido.estado = hacia
  }, enMs)
}

export function iniciarSimulacion(): void {
  // Mesa 5: la arrachera sale de cocina a los 30 s.
  avanzar(3, 'en_preparacion', 'listo', 30_000)
  // Mesa 11: el filete entra a preparación a los 20 s y queda listo a los 60 s.
  avanzar(5, 'enviado', 'en_preparacion', 20_000)
  avanzar(5, 'en_preparacion', 'listo', 60_000)
  // Mesa 3: el mesero ya sirvió el postre a los 90 s.
  avanzar(2, 'listo', 'entregado', 90_000)
}
