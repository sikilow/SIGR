-- ============================================
-- SIGR - MIGRACION 026
-- ELIMINADO LOGICO (fase 1: productos y categorias del menu).
--   * `eliminado_en` (cuando) y `eliminado_por` (quien, solo el gerente): vacio = vigente.
--   * Nada se borra de la base: el historial (pedidos, ventas, reportes) sigue mostrando el producto o categoria.
--   * Las pantallas «vivas» (menu del mesero, formularios) excluyen lo eliminado; el gerente puede verlo y restaurarlo.
--   * La auditoria de `categoria_menu` y `producto` registra tambien estas columnas.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 026_eliminado_logico_productos.sql
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'categoria_menu' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE categoria_menu
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_categoria_menu_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'producto' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE producto
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_producto_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Auditoria: los triggers listan las columnas, asi que se vuelven a crear con las columnas nuevas.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_categoria_menu_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_menu_au`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_menu_ad`$$
CREATE TRIGGER `trg_aud_categoria_menu_ai` AFTER INSERT ON `categoria_menu` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_menu', 'INSERT', JSON_OBJECT('id_categoria', NEW.`id_categoria`), JSON_OBJECT('id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_menu_au` AFTER UPDATE ON `categoria_menu` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_menu', 'UPDATE', JSON_OBJECT('id_categoria', NEW.`id_categoria`), JSON_OBJECT('id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_menu_ad` AFTER DELETE ON `categoria_menu` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_menu', 'DELETE', JSON_OBJECT('id_categoria', OLD.`id_categoria`), JSON_OBJECT('id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_producto_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_producto_au`$$
DROP TRIGGER IF EXISTS `trg_aud_producto_ad`$$
CREATE TRIGGER `trg_aud_producto_ai` AFTER INSERT ON `producto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'producto', 'INSERT', JSON_OBJECT('id_producto', NEW.`id_producto`), JSON_OBJECT('id_producto', NEW.`id_producto`, 'id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`, 'presentacion', NEW.`presentacion`, 'descripcion', NEW.`descripcion`, 'precio', NEW.`precio`, 'disponible', NEW.`disponible`, 'controla_existencia', NEW.`controla_existencia`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_producto_au` AFTER UPDATE ON `producto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'producto', 'UPDATE', JSON_OBJECT('id_producto', NEW.`id_producto`), JSON_OBJECT('id_producto', OLD.`id_producto`, 'id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`, 'presentacion', OLD.`presentacion`, 'descripcion', OLD.`descripcion`, 'precio', OLD.`precio`, 'disponible', OLD.`disponible`, 'controla_existencia', OLD.`controla_existencia`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_producto', NEW.`id_producto`, 'id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`, 'presentacion', NEW.`presentacion`, 'descripcion', NEW.`descripcion`, 'precio', NEW.`precio`, 'disponible', NEW.`disponible`, 'controla_existencia', NEW.`controla_existencia`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_producto_ad` AFTER DELETE ON `producto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'producto', 'DELETE', JSON_OBJECT('id_producto', OLD.`id_producto`), JSON_OBJECT('id_producto', OLD.`id_producto`, 'id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`, 'presentacion', OLD.`presentacion`, 'descripcion', OLD.`descripcion`, 'precio', OLD.`precio`, 'disponible', OLD.`disponible`, 'controla_existencia', OLD.`controla_existencia`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DELIMITER ;
