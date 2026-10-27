-- MIGRACIÓN 011: una cola para confirmaciones, recordatorios y vencimientos.
-- Ejecutar una sola vez después de la migración 010, sobre la base de desarrollo seleccionada.
-- Antes de ejecutarla, obtener el nombre real del CHECK de tipo:
--   SHOW CREATE TABLE notificacion_reservacion;
-- El bloque siguiente localiza la restricción por su expresión para no asumir el nombre autogenerado.
-- No se insertan avisos para reservaciones anteriores: las confirmaciones solo se encolan al crear
-- una reservación nueva o al confirmar una pendiente después de aplicar esta migración.

SET @check_tipo_anterior = (
  SELECT tc.CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS AS tc
    JOIN information_schema.CHECK_CONSTRAINTS AS cc
      ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
     AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
   WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
     AND tc.TABLE_NAME = 'notificacion_reservacion'
     AND tc.CONSTRAINT_TYPE = 'CHECK'
     AND cc.CHECK_CLAUSE LIKE '%recordatorio%'
     AND cc.CHECK_CLAUSE LIKE '%vencida%'
     AND cc.CHECK_CLAUSE NOT LIKE '%confirmacion%'
   LIMIT 1
);

SET @sql_drop_check_tipo = IF(
  @check_tipo_anterior IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE notificacion_reservacion DROP CHECK `',
    REPLACE(@check_tipo_anterior, '`', '``'),
    '`'
  )
);
PREPARE stmt_drop_check_tipo FROM @sql_drop_check_tipo;
EXECUTE stmt_drop_check_tipo;
DEALLOCATE PREPARE stmt_drop_check_tipo;

ALTER TABLE notificacion_reservacion
  DROP INDEX uq_notificacion_reservacion_tipo,
  ADD COLUMN evento VARCHAR(20) NOT NULL DEFAULT '' AFTER tipo,
  ADD CONSTRAINT chk_notificacion_tipo
    CHECK (tipo IN ('recordatorio', 'vencida', 'confirmacion')),
  ADD CONSTRAINT chk_notificacion_evento
    CHECK (
      (tipo = 'confirmacion' AND evento IN ('creada', 'confirmada'))
      OR (tipo IN ('recordatorio', 'vencida') AND evento = '')
    ),
  ADD UNIQUE KEY uq_notificacion_reservacion_evento (id_reservacion, tipo, evento);

SHOW CREATE TABLE notificacion_reservacion;
SHOW INDEX FROM notificacion_reservacion;
