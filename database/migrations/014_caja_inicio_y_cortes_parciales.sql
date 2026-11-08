-- Migración 014: registra fondos/cortes parciales y métodos de pago configurables.
-- Ejecutar después de la migración 013; sirve para bases existentes y para actualizar los triggers
-- cuando database/init.sql ya creó estas columnas.
USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'SIGR' AND table_name = 'corte_caja' AND column_name = 'efectivo_inicial') = 0,
  'ALTER TABLE corte_caja ADD COLUMN efectivo_inicial DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER inicio',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'SIGR' AND table_name = 'corte_caja' AND column_name = 'efectivo_contado') = 0,
  'ALTER TABLE corte_caja ADD COLUMN efectivo_contado DECIMAL(12,2) NULL AFTER total_reportado',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'SIGR' AND table_name = 'corte_caja' AND column_name = 'tipo_cierre') = 0,
  'ALTER TABLE corte_caja ADD COLUMN tipo_cierre ENUM(''parcial'',''final'') NULL AFTER efectivo_contado',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'SIGR' AND table_name = 'metodo_pago' AND column_name = 'activo') = 0,
  'ALTER TABLE metodo_pago ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE AFTER nombre',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = 'SIGR' AND table_name = 'corte_caja' AND constraint_name = 'chk_corte_efectivo_inicial') = 0,
  'ALTER TABLE corte_caja ADD CONSTRAINT chk_corte_efectivo_inicial CHECK (efectivo_inicial >= 0)',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = 'SIGR' AND table_name = 'corte_caja' AND constraint_name = 'chk_corte_efectivo_contado') = 0,
  'ALTER TABLE corte_caja ADD CONSTRAINT chk_corte_efectivo_contado CHECK (efectivo_contado IS NULL OR efectivo_contado >= 0)',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_au`$$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_ad`$$
CREATE TRIGGER `trg_aud_corte_caja_ai` AFTER INSERT ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (
    @sigr_actor_id, 'corte_caja', 'INSERT', JSON_OBJECT('id_corte', NEW.`id_corte`),
    JSON_OBJECT('id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'inicio', NEW.`inicio`,
      'efectivo_inicial', NEW.`efectivo_inicial`, 'fin', NEW.`fin`, 'total_reportado', NEW.`total_reportado`,
      'efectivo_contado', NEW.`efectivo_contado`, 'tipo_cierre', NEW.`tipo_cierre`), USER()
  );
END$$
CREATE TRIGGER `trg_aud_corte_caja_au` AFTER UPDATE ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (
    @sigr_actor_id, 'corte_caja', 'UPDATE', JSON_OBJECT('id_corte', NEW.`id_corte`),
    JSON_OBJECT('id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'inicio', OLD.`inicio`,
      'efectivo_inicial', OLD.`efectivo_inicial`, 'fin', OLD.`fin`, 'total_reportado', OLD.`total_reportado`,
      'efectivo_contado', OLD.`efectivo_contado`, 'tipo_cierre', OLD.`tipo_cierre`),
    JSON_OBJECT('id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'inicio', NEW.`inicio`,
      'efectivo_inicial', NEW.`efectivo_inicial`, 'fin', NEW.`fin`, 'total_reportado', NEW.`total_reportado`,
      'efectivo_contado', NEW.`efectivo_contado`, 'tipo_cierre', NEW.`tipo_cierre`), USER()
  );
END$$
CREATE TRIGGER `trg_aud_corte_caja_ad` AFTER DELETE ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (
    @sigr_actor_id, 'corte_caja', 'DELETE', JSON_OBJECT('id_corte', OLD.`id_corte`),
    JSON_OBJECT('id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'inicio', OLD.`inicio`,
      'efectivo_inicial', OLD.`efectivo_inicial`, 'fin', OLD.`fin`, 'total_reportado', OLD.`total_reportado`,
      'efectivo_contado', OLD.`efectivo_contado`, 'tipo_cierre', OLD.`tipo_cierre`), USER()
  );
END$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ad`$$
CREATE TRIGGER `trg_aud_metodo_pago_ai` AFTER INSERT ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'INSERT', JSON_OBJECT('id_metodo', NEW.`id_metodo`),
    JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_au` AFTER UPDATE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'UPDATE', JSON_OBJECT('id_metodo', NEW.`id_metodo`),
    JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`, 'activo', OLD.`activo`),
    JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_ad` AFTER DELETE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'DELETE', JSON_OBJECT('id_metodo', OLD.`id_metodo`),
    JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`, 'activo', OLD.`activo`), USER());
END$$
DELIMITER ;