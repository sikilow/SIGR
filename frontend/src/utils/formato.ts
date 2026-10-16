// Formato de textos para la interfaz (idioma y moneda de México).

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

/** 1250 → "$1,250.00 MXN" */
export function formatearMoneda(importe: number): string {
  return `${formatoMoneda.format(importe)} MXN`
}

/** 1 → "1 persona", 4 → "4 personas" */
export function formatearCapacidad(personas: number): string {
  return `${personas} ${personas === 1 ? 'persona' : 'personas'}`
}

/** 1 → "1 pedido activo", 3 → "3 pedidos activos" */
export function formatearPedidosActivos(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'pedido activo' : 'pedidos activos'}`
}

/** Date (p. ej. pedido.fechaHora) → "18:30" (hora local, 24 h) */
export function formatearHora(fecha: Date): string {
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** 1 → "1 producto", 3 → "3 productos" */
export function formatearProductos(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`
}

/** 1 → "1 pedido", 3 → "3 pedidos" */
export function formatearPedidos(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'pedido' : 'pedidos'}`
}
