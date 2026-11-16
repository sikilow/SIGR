-- ============================================
-- SIGR - MIGRACION 019
-- PEDIDOS PARA LLEVAR: seccion «Para llevar» con mesas virtuales y canal del pedido (mostrador, teléfono, plataformas).
--   * seccion.es_para_llevar: las mesas de esa sección son virtuales (no se sientan, no se reservan; no aparecen en Salón).
--   * canal_pedido: catálogo de canales que administra Gerencia.
--   * cuenta.id_canal / cuenta.referencia: de dónde viene el pedido y un dato para entregarlo (nombre o folio).
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- ============================================

USE SIGR;

-- 1) Catálogo de canales
CREATE TABLE IF NOT EXISTS canal_pedido (
  id_canal INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

INSERT INTO canal_pedido (nombre)
SELECT nombre FROM (
  SELECT 'Mostrador' AS nombre UNION ALL SELECT 'Teléfono' UNION ALL SELECT 'Rappi'
  UNION ALL SELECT 'Uber Eats' UNION ALL SELECT 'DiDi Food' UNION ALL SELECT 'Mandadito'
) AS iniciales
WHERE NOT EXISTS (SELECT 1 FROM canal_pedido);

-- 2) seccion.es_para_llevar
SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'seccion' AND column_name = 'es_para_llevar') = 0,
  'ALTER TABLE seccion ADD COLUMN es_para_llevar BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- 3) cuenta.id_canal y cuenta.referencia
SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cuenta' AND column_name = 'id_canal') = 0,
  'ALTER TABLE cuenta ADD COLUMN id_canal INT NULL, ADD COLUMN referencia VARCHAR(60) NULL,
     ADD CONSTRAINT fk_cuenta_id_canal FOREIGN KEY (id_canal) REFERENCES canal_pedido (id_canal) ON UPDATE CASCADE ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- 4) Sección «Para llevar» y sus mesas virtuales (101 a 110; Gerencia puede agregar más en esa sección)
INSERT INTO seccion (nombre, es_para_llevar) VALUES ('Para llevar', TRUE)
ON DUPLICATE KEY UPDATE es_para_llevar = TRUE;

INSERT INTO mesa (numero, capacidad, zona)
SELECT n.numero, 1, 'Para llevar'
  FROM (
    SELECT 101 AS numero UNION ALL SELECT 102 UNION ALL SELECT 103 UNION ALL SELECT 104 UNION ALL SELECT 105
    UNION ALL SELECT 106 UNION ALL SELECT 107 UNION ALL SELECT 108 UNION ALL SELECT 109 UNION ALL SELECT 110
  ) AS n
 WHERE NOT EXISTS (SELECT 1 FROM mesa m WHERE m.numero = n.numero);

-- 5) Auditoría (013): los triggers de seccion y cuenta registran las columnas nuevas; canal_pedido también se audita.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_seccion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_ad`$$
CREATE TRIGGER `trg_aud_seccion_ai` AFTER INSERT ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'INSERT', JSON_OBJECT('nombre', NEW.`nombre`), JSON_OBJECT('nombre', NEW.`nombre`, 'activa', NEW.`activa`, 'es_para_llevar', NEW.`es_para_llevar`), USER());
END$$
CREATE TRIGGER `trg_aud_seccion_au` AFTER UPDATE ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'UPDATE', JSON_OBJECT('nombre', NEW.`nombre`), JSON_OBJECT('nombre', OLD.`nombre`, 'activa', OLD.`activa`, 'es_para_llevar', OLD.`es_para_llevar`), JSON_OBJECT('nombre', NEW.`nombre`, 'activa', NEW.`activa`, 'es_para_llevar', NEW.`es_para_llevar`), USER());
END$$
CREATE TRIGGER `trg_aud_seccion_ad` AFTER DELETE ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'DELETE', JSON_OBJECT('nombre', OLD.`nombre`), JSON_OBJECT('nombre', OLD.`nombre`, 'activa', OLD.`activa`, 'es_para_llevar', OLD.`es_para_llevar`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_au`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ad`$$
CREATE TRIGGER `trg_aud_cuenta_ai` AFTER INSERT ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'INSERT', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', NEW.`id_metodo_pago_solicitado`, 'id_canal', NEW.`id_canal`, 'referencia', NEW.`referencia`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_au` AFTER UPDATE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'UPDATE', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', OLD.`id_metodo_pago_solicitado`, 'id_canal', OLD.`id_canal`, 'referencia', OLD.`referencia`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', NEW.`id_metodo_pago_solicitado`, 'id_canal', NEW.`id_canal`, 'referencia', NEW.`referencia`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_ad` AFTER DELETE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'DELETE', JSON_OBJECT('id_cuenta', OLD.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', OLD.`id_metodo_pago_solicitado`, 'id_canal', OLD.`id_canal`, 'referencia', OLD.`referencia`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_canal_pedido_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_canal_pedido_au`$$
DROP TRIGGER IF EXISTS `trg_aud_canal_pedido_ad`$$
CREATE TRIGGER `trg_aud_canal_pedido_ai` AFTER INSERT ON `canal_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'canal_pedido', 'INSERT', JSON_OBJECT('id_canal', NEW.`id_canal`), JSON_OBJECT('id_canal', NEW.`id_canal`, 'nombre', NEW.`nombre`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_canal_pedido_au` AFTER UPDATE ON `canal_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'canal_pedido', 'UPDATE', JSON_OBJECT('id_canal', NEW.`id_canal`), JSON_OBJECT('id_canal', OLD.`id_canal`, 'nombre', OLD.`nombre`, 'activo', OLD.`activo`), JSON_OBJECT('id_canal', NEW.`id_canal`, 'nombre', NEW.`nombre`, 'activo', NEW.`activo`), USER());
END$$
CREATE TRIGGER `trg_aud_canal_pedido_ad` AFTER DELETE ON `canal_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'canal_pedido', 'DELETE', JSON_OBJECT('id_canal', OLD.`id_canal`), JSON_OBJECT('id_canal', OLD.`id_canal`, 'nombre', OLD.`nombre`, 'activo', OLD.`activo`), USER());
END$$
DELIMITER ;
