-- ============================================
-- SIGR - MIGRACION 024
-- RECUPERACIÓN DE CONTRASEÑA DE EMPLEADOS POR CORREO
--   * restablecimiento_contrasena: enlaces de un solo uso para crear una contraseña nueva. Los pide el empleado
--     («¿Olvidaste tu contraseña?» en el inicio de sesión) o el gerente (Gerente → Usuarios → Restablecer contraseña).
--   * Se guarda solo la huella SHA-256 del enlace (token_hash), nunca el enlace: aunque alguien lea la base, no puede
--     usarlo. Cada enlace caduca (expira_en, 1 hora) y sirve una sola vez (usado_en).
-- Puede repetirse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- ============================================

USE SIGR;

CREATE TABLE IF NOT EXISTS restablecimiento_contrasena (
  id_restablecimiento INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  solicitado_por INT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  usado_en DATETIME NULL,
  CONSTRAINT uq_restablecimiento_token UNIQUE (token_hash),
  INDEX idx_restablecimiento_usuario (id_usuario, creado_en),
  CONSTRAINT fk_restablecimiento_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_restablecimiento_solicitante FOREIGN KEY (solicitado_por) REFERENCES usuario (id_usuario) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;
-- solicitado_por: el gerente que lo pidió; NULL = lo pidió el propio empleado desde el inicio de sesión.

SELECT COUNT(*) AS enlaces FROM restablecimiento_contrasena;
