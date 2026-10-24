-- Migración 010: tolerancia y avisos de reservación, correo de cliente y características de mesa.
-- Ejecutar una sola vez después de las migraciones 001–009:
-- mysql -h localhost -P 3306 -u root -p -e "source database/migrations/010_reservaciones_y_caracteristicas.sql"
USE SIGR
ALTER TABLE mesa
  ADD COLUMN planta_baja BOOLEAN NOT NULL DEFAULT FALSE AFTER zona,
  ADD COLUMN espacio_carriola BOOLEAN NOT NULL DEFAULT FALSE AFTER planta_baja,
  ADD COLUMN sin_escaleras BOOLEAN NOT NULL DEFAULT FALSE AFTER espacio_carriola;

CREATE TABLE configuracion_reservacion (
  id INT PRIMARY KEY CHECK (id = 1),
  tolerancia_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 15 CHECK (tolerancia_minutos BETWEEN 5 AND 180),
  recordatorio_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 5 CHECK (recordatorio_minutos BETWEEN 1 AND 30),
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO configuracion_reservacion (id, tolerancia_minutos, recordatorio_minutos) VALUES (1, 15, 5);

CREATE TABLE notificacion_reservacion (
  id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
  id_reservacion INT NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('recordatorio', 'vencida')),
  destinatario VARCHAR(120) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviada')),
  intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ultimo_error VARCHAR(500) NULL,
  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviada_en DATETIME NULL,
  UNIQUE KEY uq_notificacion_reservacion_tipo (id_reservacion, tipo),
  INDEX idx_notificacion_pendiente (estado, creada_en),
  CONSTRAINT fk_notificacion_id_reservacion FOREIGN KEY (id_reservacion) REFERENCES reservacion (id_reservacion) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

SELECT id_mesa, numero, zona, planta_baja, espacio_carriola, sin_escaleras FROM mesa ORDER BY numero;
SELECT * FROM configuracion_reservacion;
