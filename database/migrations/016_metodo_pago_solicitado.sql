-- ============================================
-- SIGR - MIGRACION 016
-- MÉTODO DIGITAL ELEGIDO AL SOLICITAR LA CUENTA
-- ============================================

USE SIGR;

-- Permite que caja precargue el método (Tarjeta, Transferencia u otro activo)
-- que el mesero confirmó con el cliente.
SET @columna_existe = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'cuenta'
     AND column_name = 'id_metodo_pago_solicitado'
);
SET @sql = IF(
  @columna_existe > 0,
  'SELECT ''La columna id_metodo_pago_solicitado ya existe'' AS mensaje',
  'ALTER TABLE cuenta ADD COLUMN id_metodo_pago_solicitado INT NULL AFTER tipo_pago_solicitado'
);
PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;

SET @restriccion_existe = (
  SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE()
     AND table_name = 'cuenta'
     AND constraint_name = 'fk_cuenta_metodo_pago_solicitado'
);
SET @sql = IF(
  @restriccion_existe > 0,
  'SELECT ''La llave foránea fk_cuenta_metodo_pago_solicitado ya existe'' AS mensaje',
  'ALTER TABLE cuenta ADD CONSTRAINT fk_cuenta_metodo_pago_solicitado FOREIGN KEY (id_metodo_pago_solicitado) REFERENCES metodo_pago (id_metodo) ON UPDATE CASCADE ON DELETE RESTRICT'
);
PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;

-- La migración 013 instaló estos triggers antes de que existiera la nueva columna.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_au`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ad`$$
CREATE TRIGGER `trg_aud_cuenta_ai` AFTER INSERT ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'INSERT', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', NEW.`id_metodo_pago_solicitado`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_au` AFTER UPDATE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'UPDATE', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', OLD.`id_metodo_pago_solicitado`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', NEW.`id_metodo_pago_solicitado`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_ad` AFTER DELETE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'DELETE', JSON_OBJECT('id_cuenta', OLD.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', OLD.`id_metodo_pago_solicitado`), USER());
END$$
DELIMITER ;
