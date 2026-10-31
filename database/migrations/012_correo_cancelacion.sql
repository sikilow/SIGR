-- MIGRACIÓN 012: correo de cancelación de reservaciones.
-- Ejecutar una sola vez después de la migración 011, sobre la base de desarrollo seleccionada.
-- Agrega el tipo 'cancelacion' a la cola de notificaciones. El aviso se encola al cancelar una
-- reservación pendiente o confirmada desde la pantalla de hostess.
-- Si tu base tiene otros nombres para los CHECK, verifícalos antes con:
--   SHOW CREATE TABLE notificacion_reservacion;

ALTER TABLE notificacion_reservacion
  DROP CHECK chk_notificacion_tipo,
  DROP CHECK chk_notificacion_evento;

ALTER TABLE notificacion_reservacion
  ADD CONSTRAINT chk_notificacion_tipo
    CHECK (tipo IN ('recordatorio', 'vencida', 'confirmacion', 'cancelacion')),
  ADD CONSTRAINT chk_notificacion_evento
    CHECK (
      (tipo = 'confirmacion' AND evento IN ('creada', 'confirmada'))
      OR (tipo IN ('recordatorio', 'vencida', 'cancelacion') AND evento = '')
    );

SHOW CREATE TABLE notificacion_reservacion;
