-- ============================================
-- SIGR - MIGRACION 027
-- ELIMINADO LOGICO DE USUARIOS (fase 2).
--   * `eliminado_en` (cuando) y `eliminado_por` (quien, solo el gerente): vacio = vigente.
--   * Nada se borra: los pedidos, ventas y cortes siguen mostrando quien los hizo.
--   * Un usuario eliminado no puede iniciar sesion y su sesion se rechaza de inmediato (la API consulta la base).
--   * El primer gerente sigue protegido: tampoco se puede eliminar.
--   * La auditoria de `usuario` registra tambien estas columnas.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 027_eliminado_logico_usuarios.sql
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'usuario' AND column_name = 'eliminado_en') = 0,
  'ALTER TABLE usuario
     ADD COLUMN eliminado_en DATETIME NULL,
     ADD COLUMN eliminado_por INT NULL,
     ADD CONSTRAINT fk_usuario_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

-- Triggers: la proteccion del primer gerente y la auditoria listan columnas, asi que se vuelven a crear.
DELIMITER $$
DROP TRIGGER IF EXISTS trg_usuario_bu_proteger_primer_gerente$$
CREATE TRIGGER trg_usuario_bu_proteger_primer_gerente BEFORE UPDATE ON usuario FOR EACH ROW
BEGIN
  DECLARE v_primer_gerente INT DEFAULT NULL;
  SELECT id_primer_gerente INTO v_primer_gerente FROM configuracion_seguridad WHERE id = 1;
  IF OLD.id_usuario = v_primer_gerente AND (NEW.activo = FALSE OR NEW.eliminado_en IS NOT NULL OR NEW.id_rol <> OLD.id_rol) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El primer gerente no se puede desactivar, eliminar ni cambiar de rol';
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_aud_usuario_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_usuario_au`$$
DROP TRIGGER IF EXISTS `trg_aud_usuario_ad`$$
CREATE TRIGGER `trg_aud_usuario_ai` AFTER INSERT ON `usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'usuario', 'INSERT', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'id_rol', NEW.`id_rol`, 'nombre', NEW.`nombre`, 'correo', NEW.`correo`, 'activo', NEW.`activo`, 'creado_en', NEW.`creado_en`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_usuario_au` AFTER UPDATE ON `usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'usuario', 'UPDATE', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'id_rol', OLD.`id_rol`, 'nombre', OLD.`nombre`, 'correo', OLD.`correo`, 'activo', OLD.`activo`, 'creado_en', OLD.`creado_en`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'id_rol', NEW.`id_rol`, 'nombre', NEW.`nombre`, 'correo', NEW.`correo`, 'activo', NEW.`activo`, 'creado_en', NEW.`creado_en`, 'eliminado_en', NEW.`eliminado_en`, 'eliminado_por', NEW.`eliminado_por`), USER());
END$$
CREATE TRIGGER `trg_aud_usuario_ad` AFTER DELETE ON `usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'usuario', 'DELETE', JSON_OBJECT('id_usuario', OLD.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'id_rol', OLD.`id_rol`, 'nombre', OLD.`nombre`, 'correo', OLD.`correo`, 'activo', OLD.`activo`, 'creado_en', OLD.`creado_en`, 'eliminado_en', OLD.`eliminado_en`, 'eliminado_por', OLD.`eliminado_por`), USER());
END$$
DELIMITER ;
