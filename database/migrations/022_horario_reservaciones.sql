-- ============================================
-- SIGR - MIGRACION 022
-- HORARIO DE RESERVACIONES (lo configura Gerencia en Gerente → Reservas)
--   * configuracion_reservacion.hora_apertura: primera hora que se puede reservar (predeterminado 13:00).
--   * configuracion_reservacion.hora_ultima_reservacion: última hora que se puede reservar (predeterminado 21:00).
--   * configuracion_reservacion.intervalo_minutos: cada cuánto se ofrecen horas en el portal (15, 30 o 60; predeterminado 30).
--   * configuracion_reservacion.dias_abiertos: siete caracteres '1'/'0' de lunes a domingo (predeterminado '1111111').
-- dias_abiertos no lleva CHECK con texto (cambiaría según la codificación de la consola); la API valida que sean siete
-- caracteres 0/1 con al menos un día abierto.
-- El portal de clientes arma sus horas con estos datos; la API rechaza reservaciones fuera de horario o en días cerrados.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'configuracion_reservacion' AND column_name = 'hora_apertura') = 0,
  'ALTER TABLE configuracion_reservacion
     ADD COLUMN hora_apertura TIME NOT NULL DEFAULT ''13:00:00'' AFTER anticipacion_minutos,
     ADD COLUMN hora_ultima_reservacion TIME NOT NULL DEFAULT ''21:00:00'' AFTER hora_apertura,
     ADD COLUMN intervalo_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER hora_ultima_reservacion,
     ADD COLUMN dias_abiertos CHAR(7) NOT NULL DEFAULT ''1111111'' AFTER intervalo_minutos,
     ADD CONSTRAINT chk_config_res_horario CHECK (hora_apertura <= hora_ultima_reservacion),
     ADD CONSTRAINT chk_config_res_intervalo CHECK (intervalo_minutos IN (15, 30, 60))',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SELECT hora_apertura, hora_ultima_reservacion, intervalo_minutos, dias_abiertos FROM configuracion_reservacion;
