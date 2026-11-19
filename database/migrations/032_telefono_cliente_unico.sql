-- ============================================
-- SIGR - MIGRACION 032
-- TELEFONO DE CLIENTE UNICO EN LA BASE: el par (lada, telefono) no se puede repetir.
--   * Antes solo lo revisaba la API con una consulta; dos peticiones simultaneas podian duplicarlo.
--   * El indice `uq_cliente_telefono` lo garantiza la base. Un cliente sin telefono (NULL) no choca con otros.
--   * Un cliente eliminado (eliminado logico) sigue ocupando su telefono, igual que su correo.
--   * Si ya hay telefonos repetidos (mismo par lada + telefono), la migracion se DETIENE con un error que lo dice y no
--     cambia nada: hay que corregir esos clientes (ver docs/actualizar-base-datos.md) y volver a ejecutarla.
-- Puede repetirse. Hacer respaldo antes (docs/actualizar-base-datos.md).
-- Ejecutar con: mysql --default-character-set=utf8mb4 -u root < 032_telefono_cliente_unico.sql
-- ============================================

USE SIGR;

-- Un telefono vacio ('') se guarda como NULL (sin telefono): si no, dos vacios contarian como repetidos.
UPDATE cliente SET telefono = NULL WHERE telefono = '';

SET @sigr_existe = (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'cliente' AND index_name = 'uq_cliente_telefono'
);
SET @sigr_repetidos = (
  SELECT COUNT(*) FROM (
    SELECT 1 FROM cliente WHERE telefono IS NOT NULL GROUP BY lada, telefono HAVING COUNT(*) > 1
  ) repetidos
);
SET @sigr_ddl = IF(
  @sigr_existe = 0,
  IF(
    @sigr_repetidos > 0,
    'SELECT * FROM ERROR_hay_telefonos_de_cliente_repetidos__ver_docs_actualizar_base_datos',
    'ALTER TABLE cliente ADD CONSTRAINT uq_cliente_telefono UNIQUE (lada, telefono)'
  ),
  'SELECT 1'
);
PREPARE sigr_migration FROM @sigr_ddl;
EXECUTE sigr_migration;
DEALLOCATE PREPARE sigr_migration;

SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columnas, non_unique
  FROM information_schema.statistics
 WHERE table_schema = DATABASE() AND table_name = 'cliente' AND index_name = 'uq_cliente_telefono'
 GROUP BY index_name, non_unique;
