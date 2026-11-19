-- ============================================
-- SIGR - MIGRACION 034
-- TICKETS PASADOS, REIMPRESION, DEVOLUCIONES Y REFERENCIA FISCAL.
--   * `devolucion` (+ `devolucion_linea` y `devolucion_pago`): una devolucion de una venta ya cobrada, total o parcial, con
--     motivo. La pide el cajero (queda `pendiente`) y la autoriza el gerente (`aprobada` o `rechazada`); si la registra el
--     gerente queda aprobada. Al aprobarla, el efectivo devuelto sale del corte del cajero (baja el efectivo esperado) y, si
--     se pide, se repone el inventario de los productos que controlan existencia.
--   * `venta_reimpresion`: quien reimprimio el ticket de una venta y cuando.
--   * `venta_fiscal`: el gerente guarda una REFERENCIA para el contador (no se emite factura) y, opcionalmente, datos fiscales
--     del cliente (RFC, razon social, regimen, codigo postal, correo). Todo menos la referencia es opcional.
--   * La auditoria registra los cambios de devolucion, devolucion_linea, devolucion_pago y venta_fiscal.
-- Puede repetirse: CREATE TABLE IF NOT EXISTS y los triggers se recrean. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 034_devoluciones_y_referencia_fiscal.sql
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS devolucion (
  id_devolucion INT AUTO_INCREMENT PRIMARY KEY,
  id_venta INT NOT NULL,
  estado VARCHAR(12) NOT NULL DEFAULT 'pendiente' CONSTRAINT chk_devolucion_estado CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  motivo VARCHAR(200) NOT NULL,
  total DECIMAL(12,2) NOT NULL CONSTRAINT chk_devolucion_total CHECK (total > 0),
  reponer_inventario BOOLEAN NOT NULL DEFAULT FALSE,
  solicitado_por INT NOT NULL,
  solicitado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelto_por INT NULL,
  resuelto_en DATETIME NULL,
  nota_resolucion VARCHAR(200) NULL,
  id_corte INT NULL,
  INDEX idx_devolucion_venta (id_venta),
  INDEX idx_devolucion_estado (estado, solicitado_en),
  INDEX idx_devolucion_corte (id_corte),
  CONSTRAINT fk_devolucion_venta FOREIGN KEY (id_venta) REFERENCES venta (id_venta) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_devolucion_solicitante FOREIGN KEY (solicitado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_devolucion_resolutor FOREIGN KEY (resuelto_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_devolucion_corte FOREIGN KEY (id_corte) REFERENCES corte_caja (id_corte) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS devolucion_linea (
  id_linea INT AUTO_INCREMENT PRIMARY KEY,
  id_devolucion INT NOT NULL,
  id_detalle INT NOT NULL,
  cantidad INT NOT NULL CONSTRAINT chk_devolucion_linea_cantidad CHECK (cantidad > 0),
  importe DECIMAL(12,2) NOT NULL CONSTRAINT chk_devolucion_linea_importe CHECK (importe >= 0),
  INDEX idx_devolucion_linea_detalle (id_detalle),
  CONSTRAINT fk_devolucion_linea_devolucion FOREIGN KEY (id_devolucion) REFERENCES devolucion (id_devolucion) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_devolucion_linea_detalle FOREIGN KEY (id_detalle) REFERENCES detalle_pedido (id_detalle) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS devolucion_pago (
  id_devolucion_pago INT AUTO_INCREMENT PRIMARY KEY,
  id_devolucion INT NOT NULL,
  id_metodo INT NOT NULL,
  monto DECIMAL(12,2) NOT NULL CONSTRAINT chk_devolucion_pago_monto CHECK (monto > 0),
  INDEX idx_devolucion_pago_metodo (id_metodo),
  CONSTRAINT fk_devolucion_pago_devolucion FOREIGN KEY (id_devolucion) REFERENCES devolucion (id_devolucion) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_devolucion_pago_metodo FOREIGN KEY (id_metodo) REFERENCES metodo_pago (id_metodo) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venta_reimpresion (
  id_reimpresion INT AUTO_INCREMENT PRIMARY KEY,
  id_venta INT NOT NULL,
  id_usuario INT NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_venta_reimpresion_venta (id_venta),
  CONSTRAINT fk_venta_reimpresion_venta FOREIGN KEY (id_venta) REFERENCES venta (id_venta) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_venta_reimpresion_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venta_fiscal (
  id_venta INT PRIMARY KEY,
  referencia_contador VARCHAR(60) NOT NULL,
  rfc VARCHAR(13) NULL,
  razon_social VARCHAR(160) NULL,
  regimen_fiscal VARCHAR(10) NULL,
  codigo_postal CHAR(5) NULL,
  correo VARCHAR(120) NULL,
  notas VARCHAR(200) NULL,
  registrado_por INT NOT NULL,
  registrado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_venta_fiscal_referencia (referencia_contador),
  CONSTRAINT fk_venta_fiscal_venta FOREIGN KEY (id_venta) REFERENCES venta (id_venta) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_venta_fiscal_usuario FOREIGN KEY (registrado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Auditoria.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_ad`$$
CREATE TRIGGER `trg_aud_devolucion_ai` AFTER INSERT ON `devolucion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion', 'INSERT', JSON_OBJECT('id_devolucion', NEW.`id_devolucion`), JSON_OBJECT('id_devolucion', NEW.`id_devolucion`, 'id_venta', NEW.`id_venta`, 'estado', NEW.`estado`, 'motivo', NEW.`motivo`, 'total', NEW.`total`, 'reponer_inventario', NEW.`reponer_inventario`, 'solicitado_por', NEW.`solicitado_por`, 'solicitado_en', NEW.`solicitado_en`, 'resuelto_por', NEW.`resuelto_por`, 'resuelto_en', NEW.`resuelto_en`, 'nota_resolucion', NEW.`nota_resolucion`, 'id_corte', NEW.`id_corte`), USER());
END$$
CREATE TRIGGER `trg_aud_devolucion_au` AFTER UPDATE ON `devolucion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion', 'UPDATE', JSON_OBJECT('id_devolucion', NEW.`id_devolucion`), JSON_OBJECT('id_devolucion', OLD.`id_devolucion`, 'id_venta', OLD.`id_venta`, 'estado', OLD.`estado`, 'motivo', OLD.`motivo`, 'total', OLD.`total`, 'reponer_inventario', OLD.`reponer_inventario`, 'solicitado_por', OLD.`solicitado_por`, 'solicitado_en', OLD.`solicitado_en`, 'resuelto_por', OLD.`resuelto_por`, 'resuelto_en', OLD.`resuelto_en`, 'nota_resolucion', OLD.`nota_resolucion`, 'id_corte', OLD.`id_corte`), JSON_OBJECT('id_devolucion', NEW.`id_devolucion`, 'id_venta', NEW.`id_venta`, 'estado', NEW.`estado`, 'motivo', NEW.`motivo`, 'total', NEW.`total`, 'reponer_inventario', NEW.`reponer_inventario`, 'solicitado_por', NEW.`solicitado_por`, 'solicitado_en', NEW.`solicitado_en`, 'resuelto_por', NEW.`resuelto_por`, 'resuelto_en', NEW.`resuelto_en`, 'nota_resolucion', NEW.`nota_resolucion`, 'id_corte', NEW.`id_corte`), USER());
END$$
CREATE TRIGGER `trg_aud_devolucion_ad` AFTER DELETE ON `devolucion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion', 'DELETE', JSON_OBJECT('id_devolucion', OLD.`id_devolucion`), JSON_OBJECT('id_devolucion', OLD.`id_devolucion`, 'id_venta', OLD.`id_venta`, 'estado', OLD.`estado`, 'motivo', OLD.`motivo`, 'total', OLD.`total`, 'reponer_inventario', OLD.`reponer_inventario`, 'solicitado_por', OLD.`solicitado_por`, 'solicitado_en', OLD.`solicitado_en`, 'resuelto_por', OLD.`resuelto_por`, 'resuelto_en', OLD.`resuelto_en`, 'nota_resolucion', OLD.`nota_resolucion`, 'id_corte', OLD.`id_corte`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_linea_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_linea_au`$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_linea_ad`$$
CREATE TRIGGER `trg_aud_devolucion_linea_ai` AFTER INSERT ON `devolucion_linea` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion_linea', 'INSERT', JSON_OBJECT('id_linea', NEW.`id_linea`), JSON_OBJECT('id_linea', NEW.`id_linea`, 'id_devolucion', NEW.`id_devolucion`, 'id_detalle', NEW.`id_detalle`, 'cantidad', NEW.`cantidad`, 'importe', NEW.`importe`), USER());
END$$
CREATE TRIGGER `trg_aud_devolucion_linea_au` AFTER UPDATE ON `devolucion_linea` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion_linea', 'UPDATE', JSON_OBJECT('id_linea', NEW.`id_linea`), JSON_OBJECT('id_linea', OLD.`id_linea`, 'id_devolucion', OLD.`id_devolucion`, 'id_detalle', OLD.`id_detalle`, 'cantidad', OLD.`cantidad`, 'importe', OLD.`importe`), JSON_OBJECT('id_linea', NEW.`id_linea`, 'id_devolucion', NEW.`id_devolucion`, 'id_detalle', NEW.`id_detalle`, 'cantidad', NEW.`cantidad`, 'importe', NEW.`importe`), USER());
END$$
CREATE TRIGGER `trg_aud_devolucion_linea_ad` AFTER DELETE ON `devolucion_linea` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion_linea', 'DELETE', JSON_OBJECT('id_linea', OLD.`id_linea`), JSON_OBJECT('id_linea', OLD.`id_linea`, 'id_devolucion', OLD.`id_devolucion`, 'id_detalle', OLD.`id_detalle`, 'cantidad', OLD.`cantidad`, 'importe', OLD.`importe`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_devolucion_pago_ad`$$
CREATE TRIGGER `trg_aud_devolucion_pago_ai` AFTER INSERT ON `devolucion_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion_pago', 'INSERT', JSON_OBJECT('id_devolucion_pago', NEW.`id_devolucion_pago`), JSON_OBJECT('id_devolucion_pago', NEW.`id_devolucion_pago`, 'id_devolucion', NEW.`id_devolucion`, 'id_metodo', NEW.`id_metodo`, 'monto', NEW.`monto`), USER());
END$$
CREATE TRIGGER `trg_aud_devolucion_pago_au` AFTER UPDATE ON `devolucion_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion_pago', 'UPDATE', JSON_OBJECT('id_devolucion_pago', NEW.`id_devolucion_pago`), JSON_OBJECT('id_devolucion_pago', OLD.`id_devolucion_pago`, 'id_devolucion', OLD.`id_devolucion`, 'id_metodo', OLD.`id_metodo`, 'monto', OLD.`monto`), JSON_OBJECT('id_devolucion_pago', NEW.`id_devolucion_pago`, 'id_devolucion', NEW.`id_devolucion`, 'id_metodo', NEW.`id_metodo`, 'monto', NEW.`monto`), USER());
END$$
CREATE TRIGGER `trg_aud_devolucion_pago_ad` AFTER DELETE ON `devolucion_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'devolucion_pago', 'DELETE', JSON_OBJECT('id_devolucion_pago', OLD.`id_devolucion_pago`), JSON_OBJECT('id_devolucion_pago', OLD.`id_devolucion_pago`, 'id_devolucion', OLD.`id_devolucion`, 'id_metodo', OLD.`id_metodo`, 'monto', OLD.`monto`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_venta_fiscal_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_venta_fiscal_au`$$
DROP TRIGGER IF EXISTS `trg_aud_venta_fiscal_ad`$$
CREATE TRIGGER `trg_aud_venta_fiscal_ai` AFTER INSERT ON `venta_fiscal` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'venta_fiscal', 'INSERT', JSON_OBJECT('id_venta', NEW.`id_venta`), JSON_OBJECT('id_venta', NEW.`id_venta`, 'referencia_contador', NEW.`referencia_contador`, 'rfc', NEW.`rfc`, 'razon_social', NEW.`razon_social`, 'regimen_fiscal', NEW.`regimen_fiscal`, 'codigo_postal', NEW.`codigo_postal`, 'correo', NEW.`correo`, 'notas', NEW.`notas`, 'registrado_por', NEW.`registrado_por`, 'registrado_en', NEW.`registrado_en`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_venta_fiscal_au` AFTER UPDATE ON `venta_fiscal` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'venta_fiscal', 'UPDATE', JSON_OBJECT('id_venta', NEW.`id_venta`), JSON_OBJECT('id_venta', OLD.`id_venta`, 'referencia_contador', OLD.`referencia_contador`, 'rfc', OLD.`rfc`, 'razon_social', OLD.`razon_social`, 'regimen_fiscal', OLD.`regimen_fiscal`, 'codigo_postal', OLD.`codigo_postal`, 'correo', OLD.`correo`, 'notas', OLD.`notas`, 'registrado_por', OLD.`registrado_por`, 'registrado_en', OLD.`registrado_en`, 'actualizado_en', OLD.`actualizado_en`), JSON_OBJECT('id_venta', NEW.`id_venta`, 'referencia_contador', NEW.`referencia_contador`, 'rfc', NEW.`rfc`, 'razon_social', NEW.`razon_social`, 'regimen_fiscal', NEW.`regimen_fiscal`, 'codigo_postal', NEW.`codigo_postal`, 'correo', NEW.`correo`, 'notas', NEW.`notas`, 'registrado_por', NEW.`registrado_por`, 'registrado_en', NEW.`registrado_en`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_venta_fiscal_ad` AFTER DELETE ON `venta_fiscal` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'venta_fiscal', 'DELETE', JSON_OBJECT('id_venta', OLD.`id_venta`), JSON_OBJECT('id_venta', OLD.`id_venta`, 'referencia_contador', OLD.`referencia_contador`, 'rfc', OLD.`rfc`, 'razon_social', OLD.`razon_social`, 'regimen_fiscal', OLD.`regimen_fiscal`, 'codigo_postal', OLD.`codigo_postal`, 'correo', OLD.`correo`, 'notas', OLD.`notas`, 'registrado_por', OLD.`registrado_por`, 'registrado_en', OLD.`registrado_en`, 'actualizado_en', OLD.`actualizado_en`), USER());
END$$
DELIMITER ;
