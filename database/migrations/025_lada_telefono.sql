-- ============================================
-- SIGR - MIGRACION 025
-- LADA (CODIGO DE PAIS) DEL TELEFONO: «52» Mexico, «1» EE. UU./Canada, etc.
--   * El telefono sigue guardandose solo con digitos en `telefono` (la cantidad la valida la API segun el pais); la lada va aparte en `lada` (solo digitos, sin «+»).
--   * Los registros existentes quedan con «52» (Mexico).
--   * La auditoria de `perfil_usuario` y `cliente` registra tambien la lada.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 025_lada_telefono.sql (la restriccion CHECK guarda el juego de caracteres de la conexion).
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'perfil_usuario' AND column_name = 'lada') = 0,
  'ALTER TABLE perfil_usuario
     ADD COLUMN lada VARCHAR(4) NOT NULL DEFAULT ''52'' AFTER telefono,
     ADD CONSTRAINT chk_perfil_usuario_lada CHECK (lada REGEXP ''^[0-9]{1,4}$'')',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cliente' AND column_name = 'lada') = 0,
  'ALTER TABLE cliente
     ADD COLUMN lada VARCHAR(4) NOT NULL DEFAULT ''52'' AFTER telefono,
     ADD CONSTRAINT chk_cliente_lada CHECK (lada REGEXP ''^[0-9]{1,4}$'')',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Auditoria: los triggers listan las columnas, asi que se vuelven a crear con `lada`.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_perfil_usuario_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_perfil_usuario_au`$$
DROP TRIGGER IF EXISTS `trg_aud_perfil_usuario_ad`$$
CREATE TRIGGER `trg_aud_perfil_usuario_ai` AFTER INSERT ON `perfil_usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'perfil_usuario', 'INSERT', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'telefono', NEW.`telefono`, 'lada', NEW.`lada`, 'direccion', NEW.`direccion`), USER());
END$$
CREATE TRIGGER `trg_aud_perfil_usuario_au` AFTER UPDATE ON `perfil_usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'perfil_usuario', 'UPDATE', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'telefono', OLD.`telefono`, 'lada', OLD.`lada`, 'direccion', OLD.`direccion`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'telefono', NEW.`telefono`, 'lada', NEW.`lada`, 'direccion', NEW.`direccion`), USER());
END$$
CREATE TRIGGER `trg_aud_perfil_usuario_ad` AFTER DELETE ON `perfil_usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'perfil_usuario', 'DELETE', JSON_OBJECT('id_usuario', OLD.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'telefono', OLD.`telefono`, 'lada', OLD.`lada`, 'direccion', OLD.`direccion`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_au`$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_ad`$$
CREATE TRIGGER `trg_aud_cliente_ai` AFTER INSERT ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'INSERT', JSON_OBJECT('id_cliente', NEW.`id_cliente`), JSON_OBJECT('id_cliente', NEW.`id_cliente`, 'nombre', NEW.`nombre`, 'telefono', NEW.`telefono`, 'lada', NEW.`lada`, 'correo', NEW.`correo`), USER());
END$$
CREATE TRIGGER `trg_aud_cliente_au` AFTER UPDATE ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'UPDATE', JSON_OBJECT('id_cliente', NEW.`id_cliente`), JSON_OBJECT('id_cliente', OLD.`id_cliente`, 'nombre', OLD.`nombre`, 'telefono', OLD.`telefono`, 'lada', OLD.`lada`, 'correo', OLD.`correo`), JSON_OBJECT('id_cliente', NEW.`id_cliente`, 'nombre', NEW.`nombre`, 'telefono', NEW.`telefono`, 'lada', NEW.`lada`, 'correo', NEW.`correo`), USER());
END$$
CREATE TRIGGER `trg_aud_cliente_ad` AFTER DELETE ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'DELETE', JSON_OBJECT('id_cliente', OLD.`id_cliente`), JSON_OBJECT('id_cliente', OLD.`id_cliente`, 'nombre', OLD.`nombre`, 'telefono', OLD.`telefono`, 'lada', OLD.`lada`, 'correo', OLD.`correo`), USER());
END$$
DELIMITER ;
