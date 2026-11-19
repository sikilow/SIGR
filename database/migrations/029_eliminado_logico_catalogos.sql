-- ============================================
-- SIGR - MIGRACION 029
-- ELIMINADO LOGICO DE MESAS, SECCIONES, CARACTERISTICAS, CANALES Y METODOS DE PAGO (fase 4).
--   * `eliminado_en` (cuando) y `eliminado_por` (quien, solo el gerente): vacio = vigente.
--   * Aplica a: mesa, seccion, caracteristica_mesa, canal_pedido, categoria_metodo_pago y metodo_pago.
--   * Nada se borra: las cuentas, reservaciones y pagos anteriores conservan lo que usaron.
--   * Regla: algo eliminado SIEMPRE queda tambien inactivo (activa/activo = FALSE). Asi todas las pantallas que ya
--     filtran por «activo» (panel de mesas, salon, portal, caja, menu de canales) lo ocultan sin cambios.
--   * La auditoria de estas tablas registra tambien las columnas nuevas.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 029_eliminado_logico_catalogos.sql
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'mesa' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE mesa
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_mesa_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'seccion' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE seccion
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_seccion_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'caracteristica_mesa' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE caracteristica_mesa
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_caracteristica_mesa_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'canal_pedido' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE canal_pedido
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_canal_pedido_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'metodo_pago' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE metodo_pago
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_metodo_pago_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'categoria_metodo_pago' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE categoria_metodo_pago
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_categoria_metodo_pago_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Auditoria: los triggers listan las columnas, asi que se vuelven a crear con las columnas nuevas.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_mesa_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_mesa_au`$$
DROP TRIGGER IF EXISTS `trg_aud_mesa_ad`$$
CREATE TRIGGER `trg_aud_mesa_ai` AFTER INSERT ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'INSERT', JSON_OBJECT('id_mesa', NEW.`id_mesa`), JSON_OBJECT('id_mesa', NEW.`id_mesa`, 'numero', NEW.`numero`, 'capacidad', NEW.`capacidad`, 'zona', NEW.`zona`, 'activa', NEW.`activa`, 'estado', NEW.`estado`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_mesa_au` AFTER UPDATE ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'UPDATE', JSON_OBJECT('id_mesa', NEW.`id_mesa`), JSON_OBJECT('id_mesa', OLD.`id_mesa`, 'numero', OLD.`numero`, 'capacidad', OLD.`capacidad`, 'zona', OLD.`zona`, 'activa', OLD.`activa`, 'estado', OLD.`estado`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_mesa', NEW.`id_mesa`, 'numero', NEW.`numero`, 'capacidad', NEW.`capacidad`, 'zona', NEW.`zona`, 'activa', NEW.`activa`, 'estado', NEW.`estado`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_mesa_ad` AFTER DELETE ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'DELETE', JSON_OBJECT('id_mesa', OLD.`id_mesa`), JSON_OBJECT('id_mesa', OLD.`id_mesa`, 'numero', OLD.`numero`, 'capacidad', OLD.`capacidad`, 'zona', OLD.`zona`, 'activa', OLD.`activa`, 'estado', OLD.`estado`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_ad`$$
CREATE TRIGGER `trg_aud_seccion_ai` AFTER INSERT ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'INSERT', JSON_OBJECT('nombre', NEW.`nombre`), JSON_OBJECT('nombre', NEW.`nombre`, 'activa', NEW.`activa`, 'es_para_llevar', NEW.`es_para_llevar`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_seccion_au` AFTER UPDATE ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'UPDATE', JSON_OBJECT('nombre', NEW.`nombre`), JSON_OBJECT('nombre', OLD.`nombre`, 'activa', OLD.`activa`, 'es_para_llevar', OLD.`es_para_llevar`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('nombre', NEW.`nombre`, 'activa', NEW.`activa`, 'es_para_llevar', NEW.`es_para_llevar`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_seccion_ad` AFTER DELETE ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'DELETE', JSON_OBJECT('nombre', OLD.`nombre`), JSON_OBJECT('nombre', OLD.`nombre`, 'activa', OLD.`activa`, 'es_para_llevar', OLD.`es_para_llevar`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_canal_pedido_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_canal_pedido_au`$$
DROP TRIGGER IF EXISTS `trg_aud_canal_pedido_ad`$$
CREATE TRIGGER `trg_aud_canal_pedido_ai` AFTER INSERT ON `canal_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'canal_pedido', 'INSERT', JSON_OBJECT('id_canal', NEW.`id_canal`), JSON_OBJECT('id_canal', NEW.`id_canal`, 'nombre', NEW.`nombre`, 'activo', NEW.`activo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_canal_pedido_au` AFTER UPDATE ON `canal_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'canal_pedido', 'UPDATE', JSON_OBJECT('id_canal', NEW.`id_canal`), JSON_OBJECT('id_canal', OLD.`id_canal`, 'nombre', OLD.`nombre`, 'activo', OLD.`activo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_canal', NEW.`id_canal`, 'nombre', NEW.`nombre`, 'activo', NEW.`activo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_canal_pedido_ad` AFTER DELETE ON `canal_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'canal_pedido', 'DELETE', JSON_OBJECT('id_canal', OLD.`id_canal`), JSON_OBJECT('id_canal', OLD.`id_canal`, 'nombre', OLD.`nombre`, 'activo', OLD.`activo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ad`$$
CREATE TRIGGER `trg_aud_metodo_pago_ai` AFTER INSERT ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'INSERT', JSON_OBJECT('id_metodo', NEW.`id_metodo`), JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`, 'id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'es_efectivo', NEW.`es_efectivo`, 'activo', NEW.`activo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_au` AFTER UPDATE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'UPDATE', JSON_OBJECT('id_metodo', NEW.`id_metodo`), JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`, 'id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'es_efectivo', OLD.`es_efectivo`, 'activo', OLD.`activo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`, 'id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'es_efectivo', NEW.`es_efectivo`, 'activo', NEW.`activo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_ad` AFTER DELETE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'DELETE', JSON_OBJECT('id_metodo', OLD.`id_metodo`), JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`, 'id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'es_efectivo', OLD.`es_efectivo`, 'activo', OLD.`activo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_metodo_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_metodo_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_metodo_pago_ad`$$
CREATE TRIGGER `trg_aud_categoria_metodo_pago_ai` AFTER INSERT ON `categoria_metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_metodo_pago', 'INSERT', JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`), JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'nombre', NEW.`nombre`, 'tipo', NEW.`tipo`, 'activo', NEW.`activo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_metodo_pago_au` AFTER UPDATE ON `categoria_metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_metodo_pago', 'UPDATE', JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`), JSON_OBJECT('id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'nombre', OLD.`nombre`, 'tipo', OLD.`tipo`, 'activo', OLD.`activo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_categoria_metodo_pago', NEW.`id_categoria_metodo_pago`, 'nombre', NEW.`nombre`, 'tipo', NEW.`tipo`, 'activo', NEW.`activo`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_metodo_pago_ad` AFTER DELETE ON `categoria_metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_metodo_pago', 'DELETE', JSON_OBJECT('id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`), JSON_OBJECT('id_categoria_metodo_pago', OLD.`id_categoria_metodo_pago`, 'nombre', OLD.`nombre`, 'tipo', OLD.`tipo`, 'activo', OLD.`activo`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DELIMITER ;
