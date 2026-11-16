-- ============================================
-- SIGR - MIGRACION 018
-- 1) TELEFONO DE USUARIOS: solo digitos y unico (la API exige 10 digitos).
-- 2) ANTICIPACION MINIMA PARA RESERVAR: la configura Gerencia (configuracion_reservacion.anticipacion_minutos).
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- ============================================

USE SIGR;

-- 1) Telefono de usuarios -------------------------------------------------------------------------------------------
-- Los telefonos guardados antes pueden traer espacios o guiones («311 116 5727»): se dejan solo con digitos.
UPDATE perfil_usuario
   SET telefono = NULLIF(REGEXP_REPLACE(telefono, '[^0-9]', ''), '')
 WHERE telefono IS NOT NULL
   AND telefono <> NULLIF(REGEXP_REPLACE(telefono, '[^0-9]', ''), '');

-- Indice unico: dos usuarios no pueden compartir telefono (varios NULL si estan permitidos).
-- Si falla con «Duplicate entry», dos usuarios tienen el mismo telefono: corrige uno y vuelve a ejecutar este archivo.
SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'perfil_usuario' AND index_name = 'uq_perfil_usuario_telefono') = 0,
  'ALTER TABLE perfil_usuario ADD CONSTRAINT uq_perfil_usuario_telefono UNIQUE (telefono)',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- 2) Anticipacion minima de reservacion -----------------------------------------------------------------------------
-- Minutos que deben faltar, como minimo, para la hora reservada. 0 = sin minimo. Por defecto 60 (1 hora).
SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'configuracion_reservacion' AND column_name = 'anticipacion_minutos') = 0,
  'ALTER TABLE configuracion_reservacion
     ADD COLUMN anticipacion_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 60 AFTER recordatorio_minutos,
     ADD CONSTRAINT chk_config_res_anticipacion CHECK (anticipacion_minutos BETWEEN 0 AND 1440)',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Auditoria (013): los triggers de configuracion_reservacion tambien registran la columna nueva.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_reservacion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_reservacion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_reservacion_ad`$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_ai` AFTER INSERT ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'INSERT', JSON_OBJECT('id', NEW.`id`), JSON_OBJECT('id', NEW.`id`, 'tolerancia_minutos', NEW.`tolerancia_minutos`, 'recordatorio_minutos', NEW.`recordatorio_minutos`, 'anticipacion_minutos', NEW.`anticipacion_minutos`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_au` AFTER UPDATE ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'UPDATE', JSON_OBJECT('id', NEW.`id`), JSON_OBJECT('id', OLD.`id`, 'tolerancia_minutos', OLD.`tolerancia_minutos`, 'recordatorio_minutos', OLD.`recordatorio_minutos`, 'anticipacion_minutos', OLD.`anticipacion_minutos`, 'actualizado_en', OLD.`actualizado_en`), JSON_OBJECT('id', NEW.`id`, 'tolerancia_minutos', NEW.`tolerancia_minutos`, 'recordatorio_minutos', NEW.`recordatorio_minutos`, 'anticipacion_minutos', NEW.`anticipacion_minutos`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_ad` AFTER DELETE ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'DELETE', JSON_OBJECT('id', OLD.`id`), JSON_OBJECT('id', OLD.`id`, 'tolerancia_minutos', OLD.`tolerancia_minutos`, 'recordatorio_minutos', OLD.`recordatorio_minutos`, 'anticipacion_minutos', OLD.`anticipacion_minutos`, 'actualizado_en', OLD.`actualizado_en`), USER());
END$$
DELIMITER ;
