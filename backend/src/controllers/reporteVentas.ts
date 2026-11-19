// Reporte e historial de ventas por periodo (RF-VEN-003 y RF-VEN-004). Solo lectura: se arma con las tablas que
// llena el cobro (`venta`, `pago`) y con los pedidos de cada cuenta (`pedido`, `detalle_pedido`). Los pedidos
// cancelados no cuentan. Las fechas son las del cobro (`venta.fecha_hora`).
import type { Request, Response } from "express";
import { z } from "zod";
import { validar } from "../models/dominio";
import { filas, pool } from "../services/db";
import { ErrorApi } from "../utils/errores";

/** Máximo de días por consulta: dos años cubren «este año contra el anterior». */
export const MAX_DIAS_REPORTE = 731;
/** Máximo de ventas en el detalle (las más recientes). Los totales y desgloses siempre cuentan todas. */
export const MAX_VENTAS_DETALLE = 20_000;

function esFechaISOValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaUTC = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isFinite(fechaUTC.getTime()) && fechaUTC.toISOString().slice(0, 10) === fecha;
}

export const FechaISO = z.string().refine(esFechaISOValida, "la fecha debe tener formato AAAA-MM-DD");
const FiltroReporte = z.object({ desde: FechaISO, hasta: FechaISO });

/** Días entre dos fechas AAAA-MM-DD, contando ambas. */
export function diasEnRango(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}

const numero = (valor: unknown): number => Number(valor ?? 0);
const dinero = (valor: unknown): number => Math.round(Number(valor ?? 0) * 100) / 100;

/** Importe de una línea que sí se cobró (pedido no cancelado). */
const NO_CANCELADO = "pe.id_estado <> (SELECT id_estado FROM estado_pedido WHERE nombre = 'Cancelado')";
/** Ventas cobradas en el rango [desde, hasta + 1 día). */
const EN_RANGO = "v.fecha_hora >= ? AND v.fecha_hora < ? + INTERVAL 1 DAY";

