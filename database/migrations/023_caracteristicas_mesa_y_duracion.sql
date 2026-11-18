-- ============================================
-- SIGR - MIGRACION 023
-- CARACTERÍSTICAS DE MESA ADMINISTRADAS POR GERENCIA Y DURACIÓN DE LA RESERVACIÓN
--   * caracteristica_mesa: catálogo que Gerencia administra (Gerente → Mesas → Características): «Planta baja»,
--     «Junto a la ventana», «Terraza techada»… Se puede crear, renombrar, activar/desactivar y borrar (si no se usa).
--   * mesa_caracteristica: qué características tiene cada mesa.
--   * reservacion_caracteristica: qué características pidió el cliente (portal o hostess).
--   * Las columnas fijas mesa.planta_baja/espacio_carriola/sin_escaleras y reservacion.pref_planta_baja/pref_carriola/
--     pref_sin_escaleras se pasan al catálogo y se eliminan. reservacion.pref_zona (sección) se queda.
--   * configuracion_reservacion.duracion_reservacion_minutos: cuánto ocupa una reservación su mesa al calcular la
--     disponibilidad (antes fijo en 90; de 30 a 360).
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS caracteristica_mesa (
  id_caracteristica INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_caracteristica_mesa_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mesa_caracteristica (
  id_mesa INT NOT NULL,
  id_caracteristica INT NOT NULL,
  PRIMARY KEY (id_mesa, id_caracteristica),
  CONSTRAINT fk_mesa_caracteristica_mesa FOREIGN KEY (id_mesa) REFERENCES mesa (id_mesa) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_mesa_caracteristica_caracteristica FOREIGN KEY (id_caracteristica) REFERENCES caracteristica_mesa (id_caracteristica) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservacion_caracteristica (
  id_reservacion INT NOT NULL,
  id_caracteristica INT NOT NULL,
  PRIMARY KEY (id_reservacion, id_caracteristica),
  CONSTRAINT fk_reservacion_caracteristica_reservacion FOREIGN KEY (id_reservacion) REFERENCES reservacion (id_reservacion) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_reservacion_caracteristica_caracteristica FOREIGN KEY (id_caracteristica) REFERENCES caracteristica_mesa (id_caracteristica) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- Las tres características que antes eran columnas fijas.
INSERT IGNORE INTO caracteristica_mesa (nombre) VALUES ('Planta baja'), ('Espacio para carriola'), ('Sin escaleras');

-- Pasar lo que ya tenían las mesas (solo si las columnas viejas siguen existiendo).
SET @sigr_hay_columnas = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'mesa' AND column_name = 'planta_baja');

SET @sigr_ddl = IF(@sigr_hay_columnas > 0,
  'INSERT IGNORE INTO mesa_caracteristica (id_mesa, id_caracteristica)
     SELECT m.id_mesa, c.id_caracteristica FROM mesa m JOIN caracteristica_mesa c ON c.nombre = ''Planta baja'' WHERE m.planta_baja = 1
     UNION SELECT m.id_mesa, c.id_caracteristica FROM mesa m JOIN caracteristica_mesa c ON c.nombre = ''Espacio para carriola'' WHERE m.espacio_carriola = 1
     UNION SELECT m.id_mesa, c.id_caracteristica FROM mesa m JOIN caracteristica_mesa c ON c.nombre = ''Sin escaleras'' WHERE m.sin_escaleras = 1',
  'SELECT 1');
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_hay_pref = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'reservacion' AND column_name = 'pref_planta_baja');

SET @sigr_ddl = IF(@sigr_hay_pref > 0,
  'INSERT IGNORE INTO reservacion_caracteristica (id_reservacion, id_caracteristica)
     SELECT r.id_reservacion, c.id_caracteristica FROM reservacion r JOIN caracteristica_mesa c ON c.nombre = ''Planta baja'' WHERE r.pref_planta_baja = 1
     UNION SELECT r.id_reservacion, c.id_caracteristica FROM reservacion r JOIN caracteristica_mesa c ON c.nombre = ''Espacio para carriola'' WHERE r.pref_carriola = 1
     UNION SELECT r.id_reservacion, c.id_caracteristica FROM reservacion r JOIN caracteristica_mesa c ON c.nombre = ''Sin escaleras'' WHERE r.pref_sin_escaleras = 1',
  'SELECT 1');
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Los triggers de auditoría de mesa nombran las columnas viejas: se reemplazan antes de quitarlas.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_mesa_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_mesa_au`$$
DROP TRIGGER IF EXISTS `trg_aud_mesa_ad`$$
CREATE TRIGGER `trg_aud_mesa_ai` AFTER INSERT ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'INSERT', JSON_OBJECT('id_mesa', NEW.`id_mesa`), JSON_OBJECT('id_mesa', NEW.`id_mesa`, 'numero', NEW.`numero`, 'capacidad', NEW.`capacidad`, 'zona', NEW.`zona`, 'activa', NEW.`activa`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_mesa_au` AFTER UPDATE ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'UPDATE', JSON_OBJECT('id_mesa', NEW.`id_mesa`), JSON_OBJECT('id_mesa', OLD.`id_mesa`, 'numero', OLD.`numero`, 'capacidad', OLD.`capacidad`, 'zona', OLD.`zona`, 'activa', OLD.`activa`, 'estado', OLD.`estado`), JSON_OBJECT('id_mesa', NEW.`id_mesa`, 'numero', NEW.`numero`, 'capacidad', NEW.`capacidad`, 'zona', NEW.`zona`, 'activa', NEW.`activa`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_mesa_ad` AFTER DELETE ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'DELETE', JSON_OBJECT('id_mesa', OLD.`id_mesa`), JSON_OBJECT('id_mesa', OLD.`id_mesa`, 'numero', OLD.`numero`, 'capacidad', OLD.`capacidad`, 'zona', OLD.`zona`, 'activa', OLD.`activa`, 'estado', OLD.`estado`), USER());
END$$
DELIMITER ;

SET @sigr_ddl = IF(@sigr_hay_columnas > 0,
  'ALTER TABLE mesa DROP COLUMN planta_baja, DROP COLUMN espacio_carriola, DROP COLUMN sin_escaleras',
  'SELECT 1');
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(@sigr_hay_pref > 0,
  'ALTER TABLE reservacion DROP COLUMN pref_planta_baja, DROP COLUMN pref_carriola, DROP COLUMN pref_sin_escaleras',
  'SELECT 1');
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Duración de la reservación (antes fija en 90 minutos en el código).
SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'configuracion_reservacion' AND column_name = 'duracion_reservacion_minutos') = 0,
  'ALTER TABLE configuracion_reservacion
     ADD COLUMN duracion_reservacion_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 90 AFTER dias_abiertos,
     ADD CONSTRAINT chk_config_res_duracion CHECK (duracion_reservacion_minutos BETWEEN 30 AND 360)',
  'SELECT 1');
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SELECT c.nombre, COUNT(mc.id_mesa) AS mesas FROM caracteristica_mesa c LEFT JOIN mesa_caracteristica mc USING (id_caracteristica) GROUP BY c.id_caracteristica, c.nombre;
SELECT duracion_reservacion_minutos FROM configuracion_reservacion;
