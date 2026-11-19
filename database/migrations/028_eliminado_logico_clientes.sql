-- ============================================
-- SIGR - MIGRACION 028
-- ELIMINADO LOGICO DE CLIENTES (fase 3).
--   * `eliminado_en` (cuando) y `eliminado_por` (quien, solo el gerente): vacio = vigente.
--   * Nada se borra: las reservaciones y la lista de espera siguen mostrando al cliente.
--   * Un cliente eliminado no aparece en las busquedas de la hostess y no puede entrar al portal.
--   * La auditoria de `cliente` registra tambien estas columnas.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 028_eliminado_logico_clientes.sql
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cliente' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE cliente
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_cliente_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Auditoria: los triggers listan las columnas, asi que se vuelven a crear con las columnas nuevas.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_cliente_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_au`$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_ad`$$
CREATE TRIGGER `trg_aud_cliente_ai` AFTER INSERT ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'INSERT', JSON_OBJECT('id_cliente', NEW.`id_cliente`), JSON_OBJECT('id_cliente', NEW.`id_cliente`, 'nombre', NEW.`nombre`, 'telefono', NEW.`telefono`, 'lada', NEW.`lada`, 'correo', NEW.`correo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_cliente_au` AFTER UPDATE ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'UPDATE', JSON_OBJECT('id_cliente', NEW.`id_cliente`), JSON_OBJECT('id_cliente', OLD.`id_cliente`, 'nombre', OLD.`nombre`, 'telefono', OLD.`telefono`, 'lada', OLD.`lada`, 'correo', OLD.`correo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_cliente', NEW.`id_cliente`, 'nombre', NEW.`nombre`, 'telefono', NEW.`telefono`, 'lada', NEW.`lada`, 'correo', NEW.`correo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_cliente_ad` AFTER DELETE ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'DELETE', JSON_OBJECT('id_cliente', OLD.`id_cliente`), JSON_OBJECT('id_cliente', OLD.`id_cliente`, 'nombre', OLD.`nombre`, 'telefono', OLD.`telefono`, 'lada', OLD.`lada`, 'correo', OLD.`correo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DELIMITER ;
