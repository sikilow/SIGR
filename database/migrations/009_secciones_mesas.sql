-- Migración 009: administra secciones y exige una sección en cada mesa.
-- Ejecutar una sola vez desde la raíz:
-- mysql -h localhost -P 3306 -u root -p -e "source database/migrations/009_secciones_mesas.sql"
USE SIGR;
CREATE TABLE seccion (
  nombre VARCHAR(40) PRIMARY KEY,
  activa BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

INSERT INTO seccion (nombre)
SELECT DISTINCT TRIM(zona)
  FROM mesa
 WHERE zona IS NOT NULL AND TRIM(zona) <> '';

INSERT INTO seccion (nombre)
SELECT 'General'
 WHERE NOT EXISTS (SELECT 1 FROM seccion WHERE nombre = 'General');

UPDATE mesa SET zona = 'General' WHERE zona IS NULL OR TRIM(zona) = '';

ALTER TABLE mesa
  MODIFY COLUMN zona VARCHAR(40) NOT NULL DEFAULT 'General';

SELECT nombre, activa FROM seccion ORDER BY nombre;
SELECT id_mesa, numero, zona FROM mesa ORDER BY numero;
