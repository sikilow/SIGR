-- SIGR · Script inicial de la base de datos (esquema + datos base)
-- Crea la base SIGR COMPLETA y lista para la API: tablas de negocio, credenciales de clientes, catálogos (roles, estados
-- de pedido, categorías y métodos de pago), datos base (mesas 1 a 6, menú, un cliente de prueba) y, al final, la capa de
-- seguridad y auditoría (gerente inicial protegido, sigr_auditoria, triggers y sp_consultar_auditoria).
-- Es el ESTADO FINAL de todas las migraciones 001 a 017: una base nueva NO necesita aplicar ninguna migración.
-- Los usuarios con contraseña NO se crean aquí: se crean con `npx tsx src/utils/seed.ts` (en backend/); el primer
-- gerente que se cree queda protegido automáticamente.
-- Datos de demostración opcionales: seed_demo.sql. Bases ya existentes: migrations/ (NO ejecutes este archivo sobre ellas).
-- Regla del proyecto: todo cambio de esquema va en una migración Y en este archivo; se comprueba con
--   node database/verificar_init.mjs      (ver docs/CONTEXTO_BASE_DE_DATOS.md)

-- PROYECTO SIGR - PRACTICA P23

CREATE DATABASE IF NOT EXISTS SIGR CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE SIGR;

