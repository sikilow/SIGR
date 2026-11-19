// Reporte de reservaciones e inasistencias por periodo (solo gerente). Solo lectura: se arma con `reservacion`. Estados:
// pendiente / confirmada (todavía por llegar), llego (asistió), vencida (no llegó dentro de la tolerancia = inasistencia) y
// cancelada. Las fechas son las de la reservación (`fecha_hora`), no las de cuando se hizo.
import type { Request, Response } from "express";
import { z } from "zod";
import { validar } from "../models/dominio";
import { filas, pool } from "../services/db";
import { ErrorApi } from "../utils/errores";
import { diasEnRango, FechaISO, MAX_DIAS_REPORTE } from "./reporteVentas";

const FiltroReporte = z.object({ desde: FechaISO, hasta: FechaISO });
const n = (v: unknown): number => Number(v ?? 0);

const EN_RANGO = "r.fecha_hora >= ? AND r.fecha_hora < ? + INTERVAL 1 DAY";
/** Conteos por estado, comunes a todos los desgloses. */
const CONTEOS = `COUNT(*) AS total, SUM(r.estado = 'llego') AS llegaron, SUM(r.estado = 'vencida') AS vencidas, SUM(r.estado = 'cancelada') AS canceladas`;

const conteos = (f: Record<string, unknown>) => ({ total: n(f.total), llegaron: n(f.llegaron), vencidas: n(f.vencidas), canceladas: n(f.canceladas) });

/** GET /api/reservaciones/reporte?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (gerente). */
export const reporteReservaciones = async (req: Request, res: Response) => {
  const { desde, hasta } = validar(FiltroReporte, req.query);
  if (desde > hasta) throw new ErrorApi(422, "estado_invalido", "La fecha inicial no puede ser posterior a la final.");
  if (diasEnRango(desde, hasta) > MAX_DIAS_REPORTE) {
    throw new ErrorApi(422, "estado_invalido", "El periodo no puede ser mayor a dos años. Elige un rango más corto.");
  }
  const rango = [desde, hasta];

  const [resumen, porDia, porHora, porDiaSemana, porSeccion, reincidentes] = await Promise.all([
    filas(
      pool,
      `SELECT ${CONTEOS}, SUM(r.estado IN ('pendiente', 'confirmada')) AS por_llegar,
              COALESCE(SUM(r.personas), 0) AS personas, COALESCE(SUM(IF(r.estado = 'llego', r.personas, 0)), 0) AS personas_llegaron,
              COALESCE(SUM(IF(r.estado = 'vencida', r.personas, 0)), 0) AS personas_vencidas
         FROM reservacion r WHERE ${EN_RANGO}`,
      rango,
    ),
    filas(pool, `SELECT DATE_FORMAT(r.fecha_hora, '%Y-%m-%d') AS dia, ${CONTEOS} FROM reservacion r WHERE ${EN_RANGO} GROUP BY dia ORDER BY dia`, rango),
    filas(pool, `SELECT HOUR(r.fecha_hora) AS hora, ${CONTEOS} FROM reservacion r WHERE ${EN_RANGO} GROUP BY hora ORDER BY hora`, rango),
    // 0 = lunes ... 6 = domingo (igual que horario_reservacion_dia).
    filas(pool, `SELECT WEEKDAY(r.fecha_hora) AS dia_semana, ${CONTEOS} FROM reservacion r WHERE ${EN_RANGO} GROUP BY dia_semana ORDER BY dia_semana`, rango),
    // La sección que pidió el cliente; sin preferencia = «Cualquiera».
    filas(pool, `SELECT COALESCE(r.pref_zona, 'Cualquiera') AS seccion, ${CONTEOS} FROM reservacion r WHERE ${EN_RANGO} GROUP BY seccion ORDER BY total DESC, seccion`, rango),
    // Clientes con 2 o más inasistencias en el periodo: para llamarles o pedir confirmación antes de apartarles mesa.
    filas(
      pool,
      `SELECT c.id_cliente, c.nombre, c.lada, c.telefono, COUNT(*) AS total, SUM(r.estado = 'vencida') AS vencidas
         FROM reservacion r JOIN cliente c ON c.id_cliente = r.id_cliente
        WHERE ${EN_RANGO}
        GROUP BY c.id_cliente, c.nombre, c.lada, c.telefono
       HAVING vencidas >= 2
        ORDER BY vencidas DESC, total DESC, c.nombre
        LIMIT 10`,
      rango,
    ),
  ]);

  const r: Record<string, unknown> = resumen[0] ?? {};
  res.json({
    desde,
    hasta,
    resumen: {
      ...conteos(r),
      por_llegar: n(r.por_llegar),
      personas: n(r.personas),
      personas_llegaron: n(r.personas_llegaron),
      personas_vencidas: n(r.personas_vencidas),
    },
    por_dia: porDia.map((f) => ({ dia: String(f.dia), ...conteos(f) })),
    por_hora: porHora.map((f) => ({ hora: n(f.hora), ...conteos(f) })),
    por_dia_semana: porDiaSemana.map((f) => ({ dia_semana: n(f.dia_semana), ...conteos(f) })),
    por_seccion: porSeccion.map((f) => ({ seccion: String(f.seccion), ...conteos(f) })),
    clientes_con_inasistencias: reincidentes.map((f) => ({
      id_cliente: n(f.id_cliente),
      nombre: String(f.nombre),
      telefono: f.telefono ? `+${String(f.lada ?? "52")} ${String(f.telefono)}` : null,
      reservaciones: n(f.total),
      inasistencias: n(f.vencidas),
    })),
  });
};
