-- ============================================
-- SIGR - MIGRACION 031
-- SEGURIDAD DE ACCESO: SESIONES Y REGISTRO DE ACCESOS.
--   * `sesion_empleado`: una fila por inicio de sesion del personal. El token lleva su id (`sid`), asi que:
--       - «Salir» la cierra en el servidor y el token deja de servir (RNF-012).
--       - Se cierra sola tras un tiempo sin actividad (RNF-011; 15 min por omision, configurable en la API).
--   * `registro_acceso`: intentos de inicio de sesion (ok, fallidos, bloqueados), accesos no autorizados, sesiones
--     vencidas y salidas, con la IP (RNF-017). Tambien alimenta el bloqueo tras 5 intentos fallidos (RNF-009).
--   * Son registros de seguridad: no llevan triggers de auditoria (auditar una bitacora no aporta). La API borra los
--     registros de acceso de mas de 180 dias y las sesiones cerradas de mas de 30.
-- Puede repetirse: usa CREATE TABLE IF NOT EXISTS. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 031_seguridad_acceso.sql
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS sesion_empleado (
  id_sesion CHAR(32) PRIMARY KEY,
  id_usuario INT NOT NULL,
  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en DATETIME NULL,
  motivo_cierre VARCHAR(20) NULL,
  ip VARCHAR(45) NULL,
  INDEX idx_sesion_empleado_usuario (id_usuario, cerrada_en),
  INDEX idx_sesion_empleado_actividad (ultima_actividad),
  CONSTRAINT fk_sesion_empleado_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registro_acceso (
  id_registro BIGINT AUTO_INCREMENT PRIMARY KEY,
  ambito ENUM('empleado', 'cliente') NOT NULL,
  identificador VARCHAR(120) NOT NULL,
  resultado ENUM('ok', 'fallido', 'bloqueado', 'no_autorizado', 'sesion_expirada', 'salida') NOT NULL,
  detalle VARCHAR(200) NULL,
  ip VARCHAR(45) NULL,
  ruta VARCHAR(120) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_registro_acceso_identificador (ambito, identificador, creado_en),
  INDEX idx_registro_acceso_fecha (creado_en)
) ENGINE=InnoDB;