CREATE TABLE rol (
  id_rol INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE usuario (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  id_rol INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(120) NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuario_id_rol FOREIGN KEY (id_rol) REFERENCES rol (id_rol) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE credenciales (
  id_usuario INT PRIMARY KEY,
  nombre_usuario VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  ultimo_acceso DATETIME NULL,
  CONSTRAINT fk_credenciales_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE perfil_usuario (
  id_usuario INT PRIMARY KEY,
  telefono VARCHAR(20) NULL,
  direccion VARCHAR(180) NULL,
  CONSTRAINT uq_perfil_usuario_telefono UNIQUE (telefono),
  CONSTRAINT fk_perfil_usuario_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE cliente (
  id_cliente INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  telefono VARCHAR(20) NULL,
  correo VARCHAR(120) NULL,
  CONSTRAINT uq_cliente_correo UNIQUE (correo)
) ENGINE=InnoDB;
-- correo: único y en minúsculas; lo usa el portal de clientes para iniciar sesión.

-- Contraseñas de los clientes del portal web (migración 014).
CREATE TABLE cliente_credencial (
  id_credencial INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  CONSTRAINT fk_credencial_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE seccion (
  nombre VARCHAR(40) PRIMARY KEY,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  es_para_llevar BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

INSERT INTO seccion (nombre) VALUES ('General'), ('Salón'), ('Terraza'), ('Barra');
INSERT INTO seccion (nombre, es_para_llevar) VALUES ('Para llevar', TRUE);

CREATE TABLE mesa (
  id_mesa INT AUTO_INCREMENT PRIMARY KEY,
  numero INT NOT NULL UNIQUE,
  capacidad INT NOT NULL CHECK (capacidad > 0),
  zona VARCHAR(40) NOT NULL DEFAULT 'General',
  planta_baja BOOLEAN NOT NULL DEFAULT FALSE,
  espacio_carriola BOOLEAN NOT NULL DEFAULT FALSE,
  sin_escaleras BOOLEAN NOT NULL DEFAULT FALSE,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  estado VARCHAR(20) NOT NULL DEFAULT 'libre' CONSTRAINT chk_mesa_estado CHECK (estado IN ('libre', 'ocupada', 'reservada'))
) ENGINE=InnoDB;
-- zona: sección existente; una sección inhabilitada oculta sus mesas a hostess y mesero.
-- activa: FALSE = mesa no disponible; no aparece en el Salón ni en el Panel de mesas. No se borran (tienen cuentas ligadas).

CREATE TABLE categoria_menu (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE producto (
  id_producto INT AUTO_INCREMENT PRIMARY KEY,
  id_categoria INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  presentacion VARCHAR(100) NOT NULL DEFAULT '',
  descripcion VARCHAR(255) NOT NULL,
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  disponible BOOLEAN NOT NULL DEFAULT TRUE,
  -- FALSE = se prepara al momento: no tiene existencia que controlar (ni se limita ni se descuenta).
  controla_existencia BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_producto_variante (id_categoria, nombre, presentacion),
  CONSTRAINT fk_producto_id_categoria FOREIGN KEY (id_categoria) REFERENCES categoria_menu (id_categoria) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE disponibilidadProducto (
  id_inventario INT AUTO_INCREMENT PRIMARY KEY,
  id_producto INT NOT NULL UNIQUE,
  existencia INT NOT NULL DEFAULT 0 CHECK (existencia >= 0),
  stock_minimo INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  CONSTRAINT fk_inventario_id_producto FOREIGN KEY (id_producto) REFERENCES producto (id_producto) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE reservacion (
  id_reservacion INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  id_mesa INT NULL,
  fecha_hora DATETIME NOT NULL,
  personas INT NOT NULL CHECK (personas > 0),
  estado VARCHAR(25) NOT NULL DEFAULT 'pendiente',
  llegada_en DATETIME NULL,
  CONSTRAINT fk_reservacion_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_reservacion_id_mesa FOREIGN KEY (id_mesa) REFERENCES mesa (id_mesa) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE configuracion_reservacion (
  id INT PRIMARY KEY CHECK (id = 1),
  tolerancia_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 15 CHECK (tolerancia_minutos BETWEEN 5 AND 180),
  recordatorio_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 5 CHECK (recordatorio_minutos BETWEEN 1 AND 30),
  anticipacion_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  CONSTRAINT chk_config_res_anticipacion CHECK (anticipacion_minutos BETWEEN 0 AND 1440),
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO configuracion_reservacion (id, tolerancia_minutos, recordatorio_minutos) VALUES (1, 15, 5);

CREATE TABLE notificacion_reservacion (
  id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
  id_reservacion INT NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  evento VARCHAR(20) NOT NULL DEFAULT '',
  destinatario VARCHAR(120) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviada')),
  intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ultimo_error VARCHAR(500) NULL,
  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviada_en DATETIME NULL,
  CONSTRAINT chk_notificacion_tipo CHECK (tipo IN ('recordatorio', 'vencida', 'confirmacion', 'cancelacion')),
  CONSTRAINT chk_notificacion_evento CHECK (
    (tipo = 'confirmacion' AND evento IN ('creada', 'confirmada'))
    OR (tipo IN ('recordatorio', 'vencida', 'cancelacion') AND evento = '')
  ),
  UNIQUE KEY uq_notificacion_reservacion_evento (id_reservacion, tipo, evento),
  INDEX idx_notificacion_pendiente (estado, creada_en),
  CONSTRAINT fk_notificacion_id_reservacion FOREIGN KEY (id_reservacion) REFERENCES reservacion (id_reservacion) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE lista_espera (
  id_espera INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  personas INT NOT NULL CHECK (personas > 0),
  registrado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(25) NOT NULL DEFAULT 'esperando',
  CONSTRAINT fk_lista_espera_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE canal_pedido (
  id_canal INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE cuenta (
  id_cuenta INT AUTO_INCREMENT PRIMARY KEY,
  id_mesa INT NOT NULL,
  abierta_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en DATETIME NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta' CONSTRAINT chk_cuenta_estado CHECK (estado IN ('abierta', 'por_pagar', 'cerrada')),
  tipo_pago_solicitado VARCHAR(10) NULL CONSTRAINT chk_cuenta_tipo_pago CHECK (tipo_pago_solicitado IS NULL OR tipo_pago_solicitado IN ('fisico', 'digital')),
  id_metodo_pago_solicitado INT NULL,
  id_canal INT NULL,
  referencia VARCHAR(60) NULL,
  CONSTRAINT fk_cuenta_id_canal FOREIGN KEY (id_canal) REFERENCES canal_pedido (id_canal) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cuenta_id_mesa FOREIGN KEY (id_mesa) REFERENCES mesa (id_mesa) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE estado_pedido (
  id_estado INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE motivo_cancelacion (
  id_motivo INT AUTO_INCREMENT PRIMARY KEY,
  descripcion VARCHAR(200) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE pedido (
  id_pedido INT AUTO_INCREMENT PRIMARY KEY,
  id_cuenta INT NOT NULL,
  id_mesero INT NOT NULL,
  id_estado INT NOT NULL,
  id_motivo INT NULL,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones VARCHAR(255) NULL,
  CONSTRAINT fk_pedido_id_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuenta (id_cuenta) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pedido_id_mesero FOREIGN KEY (id_mesero) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pedido_id_estado FOREIGN KEY (id_estado) REFERENCES estado_pedido (id_estado) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pedido_id_motivo FOREIGN KEY (id_motivo) REFERENCES motivo_cancelacion (id_motivo) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE detalle_pedido (
  id_detalle INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido INT NOT NULL,
  id_producto INT NOT NULL,
  cantidad INT NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(10,2) NOT NULL CHECK (precio_unitario >= 0),
  indicaciones VARCHAR(255) NULL,
  CONSTRAINT fk_detalle_pedido_id_pedido FOREIGN KEY (id_pedido) REFERENCES pedido (id_pedido) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_detalle_pedido_id_producto FOREIGN KEY (id_producto) REFERENCES producto (id_producto) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE corte_caja (
  id_corte INT AUTO_INCREMENT PRIMARY KEY,
  id_cajero INT NOT NULL,
  inicio DATETIME NOT NULL,
  fin DATETIME NULL,
  fondo_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
  efectivo_esperado DECIMAL(12,2) NULL,
  efectivo_contado DECIMAL(12,2) NULL,
  total_reportado DECIMAL(12,2) NULL CHECK (total_reportado >= 0),
  CONSTRAINT chk_corte_fondo_inicial CHECK (fondo_inicial >= 0),
  CONSTRAINT chk_corte_efectivo_contado CHECK (efectivo_contado IS NULL OR efectivo_contado >= 0),
  CONSTRAINT fk_corte_caja_id_cajero FOREIGN KEY (id_cajero) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;
-- fondo_inicial: efectivo al abrir. efectivo_esperado = fondo + cobros en efectivo; efectivo_contado: lo que contó el cajero.
-- total_reportado solo existe en cortes anteriores a la migración 015.

CREATE TABLE venta (
  id_venta INT AUTO_INCREMENT PRIMARY KEY,
  id_cuenta INT NOT NULL UNIQUE,
  id_corte INT NULL,
  id_cajero INT NOT NULL,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total DECIMAL(12,2) NOT NULL CHECK (total >= 0),
  CONSTRAINT fk_venta_id_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuenta (id_cuenta) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_venta_id_corte FOREIGN KEY (id_corte) REFERENCES corte_caja (id_corte) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_venta_id_cajero FOREIGN KEY (id_cajero) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE categoria_metodo_pago (
  id_categoria_metodo_pago INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE,
  tipo ENUM('fisico', 'digital') NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE metodo_pago (
  id_metodo INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE,
  id_categoria_metodo_pago INT NOT NULL,
  es_efectivo BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

ALTER TABLE metodo_pago
  ADD CONSTRAINT fk_metodo_pago_categoria
  FOREIGN KEY (id_categoria_metodo_pago) REFERENCES categoria_metodo_pago (id_categoria_metodo_pago)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE cuenta
  ADD CONSTRAINT fk_cuenta_metodo_pago_solicitado
  FOREIGN KEY (id_metodo_pago_solicitado) REFERENCES metodo_pago (id_metodo)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE pago (
  id_pago INT AUTO_INCREMENT PRIMARY KEY,
  id_venta INT NOT NULL,
  id_metodo INT NOT NULL,
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  monto_recibido DECIMAL(12,2) NOT NULL,
  cambio DECIMAL(12,2) NOT NULL DEFAULT 0 CONSTRAINT chk_pago_cambio CHECK (cambio >= 0),
  pagado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  referencia VARCHAR(100) NULL,
  -- MySQL 8 no acepta un CHECK de columna que use otra columna (error 3813).
  CONSTRAINT chk_pago_monto_recibido CHECK (monto_recibido >= monto),
  CONSTRAINT fk_pago_id_venta FOREIGN KEY (id_venta) REFERENCES venta (id_venta) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pago_id_metodo FOREIGN KEY (id_metodo) REFERENCES metodo_pago (id_metodo) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE datos_fiscales (
  id_datos_fiscales INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  rfc VARCHAR(13) NOT NULL,
  razon_social VARCHAR(160) NOT NULL,
  regimen_fiscal VARCHAR(10) NULL,
  codigo_postal CHAR(5) NOT NULL,
  CONSTRAINT fk_datos_fiscales_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE factura (
  id_factura INT AUTO_INCREMENT PRIMARY KEY,
  id_venta INT NOT NULL UNIQUE,
  id_datos_fiscales INT NOT NULL,
  folio VARCHAR(50) NOT NULL UNIQUE,
  fecha_emision DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) NOT NULL DEFAULT 'emitida',
  CONSTRAINT fk_factura_id_venta FOREIGN KEY (id_venta) REFERENCES venta (id_venta) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_factura_id_datos_fiscales FOREIGN KEY (id_datos_fiscales) REFERENCES datos_fiscales (id_datos_fiscales) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE idempotencia (
  clave VARCHAR(100) NOT NULL,
  id_usuario INT NOT NULL,
  ruta VARCHAR(160) NOT NULL,
  estado_http INT NOT NULL,
  respuesta JSON NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clave, id_usuario)
) ENGINE=InnoDB;

CREATE INDEX idx_reservacion_fecha_hora ON reservacion (fecha_hora);
CREATE INDEX idx_pedido_fecha_hora ON pedido (fecha_hora);
CREATE INDEX idx_venta_fecha_hora ON venta (fecha_hora);
CREATE INDEX idx_lista_espera_registrado_en ON lista_espera (registrado_en);

CREATE VIEW vista_ventas_detalle AS
SELECT v.id_venta, v.fecha_hora, v.total, u.nombre AS cajero, m.numero AS numero_mesa
FROM venta v JOIN usuario u ON u.id_usuario = v.id_cajero
JOIN cuenta c ON c.id_cuenta = v.id_cuenta JOIN mesa m ON m.id_mesa = c.id_mesa;

INSERT INTO rol(nombre) VALUES ('Gerente'),('Mesero'),('Cocinero'),('Cajero'),('Hostess');
INSERT INTO estado_pedido(nombre) VALUES ('Pendiente'),('En preparacion'),('Listo'),('Entregado'),('Cancelado'),('Registrado'),('Pagado');
-- Nota: 'Pendiente' = enviado a cocina (ver backend/src/models/dominio.ts).
INSERT INTO categoria_metodo_pago(nombre, tipo)
VALUES (CONVERT(X'46C3AD7369636F' USING utf8mb4), 'fisico'),('Digital', 'digital');
INSERT INTO metodo_pago(nombre, id_categoria_metodo_pago, es_efectivo)
SELECT 'Efectivo', id_categoria_metodo_pago, TRUE FROM categoria_metodo_pago WHERE tipo = 'fisico';
INSERT INTO metodo_pago(nombre, id_categoria_metodo_pago)
SELECT nombres.nombre, categoria.id_categoria_metodo_pago
  FROM (SELECT 'Tarjeta' AS nombre UNION ALL SELECT 'Transferencia') nombres
  JOIN categoria_metodo_pago categoria ON categoria.tipo = 'digital';


-- =====================================================================
-- DATOS BASE
-- =====================================================================
USE SIGR;

INSERT INTO mesa (numero, capacidad, zona) VALUES
  (1,2,'Salón'),(2,2,'Salón'),(3,4,'Salón'),(4,4,'Salón'),(5,6,'Salón'),(6,8,'Salón');

INSERT INTO categoria_menu (nombre) VALUES ('Entradas'),('Platos fuertes'),('Postres'),('Bebidas');

-- Pedidos para llevar: mesas virtuales 101 a 110 en la sección «Para llevar» y canales de pedido.
INSERT INTO mesa (numero, capacidad, zona) VALUES
  (101,1,'Para llevar'),(102,1,'Para llevar'),(103,1,'Para llevar'),(104,1,'Para llevar'),(105,1,'Para llevar'),
  (106,1,'Para llevar'),(107,1,'Para llevar'),(108,1,'Para llevar'),(109,1,'Para llevar'),(110,1,'Para llevar');
INSERT INTO canal_pedido (nombre) VALUES ('Mostrador'), ('Teléfono'), ('Rappi'), ('Uber Eats'), ('DiDi Food'), ('Mandadito');

-- controla_existencia = FALSE: se prepara al momento (no hay existencia que contar).
-- TRUE: viene ya hecho o embotellado (postre, refresco, cerveza) y su existencia sí se controla.
INSERT INTO producto (id_categoria, nombre, descripcion, precio, controla_existencia) VALUES
(1, 'Guacamole', 'Con totopos', 85.00, FALSE),
(1, 'Sopa de tortilla', 'Detalle pendiente de completar', 70.00, FALSE),
(2, 'Tacos de arrachera', 'Orden de 4', 140.00, FALSE),
(2, 'Enchiladas verdes', 'Con pollo', 120.00, FALSE),
(3, 'Flan', 'Detalle pendiente de completar', 55.00, TRUE),
(4, 'Agua de horchata', '500 ml', 35.00, FALSE),
(4, 'Refresco', 'Detalle pendiente de completar', 30.00, TRUE),
(4, 'Cerveza', 'Detalle pendiente de completar', 50.00, TRUE);

INSERT INTO disponibilidadProducto (id_producto, existencia, stock_minimo)
SELECT id_producto, 50, 5 FROM producto;

INSERT INTO motivo_cancelacion (descripcion) VALUES
('Cliente cambió de opinión'),('Producto agotado'),('Error al capturar'),('Otro');

INSERT INTO cliente (nombre, telefono, correo) VALUES
('Cliente Prueba', '3111234567', 'cliente@correo.com');

-- =====================================================================
-- SEGURIDAD Y AUDITORIA (estado final de las migraciones 013, 015, 016 y 017)
-- Va al final, despues de los datos base, para que la bitacora no registre el relleno inicial.
-- Incluye: gerente inicial protegido, bitacora sigr_auditoria, triggers de auditoria y sp_consultar_auditoria.
-- El primer usuario con rol Gerente que se cree (npx tsx src/utils/seed.ts) queda como gerente protegido.
-- =====================================================================
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
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'INSERT', JSON_OBJECT('id', NEW.`id`), JSON_OBJECT('id', NEW.`id`, 'tolerancia_minutos', NEW.`tolerancia_minutos`, 'recordatorio_minutos', NEW.`recordatorio_minutos`, 'anticipacion_minutos', NEW.`anticipacion_minutos`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_au` AFTER UPDATE ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'UPDATE', JSON_OBJECT('id', NEW.`id`), JSON_OBJECT('id', OLD.`id`, 'tolerancia_minutos', OLD.`tolerancia_minutos`, 'recordatorio_minutos', OLD.`recordatorio_minutos`, 'anticipacion_minutos', OLD.`anticipacion_minutos`, 'actualizado_en', OLD.`actualizado_en`), JSON_OBJECT('id', NEW.`id`, 'tolerancia_minutos', NEW.`tolerancia_minutos`, 'recordatorio_minutos', NEW.`recordatorio_minutos`, 'anticipacion_minutos', NEW.`anticipacion_minutos`, 'actualizado_en', NEW.`actualizado_en`), USER());
END$$
CREATE TRIGGER `trg_aud_configuracion_reservacion_ad` AFTER DELETE ON `configuracion_reservacion` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'configuracion_reservacion', 'DELETE', JSON_OBJECT('id', OLD.`id`), JSON_OBJECT('id', OLD.`id`, 'tolerancia_minutos', OLD.`tolerancia_minutos`, 'recordatorio_minutos', OLD.`recordatorio_minutos`, 'anticipacion_minutos', OLD.`anticipacion_minutos`, 'actualizado_en', OLD.`actualizado_en`), USER());
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

-- Triggers de corte_caja (migracion 015): registran fondo_inicial, efectivo_esperado y efectivo_contado.
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

-- Triggers de cuenta (migracion 016): registran id_metodo_pago_solicitado.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ai`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_au`$$
DROP TRIGGER IF EXISTS `trg_aud_cuenta_ad`$$
CREATE TRIGGER `trg_aud_cuenta_ai` AFTER INSERT ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'INSERT', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', NEW.`id_metodo_pago_solicitado`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_au` AFTER UPDATE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, despues, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'UPDATE', JSON_OBJECT('id_cuenta', NEW.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', OLD.`id_metodo_pago_solicitado`), JSON_OBJECT('id_cuenta', NEW.`id_cuenta`, 'id_mesa', NEW.`id_mesa`, 'abierta_en', NEW.`abierta_en`, 'cerrada_en', NEW.`cerrada_en`, 'estado', NEW.`estado`, 'tipo_pago_solicitado', NEW.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', NEW.`id_metodo_pago_solicitado`), USER());
END$$
CREATE TRIGGER `trg_aud_cuenta_ad` AFTER DELETE ON `cuenta` FOR EACH ROW
BEGIN
  INSERT INTO sigr_auditoria (actor_id, tabla, operacion, registro_id, antes, usuario_bd)
  VALUES (@sigr_actor_id, 'cuenta', 'DELETE', JSON_OBJECT('id_cuenta', OLD.`id_cuenta`), JSON_OBJECT('id_cuenta', OLD.`id_cuenta`, 'id_mesa', OLD.`id_mesa`, 'abierta_en', OLD.`abierta_en`, 'cerrada_en', OLD.`cerrada_en`, 'estado', OLD.`estado`, 'tipo_pago_solicitado', OLD.`tipo_pago_solicitado`, 'id_metodo_pago_solicitado', OLD.`id_metodo_pago_solicitado`), USER());
END$$
DELIMITER ;

-- Triggers de categoria_metodo_pago y metodo_pago (migracion 017).
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

-- Triggers de seccion, cuenta y canal_pedido (migracion 019).
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
