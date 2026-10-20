-- MIGRACIÓN 02: ajustes para el front nuevo (motivo libre e idempotencia).
-- Ejecutar UNA SOLA VEZ sobre una base que ya tiene la migración 01:
--   mysql -u root -p -e "source E:/gitPrubs/SIGR/database/migrations/002_api_idempotencia.sql"
-- (Si recreas la BD desde el init.sql nuevo, NO la ejecutes: ya incluye todo esto.)
USE SIGR;

-- 1) El motivo de cancelación ahora es texto libre de hasta 200 caracteres.
ALTER TABLE motivo_cancelacion MODIFY descripcion VARCHAR(200) NOT NULL;

-- 2) Respuestas guardadas por clave (cabecera Idempotency-Key): un reintento no repite la acción.
CREATE TABLE IF NOT EXISTS idempotencia (
  clave VARCHAR(100) NOT NULL,
  id_usuario INT NOT NULL,
  ruta VARCHAR(160) NOT NULL,
  estado_http INT NOT NULL,
  respuesta JSON NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clave, id_usuario)
) ENGINE=InnoDB;

SHOW CREATE TABLE motivo_cancelacion;
