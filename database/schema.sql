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
  CONSTRAINT fk_perfil_usuario_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE cliente (
  id_cliente INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  telefono VARCHAR(20) NULL,
  correo VARCHAR(120) NULL
) ENGINE=InnoDB;

CREATE TABLE mesa (
  id_mesa INT AUTO_INCREMENT PRIMARY KEY,
  numero INT NOT NULL UNIQUE,
  capacidad INT NOT NULL CHECK (capacidad > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'reservada'))
) ENGINE=InnoDB;

CREATE TABLE categoria_menu (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE producto (
  id_producto INT AUTO_INCREMENT PRIMARY KEY,
  id_categoria INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  disponible BOOLEAN NOT NULL DEFAULT TRUE,
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

CREATE TABLE lista_espera (
  id_espera INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  personas INT NOT NULL CHECK (personas > 0),
  registrado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(25) NOT NULL DEFAULT 'esperando',
  CONSTRAINT fk_lista_espera_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE cuenta (
  id_cuenta INT AUTO_INCREMENT PRIMARY KEY,
  id_mesa INT NOT NULL,
  abierta_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en DATETIME NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'por_pagar', 'cerrada')),
  tipo_pago_solicitado VARCHAR(10) NULL CHECK (tipo_pago_solicitado IS NULL OR tipo_pago_solicitado IN ('fisico', 'digital')),
  CONSTRAINT fk_cuenta_id_mesa FOREIGN KEY (id_mesa) REFERENCES mesa (id_mesa) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE estado_pedido (
  id_estado INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE motivo_cancelacion (
  id_motivo INT AUTO_INCREMENT PRIMARY KEY,
  descripcion VARCHAR(180) NOT NULL
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
  total_reportado DECIMAL(12,2) NULL CHECK (total_reportado >= 0),
  CONSTRAINT fk_corte_caja_id_cajero FOREIGN KEY (id_cajero) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

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

CREATE TABLE metodo_pago (
  id_metodo INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE pago (
  id_pago INT AUTO_INCREMENT PRIMARY KEY,
  id_venta INT NOT NULL,
  id_metodo INT NOT NULL,
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  pagado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  referencia VARCHAR(100) NULL,
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
-- Nota: 'Pendiente' = enviado a cocina (ver backend/src/dominio.ts).
INSERT INTO metodo_pago(nombre) VALUES ('Efectivo'),('Tarjeta'),('Transferencia');

-- Pruebas básicas de consulta (ejecutar tras agregar registros de prueba):
SELECT * FROM estado_pedido;
select * from rol;
select * from metodo_pago;
-- Prueba de integridad esperada: intentar insertar FK inexistente debe rechazarse.