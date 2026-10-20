-- MIGRACIÓN 01: ajustes para conectar el frontend del mesero con la API.
-- Ejecutar UNA SOLA VEZ sobre una base ya creada con el init.sql anterior:
--   mysql -u root -p -e "source E:/gitPrubs/SIGR/database/migrations/001_ajustes_front.sql"
-- (Si recreas la BD desde el init.sql nuevo, NO la ejecutes: ya incluye todo esto.)
USE SIGR;

-- 1) Estados de mesa: el front usa libre / ocupada / reservada (antes el default era 'disponible').
UPDATE mesa SET estado = 'libre' WHERE estado = 'disponible';
ALTER TABLE mesa ALTER COLUMN estado SET DEFAULT 'libre';
ALTER TABLE mesa ADD CONSTRAINT chk_mesa_estado CHECK (estado IN ('libre', 'ocupada', 'reservada'));

-- 2) La cuenta guarda cómo se pidió pagar (la pantalla "Cuenta de mesa" lo muestra).
ALTER TABLE cuenta ADD COLUMN tipo_pago_solicitado VARCHAR(10) NULL;
ALTER TABLE cuenta ADD CONSTRAINT chk_cuenta_estado CHECK (estado IN ('abierta', 'por_pagar', 'cerrada'));
ALTER TABLE cuenta ADD CONSTRAINT chk_cuenta_tipo_pago CHECK (tipo_pago_solicitado IS NULL OR tipo_pago_solicitado IN ('fisico', 'digital'));

-- 3) Estados de pedido que faltaban. 'Pendiente' (ya existía) se usa como "enviado a cocina".
INSERT IGNORE INTO estado_pedido (nombre) VALUES ('Registrado'), ('Pagado');

-- 4) Motivo de cancelación "Otro".
INSERT INTO motivo_cancelacion (descripcion)
SELECT 'Otro' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM motivo_cancelacion WHERE descripcion = 'Otro');

SELECT * FROM estado_pedido;
SELECT * FROM motivo_cancelacion;
