import { consumirErrorEnvioCorreo, enviarCorreo } from "./correo";
import { ejecutar, filas, pool, transaccion } from "./db";
import {
  plantillaCancelacion,
  plantillaConfirmacion,
  plantillaRecordatorio,
  plantillaVencida,
  type CorreoReservacion,
  type DatosReservacion,
} from "./plantillasCorreo";
import type { RowDataPacket } from "mysql2/promise";

const INTERVALO_PROCESAMIENTO_MS = 30_000;
const LIMITE_NOTIFICACIONES = 20;
const ESPERA_CUOTA_GMAIL_SEGUNDOS = 6 * 60 * 60;

interface AvisoReservacion extends RowDataPacket {
  id_notificacion: number;
  tipo: "recordatorio" | "vencida" | "confirmacion" | "cancelacion";
  evento: "creada" | "confirmada" | "";
  destinatario: string;
  fecha_hora: string;
  personas: number;
  nombre: string;
  mesa_numero: number | null;
  tolerancia_minutos: number;
}

async function programarRecordatorios(): Promise<void> {
  await ejecutar(
    pool,
    `INSERT INTO notificacion_reservacion (id_reservacion, tipo, destinatario)
     SELECT r.id_reservacion, 'recordatorio', c.correo
       FROM reservacion r
       JOIN cliente c ON c.id_cliente = r.id_cliente
       JOIN configuracion_reservacion cr ON cr.id = 1
      WHERE r.estado IN ('pendiente', 'confirmada')
        AND c.correo IS NOT NULL AND TRIM(c.correo) <> ''
        AND r.fecha_hora > NOW()
        AND r.fecha_hora <= DATE_ADD(NOW(), INTERVAL cr.recordatorio_minutos MINUTE)
     ON DUPLICATE KEY UPDATE id_notificacion = id_notificacion`,
  );
}

async function vencerReservaciones(): Promise<void> {
  const candidatas = await filas(
    pool,
    `SELECT r.id_reservacion
       FROM reservacion r
       JOIN configuracion_reservacion cr ON cr.id = 1
      WHERE r.estado IN ('pendiente', 'confirmada')
        AND DATE_ADD(r.fecha_hora, INTERVAL cr.tolerancia_minutos MINUTE) <= NOW()
      ORDER BY r.fecha_hora
      LIMIT ?`,
    [LIMITE_NOTIFICACIONES],
  );

  for (const candidata of candidatas) {
    await transaccion(async (cx) => {
      const [r] = await filas(
        cx,
        `SELECT r.id_reservacion, r.id_mesa, r.fecha_hora, r.personas, c.correo
           FROM reservacion r
           JOIN cliente c ON c.id_cliente = r.id_cliente
           JOIN configuracion_reservacion cr ON cr.id = 1
          WHERE r.id_reservacion = ?
            AND r.estado IN ('pendiente', 'confirmada')
            AND DATE_ADD(r.fecha_hora, INTERVAL cr.tolerancia_minutos MINUTE) <= NOW()
          FOR UPDATE`,
        [candidata.id_reservacion],
      );
      if (!r) return;

      const mesaId = r.id_mesa == null ? null : Number(r.id_mesa);
      await ejecutar(cx, "UPDATE reservacion SET estado = 'vencida', id_mesa = NULL WHERE id_reservacion = ?", [r.id_reservacion]);
      if (mesaId !== null) {
        await ejecutar(
          cx,
          `UPDATE mesa
              SET estado = 'libre'
            WHERE id_mesa = ? AND estado = 'reservada'
              AND NOT EXISTS (
                SELECT 1 FROM reservacion
                 WHERE id_mesa = ? AND id_reservacion <> ?
                   AND estado IN ('pendiente', 'confirmada')
              )`,
          [mesaId, mesaId, r.id_reservacion],
        );
      }
      if (typeof r.correo === "string" && r.correo.trim() !== "") {
        await ejecutar(
          cx,
          `INSERT INTO notificacion_reservacion (id_reservacion, tipo, destinatario)
           VALUES (?, 'vencida', ?)
           ON DUPLICATE KEY UPDATE id_notificacion = id_notificacion`,
          [r.id_reservacion, r.correo],
        );
      } else {
        console.error(`Reservación ${r.id_reservacion} vencida sin correo de cliente; no se pudo notificar.`);
      }
    });
  }
}

