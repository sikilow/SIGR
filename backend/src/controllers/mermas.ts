// Mermas (migración 035): producto que se pierde por caducar, dañarse, un error de preparación u otra causa. El gerente las
// registra (si el producto controla existencia, se descuenta del inventario) y consulta el reporte por periodo.
import type { Request, Response } from "express";
import { z } from "zod";
import { validar } from "../models/dominio";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { conIdempotencia } from "../services/idempotencia";
import { nota } from "../utils/campos";
import { ErrorApi } from "../utils/errores";
import { diasEnRango, FechaISO, MAX_DIAS_REPORTE } from "./reporteVentas";

export const MOTIVOS_MERMA = ["caducado", "danado", "preparacion", "otro"] as const;
type MotivoMerma = (typeof MOTIVOS_MERMA)[number];

const dinero = (n: unknown): number => Math.round(Number(n ?? 0) * 100) / 100;

const NuevaMerma = z
  .object({
    id_producto: z.number().int().positive(),
    cantidad: z.number().int().positive().max(100_000),
    motivo: z.enum(MOTIVOS_MERMA),
    nota: nota(200).optional(),
  })
  .strict();

/**
 * POST /api/catalogo/mermas { id_producto, cantidad, motivo, nota? } (gerente; acepta Idempotency-Key).
 * Si el producto controla existencia, descuenta `cantidad` del inventario sin pasar de lo que hay; si se prepara al momento,
 * solo queda el registro. Guarda el precio de venta de ese momento para estimar el valor perdido.
 */
