// Reglas de las devoluciones de ventas (migración 034). Son funciones puras: no tocan la base, así se prueban solas.
import { ErrorApi } from "../utils/errores";

const centavos = (monto: number): number => Math.round(monto * 100);

/** Una línea vendida (detalle_pedido de la cuenta cobrada) con lo que ya se devolvió o se pidió devolver. */
export interface LineaVenta {
  id_detalle: number;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  /** Unidades de devoluciones aprobadas. */
  devuelta: number;
  /** Unidades de devoluciones pendientes de autorizar (ya apartadas: no se pueden pedir otra vez). */
  pendiente: number;
}

export interface LineaSolicitada {
  id_detalle: number;
  cantidad: number;
}

export interface LineaDevolucion {
  id_detalle: number;
  cantidad: number;
  importe: number;
}

/** Cuánto se puede devolver todavía de una línea. */
export const disponibleDeLinea = (l: LineaVenta): number => Math.max(0, l.cantidad - l.devuelta - l.pendiente);

/**
 * Importe de cada línea solicitada (cantidad × precio de la venta) y total. Falla (422) si una línea no es de la venta, si se
 * repite o si se pide más de lo que queda por devolver.
 */
export function calcularLineasDevolucion(lineasVenta: LineaVenta[], solicitadas: LineaSolicitada[]): { lineas: LineaDevolucion[]; total: number } {
  const porId = new Map(lineasVenta.map((l) => [l.id_detalle, l]));
  const vistas = new Set<number>();
  let totalCentavos = 0;
  const lineas = solicitadas.map((s) => {
    const linea = porId.get(s.id_detalle);
    if (!linea) throw new ErrorApi(422, "estado_invalido", "Hay un producto que no pertenece a esta venta.");
    if (vistas.has(s.id_detalle)) throw new ErrorApi(422, "estado_invalido", `«${linea.producto}» aparece dos veces: junta las cantidades en una sola línea.`);
    vistas.add(s.id_detalle);
    const queda = disponibleDeLinea(linea);
    if (s.cantidad > queda) {
      throw new ErrorApi(
        422,
        "estado_invalido",
        queda === 0
          ? `«${linea.producto}» ya se devolvió por completo (o tiene una devolución pendiente).`
          : `De «${linea.producto}» solo se pueden devolver ${queda} (se vendieron ${linea.cantidad}).`,
      );
    }
    const importe = centavos(linea.precio_unitario) * s.cantidad;
    totalCentavos += importe;
    return { id_detalle: s.id_detalle, cantidad: s.cantidad, importe: importe / 100 };
  });
  return { lineas, total: totalCentavos / 100 };
}

/** Lo que se pagó con un método en la venta y lo que ya se devolvió (o está pendiente) por ese método. */
export interface PagoVenta {
  id_metodo: number;
  metodo: string;
  monto: number;
  devuelto: number;
  pendiente: number;
}

export interface PagoDevolucion {
  id_metodo: number;
  monto: number;
}

/**
 * Cómo se devuelve el dinero: los montos deben sumar exactamente el total de la devolución, solo con métodos que se usaron
 * en la venta y sin pasar de lo que se cobró con cada uno (descontando lo ya devuelto o pendiente).
 */
export function validarPagosDevolucion(total: number, pagos: PagoDevolucion[], pagosVenta: PagoVenta[]): void {
  const porMetodo = new Map(pagosVenta.map((p) => [p.id_metodo, p]));
  const vistos = new Set<number>();
  let suma = 0;
  for (const p of pagos) {
    const pagado = porMetodo.get(p.id_metodo);
    if (!pagado) throw new ErrorApi(422, "estado_invalido", "Solo se puede devolver con los métodos de pago que se usaron en la venta.");
    if (vistos.has(p.id_metodo)) throw new ErrorApi(422, "estado_invalido", `«${pagado.metodo}» aparece dos veces en la devolución.`);
    vistos.add(p.id_metodo);
    const queda = centavos(pagado.monto) - centavos(pagado.devuelto) - centavos(pagado.pendiente);
    if (centavos(p.monto) > queda) {
      throw new ErrorApi(422, "estado_invalido", `Con «${pagado.metodo}» solo se pueden devolver $${(Math.max(queda, 0) / 100).toFixed(2)} (lo que se cobró con ese método menos lo ya devuelto).`);
    }
    suma += centavos(p.monto);
  }
  if (suma !== centavos(total)) {
    throw new ErrorApi(
      422,
      "estado_invalido",
      `Los importes de la devolución ($${(suma / 100).toFixed(2)}) deben sumar el total a devolver ($${total.toFixed(2)}).`,
    );
  }
}

/** Estado de devolución de una venta, para mostrar en las listas. */
export type EstadoDevolucionVenta = "ninguna" | "parcial" | "total";

export function estadoDevolucionVenta(totalVenta: number, devuelto: number): EstadoDevolucionVenta {
  if (devuelto <= 0) return "ninguna";
  return centavos(devuelto) >= centavos(totalVenta) ? "total" : "parcial";
}
