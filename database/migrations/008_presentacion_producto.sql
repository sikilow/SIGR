USE SIGR;

ALTER TABLE producto
  ADD COLUMN presentacion VARCHAR(100) NOT NULL DEFAULT '' AFTER nombre,
  ADD INDEX idx_producto_variante (id_categoria, nombre, presentacion);