export const registrarMerma = async (req: Request, res: Response) => {
  const d = validar(NuevaMerma, req.body);
  await conIdempotencia(req, res, 201, () =>
    transaccion(async (cx) => {
      const [p] = await filas(
        cx,
        `SELECT p.id_producto, p.nombre, p.presentacion, p.precio, p.controla_existencia, p.eliminado_en
           FROM producto p WHERE p.id_producto = ? FOR UPDATE`,
        [d.id_producto],
      );
      if (!p) throw new ErrorApi(404, "no_encontrado", "El producto no existe.");
      if (p.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El producto está eliminado: restáuralo para registrar su merma.");

      const descuenta = Boolean(p.controla_existencia);
      if (descuenta) {
        const r = await ejecutar(cx, "UPDATE disponibilidadProducto SET existencia = existencia - ? WHERE id_producto = ? AND existencia >= ?", [
          d.cantidad,
          d.id_producto,
          d.cantidad,
        ]);
        if (r.affectedRows === 0) {
          const [i] = await filas(cx, "SELECT existencia FROM disponibilidadProducto WHERE id_producto = ?", [d.id_producto]);
          const hay = Number(i?.existencia ?? 0);
          throw new ErrorApi(
            422,
            "estado_invalido",
            hay === 0 ? `«${String(p.nombre)}» no tiene existencias en el inventario.` : `Solo quedan ${hay} de «${String(p.nombre)}» en el inventario: no se pueden registrar ${d.cantidad} como merma.`,
          );
        }
      }
      const { insertId } = await ejecutar(
        cx,
        "INSERT INTO merma (id_producto, cantidad, motivo, nota, precio_unitario, descuenta_inventario, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [d.id_producto, d.cantidad, d.motivo, d.nota?.trim() || null, p.precio, descuenta, req.usuario!.id],
      );
      const [m] = await detalleMermas(cx, "m.id_merma = ?", [insertId]);
      return m;
    }),
  );
};

async function detalleMermas(ex: Ejecutor, condicion: string, params: unknown[], limite = 1) {
  const rows = await filas(
    ex,
    `SELECT m.id_merma, DATE_FORMAT(m.registrado_en, '%Y-%m-%d %H:%i:%s') AS fecha_hora, m.id_producto, p.nombre AS producto, p.presentacion,
            m.cantidad, m.motivo, m.nota, m.precio_unitario, m.descuenta_inventario, u.nombre AS registrado_por
       FROM merma m
       JOIN producto p ON p.id_producto = m.id_producto
       JOIN usuario u ON u.id_usuario = m.registrado_por
      WHERE ${condicion}
      ORDER BY m.registrado_en DESC, m.id_merma DESC
      LIMIT ${Math.trunc(limite)}`,
    params,
  );
  return rows.map((r) => ({
    id_merma: Number(r.id_merma),
    fecha_hora: r.fecha_hora as string,
    id_producto: Number(r.id_producto),
    producto: String(r.producto),
    presentacion: (r.presentacion as string | null) || null,
    cantidad: Number(r.cantidad),
    motivo: r.motivo as MotivoMerma,
    nota: (r.nota as string | null) ?? null,
    valor: dinero(Number(r.cantidad) * Number(r.precio_unitario)),
    descuenta_inventario: Boolean(r.descuenta_inventario),
    registrado_por: String(r.registrado_por),
  }));
}

const FiltroReporte = z.object({ desde: FechaISO, hasta: FechaISO });
/** Máximo de mermas en el detalle (las más recientes). Los totales siempre cuentan todas. */
export const MAX_MERMAS_DETALLE = 500;

const EN_RANGO = "m.registrado_en >= ? AND m.registrado_en < ? + INTERVAL 1 DAY";

/** GET /api/catalogo/mermas/reporte?desde&hasta (gerente): totales y desgloses de las mermas del periodo. */
export const reporteMermas = async (req: Request, res: Response) => {
  const { desde, hasta } = validar(FiltroReporte, req.query);
  if (desde > hasta) throw new ErrorApi(422, "estado_invalido", "La fecha inicial no puede ser posterior a la final.");
  if (diasEnRango(desde, hasta) > MAX_DIAS_REPORTE) throw new ErrorApi(422, "estado_invalido", "El periodo no puede ser mayor a dos años. Elige un rango más corto.");
  const rango = [desde, hasta];

  const [resumen, porProducto, porMotivo, porDia, sinReponer, detalle] = await Promise.all([
    filas(pool, `SELECT COUNT(*) AS registros, COALESCE(SUM(m.cantidad), 0) AS unidades, COALESCE(SUM(m.cantidad * m.precio_unitario), 0) AS valor FROM merma m WHERE ${EN_RANGO}`, rango),
    filas(
      pool,
      `SELECT p.id_producto, p.nombre AS producto, p.presentacion, c.nombre AS categoria, COUNT(*) AS registros, SUM(m.cantidad) AS unidades,
              SUM(m.cantidad * m.precio_unitario) AS valor
         FROM merma m JOIN producto p ON p.id_producto = m.id_producto JOIN categoria_menu c ON c.id_categoria = p.id_categoria
        WHERE ${EN_RANGO}
        GROUP BY p.id_producto, p.nombre, p.presentacion, c.nombre
        ORDER BY valor DESC, unidades DESC`,
      rango,
    ),
    filas(
      pool,
      `SELECT m.motivo, COUNT(*) AS registros, SUM(m.cantidad) AS unidades, SUM(m.cantidad * m.precio_unitario) AS valor
         FROM merma m WHERE ${EN_RANGO} GROUP BY m.motivo ORDER BY valor DESC`,
      rango,
    ),
    filas(
      pool,
      `SELECT DATE_FORMAT(m.registrado_en, '%Y-%m-%d') AS dia, SUM(m.cantidad) AS unidades, SUM(m.cantidad * m.precio_unitario) AS valor
         FROM merma m WHERE ${EN_RANGO} GROUP BY dia ORDER BY dia`,
      rango,
    ),
    // Lo que un cliente devolvió y NO volvió al inventario (se tiró): también es producto perdido, aunque no se registre aquí.
    filas(
      pool,
      `SELECT COUNT(DISTINCT d.id_devolucion) AS devoluciones, COALESCE(SUM(l.cantidad), 0) AS unidades, COALESCE(SUM(l.importe), 0) AS valor
         FROM devolucion d JOIN devolucion_linea l ON l.id_devolucion = d.id_devolucion
        WHERE d.estado = 'aprobada' AND d.reponer_inventario = 0 AND d.resuelto_en >= ? AND d.resuelto_en < ? + INTERVAL 1 DAY`,
      rango,
    ),
    detalleMermas(pool, "m.registrado_en >= ? AND m.registrado_en < ? + INTERVAL 1 DAY", rango, MAX_MERMAS_DETALLE + 1),
  ]);

  const truncado = detalle.length > MAX_MERMAS_DETALLE;
  res.json({
    desde,
    hasta,
    resumen: { registros: Number(resumen[0]?.registros ?? 0), unidades: Number(resumen[0]?.unidades ?? 0), valor: dinero(resumen[0]?.valor) },
    por_producto: porProducto.map((r) => ({
      id_producto: Number(r.id_producto),
      producto: String(r.producto),
      presentacion: (r.presentacion as string | null) || null,
      categoria: String(r.categoria),
      registros: Number(r.registros),
      unidades: Number(r.unidades),
      valor: dinero(r.valor),
    })),
    por_motivo: porMotivo.map((r) => ({ motivo: r.motivo as MotivoMerma, registros: Number(r.registros), unidades: Number(r.unidades), valor: dinero(r.valor) })),
    por_dia: porDia.map((r) => ({ dia: String(r.dia), unidades: Number(r.unidades), valor: dinero(r.valor) })),
    devoluciones_sin_reponer: {
      devoluciones: Number(sinReponer[0]?.devoluciones ?? 0),
      unidades: Number(sinReponer[0]?.unidades ?? 0),
      valor: dinero(sinReponer[0]?.valor),
    },
    mermas: truncado ? detalle.slice(0, MAX_MERMAS_DETALLE) : detalle,
    mermas_truncadas: truncado,
  });
};
