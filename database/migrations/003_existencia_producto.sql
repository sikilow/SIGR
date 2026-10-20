-- MIGRACIÓN 03: no todos los productos controlan existencia.
-- Lo que se prepara al momento (platos, guisados, aguas frescas) no tiene "existencia" que contar: el mesero
-- puede pedir cualquier cantidad. Lo que viene hecho o embotellado (refrescos, cerveza, postres de vitrina)
-- sí la controla, y el mesero no puede agregar más de lo que hay.
-- Ejecutar UNA SOLA VEZ sobre una base que ya tiene las migraciones 01 y 02:
--   mysql --default-character-set=utf8mb4 -u root -p -e "source E:/gitPrubs/SIGR/database/migrations/003_existencia_producto.sql"
-- (Si recreas la BD desde el init.sql nuevo, NO la ejecutes: ya incluye todo esto.)
USE SIGR;

-- 1) Por defecto TODOS los productos siguen controlando existencia (el comportamiento de antes).
ALTER TABLE producto ADD COLUMN controla_existencia BOOLEAN NOT NULL DEFAULT TRUE AFTER disponible;

-- 2) Entradas, platos fuertes y la horchata se preparan al momento: dejan de controlar existencia.
--    Ajusta esta lista a tu menú, o cámbialo después producto por producto desde Gerente > Productos.
UPDATE producto
   SET controla_existencia = FALSE
 WHERE id_categoria IN (SELECT id_categoria FROM categoria_menu WHERE nombre IN ('Entradas', 'Platos fuertes'))
    OR nombre = 'Agua de horchata';

SELECT id_producto, nombre, disponible, controla_existencia FROM producto ORDER BY id_producto;
