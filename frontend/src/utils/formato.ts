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
