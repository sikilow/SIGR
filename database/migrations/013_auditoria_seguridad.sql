-- MIGRACION 013: gerente inicial protegido y auditoria transaccional de cambios.
-- Aplicar una sola vez despues de 012_correo_cancelacion.sql.
-- Captura INSERT/UPDATE/DELETE de todas las tablas del esquema inicial.
-- El actor se establece por la API en @sigr_actor_id; tareas fuera de una sesion autenticada quedan NULL.
-- No se guardan hashes de contrasena ni respuestas idempotentes en las instantaneas.

USE SIGR;

CREATE TABLE IF NOT EXISTS configuracion_seguridad (
  id TINYINT NOT NULL PRIMARY KEY CHECK (id = 1),
  id_primer_gerente INT NULL,
  CONSTRAINT fk_config_seguridad_primer_gerente FOREIGN KEY (id_primer_gerente)
    REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO configuracion_seguridad (id, id_primer_gerente)
SELECT 1, (SELECT u.id_usuario FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
             WHERE LOWER(r.nombre) = 'gerente' ORDER BY u.creado_en, u.id_usuario LIMIT 1)
ON DUPLICATE KEY UPDATE id_primer_gerente = COALESCE(id_primer_gerente, VALUES(id_primer_gerente));

CREATE TABLE IF NOT EXISTS sigr_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NULL,
  tabla VARCHAR(64) NOT NULL,
  operacion ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
  registro_id JSON NOT NULL,
  antes JSON NULL,
  despues JSON NULL,
  campos_modificados JSON NULL,
  creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  usuario_bd VARCHAR(288) NOT NULL,
  INDEX idx_sigr_auditoria_actor_fecha (actor_id, creado_en),
  INDEX idx_sigr_auditoria_tabla_fecha (tabla, creado_en)
) ENGINE=InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS trg_usuario_00_primer_gerente$$
CREATE TRIGGER trg_usuario_00_primer_gerente AFTER INSERT ON usuario FOR EACH ROW
BEGIN
  UPDATE configuracion_seguridad
     SET id_primer_gerente = NEW.id_usuario
   WHERE id = 1 AND id_primer_gerente IS NULL
     AND NEW.id_rol = (SELECT id_rol FROM rol WHERE LOWER(nombre) = 'gerente' LIMIT 1);
END$$
DROP TRIGGER IF EXISTS trg_usuario_01_primer_gerente_tras_update$$
CREATE TRIGGER trg_usuario_01_primer_gerente_tras_update AFTER UPDATE ON usuario FOR EACH ROW
BEGIN
  UPDATE configuracion_seguridad
     SET id_primer_gerente = NEW.id_usuario
   WHERE id = 1 AND id_primer_gerente IS NULL
     AND NEW.id_rol = (SELECT id_rol FROM rol WHERE LOWER(nombre) = 'gerente' LIMIT 1);
END$$
DROP TRIGGER IF EXISTS trg_usuario_bu_proteger_primer_gerente$$
CREATE TRIGGER trg_usuario_bu_proteger_primer_gerente BEFORE UPDATE ON usuario FOR EACH ROW
BEGIN
  DECLARE v_primer_gerente INT DEFAULT NULL;
  SELECT id_primer_gerente INTO v_primer_gerente FROM configuracion_seguridad WHERE id = 1;
  IF OLD.id_usuario = v_primer_gerente AND (NEW.activo = FALSE OR NEW.id_rol <> OLD.id_rol) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El primer gerente no se puede desactivar ni cambiar de rol';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_usuario_bd_proteger_primer_gerente$$
CREATE TRIGGER trg_usuario_bd_proteger_primer_gerente BEFORE DELETE ON usuario FOR EACH ROW
BEGIN
  DECLARE v_primer_gerente INT DEFAULT NULL;
  SELECT id_primer_gerente INTO v_primer_gerente FROM configuracion_seguridad WHERE id = 1;
  IF OLD.id_usuario = v_primer_gerente THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El primer gerente no se puede eliminar';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_config_seguridad_bu_inmutable$$
CREATE TRIGGER trg_config_seguridad_bu_inmutable BEFORE UPDATE ON configuracion_seguridad FOR EACH ROW
BEGIN
  IF OLD.id_primer_gerente IS NOT NULL AND NOT (NEW.id_primer_gerente <=> OLD.id_primer_gerente) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El primer gerente protegido no se puede reemplazar';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_config_seguridad_bd_inmutable$$
