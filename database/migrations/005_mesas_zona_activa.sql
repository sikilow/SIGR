-- Migración 005: sección (zona) y disponibilidad de las mesas (administración de mesas por el gerente).
-- Para bases que ya existían. Si creas la base desde database/init.sql, ya viene incluido.
-- Ejecutar una sola vez desde la raíz: mysql -u root -p -e "source database/migrations/005_mesas_zona_activa.sql"
USE SIGR;

ALTER TABLE mesa
  ADD COLUMN zona VARCHAR(40) NULL AFTER capacidad,
  ADD COLUMN activa BOOLEAN NOT NULL DEFAULT TRUE AFTER zona;

-- Comprobación:
SELECT id_mesa, numero, capacidad, zona, activa, estado FROM mesa ORDER BY numero;
