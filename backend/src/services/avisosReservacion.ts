import { esCorreoValido } from "./correo";
import { ejecutar, type Ejecutor } from "./db";

/**
 * Avisos que se encolan en el momento de una acción (los recordatorios y los vencimientos los agrega
 * el procesador de notificacionesReservacion.ts según la hora).
 */
export type AvisoInmediato =
  | { tipo: "confirmacion"; evento: "creada" | "confirmada" }
  | { tipo: "cancelacion"; evento: "" };

/**
 * Encola un correo de reservación dentro de la misma transacción que la acción: si la transacción se deshace,
 * el aviso tampoco queda. Sin un correo válido del cliente no se encola nada. Un mismo evento no se repite
 * (llave única id_reservacion + tipo + evento). Después del commit, llama a solicitarProcesamientoReservaciones().
 */
export async function encolarAvisoReservacion(
  cx: Ejecutor,
  idReservacion: number,
  correoCliente: unknown,
  aviso: AvisoInmediato,
): Promise<void> {
  if (typeof correoCliente !== "string" || !esCorreoValido(correoCliente)) return;
  // `tipo` sale de una unión cerrada (no de la petición), por eso puede ir literal en el SQL.
  await ejecutar(
    cx,
    `INSERT INTO notificacion_reservacion (id_reservacion, tipo, evento, destinatario)
     SELECT r.id_reservacion, '${aviso.tipo}', ?, c.correo
       FROM reservacion r
       JOIN cliente c ON c.id_cliente = r.id_cliente
      WHERE r.id_reservacion = ?
        AND c.correo IS NOT NULL
        AND TRIM(c.correo) <> ''
     ON CONFLICT (id_reservacion, tipo, evento) DO NOTHING`,
    [aviso.evento, idReservacion],
  );
}