CREATE TRIGGER trg_config_seguridad_bd_inmutable BEFORE DELETE ON configuracion_seguridad FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede eliminar la configuracion de seguridad';
END$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_seguridad_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_seguridad_au`$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_seguridad_ad`$$
CREATE TRIGGER `trg_aud_configuracion_seguridad_ai` AFTER INSERT ON `configuracion_seguridad` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_seguridad', 'INSERT', JSON_OBJECT('id', NEW.`id`),
          JSON_OBJECT('id', NEW.`id`, 'id_primer_gerente', NEW.`id_primer_gerente`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_seguridad_au` AFTER UPDATE ON `configuracion_seguridad` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_seguridad', 'UPDATE', JSON_OBJECT('id', NEW.`id`),
          JSON_OBJECT('id', OLD.`id`, 'id_primer_gerente', OLD.`id_primer_gerente`),
          JSON_OBJECT('id', NEW.`id`, 'id_primer_gerente', NEW.`id_primer_gerente`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_seguridad_ad` AFTER DELETE ON `configuracion_seguridad` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_seguridad', 'DELETE', JSON_OBJECT('id', OLD.`id`),
          JSON_OBJECT('id', OLD.`id`, 'id_primer_gerente', OLD.`id_primer_gerente`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_rol_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_rol_au`$$
DROP TRIGGER IF EXISTS `trg_aud_rol_ad`$$
CREATE TRIGGER `trg_aud_rol_ai` AFTER INSERT ON `rol` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'rol', 'INSERT', JSON_OBJECT('id_rol', NEW.`id_rol`), JSON_OBJECT('id_rol', NEW.`id_rol`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_rol_au` AFTER UPDATE ON `rol` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'rol', 'UPDATE', JSON_OBJECT('id_rol', NEW.`id_rol`), JSON_OBJECT('id_rol', OLD.`id_rol`, 'nombre', OLD.`nombre`), JSON_OBJECT('id_rol', NEW.`id_rol`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_rol_ad` AFTER DELETE ON `rol` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'rol', 'DELETE', JSON_OBJECT('id_rol', OLD.`id_rol`), JSON_OBJECT('id_rol', OLD.`id_rol`, 'nombre', OLD.`nombre`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_usuario_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_usuario_au`$$
DROP TRIGGER IF EXISTS `trg_aud_usuario_ad`$$
CREATE TRIGGER `trg_aud_usuario_ai` AFTER INSERT ON `usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'usuario', 'INSERT', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'id_rol', NEW.`id_rol`, 'nombre', NEW.`nombre`, 'correo', NEW.`correo`, 'activo', NEW.`activo`, 'creado_en', NEW.`creado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_usuario_au` AFTER UPDATE ON `usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'usuario', 'UPDATE', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'id_rol', OLD.`id_rol`, 'nombre', OLD.`nombre`, 'correo', OLD.`correo`, 'activo', OLD.`activo`, 'creado_en', OLD.`creado_en`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'id_rol', NEW.`id_rol`, 'nombre', NEW.`nombre`, 'correo', NEW.`correo`, 'activo', NEW.`activo`, 'creado_en', NEW.`creado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_usuario_ad` AFTER DELETE ON `usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'usuario', 'DELETE', JSON_OBJECT('id_usuario', OLD.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'id_rol', OLD.`id_rol`, 'nombre', OLD.`nombre`, 'correo', OLD.`correo`, 'activo', OLD.`activo`, 'creado_en', OLD.`creado_en`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_credenciales_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_credenciales_au`$$
DROP TRIGGER IF EXISTS `trg_aud_credenciales_ad`$$
CREATE TRIGGER `trg_aud_credenciales_ai` AFTER INSERT ON `credenciales` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'credenciales', 'INSERT', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'nombre_usuario', NEW.`nombre_usuario`, 'ultimo_acceso', NEW.`ultimo_acceso`), USER());
END$$
CREATE TRIGGER `trg_aud_credenciales_au` AFTER UPDATE ON `credenciales` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, campos_modificados, usuario_bd)
  VALUES (
    @sigr_actor_id,
    'credenciales',
    'UPDATE',
    JSON_OBJECT('id_usuario', NEW.`id_usuario`),
    JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'nombre_usuario', OLD.`nombre_usuario`, 'ultimo_acceso', OLD.`ultimo_acceso`),
    JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'nombre_usuario', NEW.`nombre_usuario`, 'ultimo_acceso', NEW.`ultimo_acceso`),
    JSON_MERGE_PRESERVE(
      JSON_ARRAY(),
      IF(NOT (OLD.`id_usuario` <=> NEW.`id_usuario`), JSON_ARRAY('id_usuario'), JSON_ARRAY()),
      IF(NOT (OLD.`nombre_usuario` <=> NEW.`nombre_usuario`), JSON_ARRAY('nombre_usuario'), JSON_ARRAY()),
      IF(NOT (OLD.`password_hash` <=> NEW.`password_hash`), JSON_ARRAY('password_hash'), JSON_ARRAY()),
      IF(NOT (OLD.`ultimo_acceso` <=> NEW.`ultimo_acceso`), JSON_ARRAY('ultimo_acceso'), JSON_ARRAY())
    ),
    USER()
  );
