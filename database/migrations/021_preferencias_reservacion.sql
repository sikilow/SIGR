-- ============================================
-- SIGR - MIGRACION 021
-- PREFERENCIAS DE MESA EN LA RESERVACIÓN
--   * reservacion.pref_zona: sección que pidió el cliente (NULL = cualquiera). No es llave foránea: si la sección
--     se renombra o se borra, la preferencia se conserva como texto y solo deja de coincidir.
--   * reservacion.pref_planta_baja, pref_carriola, pref_sin_escaleras: necesidades de acceso que pidió el cliente
--     (desde el portal o la hostess). La hostess las ve al confirmar y al registrar la llegada.
-- Puede repetirse: cada cambio se comprueba antes de aplicarse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- ============================================

USE SIGR;

SET @sigr_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'reservacion' AND column_name = 'pref_zona') = 0,
  'ALTER TABLE reservacion
     ADD COLUMN pref_zona VARCHAR(40) NULL AFTER llegada_en,
     ADD COLUMN pref_planta_baja BOOLEAN NOT NULL DEFAULT FALSE AFTER pref_zona,
     ADD COLUMN pref_carriola BOOLEAN NOT NULL DEFAULT FALSE AFTER pref_planta_baja,
     ADD COLUMN pref_sin_escaleras BOOLEAN NOT NULL DEFAULT FALSE AFTER pref_carriola',
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SELECT id_reservacion, pref_zona, pref_planta_baja, pref_carriola, pref_sin_escaleras
  FROM reservacion ORDER BY id_reservacion DESC LIMIT 5;
