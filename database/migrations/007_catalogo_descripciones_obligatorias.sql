-- Active: 1765522562563@@localhost@3307
USE SIGR;

UPDATE producto
   SET descripcion = 'Detalle pendiente de completar'
 WHERE descripcion IS NULL OR TRIM(descripcion) = '';

ALTER TABLE producto
  MODIFY COLUMN descripcion VARCHAR(255) NOT NULL;
