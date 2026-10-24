import { ejecutar, filas, pool, transaccion } from "./db";

const INTERVALO_PROCESAMIENTO_MS = 30_000;
const LIMITE_NOTIFICACIONES = 20;
const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export async function enviarCorreoResend(correo: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("Resend no está configurado; define RESEND_API_KEY y RESEND_FROM en backend/.env.");
  }

  const respuesta = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, ...correo }),
  });
  if (!respuesta.ok) {
    const detalle = (await respuesta.text()).slice(0, 500);
    throw new Error(`Resend rechazó el correo (HTTP ${respuesta.status}): ${detalle}`);
  }
}

async function programarRecordatorios(): Promise<void> {
  await ejecutar(
    pool,
    `INSERT IGNORE INTO notificacion_reservacion (id_reservacion, tipo, destinatario)
     SELECT r.id_reservacion, 'recordatorio', c.correo
       FROM reservacion r
       JOIN cliente c ON c.id_cliente = r.id_cliente
       JOIN configuracion_reservacion cr ON cr.id = 1
      WHERE r.estado IN ('pendiente', 'confirmada')
        AND c.correo IS NOT NULL AND c.correo <> ''
        AND r.fecha_hora > NOW()
        AND r.fecha_hora <= DATE_ADD(NOW(), INTERVAL cr.recordatorio_minutos MINUTE)`,
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
          `INSERT IGNORE INTO notificacion_reservacion (id_reservacion, tipo, destinatario)
           VALUES (?, 'vencida', ?)`,
          [r.id_reservacion, r.correo],
        );
      } else {
        console.error(`Reservación ${r.id_reservacion} vencida sin correo de cliente; no se pudo notificar.`);
      }
    });
  }
}

async function procesarNotificaciones(): Promise<void> {
  const pendientes = await filas(
    pool,
    `SELECT n.id_notificacion, n.tipo, n.destinatario, r.fecha_hora, r.personas, c.nombre
       FROM notificacion_reservacion n
       JOIN reservacion r ON r.id_reservacion = n.id_reservacion
       JOIN cliente c ON c.id_cliente = r.id_cliente
      WHERE n.estado = 'pendiente' AND n.creada_en <= NOW()
      ORDER BY n.creada_en, n.id_notificacion
      LIMIT ?`,
    [LIMITE_NOTIFICACIONES],
  );
  if (pendientes.length === 0) return;
  for (const aviso of pendientes) {
    const fecha = new Date(String(aviso.fecha_hora)).toLocaleString("es-MX");
    const vencida = aviso.tipo === "vencida";
    try {
      await enviarCorreoResend({
        to: String(aviso.destinatario),
        subject: vencida ? "Tu reservación venció" : "Recordatorio de tu reservación",
        text: vencida
          ? `Hola ${aviso.nombre}, tu reservación del ${fecha} para ${aviso.personas} persona(s) venció porque no registramos tu llegada dentro del tiempo de tolerancia. La mesa quedó liberada. Si aún deseas visitarnos, comunícate con el restaurante para consultar disponibilidad.`
          : `Hola ${aviso.nombre}, te recordamos tu reservación para el ${fecha}, para ${aviso.personas} persona(s). ¡Te esperamos!`,
      });
      await ejecutar(pool, "UPDATE notificacion_reservacion SET estado = 'enviada', enviada_en = NOW(), ultimo_error = NULL WHERE id_notificacion = ?", [aviso.id_notificacion]);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      console.error(`No se pudo enviar la notificación ${aviso.id_notificacion}: ${mensaje}`);
      await registrarFallo(Number(aviso.id_notificacion), mensaje);
    }
  }
}

async function registrarFallo(id: number, mensaje: string): Promise<void> {
  await ejecutar(
    pool,
    `UPDATE notificacion_reservacion
        SET intentos = intentos + 1,
            ultimo_error = LEFT(?, 500),
            creada_en = DATE_ADD(NOW(), INTERVAL LEAST(POWER(2, LEAST(intentos, 7)) * 30, 3600) SECOND)
      WHERE id_notificacion = ? AND estado = 'pendiente'`,
    [mensaje, id],
  );
}

export function iniciarProcesadorReservaciones(): void {
  let procesando = false;
  const ejecutarCiclo = async () => {
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
  };
  void ejecutarCiclo();
  setInterval(() => void ejecutarCiclo(), INTERVALO_PROCESAMIENTO_MS);
}