/** GET /api/caja/reportes/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (gerente). */
export const reporteVentas = async (req: Request, res: Response) => {
  const { desde, hasta } = validar(FiltroReporte, req.query);
  if (desde > hasta) throw new ErrorApi(422, "estado_invalido", "La fecha inicial no puede ser posterior a la final.");
  if (diasEnRango(desde, hasta) > MAX_DIAS_REPORTE) {
    throw new ErrorApi(422, "estado_invalido", "El periodo no puede ser mayor a dos años. Elige un rango más corto.");
  }
  const rango = [desde, hasta];

  const [resumen, porDia, porHora, porMetodo, porMesero, porProducto, porCategoria, porSeccion, ventas, pagos] = await Promise.all([
    filas(pool, `SELECT COUNT(*) AS ventas, COALESCE(SUM(v.total), 0) AS total FROM venta v WHERE ${EN_RANGO}`, rango),
    filas(
      pool,
      `SELECT DATE_FORMAT(v.fecha_hora, '%Y-%m-%d') AS dia, COUNT(*) AS ventas, SUM(v.total) AS total
         FROM venta v WHERE ${EN_RANGO} GROUP BY dia ORDER BY dia`,
      rango,
    ),
    filas(
      pool,
      `SELECT HOUR(v.fecha_hora) AS hora, COUNT(*) AS ventas, SUM(v.total) AS total
         FROM venta v WHERE ${EN_RANGO} GROUP BY hora ORDER BY hora`,
      rango,
    ),
    filas(
      pool,
      `SELECT mp.nombre AS metodo, COUNT(p.id_pago) AS pagos, SUM(p.monto) AS total
         FROM pago p
         JOIN venta v ON v.id_venta = p.id_venta
         JOIN metodo_pago mp ON mp.id_metodo = p.id_metodo
        WHERE ${EN_RANGO}
        GROUP BY mp.id_metodo, mp.nombre
        ORDER BY total DESC`,
      rango,
    ),
    filas(
      pool,
      `SELECT u.nombre AS mesero, COUNT(DISTINCT v.id_venta) AS cuentas, SUM(dp.cantidad * dp.precio_unitario) AS total
         FROM venta v
         JOIN pedido pe ON pe.id_cuenta = v.id_cuenta AND ${NO_CANCELADO}
         JOIN detalle_pedido dp ON dp.id_pedido = pe.id_pedido
         JOIN usuario u ON u.id_usuario = pe.id_mesero
        WHERE ${EN_RANGO}
        GROUP BY u.id_usuario, u.nombre
        ORDER BY total DESC`,
      rango,
    ),
    filas(
      pool,
      `SELECT pr.nombre AS producto, pr.presentacion, cm.nombre AS categoria,
              SUM(dp.cantidad) AS cantidad, SUM(dp.cantidad * dp.precio_unitario) AS total
         FROM venta v
         JOIN pedido pe ON pe.id_cuenta = v.id_cuenta AND ${NO_CANCELADO}
         JOIN detalle_pedido dp ON dp.id_pedido = pe.id_pedido
         JOIN producto pr ON pr.id_producto = dp.id_producto
         JOIN categoria_menu cm ON cm.id_categoria = pr.id_categoria
        WHERE ${EN_RANGO}
        GROUP BY pr.id_producto, pr.nombre, pr.presentacion, cm.nombre
        ORDER BY total DESC, cantidad DESC`,
      rango,
    ),
    filas(
      pool,
      `SELECT cm.nombre AS categoria, SUM(dp.cantidad) AS cantidad, SUM(dp.cantidad * dp.precio_unitario) AS total
         FROM venta v
         JOIN pedido pe ON pe.id_cuenta = v.id_cuenta AND ${NO_CANCELADO}
         JOIN detalle_pedido dp ON dp.id_pedido = pe.id_pedido
         JOIN producto pr ON pr.id_producto = dp.id_producto
         JOIN categoria_menu cm ON cm.id_categoria = pr.id_categoria
        WHERE ${EN_RANGO}
        GROUP BY cm.id_categoria, cm.nombre
        ORDER BY total DESC`,
      rango,
    ),
    filas(
      pool,
      `SELECT COALESCE(m.zona, 'Sin sección') AS seccion, COUNT(*) AS ventas, SUM(v.total) AS total
         FROM venta v
         JOIN cuenta c ON c.id_cuenta = v.id_cuenta
         JOIN mesa m ON m.id_mesa = c.id_mesa
        WHERE ${EN_RANGO}
        GROUP BY seccion
        ORDER BY total DESC`,
      rango,
    ),
    filas(
      pool,
      `SELECT v.id_venta, v.id_cuenta, DATE_FORMAT(v.fecha_hora, '%Y-%m-%d %H:%i:%s') AS fecha_hora, v.total,
              m.numero AS mesa_numero, m.zona AS seccion, cp.nombre AS canal, uc.nombre AS cajero,
              (SELECT GROUP_CONCAT(DISTINCT um.nombre ORDER BY um.nombre SEPARATOR ', ')
                 FROM pedido pe JOIN usuario um ON um.id_usuario = pe.id_mesero
                WHERE pe.id_cuenta = v.id_cuenta AND ${NO_CANCELADO}) AS meseros
         FROM venta v
         JOIN cuenta c ON c.id_cuenta = v.id_cuenta
         JOIN mesa m ON m.id_mesa = c.id_mesa
         LEFT JOIN canal_pedido cp ON cp.id_canal = c.id_canal
         JOIN usuario uc ON uc.id_usuario = v.id_cajero
        WHERE ${EN_RANGO}
        ORDER BY v.fecha_hora DESC, v.id_venta DESC
        LIMIT ${MAX_VENTAS_DETALLE}`,
      rango,
    ),
    filas(
      pool,
      `SELECT p.id_venta, mp.nombre AS metodo, p.monto
         FROM pago p
         JOIN venta v ON v.id_venta = p.id_venta
         JOIN metodo_pago mp ON mp.id_metodo = p.id_metodo
        WHERE ${EN_RANGO}
        ORDER BY p.id_pago`,
      rango,
    ),
  ]);

  const pagosPorVenta = new Map<number, { metodo: string; monto: number }[]>();
  for (const pago of pagos) {
    const id = numero(pago.id_venta);
    const lista = pagosPorVenta.get(id) ?? [];
    lista.push({ metodo: String(pago.metodo), monto: dinero(pago.monto) });
    pagosPorVenta.set(id, lista);
  }

  // Devoluciones aprobadas en el periodo (por la fecha en que se aprobaron; migración 034). El «neto» es ventas menos devoluciones.
  const [devueltas] = await filas(
    pool,
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(d.total), 0) AS total
       FROM devolucion d
      WHERE d.estado = 'aprobada' AND d.resuelto_en >= ? AND d.resuelto_en < ? + INTERVAL 1 DAY`,
    rango,
  );
  const totalDevuelto = dinero(devueltas?.total);

  const totalVentas = numero(resumen[0]?.ventas);
  res.json({
    desde,
    hasta,
    resumen: {
      ventas: totalVentas,
      total: dinero(resumen[0]?.total),
      devoluciones: numero(devueltas?.cantidad),
      devuelto: totalDevuelto,
      neto: Math.round((dinero(resumen[0]?.total) - totalDevuelto) * 100) / 100,
    },
    por_dia: porDia.map((f) => ({ dia: String(f.dia), ventas: numero(f.ventas), total: dinero(f.total) })),
    por_hora: porHora.map((f) => ({ hora: numero(f.hora), ventas: numero(f.ventas), total: dinero(f.total) })),
    por_metodo: porMetodo.map((f) => ({ metodo: String(f.metodo), pagos: numero(f.pagos), total: dinero(f.total) })),
    por_mesero: porMesero.map((f) => ({ mesero: String(f.mesero), cuentas: numero(f.cuentas), total: dinero(f.total) })),
    por_producto: porProducto.map((f) => ({
      producto: String(f.producto),
      presentacion: String(f.presentacion ?? ""),
      categoria: String(f.categoria),
      cantidad: numero(f.cantidad),
      total: dinero(f.total),
    })),
    por_categoria: porCategoria.map((f) => ({ categoria: String(f.categoria), cantidad: numero(f.cantidad), total: dinero(f.total) })),
    por_seccion: porSeccion.map((f) => ({ seccion: String(f.seccion), ventas: numero(f.ventas), total: dinero(f.total) })),
    ventas: ventas.map((f) => ({
      id_venta: numero(f.id_venta),
      id_cuenta: numero(f.id_cuenta),
      fecha_hora: String(f.fecha_hora),
      total: dinero(f.total),
      mesa_numero: numero(f.mesa_numero),
      seccion: f.seccion === null ? null : String(f.seccion),
      canal: f.canal === null ? null : String(f.canal),
      cajero: String(f.cajero),
      meseros: f.meseros === null ? "" : String(f.meseros),
      pagos: pagosPorVenta.get(numero(f.id_venta)) ?? [],
    })),
    ventas_truncadas: totalVentas > ventas.length,
  });
};
