-- ============================================
-- SIGR - MIGRACION 033
-- RECUPERAR CONTRASENA DEL CLIENTE (portal): enlace de un solo uso por correo, igual que el del personal.
--   * `restablecimiento_contrasena_cliente`: guarda solo la huella (SHA-256) del enlace, no el enlace. Caduca a la hora y
--     deja de servir en cuanto se usa. No se audita (como `restablecimiento_contrasena` del personal).
-- Puede repetirse: usa CREATE TABLE IF NOT EXISTS. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 033_recuperar_contrasena_cliente.sql
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS restablecimiento_contrasena_cliente (
  id_restablecimiento INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  usado_en DATETIME NULL,
  CONSTRAINT uq_restablecimiento_cliente_token UNIQUE (token_hash),
  INDEX idx_restablecimiento_cliente (id_cliente, creado_en),
  CONSTRAINT fk_restablecimiento_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;
