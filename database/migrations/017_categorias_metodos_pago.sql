-- ============================================
-- SIGR - MIGRACION 017
-- CATEGORIAS Y METODOS DE PAGO CONFIGURABLES
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS categoria_metodo_pago (
  id_categoria_metodo_pago INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE,
  tipo ENUM('fisico', 'digital') NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

INSERT INTO categoria_metodo_pago (nombre, tipo)
VALUES (CONVERT(X'46C3AD7369636F' USING utf8mb4), 'fisico'), ('Digital', 'digital')
ON DUPLICATE KEY UPDATE tipo = VALUES(tipo);

UPDATE categoria_metodo_pago
   SET nombre = CONVERT(X'46C3AD7369636F' USING utf8mb4)
 WHERE id_categoria_metodo_pago = (
   SELECT MIN(id_categoria_metodo_pago)
     FROM (SELECT id_categoria_metodo_pago FROM categoria_metodo_pago WHERE tipo = 'fisico') AS categoria_fisica
 );

SET @columna_activo_existe = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'metodo_pago'
     AND column_name = 'activo'
);
SET @sql = IF(
  @columna_activo_existe > 0,
  'SELECT ''La columna activo ya existe'' AS mensaje',
  'ALTER TABLE metodo_pago ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE AFTER nombre'
);
PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;

SET @columna_categoria_existe = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'metodo_pago'
     AND column_name = 'id_categoria_metodo_pago'
);
SET @sql = IF(
  @columna_categoria_existe > 0,
  'SELECT ''La columna id_categoria_metodo_pago ya existe'' AS mensaje',
  'ALTER TABLE metodo_pago ADD COLUMN id_categoria_metodo_pago INT NULL AFTER nombre'
);
PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;

SET @columna_efectivo_existe = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'metodo_pago'
     AND column_name = 'es_efectivo'
);
SET @sql = IF(
  @columna_efectivo_existe > 0,
  'SELECT ''La columna es_efectivo ya existe'' AS mensaje',
  'ALTER TABLE metodo_pago ADD COLUMN es_efectivo BOOLEAN NOT NULL DEFAULT FALSE AFTER id_categoria_metodo_pago'
);
PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;

-- Mantiene la auditoría actualizada con las columnas nuevas y registra las categorías.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ad`$$
CREATE TRIGGER `trg_aud_metodo_pago_ai` AFTER INSERT ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'INSERT', JSON_OBJECT('id_metodo', NEW.`id_metodo`),
          JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`, 'id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'es_efectivo', NEW.`es_efectivo`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_au` AFTER UPDATE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'UPDATE', JSON_OBJECT('id_metodo', NEW.`id_metodo`),
          JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`, 'id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'es_efectivo', OLD.`es_efectivo`, 'activo', OLD.`activo`),
          JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`, 'id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'es_efectivo', NEW.`es_efectivo`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_ad` AFTER DELETE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'DELETE', JSON_OBJECT('id_metodo', OLD.`id_metodo`),
          JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`, 'id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'es_efectivo', OLD.`es_efectivo`, 'activo', OLD.`activo`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_metodo_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_metodo_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_metodo_pago_ad`$$
CREATE TRIGGER `trg_aud_categoria_metodo_pago_ai` AFTER INSERT ON `categoria_metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_metodo_pago', 'INSERT', JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`),
          JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'nombre', NEW.`nombre`, 'tipo', NEW.`tipo`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_metodo_pago_au` AFTER UPDATE ON `categoria_metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_metodo_pago', 'UPDATE', JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`),
          JSON_OBJECT('id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'nombre', OLD.`nombre`, 'tipo', OLD.`tipo`, 'activo', OLD.`activo`),
          JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'nombre', NEW.`nombre`, 'tipo', NEW.`tipo`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_metodo_pago_ad` AFTER DELETE ON `categoria_metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_metodo_pago', 'DELETE', JSON_OBJECT('id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`),
          JSON_OBJECT('id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'nombre', OLD.`nombre`, 'tipo', OLD.`tipo`, 'activo', OLD.`activo`), USER());
END$$
DELIMITER ;

UPDATE metodo_pago mp
JOIN categoria_metodo_pago cmp ON cmp.tipo = IF(LOWER(TRIM(mp.nombre)) = 'efectivo', 'fisico', 'digital')
   SET mp.id_categoria_metodo_pago = cmp.id_categoria_metodo_pago
 WHERE mp.id_categoria_metodo_pago IS NULL;

UPDATE metodo_pago
   SET es_efectivo = (LOWER(TRIM(nombre)) = 'efectivo')
 WHERE es_efectivo = FALSE;

SET @columna_requerida = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'metodo_pago'
     AND column_name = 'id_categoria_metodo_pago'
     AND is_nullable = 'NO'
);
SET @sql = IF(
  @columna_requerida > 0,
  'SELECT ''La columna id_categoria_metodo_pago ya es obligatoria'' AS mensaje',
  'ALTER TABLE metodo_pago MODIFY COLUMN id_categoria_metodo_pago INT NOT NULL'
);
PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;

SET @restriccion_existe = (
  SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE()
     AND table_name = 'metodo_pago'
     AND constraint_name = 'fk_metodo_pago_categoria'
);
SET @sql = IF(
  @restriccion_existe > 0,
  'SELECT ''La llave foránea fk_metodo_pago_categoria ya existe'' AS mensaje',
  'ALTER TABLE metodo_pago ADD CONSTRAINT fk_metodo_pago_categoria FOREIGN KEY (id_categoria_metodo_pago) REFERENCES categoria_metodo_pago (id_categoria_metodo_pago) ON UPDATE CASCADE ON DELETE RESTRICT'
);
PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;