async function procesarNotificaciones(): Promise<void> {
  const pendientes = await filas<AvisoReservacion>(
    pool,
    `SELECT n.id_notificacion, n.tipo, n.evento, n.destinatario, r.fecha_hora, r.personas,
            c.nombre, m.numero AS mesa_numero, COALESCE(cr.tolerancia_minutos, 15) AS tolerancia_minutos
       FROM notificacion_reservacion n
       JOIN reservacion r ON r.id_reservacion = n.id_reservacion
       JOIN cliente c ON c.id_cliente = r.id_cliente
       LEFT JOIN mesa m ON m.id_mesa = r.id_mesa
       LEFT JOIN configuracion_reservacion cr ON cr.id = 1
      WHERE n.estado = 'pendiente' AND n.creada_en <= NOW()
      ORDER BY n.creada_en, n.id_notificacion
      LIMIT ?`,
    [LIMITE_NOTIFICACIONES],
  );
  for (const aviso of pendientes) {
    const id = Number(aviso.id_notificacion);
    const idempotencyKey = `notificacion-reservacion/${id}`;
    const datos: DatosReservacion = {
      nombre: String(aviso.nombre),
      fechaHora: String(aviso.fecha_hora),
      personas: Number(aviso.personas),
      mesaNumero: aviso.mesa_numero == null ? null : Number(aviso.mesa_numero),
      toleranciaMinutos: Number(aviso.tolerancia_minutos),
    };

    let correo: CorreoReservacion;
    if (aviso.tipo === "confirmacion") {
      correo = plantillaConfirmacion({
        ...datos,
        evento: aviso.evento === "confirmada" ? "confirmada" : "creada",
      });
    } else if (aviso.tipo === "vencida") {
      correo = plantillaVencida(datos);
    } else if (aviso.tipo === "cancelacion") {
      correo = plantillaCancelacion(datos);
    } else {
      correo = plantillaRecordatorio(datos);
    }

    try {
      const enviada = await enviarCorreo({
        para: String(aviso.destinatario),
        asunto: correo.asunto,
        texto: correo.texto,
        html: correo.html,
        idempotencyKey,
      });
      if (!enviada) {
        throw new Error(consumirErrorEnvioCorreo(idempotencyKey) ?? "El servicio de correo no aceptó el mensaje.");
      }
      await ejecutar(
        pool,
        "UPDATE notificacion_reservacion SET estado = 'enviada', enviada_en = NOW(), ultimo_error = NULL WHERE id_notificacion = ?",
        [id],
      );
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      console.error(`No se pudo enviar la notificación ${id}: ${mensaje}`);
      await registrarFallo(id, mensaje);
    }
  }
}

async function registrarFallo(id: number, mensaje: string): Promise<void> {
  const esperaLarga = /550\s+5\.4\.5/i.test(mensaje);
  await ejecutar(
    pool,
    `UPDATE notificacion_reservacion
        SET intentos = intentos + 1,
            ultimo_error = LEFT(?, 500),
            creada_en = DATE_ADD(
              NOW(),
              INTERVAL IF(
                ? = 1,
                ${ESPERA_CUOTA_GMAIL_SEGUNDOS},
                LEAST(POWER(2, LEAST(intentos, 7)) * 30, 3600)
              ) SECOND
            )
      WHERE id_notificacion = ? AND estado = 'pendiente'`,
    [mensaje.slice(0, 500), esperaLarga ? 1 : 0, id],
  );
}

let procesando = false;

async function ejecutarCicloReservaciones(): Promise<void> {
  if (procesando) return;
  procesando = true;
  try {
    await programarRecordatorios();
    await vencerReservaciones();
    await procesarNotificaciones();
  } catch (error) {
    console.error("Falló el ciclo de vencimientos y notificaciones de reservaciones:", error);
  } finally {
    procesando = false;
  }
}

export function solicitarProcesamientoReservaciones(): void {
  void ejecutarCicloReservaciones();
}

export function iniciarProcesadorReservaciones(): void {
  void ejecutarCicloReservaciones();
  setInterval(() => void ejecutarCicloReservaciones(), INTERVALO_PROCESAMIENTO_MS);
}

export const __pruebas = {
  programarRecordatorios,
  vencerReservaciones,
  procesarNotificaciones,
  registrarFallo,
};
