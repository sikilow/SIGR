// Reglas de las devoluciones de ventas (las mismas que valida la API en backend/src/models/devolucion.ts). Funciones puras:
// las usan la pantalla (para sugerir y avisar antes de enviar) y la demo (para responder como la API).
import type { LineaVentaDetalle, PagoVentaDetalle, SolicitudDevolucion, VentaDetalle } from '../types'

const centavos = (monto: number): number => Math.round(monto * 100)
const aPesos = (c: number): number => c / 100

/** Cuánto se puede devolver todavía de una línea (lo vendido menos lo ya devuelto o apartado por una solicitud pendiente). */
export function disponibleDeLinea(l: Pick<LineaVentaDetalle, 'cantidad' | 'devuelta' | 'pendiente'>): number {
  return Math.max(0, l.cantidad - l.devuelta - l.pendiente)
}

/** Lo que se puede devolver todavía con un método: lo cobrado menos lo ya devuelto o apartado. */
export function capacidadDePago(p: Pick<PagoVentaDetalle, 'monto' | 'devuelto' | 'pendiente'>): number {
  return Math.max(0, aPesos(centavos(p.monto) - centavos(p.devuelto) - centavos(p.pendiente)))
}

/** Importe de las unidades elegidas (`cantidades` por id_detalle), a precio de la venta. */
export function totalDeLineas(lineas: LineaVentaDetalle[], cantidades: Record<number, number>): number {
  return aPesos(lineas.reduce((suma, l) => suma + centavos(l.precioUnitario) * (cantidades[l.idDetalle] ?? 0), 0))
}

/**
 * Sugiere cómo devolver el dinero: llena cada método en el orden de la venta hasta donde alcanzó lo cobrado con él.
 * Devuelve solo los métodos con importe; si no alcanza (no debería pasar), lo que falta queda sin repartir.
 */
export function repartirDevolucion(total: number, pagos: PagoVentaDetalle[]): Array<{ idMetodo: number; monto: number }> {
  let falta = centavos(total)
  const reparto: Array<{ idMetodo: number; monto: number }> = []
  for (const p of pagos) {
    if (falta <= 0) break
    const cabe = Math.min(falta, centavos(capacidadDePago(p)))
    if (cabe > 0) {
      reparto.push({ idMetodo: p.idMetodo, monto: aPesos(cabe) })
      falta -= cabe
    }
  }
  return reparto
}

const moneda = (n: number): string => `$${n.toFixed(2)}`

/**
 * Revisa una solicitud contra el ticket: devuelve el primer problema (en español, para mostrarlo tal cual) o `null` si está
 * bien. La API vuelve a revisarla: esto solo evita mandar algo que se sabe inválido.
 */
export function validarSolicitudDevolucion(venta: VentaDetalle, s: SolicitudDevolucion): string | null {
  if (s.lineas.length === 0) return 'Elige al menos un producto.'
  const motivo = s.motivo.trim()
  if (motivo.length < 5) return 'Escribe el motivo (al menos 5 caracteres).'
  if (motivo.length > 200) return 'El motivo no puede pasar de 200 caracteres.'

  const vistas = new Set<number>()
  let total = 0
  for (const sol of s.lineas) {
    const linea = venta.lineas.find((l) => l.idDetalle === sol.idDetalle)
    if (!linea) return 'Hay un producto que no pertenece a esta venta.'
    if (vistas.has(sol.idDetalle)) return `«${linea.producto}» aparece dos veces: junta las cantidades en una sola línea.`
    vistas.add(sol.idDetalle)
    if (!Number.isInteger(sol.cantidad) || sol.cantidad < 1) return `Indica cuántas unidades de «${linea.producto}» se devuelven.`
    const queda = disponibleDeLinea(linea)
    if (sol.cantidad > queda) {
      return queda === 0
        ? `«${linea.producto}» ya se devolvió por completo (o tiene una devolución pendiente).`
        : `De «${linea.producto}» solo se pueden devolver ${queda} (se vendieron ${linea.cantidad}).`
    }
    total += centavos(linea.precioUnitario) * sol.cantidad
  }

  if (s.pagos.length === 0) return 'Indica cómo se devuelve el dinero.'
  const metodos = new Set<number>()
  let suma = 0
  for (const p of s.pagos) {
    const pagado = venta.pagos.find((x) => x.idMetodo === p.idMetodo)
    if (!pagado) return 'Solo se puede devolver con los métodos de pago que se usaron en la venta.'
    if (metodos.has(p.idMetodo)) return `«${pagado.metodo}» aparece dos veces en la devolución.`
    metodos.add(p.idMetodo)
    if (!(p.monto > 0)) return `Indica el importe a devolver con «${pagado.metodo}».`
    const queda = centavos(capacidadDePago(pagado))
    if (centavos(p.monto) > queda) {
      return `Con «${pagado.metodo}» solo se pueden devolver ${moneda(aPesos(queda))} (lo que se cobró con ese método menos lo ya devuelto).`
    }
    suma += centavos(p.monto)
  }
  if (suma !== total) {
    return `Los importes de la devolución (${moneda(aPesos(suma))}) deben sumar el total a devolver (${moneda(aPesos(total))}).`
  }
  return null
}