END$$
CREATE TRIGGER `trg_aud_credenciales_ad` AFTER DELETE ON `credenciales` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'credenciales', 'DELETE', JSON_OBJECT('id_usuario', OLD.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'nombre_usuario', OLD.`nombre_usuario`, 'ultimo_acceso', OLD.`ultimo_acceso`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_perfil_usuario_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_perfil_usuario_au`$$
DROP TRIGGER IF EXISTS `trg_aud_perfil_usuario_ad`$$
CREATE TRIGGER `trg_aud_perfil_usuario_ai` AFTER INSERT ON `perfil_usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'perfil_usuario', 'INSERT', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'telefono', NEW.`telefono`, 'direccion', NEW.`direccion`), USER());
END$$
CREATE TRIGGER `trg_aud_perfil_usuario_au` AFTER UPDATE ON `perfil_usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'perfil_usuario', 'UPDATE', JSON_OBJECT('id_usuario', NEW.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'telefono', OLD.`telefono`, 'direccion', OLD.`direccion`), JSON_OBJECT('id_usuario', NEW.`id_usuario`, 'telefono', NEW.`telefono`, 'direccion', NEW.`direccion`), USER());
END$$
CREATE TRIGGER `trg_aud_perfil_usuario_ad` AFTER DELETE ON `perfil_usuario` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'perfil_usuario', 'DELETE', JSON_OBJECT('id_usuario', OLD.`id_usuario`), JSON_OBJECT('id_usuario', OLD.`id_usuario`, 'telefono', OLD.`telefono`, 'direccion', OLD.`direccion`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_au`$$
DROP TRIGGER IF EXISTS `trg_aud_cliente_ad`$$
CREATE TRIGGER `trg_aud_cliente_ai` AFTER INSERT ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'INSERT', JSON_OBJECT('id_cliente', NEW.`id_cliente`), JSON_OBJECT('id_cliente', NEW.`id_cliente`, 'nombre', NEW.`nombre`, 'telefono', NEW.`telefono`, 'correo', NEW.`correo`), USER());
END$$
CREATE TRIGGER `trg_aud_cliente_au` AFTER UPDATE ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'UPDATE', JSON_OBJECT('id_cliente', NEW.`id_cliente`), JSON_OBJECT('id_cliente', OLD.`id_cliente`, 'nombre', OLD.`nombre`, 'telefono', OLD.`telefono`, 'correo', OLD.`correo`), JSON_OBJECT('id_cliente', NEW.`id_cliente`, 'nombre', NEW.`nombre`, 'telefono', NEW.`telefono`, 'correo', NEW.`correo`), USER());
END$$
CREATE TRIGGER `trg_aud_cliente_ad` AFTER DELETE ON `cliente` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'cliente', 'DELETE', JSON_OBJECT('id_cliente', OLD.`id_cliente`), JSON_OBJECT('id_cliente', OLD.`id_cliente`, 'nombre', OLD.`nombre`, 'telefono', OLD.`telefono`, 'correo', OLD.`correo`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_seccion_ad`$$
CREATE TRIGGER `trg_aud_seccion_ai` AFTER INSERT ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'INSERT', JSON_OBJECT('nombre', NEW.`nombre`), JSON_OBJECT('nombre', NEW.`nombre`, 'activa', NEW.`activa`), USER());
END$$
CREATE TRIGGER `trg_aud_seccion_au` AFTER UPDATE ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'UPDATE', JSON_OBJECT('nombre', NEW.`nombre`), JSON_OBJECT('nombre', OLD.`nombre`, 'activa', OLD.`activa`), JSON_OBJECT('nombre', NEW.`nombre`, 'activa', NEW.`activa`), USER());
END$$
CREATE TRIGGER `trg_aud_seccion_ad` AFTER DELETE ON `seccion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'seccion', 'DELETE', JSON_OBJECT('nombre', OLD.`nombre`), JSON_OBJECT('nombre', OLD.`nombre`, 'activa', OLD.`activa`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_mesa_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_mesa_au`$$
DROP TRIGGER IF EXISTS `trg_aud_mesa_ad`$$
CREATE TRIGGER `trg_aud_mesa_ai` AFTER INSERT ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'INSERT', JSON_OBJECT('id_mesa', NEW.`id_mesa`), JSON_OBJECT('id_mesa', NEW.`id_mesa`, 'numero', NEW.`numero`, 'capacidad', NEW.`capacidad`, 'zona', NEW.`zona`, 'planta_baja', NEW.`planta_baja`, 'espacio_carriola', NEW.`espacio_carriola`, 'sin_escaleras', NEW.`sin_escaleras`, 'activa', NEW.`activa`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_mesa_au` AFTER UPDATE ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'UPDATE', JSON_OBJECT('id_mesa', NEW.`id_mesa`), JSON_OBJECT('id_mesa', OLD.`id_mesa`, 'numero', OLD.`numero`, 'capacidad', OLD.`capacidad`, 'zona', OLD.`zona`, 'planta_baja', OLD.`planta_baja`, 'espacio_carriola', OLD.`espacio_carriola`, 'sin_escaleras', OLD.`sin_escaleras`, 'activa', OLD.`activa`, 'estado', OLD.`estado`), JSON_OBJECT('id_mesa', NEW.`id_mesa`, 'numero', NEW.`numero`, 'capacidad', NEW.`capacidad`, 'zona', NEW.`zona`, 'planta_baja', NEW.`planta_baja`, 'espacio_carriola', NEW.`espacio_carriola`, 'sin_escaleras', NEW.`sin_escaleras`, 'activa', NEW.`activa`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_mesa_ad` AFTER DELETE ON `mesa` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'mesa', 'DELETE', JSON_OBJECT('id_mesa', OLD.`id_mesa`), JSON_OBJECT('id_mesa', OLD.`id_mesa`, 'numero', OLD.`numero`, 'capacidad', OLD.`capacidad`, 'zona', OLD.`zona`, 'planta_baja', OLD.`planta_baja`, 'espacio_carriola', OLD.`espacio_carriola`, 'sin_escaleras', OLD.`sin_escaleras`, 'activa', OLD.`activa`, 'estado', OLD.`estado`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_menu_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_menu_au`$$
DROP TRIGGER IF EXISTS `trg_aud_categoria_menu_ad`$$
CREATE TRIGGER `trg_aud_categoria_menu_ai` AFTER INSERT ON `categoria_menu` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_menu', 'INSERT', JSON_OBJECT('id_categoria', NEW.`id_categoria`), JSON_OBJECT('id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_menu_au` AFTER UPDATE ON `categoria_menu` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_menu', 'UPDATE', JSON_OBJECT('id_categoria', NEW.`id_categoria`), JSON_OBJECT('id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`), JSON_OBJECT('id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_categoria_menu_ad` AFTER DELETE ON `categoria_menu` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'categoria_menu', 'DELETE', JSON_OBJECT('id_categoria', OLD.`id_categoria`), JSON_OBJECT('id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_producto_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_producto_au`$$
DROP TRIGGER IF EXISTS `trg_aud_producto_ad`$$
CREATE TRIGGER `trg_aud_producto_ai` AFTER INSERT ON `producto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'producto', 'INSERT', JSON_OBJECT('id_producto', NEW.`id_producto`), JSON_OBJECT('id_producto', NEW.`id_producto`, 'id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`, 'presentacion', NEW.`presentacion`, 'descripcion', NEW.`descripcion`, 'precio', NEW.`precio`, 'disponible', NEW.`disponible`, 'controla_existencia', NEW.`controla_existencia`), USER());
END$$
CREATE TRIGGER `trg_aud_producto_au` AFTER UPDATE ON `producto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'producto', 'UPDATE', JSON_OBJECT('id_producto', NEW.`id_producto`), JSON_OBJECT('id_producto', OLD.`id_producto`, 'id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`, 'presentacion', OLD.`presentacion`, 'descripcion', OLD.`descripcion`, 'precio', OLD.`precio`, 'disponible', OLD.`disponible`, 'controla_existencia', OLD.`controla_existencia`), JSON_OBJECT('id_producto', NEW.`id_producto`, 'id_categoria', NEW.`id_categoria`, 'nombre', NEW.`nombre`, 'presentacion', NEW.`presentacion`, 'descripcion', NEW.`descripcion`, 'precio', NEW.`precio`, 'disponible', NEW.`disponible`, 'controla_existencia', NEW.`controla_existencia`), USER());
END$$
CREATE TRIGGER `trg_aud_producto_ad` AFTER DELETE ON `producto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'producto', 'DELETE', JSON_OBJECT('id_producto', OLD.`id_producto`), JSON_OBJECT('id_producto', OLD.`id_producto`, 'id_categoria', OLD.`id_categoria`, 'nombre', OLD.`nombre`, 'presentacion', OLD.`presentacion`, 'descripcion', OLD.`descripcion`, 'precio', OLD.`precio`, 'disponible', OLD.`disponible`, 'controla_existencia', OLD.`controla_existencia`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_disponibilidadproducto_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_disponibilidadproducto_au`$$
DROP TRIGGER IF EXISTS `trg_aud_disponibilidadproducto_ad`$$
CREATE TRIGGER `trg_aud_disponibilidadproducto_ai` AFTER INSERT ON `disponibilidadProducto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'disponibilidadProducto', 'INSERT', JSON_OBJECT('id_inventario', NEW.`id_inventario`), JSON_OBJECT('id_inventario', NEW.`id_inventario`, 'id_producto', NEW.`id_producto`, 'existencia', NEW.`existencia`, 'stock_minimo', NEW.`stock_minimo`), USER());
END$$
CREATE TRIGGER `trg_aud_disponibilidadproducto_au` AFTER UPDATE ON `disponibilidadProducto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'disponibilidadProducto', 'UPDATE', JSON_OBJECT('id_inventario', NEW.`id_inventario`), JSON_OBJECT('id_inventario', OLD.`id_inventario`, 'id_producto', OLD.`id_producto`, 'existencia', OLD.`existencia`, 'stock_minimo', OLD.`stock_minimo`), JSON_OBJECT('id_inventario', NEW.`id_inventario`, 'id_producto', NEW.`id_producto`, 'existencia', NEW.`existencia`, 'stock_minimo', NEW.`stock_minimo`), USER());
END$$
CREATE TRIGGER `trg_aud_disponibilidadproducto_ad` AFTER DELETE ON `disponibilidadProducto` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'disponibilidadProducto', 'DELETE', JSON_OBJECT('id_inventario', OLD.`id_inventario`), JSON_OBJECT('id_inventario', OLD.`id_inventario`, 'id_producto', OLD.`id_producto`, 'existencia', OLD.`existencia`, 'stock_minimo', OLD.`stock_minimo`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_reservacion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_reservacion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_reservacion_ad`$$
CREATE TRIGGER `trg_aud_reservacion_ai` AFTER INSERT ON `reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'reservacion', 'INSERT', JSON_OBJECT('id_reservacion', NEW.`id_reservacion`), JSON_OBJECT('id_reservacion', NEW.`id_reservacion`, 'id_cliente', NEW.`id_cliente`, 'id_mesa', NEW.`id_mesa`, 'fecha_hora', NEW.`fecha_hora`, 'personas', NEW.`personas`, 'estado', NEW.`estado`, 'llegada_en', NEW.`llegada_en`), USER());
END$$
CREATE TRIGGER `trg_aud_reservacion_au` AFTER UPDATE ON `reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'reservacion', 'UPDATE', JSON_OBJECT('id_reservacion', NEW.`id_reservacion`), JSON_OBJECT('id_reservacion', OLD.`id_reservacion`, 'id_cliente', OLD.`id_cliente`, 'id_mesa', OLD.`id_mesa`, 'fecha_hora', OLD.`fecha_hora`, 'personas', OLD.`personas`, 'estado', OLD.`estado`, 'llegada_en', OLD.`llegada_en`), JSON_OBJECT('id_reservacion', NEW.`id_reservacion`, 'id_cliente', NEW.`id_cliente`, 'id_mesa', NEW.`id_mesa`, 'fecha_hora', NEW.`fecha_hora`, 'personas', NEW.`personas`, 'estado', NEW.`estado`, 'llegada_en', NEW.`llegada_en`), USER());
END$$
CREATE TRIGGER `trg_aud_reservacion_ad` AFTER DELETE ON `reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'reservacion', 'DELETE', JSON_OBJECT('id_reservacion', OLD.`id_reservacion`), JSON_OBJECT('id_reservacion', OLD.`id_reservacion`, 'id_cliente', OLD.`id_cliente`, 'id_mesa', OLD.`id_mesa`, 'fecha_hora', OLD.`fecha_hora`, 'personas', OLD.`personas`, 'estado', OLD.`estado`, 'llegada_en', OLD.`llegada_en`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_reservacion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_reservacion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_configuracion_reservacion_ad`$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_ai` AFTER INSERT ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'INSERT', JSON_OBJECT('id', NEW.`id`), JSON_OBJECT('id', NEW.`id`, 'tolerancia_minutos', NEW.`tolerancia_minutos`, 'recordatorio_minutos', NEW.`recordatorio_minutos`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_au` AFTER UPDATE ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'UPDATE', JSON_OBJECT('id', NEW.`id`), JSON_OBJECT('id', OLD.`id`, 'tolerancia_minutos', OLD.`tolerancia_minutos`, 'recordatorio_minutos', OLD.`recordatorio_minutos`, 'actualizado_en', OLD.`actualizado_en`), JSON_OBJECT('id', NEW.`id`, 'tolerancia_minutos', NEW.`tolerancia_minutos`, 'recordatorio_minutos', NEW.`recordatorio_minutos`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_ad` AFTER DELETE ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'DELETE', JSON_OBJECT('id', OLD.`id`), JSON_OBJECT('id', OLD.`id`, 'tolerancia_minutos', OLD.`tolerancia_minutos`, 'recordatorio_minutos', OLD.`recordatorio_minutos`, 'actualizado_en', OLD.`actualizado_en`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_notificacion_reservacion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_notificacion_reservacion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_notificacion_reservacion_ad`$$
CREATE TRIGGER `trg_aud_notificacion_reservacion_ai` AFTER INSERT ON `notificacion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'notificacion_reservacion', 'INSERT', JSON_OBJECT('id_notificacion', NEW.`id_notificacion`), JSON_OBJECT('id_notificacion', NEW.`id_notificacion`, 'id_reservacion', NEW.`id_reservacion`, 'tipo', NEW.`tipo`, 'evento', NEW.`evento`, 'destinatario', NEW.`destinatario`, 'estado', NEW.`estado`, 'intentos', NEW.`intentos`, 'ultimo_error', NEW.`ultimo_error`, 'creada_en', NEW.`creada_en`, 'enviada_en', NEW.`enviada_en`), USER());
END$$
CREATE TRIGGER `trg_aud_notificacion_reservacion_au` AFTER UPDATE ON `notificacion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'notificacion_reservacion', 'UPDATE', JSON_OBJECT('id_notificacion', NEW.`id_notificacion`), JSON_OBJECT('id_notificacion', OLD.`id_notificacion`, 'id_reservacion', OLD.`id_reservacion`, 'tipo', OLD.`tipo`, 'evento', OLD.`evento`, 'destinatario', OLD.`destinatario`, 'estado', OLD.`estado`, 'intentos', OLD.`intentos`, 'ultimo_error', OLD.`ultimo_error`, 'creada_en', OLD.`creada_en`, 'enviada_en', OLD.`enviada_en`), JSON_OBJECT('id_notificacion', NEW.`id_notificacion`, 'id_reservacion', NEW.`id_reservacion`, 'tipo', NEW.`tipo`, 'evento', NEW.`evento`, 'destinatario', NEW.`destinatario`, 'estado', NEW.`estado`, 'intentos', NEW.`intentos`, 'ultimo_error', NEW.`ultimo_error`, 'creada_en', NEW.`creada_en`, 'enviada_en', NEW.`enviada_en`), USER());
END$$
CREATE TRIGGER `trg_aud_notificacion_reservacion_ad` AFTER DELETE ON `notificacion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'notificacion_reservacion', 'DELETE', JSON_OBJECT('id_notificacion', OLD.`id_notificacion`), JSON_OBJECT('id_notificacion', OLD.`id_notificacion`, 'id_reservacion', OLD.`id_reservacion`, 'tipo', OLD.`tipo`, 'evento', OLD.`evento`, 'destinatario', OLD.`destinatario`, 'estado', OLD.`estado`, 'intentos', OLD.`intentos`, 'ultimo_error', OLD.`ultimo_error`, 'creada_en', OLD.`creada_en`, 'enviada_en', OLD.`enviada_en`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_lista_espera_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_lista_espera_au`$$
DROP TRIGGER IF EXISTS `trg_aud_lista_espera_ad`$$
CREATE TRIGGER `trg_aud_lista_espera_ai` AFTER INSERT ON `lista_espera` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'lista_espera', 'INSERT', JSON_OBJECT('id_espera', NEW.`id_espera`), JSON_OBJECT('id_espera', NEW.`id_espera`, 'id_cliente', NEW.`id_cliente`, 'personas', NEW.`personas`, 'registrado_en', NEW.`registrado_en`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_lista_espera_au` AFTER UPDATE ON `lista_espera` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'lista_espera', 'UPDATE', JSON_OBJECT('id_espera', NEW.`id_espera`), JSON_OBJECT('id_espera', OLD.`id_espera`, 'id_cliente', OLD.`id_cliente`, 'personas', OLD.`personas`, 'registrado_en', OLD.`registrado_en`, 'estado', OLD.`estado`), JSON_OBJECT('id_espera', NEW.`id_espera`, 'id_cliente', NEW.`id_cliente`, 'personas', NEW.`personas`, 'registrado_en', NEW.`registrado_en`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_lista_espera_ad` AFTER DELETE ON `lista_espera` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'lista_espera', 'DELETE', JSON_OBJECT('id_espera', OLD.`id_espera`), JSON_OBJECT('id_espera', OLD.`id_espera`, 'id_cliente', OLD.`id_cliente`, 'personas', OLD.`personas`, 'registrado_en', OLD.`registrado_en`, 'estado', OLD.`estado`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_au`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ad`$$
CREATE TRIGGER `trg_aud_cuenta_ai` AFTER INSERT ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'INSERT', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_au` AFTER UPDATE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'UPDATE', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_ad` AFTER DELETE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'DELETE', JSON_OBJECT('id_cuenta', OLD.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_estado_pedido_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_estado_pedido_au`$$
DROP TRIGGER IF EXISTS `trg_aud_estado_pedido_ad`$$
CREATE TRIGGER `trg_aud_estado_pedido_ai` AFTER INSERT ON `estado_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'estado_pedido', 'INSERT', JSON_OBJECT('id_estado', NEW.`id_estado`), JSON_OBJECT('id_estado', NEW.`id_estado`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_estado_pedido_au` AFTER UPDATE ON `estado_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'estado_pedido', 'UPDATE', JSON_OBJECT('id_estado', NEW.`id_estado`), JSON_OBJECT('id_estado', OLD.`id_estado`, 'nombre', OLD.`nombre`), JSON_OBJECT('id_estado', NEW.`id_estado`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_estado_pedido_ad` AFTER DELETE ON `estado_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'estado_pedido', 'DELETE', JSON_OBJECT('id_estado', OLD.`id_estado`), JSON_OBJECT('id_estado', OLD.`id_estado`, 'nombre', OLD.`nombre`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_motivo_cancelacion_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_motivo_cancelacion_au`$$
DROP TRIGGER IF EXISTS `trg_aud_motivo_cancelacion_ad`$$
CREATE TRIGGER `trg_aud_motivo_cancelacion_ai` AFTER INSERT ON `motivo_cancelacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'motivo_cancelacion', 'INSERT', JSON_OBJECT('id_motivo', NEW.`id_motivo`), JSON_OBJECT('id_motivo', NEW.`id_motivo`, 'descripcion', NEW.`descripcion`), USER());
END$$
CREATE TRIGGER `trg_aud_motivo_cancelacion_au` AFTER UPDATE ON `motivo_cancelacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'motivo_cancelacion', 'UPDATE', JSON_OBJECT('id_motivo', NEW.`id_motivo`), JSON_OBJECT('id_motivo', OLD.`id_motivo`, 'descripcion', OLD.`descripcion`), JSON_OBJECT('id_motivo', NEW.`id_motivo`, 'descripcion', NEW.`descripcion`), USER());
END$$
CREATE TRIGGER `trg_aud_motivo_cancelacion_ad` AFTER DELETE ON `motivo_cancelacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'motivo_cancelacion', 'DELETE', JSON_OBJECT('id_motivo', OLD.`id_motivo`), JSON_OBJECT('id_motivo', OLD.`id_motivo`, 'descripcion', OLD.`descripcion`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_pedido_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_pedido_au`$$
DROP TRIGGER IF EXISTS `trg_aud_pedido_ad`$$
CREATE TRIGGER `trg_aud_pedido_ai` AFTER INSERT ON `pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'pedido', 'INSERT', JSON_OBJECT('id_pedido', NEW.`id_pedido`), JSON_OBJECT('id_pedido', NEW.`id_pedido`, 'id_cuenta', NEW.`id_cuenta`, 'id_mesero', NEW.`id_mesero`, 'id_estado', NEW.`id_estado`, 'id_motivo', NEW.`id_motivo`, 'fecha_hora', NEW.`fecha_hora`, 'observaciones', NEW.`observaciones`), USER());
END$$
CREATE TRIGGER `trg_aud_pedido_au` AFTER UPDATE ON `pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'pedido', 'UPDATE', JSON_OBJECT('id_pedido', NEW.`id_pedido`), JSON_OBJECT('id_pedido', OLD.`id_pedido`, 'id_cuenta', OLD.`id_cuenta`, 'id_mesero', OLD.`id_mesero`, 'id_estado', OLD.`id_estado`, 'id_motivo', OLD.`id_motivo`, 'fecha_hora', OLD.`fecha_hora`, 'observaciones', OLD.`observaciones`), JSON_OBJECT('id_pedido', NEW.`id_pedido`, 'id_cuenta', NEW.`id_cuenta`, 'id_mesero', NEW.`id_mesero`, 'id_estado', NEW.`id_estado`, 'id_motivo', NEW.`id_motivo`, 'fecha_hora', NEW.`fecha_hora`, 'observaciones', NEW.`observaciones`), USER());
END$$
CREATE TRIGGER `trg_aud_pedido_ad` AFTER DELETE ON `pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'pedido', 'DELETE', JSON_OBJECT('id_pedido', OLD.`id_pedido`), JSON_OBJECT('id_pedido', OLD.`id_pedido`, 'id_cuenta', OLD.`id_cuenta`, 'id_mesero', OLD.`id_mesero`, 'id_estado', OLD.`id_estado`, 'id_motivo', OLD.`id_motivo`, 'fecha_hora', OLD.`fecha_hora`, 'observaciones', OLD.`observaciones`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_detalle_pedido_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_detalle_pedido_au`$$
DROP TRIGGER IF EXISTS `trg_aud_detalle_pedido_ad`$$
CREATE TRIGGER `trg_aud_detalle_pedido_ai` AFTER INSERT ON `detalle_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'detalle_pedido', 'INSERT', JSON_OBJECT('id_detalle', NEW.`id_detalle`), JSON_OBJECT('id_detalle', NEW.`id_detalle`, 'id_pedido', NEW.`id_pedido`, 'id_producto', NEW.`id_producto`, 'cantidad', NEW.`cantidad`, 'precio_unitario', NEW.`precio_unitario`, 'indicaciones', NEW.`indicaciones`), USER());
END$$
CREATE TRIGGER `trg_aud_detalle_pedido_au` AFTER UPDATE ON `detalle_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'detalle_pedido', 'UPDATE', JSON_OBJECT('id_detalle', NEW.`id_detalle`), JSON_OBJECT('id_detalle', OLD.`id_detalle`, 'id_pedido', OLD.`id_pedido`, 'id_producto', OLD.`id_producto`, 'cantidad', OLD.`cantidad`, 'precio_unitario', OLD.`precio_unitario`, 'indicaciones', OLD.`indicaciones`), JSON_OBJECT('id_detalle', NEW.`id_detalle`, 'id_pedido', NEW.`id_pedido`, 'id_producto', NEW.`id_producto`, 'cantidad', NEW.`cantidad`, 'precio_unitario', NEW.`precio_unitario`, 'indicaciones', NEW.`indicaciones`), USER());
END$$
CREATE TRIGGER `trg_aud_detalle_pedido_ad` AFTER DELETE ON `detalle_pedido` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'detalle_pedido', 'DELETE', JSON_OBJECT('id_detalle', OLD.`id_detalle`), JSON_OBJECT('id_detalle', OLD.`id_detalle`, 'id_pedido', OLD.`id_pedido`, 'id_producto', OLD.`id_producto`, 'cantidad', OLD.`cantidad`, 'precio_unitario', OLD.`precio_unitario`, 'indicaciones', OLD.`indicaciones`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_au`$$
DROP TRIGGER IF EXISTS `trg_aud_corte_caja_ad`$$
CREATE TRIGGER `trg_aud_corte_caja_ai` AFTER INSERT ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'corte_caja', 'INSERT', JSON_OBJECT('id_corte', NEW.`id_corte`), JSON_OBJECT('id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'inicio', NEW.`inicio`, 'fin', NEW.`fin`, 'total_reportado', NEW.`total_reportado`), USER());
END$$
CREATE TRIGGER `trg_aud_corte_caja_au` AFTER UPDATE ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'corte_caja', 'UPDATE', JSON_OBJECT('id_corte', NEW.`id_corte`), JSON_OBJECT('id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'inicio', OLD.`inicio`, 'fin', OLD.`fin`, 'total_reportado', OLD.`total_reportado`), JSON_OBJECT('id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'inicio', NEW.`inicio`, 'fin', NEW.`fin`, 'total_reportado', NEW.`total_reportado`), USER());
END$$
CREATE TRIGGER `trg_aud_corte_caja_ad` AFTER DELETE ON `corte_caja` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'corte_caja', 'DELETE', JSON_OBJECT('id_corte', OLD.`id_corte`), JSON_OBJECT('id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'inicio', OLD.`inicio`, 'fin', OLD.`fin`, 'total_reportado', OLD.`total_reportado`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_venta_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_venta_au`$$
DROP TRIGGER IF EXISTS `trg_aud_venta_ad`$$
CREATE TRIGGER `trg_aud_venta_ai` AFTER INSERT ON `venta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'venta', 'INSERT', JSON_OBJECT('id_venta', NEW.`id_venta`), JSON_OBJECT('id_venta', NEW.`id_venta`, 'id_cuenta', NEW.`id_cuenta`, 'id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'fecha_hora', NEW.`fecha_hora`, 'total', NEW.`total`), USER());
END$$
CREATE TRIGGER `trg_aud_venta_au` AFTER UPDATE ON `venta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'venta', 'UPDATE', JSON_OBJECT('id_venta', NEW.`id_venta`), JSON_OBJECT('id_venta', OLD.`id_venta`, 'id_cuenta', OLD.`id_cuenta`, 'id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'fecha_hora', OLD.`fecha_hora`, 'total', OLD.`total`), JSON_OBJECT('id_venta', NEW.`id_venta`, 'id_cuenta', NEW.`id_cuenta`, 'id_corte', NEW.`id_corte`, 'id_cajero', NEW.`id_cajero`, 'fecha_hora', NEW.`fecha_hora`, 'total', NEW.`total`), USER());
END$$
CREATE TRIGGER `trg_aud_venta_ad` AFTER DELETE ON `venta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'venta', 'DELETE', JSON_OBJECT('id_venta', OLD.`id_venta`), JSON_OBJECT('id_venta', OLD.`id_venta`, 'id_cuenta', OLD.`id_cuenta`, 'id_corte', OLD.`id_corte`, 'id_cajero', OLD.`id_cajero`, 'fecha_hora', OLD.`fecha_hora`, 'total', OLD.`total`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_metodo_pago_ad`$$
CREATE TRIGGER `trg_aud_metodo_pago_ai` AFTER INSERT ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'INSERT', JSON_OBJECT('id_metodo', NEW.`id_metodo`), JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_au` AFTER UPDATE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'UPDATE', JSON_OBJECT('id_metodo', NEW.`id_metodo`), JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`), JSON_OBJECT('id_metodo', NEW.`id_metodo`, 'nombre', NEW.`nombre`), USER());
END$$
CREATE TRIGGER `trg_aud_metodo_pago_ad` AFTER DELETE ON `metodo_pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'metodo_pago', 'DELETE', JSON_OBJECT('id_metodo', OLD.`id_metodo`), JSON_OBJECT('id_metodo', OLD.`id_metodo`, 'nombre', OLD.`nombre`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_pago_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_pago_au`$$
DROP TRIGGER IF EXISTS `trg_aud_pago_ad`$$
CREATE TRIGGER `trg_aud_pago_ai` AFTER INSERT ON `pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'pago', 'INSERT', JSON_OBJECT('id_pago', NEW.`id_pago`), JSON_OBJECT('id_pago', NEW.`id_pago`, 'id_venta', NEW.`id_venta`, 'id_metodo', NEW.`id_metodo`, 'monto', NEW.`monto`, 'monto_recibido', NEW.`monto_recibido`, 'cambio', NEW.`cambio`, 'pagado_en', NEW.`pagado_en`, 'referencia', NEW.`referencia`), USER());
END$$
CREATE TRIGGER `trg_aud_pago_au` AFTER UPDATE ON `pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'pago', 'UPDATE', JSON_OBJECT('id_pago', NEW.`id_pago`), JSON_OBJECT('id_pago', OLD.`id_pago`, 'id_venta', OLD.`id_venta`, 'id_metodo', OLD.`id_metodo`, 'monto', OLD.`monto`, 'monto_recibido', OLD.`monto_recibido`, 'cambio', OLD.`cambio`, 'pagado_en', OLD.`pagado_en`, 'referencia', OLD.`referencia`), JSON_OBJECT('id_pago', NEW.`id_pago`, 'id_venta', NEW.`id_venta`, 'id_metodo', NEW.`id_metodo`, 'monto', NEW.`monto`, 'monto_recibido', NEW.`monto_recibido`, 'cambio', NEW.`cambio`, 'pagado_en', NEW.`pagado_en`, 'referencia', NEW.`referencia`), USER());
END$$
CREATE TRIGGER `trg_aud_pago_ad` AFTER DELETE ON `pago` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'pago', 'DELETE', JSON_OBJECT('id_pago', OLD.`id_pago`), JSON_OBJECT('id_pago', OLD.`id_pago`, 'id_venta', OLD.`id_venta`, 'id_metodo', OLD.`id_metodo`, 'monto', OLD.`monto`, 'monto_recibido', OLD.`monto_recibido`, 'cambio', OLD.`cambio`, 'pagado_en', OLD.`pagado_en`, 'referencia', OLD.`referencia`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_datos_fiscales_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_datos_fiscales_au`$$
DROP TRIGGER IF EXISTS `trg_aud_datos_fiscales_ad`$$
CREATE TRIGGER `trg_aud_datos_fiscales_ai` AFTER INSERT ON `datos_fiscales` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'datos_fiscales', 'INSERT', JSON_OBJECT('id_datos_fiscales', NEW.`id_datos_fiscales`), JSON_OBJECT('id_datos_fiscales', NEW.`id_datos_fiscales`, 'id_cliente', NEW.`id_cliente`, 'rfc', NEW.`rfc`, 'razon_social', NEW.`razon_social`, 'regimen_fiscal', NEW.`regimen_fiscal`, 'codigo_postal', NEW.`codigo_postal`), USER());
END$$
CREATE TRIGGER `trg_aud_datos_fiscales_au` AFTER UPDATE ON `datos_fiscales` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'datos_fiscales', 'UPDATE', JSON_OBJECT('id_datos_fiscales', NEW.`id_datos_fiscales`), JSON_OBJECT('id_datos_fiscales', OLD.`id_datos_fiscales`, 'id_cliente', OLD.`id_cliente`, 'rfc', OLD.`rfc`, 'razon_social', OLD.`razon_social`, 'regimen_fiscal', OLD.`regimen_fiscal`, 'codigo_postal', OLD.`codigo_postal`), JSON_OBJECT('id_datos_fiscales', NEW.`id_datos_fiscales`, 'id_cliente', NEW.`id_cliente`, 'rfc', NEW.`rfc`, 'razon_social', NEW.`razon_social`, 'regimen_fiscal', NEW.`regimen_fiscal`, 'codigo_postal', NEW.`codigo_postal`), USER());
END$$
CREATE TRIGGER `trg_aud_datos_fiscales_ad` AFTER DELETE ON `datos_fiscales` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'datos_fiscales', 'DELETE', JSON_OBJECT('id_datos_fiscales', OLD.`id_datos_fiscales`), JSON_OBJECT('id_datos_fiscales', OLD.`id_datos_fiscales`, 'id_cliente', OLD.`id_cliente`, 'rfc', OLD.`rfc`, 'razon_social', OLD.`razon_social`, 'regimen_fiscal', OLD.`regimen_fiscal`, 'codigo_postal', OLD.`codigo_postal`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_factura_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_factura_au`$$
DROP TRIGGER IF EXISTS `trg_aud_factura_ad`$$
CREATE TRIGGER `trg_aud_factura_ai` AFTER INSERT ON `factura` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'factura', 'INSERT', JSON_OBJECT('id_factura', NEW.`id_factura`), JSON_OBJECT('id_factura', NEW.`id_factura`, 'id_venta', NEW.`id_venta`, 'id_datos_fiscales', NEW.`id_datos_fiscales`, 'folio', NEW.`folio`, 'fecha_emision', NEW.`fecha_emision`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_factura_au` AFTER UPDATE ON `factura` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'factura', 'UPDATE', JSON_OBJECT('id_factura', NEW.`id_factura`), JSON_OBJECT('id_factura', OLD.`id_factura`, 'id_venta', OLD.`id_venta`, 'id_datos_fiscales', OLD.`id_datos_fiscales`, 'folio', OLD.`folio`, 'fecha_emision', OLD.`fecha_emision`, 'estado', OLD.`estado`), JSON_OBJECT('id_factura', NEW.`id_factura`, 'id_venta', NEW.`id_venta`, 'id_datos_fiscales', NEW.`id_datos_fiscales`, 'folio', NEW.`folio`, 'fecha_emision', NEW.`fecha_emision`, 'estado', NEW.`estado`), USER());
END$$
CREATE TRIGGER `trg_aud_factura_ad` AFTER DELETE ON `factura` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'factura', 'DELETE', JSON_OBJECT('id_factura', OLD.`id_factura`), JSON_OBJECT('id_factura', OLD.`id_factura`, 'id_venta', OLD.`id_venta`, 'id_datos_fiscales', OLD.`id_datos_fiscales`, 'folio', OLD.`folio`, 'fecha_emision', OLD.`fecha_emision`, 'estado', OLD.`estado`), USER());
END$$
DROP TRIGGER IF EXISTS `trg_aud_idempotencia_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_idempotencia_au`$$
DROP TRIGGER IF EXISTS `trg_aud_idempotencia_ad`$$
CREATE TRIGGER `trg_aud_idempotencia_ai` AFTER INSERT ON `idempotencia` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'idempotencia', 'INSERT', JSON_OBJECT('clave', NEW.`clave`, 'id_usuario', NEW.`id_usuario`), JSON_OBJECT('clave', NEW.`clave`, 'id_usuario', NEW.`id_usuario`, 'ruta', NEW.`ruta`, 'estado_http', NEW.`estado_http`, 'creado_en', NEW.`creado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_idempotencia_au` AFTER UPDATE ON `idempotencia` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'idempotencia', 'UPDATE', JSON_OBJECT('clave', NEW.`clave`, 'id_usuario', NEW.`id_usuario`), JSON_OBJECT('clave', OLD.`clave`, 'id_usuario', OLD.`id_usuario`, 'ruta', OLD.`ruta`, 'estado_http', OLD.`estado_http`, 'creado_en', OLD.`creado_en`), JSON_OBJECT('clave', NEW.`clave`, 'id_usuario', NEW.`id_usuario`, 'ruta', NEW.`ruta`, 'estado_http', NEW.`estado_http`, 'creado_en', NEW.`creado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_idempotencia_ad` AFTER DELETE ON `idempotencia` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'idempotencia', 'DELETE', JSON_OBJECT('clave', OLD.`clave`, 'id_usuario', OLD.`id_usuario`), JSON_OBJECT('clave', OLD.`clave`, 'id_usuario', OLD.`id_usuario`, 'ruta', OLD.`ruta`, 'estado_http', OLD.`estado_http`, 'creado_en', OLD.`creado_en`), USER());
END$$
DROP TRIGGER IF EXISTS trg_sigr_auditoria_bu_inmutable$$
CREATE TRIGGER trg_sigr_auditoria_bu_inmutable BEFORE UPDATE ON sigr_auditoria FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de auditoria es inmutable';
END$$
DROP TRIGGER IF EXISTS trg_sigr_auditoria_bd_inmutable$$
CREATE TRIGGER trg_sigr_auditoria_bd_inmutable BEFORE DELETE ON sigr_auditoria FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de auditoria es inmutable';
END$$
DROP PROCEDURE IF EXISTS sp_consultar_auditoria$$
CREATE PROCEDURE sp_consultar_auditoria(
  IN p_actor_id INT, IN p_tabla VARCHAR(64), IN p_desde DATETIME, IN p_hasta DATETIME, IN p_limite INT
)
SQL SECURITY INVOKER
READS SQL DATA
BEGIN
  DECLARE v_limite INT DEFAULT 100;
  SET v_limite = LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500);
  SELECT id, actor_id, tabla, operacion, registro_id, antes, despues, campos_modificados, creado_en, usuario_bd
    FROM sigr_auditoria
   WHERE (p_actor_id IS NULL OR actor_id = p_actor_id)
     AND (p_tabla IS NULL OR tabla = p_tabla)
     AND (p_desde IS NULL OR creado_en >= p_desde)
     AND (p_hasta IS NULL OR creado_en < p_hasta)
   ORDER BY id DESC LIMIT v_limite;
END$$
DELIMITER ;

-- Verificacion manual:
-- CALL sp_consultar_auditoria(NULL, NULL, NULL, NULL, 100);
