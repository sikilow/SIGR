-- ============================================
-- SIGR - MIGRACION 015
-- CORTE DE CAJA: FONDO INICIAL Y CUADRE DE EFECTIVO
-- Ejecutar una sola vez, despues de 014.
-- ============================================

USE SIGR;

-- fondo_inicial: efectivo con el que el cajero abre el turno.
-- efectivo_esperado: fondo inicial + cobros en efectivo (sin el cambio entregado), calculado al cerrar.
-- efectivo_contado: efectivo que el cajero conto al cerrar.
-- Los cortes anteriores conservan total_reportado y quedan con efectivo_contado en NULL.
ALTER TABLE corte_caja
  ADD COLUMN fondo_inicial DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER fin,
  ADD COLUMN efectivo_esperado DECIMAL(12,2) NULL AFTER fondo_inicial,
  ADD COLUMN efectivo_contado DECIMAL(12,2) NULL AFTER efectivo_esperado,
  ADD CONSTRAINT chk_corte_fondo_inicial CHECK (fondo_inicial >= 0),
  ADD CONSTRAINT chk_corte_efectivo_contado CHECK (efectivo_contado IS NULL OR efectivo_contado >= 0);

-- Auditoria (013): los triggers de corte_caja tambien registran las columnas nuevas.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_au`$$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_ad`$$
CREATE TRIGGER `trg_aud_corte_caja_ai` AFTER INSERT ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'corte_caja', 'INSERT', JSON_OBJECT('id_corte', NEW.`id_corte`), JSON_OBJECT('id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'inicio', NEW.`inicio`, 'fin', NEW.`fin`, 'fondo_inicial', NEW.`fondo_inicial`, 'efectivo_esperado', NEW.`efectivo_esperado`, 'efectivo_contado', NEW.`efectivo_contado`, 'total_reportado', NEW.`total_reportado`), USER());
END$$
CREATE TRIGGER `trg_aud_corte_caja_au` AFTER UPDATE ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'corte_caja', 'UPDATE', JSON_OBJECT('id_corte', NEW.`id_corte`), JSON_OBJECT('id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'inicio', OLD.`inicio`, 'fin', OLD.`fin`, 'fondo_inicial', OLD.`fondo_inicial`, 'efectivo_esperado', OLD.`efectivo_esperado`, 'efectivo_contado', OLD.`efectivo_contado`, 'total_reportado', OLD.`total_reportado`), JSON_OBJECT('id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'inicio', NEW.`inicio`, 'fin', NEW.`fin`, 'fondo_inicial', NEW.`fondo_inicial`, 'efectivo_esperado', NEW.`efectivo_esperado`, 'efectivo_contado', NEW.`efectivo_contado`, 'total_reportado', NEW.`total_reportado`), USER());
END$$
CREATE TRIGGER `trg_aud_corte_caja_ad` AFTER DELETE ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'corte_caja', 'DELETE', JSON_OBJECT('id_corte', OLD.`id_corte`), JSON_OBJECT('id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'inicio', OLD.`inicio`, 'fin', OLD.`fin`, 'fondo_inicial', OLD.`fondo_inicial`, 'efectivo_esperado', OLD.`efectivo_esperado`, 'efectivo_contado', OLD.`efectivo_contado`, 'total_reportado', OLD.`total_reportado`), USER());
END$$
DELIMITER ;
