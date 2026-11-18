import { filas, type Ejecutor } from "./db";
import { ErrorApi } from "../utils/errores";
import { describirMinutos } from "../models/dominio";

/**
 * Cuánto tiempo ocupa una reservación su mesa si no hay configuración: con 90, una mesa que se reserva a las 14:00 no
 * puede darse a otro grupo confirmado entre las 12:30 y las 15:30. Gerencia lo cambia en Gerente → Reservas
 * (configuracion_reservacion.duracion_reservacion_minutos, migración 023).
 */
export const DURACION_RESERVACION_MINUTOS = 90;

/** Duración configurada por Gerencia (30 a 360 minutos); sin fila, la predeterminada. */
export async function cargarDuracionReservacion(ex: Ejecutor): Promise<number> {
  const [fila] = await filas(ex, "SELECT duracion_reservacion_minutos FROM configuracion_reservacion WHERE id = 1");
  const minutos = Number(fila?.duracion_reservacion_minutos);
  return Number.isInteger(minutos) && minutos > 0 ? minutos : DURACION_RESERVACION_MINUTOS;
}

export interface MesaConCapacidad {
  id_mesa: number;
  capacidad: number;
}

/** Reservación ya comprometida (confirmada o con llegada) que puede estorbar a otra. */
export interface ReservacionComprometida {
  id_mesa: number | null;
  personas: number;
  /** Diferencia en minutos con la hora de la reservación que se quiere confirmar (positiva o negativa). */
  distanciaMinutos: number;
}

/**
 * ¿Queda al menos una mesa con capacidad suficiente para `personas`, descontando las reservaciones comprometidas que se
 * traslapan con esa hora? Las que ya tienen mesa ocupan esa mesa; las demás se acomodan en la mesa más chica que les
 * alcance (de las más grandes a las más chicas), igual que haría la hostess.
 */
export function hayMesaParaReservacion(
  mesas: MesaConCapacidad[],
  comprometidas: ReservacionComprometida[],
  personas: number,
  duracionMinutos: number = DURACION_RESERVACION_MINUTOS,
): boolean {
  const libres = [...mesas].sort((a, b) => a.capacidad - b.capacidad);
  const traslapadas = comprometidas.filter((r) => Math.abs(r.distanciaMinutos) < duracionMinutos);

  for (const r of traslapadas) {
    if (r.id_mesa === null) continue;
    const i = libres.findIndex((m) => m.id_mesa === r.id_mesa);
    if (i >= 0) libres.splice(i, 1);
  }
  for (const r of traslapadas.filter((x) => x.id_mesa === null).sort((a, b) => b.personas - a.personas)) {
    const i = libres.findIndex((m) => m.capacidad >= r.personas);
    if (i >= 0) libres.splice(i, 1);
  }
  return libres.some((m) => m.capacidad >= personas);
}

/**
 * Comprueba que haya una mesa para la reservación (hostess al registrarla o confirmarla, y portal de clientes).
 * Solo cuentan las mesas del salón disponibles (no las virtuales de «Para llevar») y las reservaciones confirmadas
 * o con llegada: las solicitudes pendientes todavía no comprometen mesa.
 */
export async function exigirMesaDisponible(
  cx: Ejecutor,
  reservacion: { idReservacion?: number; fechaHora: string; personas: number },
): Promise<void> {
  const duracion = await cargarDuracionReservacion(cx);
  // Si la reservación empieza dentro de la duración desde ahora, las mesas ocupadas en este momento (por ejemplo, por
  // clientes que llegaron sin reservación) todavía no estarán libres: no cuentan.
  const mesas = await filas(
    cx,
    `SELECT m.id_mesa, m.capacidad,
            (m.estado = 'ocupada' AND ABS(TIMESTAMPDIFF(MINUTE, NOW(), ?)) < ?) AS ocupada_a_esa_hora
       FROM mesa m JOIN seccion s ON s.nombre = m.zona
      WHERE m.activa = TRUE AND s.activa = TRUE AND s.es_para_llevar = FALSE`,
    [reservacion.fechaHora, duracion],
  );
  const grandes = mesas.filter((m) => Number(m.capacidad) >= reservacion.personas);
  if (grandes.length === 0) {
    throw new ErrorApi(
      409,
      "mesa_no_disponible",
      `No tenemos mesas para ${reservacion.personas} ${reservacion.personas === 1 ? "persona" : "personas"}.`,
    );
  }

  const otras = await filas(
    cx,
    `SELECT r.id_mesa, r.personas,
            TIMESTAMPDIFF(MINUTE, ?, r.fecha_hora) AS distancia_minutos
       FROM reservacion r
      WHERE r.estado IN ('confirmada', 'llego')
        AND r.id_reservacion <> ?
        AND r.fecha_hora > DATE_SUB(?, INTERVAL ? MINUTE)
        AND r.fecha_hora < DATE_ADD(?, INTERVAL ? MINUTE)`,
    [
      reservacion.fechaHora,
      reservacion.idReservacion ?? 0,
      reservacion.fechaHora,
      duracion,
      reservacion.fechaHora,
      duracion,
    ],
  );

  const hay = hayMesaParaReservacion(
    mesas
      .filter((m) => Number(m.ocupada_a_esa_hora) !== 1)
      .map((m) => ({ id_mesa: Number(m.id_mesa), capacidad: Number(m.capacidad) })),
    otras.map((r) => ({
      id_mesa: r.id_mesa == null ? null : Number(r.id_mesa),
      personas: Number(r.personas),
      distanciaMinutos: Number(r.distancia_minutos),
    })),
    reservacion.personas,
    duracion,
  );
  if (!hay) {
    throw new ErrorApi(
      409,
      "mesa_no_disponible",
      `No hay mesa disponible para ${reservacion.personas} ${reservacion.personas === 1 ? "persona" : "personas"} a esa hora ` +
        `(cada reservación ocupa su mesa ${describirMinutos(duracion)}). Elige otro horario.`,
    );
  }
}
