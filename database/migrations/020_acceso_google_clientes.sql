-- ============================================
-- SIGR - MIGRACION 020
-- ACCESO DE CLIENTES CON GOOGLE
--   * cliente_credencial.google_sub: identificador fijo de la cuenta de Google (único).
--   * cliente_credencial.password_hash pasa a ser opcional: quien entra con Google no tiene contraseña propia.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cliente_credencial'
      AND column_name = 'password_hash' AND is_nullable = 'NO') > 0,
  'ALTER TABLE cliente_credencial MODIFY COLUMN password_hash VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cliente_credencial' AND column_name = 'google_sub') = 0,
  'ALTER TABLE cliente_credencial ADD COLUMN google_sub VARCHAR(64) NULL, ADD CONSTRAINT uq_credencial_google_sub UNIQUE (google_sub)',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;
