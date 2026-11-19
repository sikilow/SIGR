-- ============================================
-- SIGR - MIGRACION 035
-- MERMAS: producto que se pierde (caduco, se daño, error de preparacion...).
--   * `merma`: que producto, cuantas unidades, motivo, nota, quien la registro y cuando. Guarda el precio de venta del
--     producto en ese momento para estimar el valor perdido (el sistema no maneja costos). Si el producto controla
--     existencia, al registrarla se descuenta del inventario (no puede pasar de lo que hay).
--   * El reporte de mermas (gerente) suma por producto, motivo y dia, y suma aparte lo devuelto por clientes que no volvio al
--     inventario (devoluciones aprobadas sin `reponer_inventario`).
--   * La auditoria registra los cambios de merma.
-- Puede repetirse: CREATE TABLE IF NOT EXISTS y los triggers se recrean. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 035_mermas.sql
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS merma (
  id_merma INT AUTO_INCREMENT PRIMARY KEY,
  id_producto INT NOT NULL,
  cantidad INT NOT NULL CONSTRAINT chk_merma_cantidad CHECK (cantidad > 0),
  motivo VARCHAR(20) NOT NULL CONSTRAINT chk_merma_motivo CHECK (motivo IN ('caducado', 'danado', 'preparacion', 'otro')),
  nota VARCHAR(200) NULL,
  -- Precio de venta del producto al registrar la merma: sirve para estimar el valor perdido (el sistema no guarda costos).
  precio_unitario DECIMAL(10,2) NOT NULL CONSTRAINT chk_merma_precio CHECK (precio_unitario >= 0),
  -- TRUE = el producto controla existencia y se descontó del inventario al registrarla.
  descuenta_inventario BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_por INT NOT NULL,
  registrado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_merma_fecha (registrado_en),
  INDEX idx_merma_producto (id_producto, registrado_en),
  CONSTRAINT fk_merma_producto FOREIGN KEY (id_producto) REFERENCES producto (id_producto) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_merma_usuario FOREIGN KEY (registrado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Auditoria.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_merma_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_merma_au`$$
DROP TRIGGER IF EXISTS `trg_aud_merma_ad`$$
CREATE TRIGGER `trg_aud_merma_ai` AFTER INSERT ON `merma` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'merma', 'INSERT', JSON_OBJECT('id_merma', NEW.`id_merma`), JSON_OBJECT('id_merma', NEW.`id_merma`, 'id_producto', NEW.`id_producto`, 'cantidad', NEW.`cantidad`, 'motivo', NEW.`motivo`, 'nota', NEW.`nota`, 'precio_unitario', NEW.`precio_unitario`, 'descuenta_inventario', NEW.`descuenta_inventario`, 'registrado_por', NEW.`registrado_por`, 'registrado_en', NEW.`registrado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_merma_au` AFTER UPDATE ON `merma` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'merma', 'UPDATE', JSON_OBJECT('id_merma', NEW.`id_merma`), JSON_OBJECT('id_merma', OLD.`id_merma`, 'id_producto', OLD.`id_producto`, 'cantidad', OLD.`cantidad`, 'motivo', OLD.`motivo`, 'nota', OLD.`nota`, 'precio_unitario', OLD.`precio_unitario`, 'descuenta_inventario', OLD.`descuenta_inventario`, 'registrado_por', OLD.`registrado_por`, 'registrado_en', OLD.`registrado_en`), JSON_OBJECT('id_merma', NEW.`id_merma`, 'id_producto', NEW.`id_producto`, 'cantidad', NEW.`cantidad`, 'motivo', NEW.`motivo`, 'nota', NEW.`nota`, 'precio_unitario', NEW.`precio_unitario`, 'descuenta_inventario', NEW.`descuenta_inventario`, 'registrado_por', NEW.`registrado_por`, 'registrado_en', NEW.`registrado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_merma_ad` AFTER DELETE ON `merma` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'merma', 'DELETE', JSON_OBJECT('id_merma', OLD.`id_merma`), JSON_OBJECT('id_merma', OLD.`id_merma`, 'id_producto', OLD.`id_producto`, 'cantidad', OLD.`cantidad`, 'motivo', OLD.`motivo`, 'nota', OLD.`nota`, 'precio_unitario', OLD.`precio_unitario`, 'descuenta_inventario', OLD.`descuenta_inventario`, 'registrado_por', OLD.`registrado_por`, 'registrado_en', OLD.`registrado_en`), USER());
END$$
DELIMITER ;
