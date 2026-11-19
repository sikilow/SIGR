-- ============================================
-- SIGR - MIGRACION 030
-- HORARIO DE RESERVACIONES POR DIA (Gerente → Reservaciones).
--   * Nueva tabla `horario_reservacion_dia`: siete filas (dia 0 = lunes ... 6 = domingo) con si ese dia se reciben reservaciones y la
--     primera y la ultima hora para reservar de ESE dia. Asi un dia puede abrir mas temprano o cerrar mas tarde.
--   * El intervalo de horas (15, 30 o 60 minutos) sigue siendo uno solo para todo el restaurante
--     (`configuracion_reservacion.intervalo_minutos`).
--   * Los datos actuales se copian: cada dia recibe la hora de apertura y la ultima hora que ya estaban configuradas, y
--     abre o cierra segun `dias_abiertos`.
--   * Despues se QUITAN de `configuracion_reservacion` las columnas `hora_apertura`, `hora_ultima_reservacion` y
--     `dias_abiertos` (y su CHECK), para que haya una sola fuente de verdad. HACER RESPALDO ANTES.
--   * La auditoria registra los cambios de la tabla nueva.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 030_horario_reservaciones_por_dia.sql
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS horario_reservacion_dia (
  dia TINYINT UNSIGNED PRIMARY KEY,
  abierto BOOLEAN NOT NULL DEFAULT TRUE,
  hora_apertura TIME NOT NULL DEFAULT '13:00:00',
  hora_ultima_reservacion TIME NOT NULL DEFAULT '21:00:00',
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_horario_dia_dia CHECK (dia BETWEEN 0 AND 6),
  CONSTRAINT chk_horario_dia_horas CHECK (hora_apertura <= hora_ultima_reservacion)
) ENGINE=InnoDB;

-- 1) Copiar el horario general que ya existia (solo si las columnas viejas todavia estan y la tabla esta vacia).
SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'configuracion_reservacion' AND column_name = 'dias_abiertos') = 1
  AND (SELECT COUNT(*) FROM horario_reservacion_dia) = 0,
  'INSERT INTO horario_reservacion_dia (dia, abierto, hora_apertura, hora_ultima_reservacion)
     SELECT n.dia, SUBSTRING(c.dias_abiertos, n.dia + 1, 1) = ''1'', c.hora_apertura, c.hora_ultima_reservacion
       FROM configuracion_reservacion c
       JOIN (SELECT 0 AS dia UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) n
      WHERE c.id = 1',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- 2) Los dias que falten (base sin la configuracion vieja) toman el horario predeterminado: 13:00 a 21:00, abierto.
INSERT IGNORE INTO horario_reservacion_dia (dia) VALUES (0), (1), (2), (3), (4), (5), (6);

-- 3) Quitar las columnas viejas.
SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'configuracion_reservacion' AND column_name = 'dias_abiertos') = 1,
  'ALTER TABLE configuracion_reservacion
     DROP CHECK chk_config_res_horario,
     DROP COLUMN hora_apertura,
     DROP COLUMN hora_ultima_reservacion,
     DROP COLUMN dias_abiertos',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Auditoria.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_horario_reservacion_dia_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_horario_reservacion_dia_au`$$
DROP TRIGGER IF EXISTS `trg_aud_horario_reservacion_dia_ad`$$
CREATE TRIGGER `trg_aud_horario_reservacion_dia_ai` AFTER INSERT ON `horario_reservacion_dia` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'horario_reservacion_dia', 'INSERT', JSON_OBJECT('dia', NEW.`dia`), JSON_OBJECT('dia', NEW.`dia`, 'abierto', NEW.`abierto`, 'hora_apertura', NEW.`hora_apertura`, 'hora_ultima_reservacion', NEW.`hora_ultima_reservacion`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_horario_reservacion_dia_au` AFTER UPDATE ON `horario_reservacion_dia` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'horario_reservacion_dia', 'UPDATE', JSON_OBJECT('dia', NEW.`dia`), JSON_OBJECT('dia', OLD.`dia`, 'abierto', OLD.`abierto`, 'hora_apertura', OLD.`hora_apertura`, 'hora_ultima_reservacion', OLD.`hora_ultima_reservacion`, 'actualizado_en', OLD.`actualizado_en`), JSON_OBJECT('dia', NEW.`dia`, 'abierto', NEW.`abierto`, 'hora_apertura', NEW.`hora_apertura`, 'hora_ultima_reservacion', NEW.`hora_ultima_reservacion`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_horario_reservacion_dia_ad` AFTER DELETE ON `horario_reservacion_dia` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'horario_reservacion_dia', 'DELETE', JSON_OBJECT('dia', OLD.`dia`), JSON_OBJECT('dia', OLD.`dia`, 'abierto', OLD.`abierto`, 'hora_apertura', OLD.`hora_apertura`, 'hora_ultima_reservacion', OLD.`hora_ultima_reservacion`, 'actualizado_en', OLD.`actualizado_en`), USER());
END$$
DELIMITER ;

SELECT dia, abierto, hora_apertura, hora_ultima_reservacion FROM horario_reservacion_dia ORDER BY dia;
