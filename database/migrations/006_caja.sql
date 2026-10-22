-- Migración 006: registra el efectivo recibido y el cambio entregado en cada pago.
-- Ejecutar una sola vez sobre una base ya creada:
--   mysql -u root -p -e "source database/migrations/006_caja.sql"
-- Si la base se creó desde database/init.sql, las columnas ya existen.
USE SIGR;

ALTER TABLE pago
  ADD COLUMN monto_recibido DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER monto,
  ADD COLUMN cambio DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER monto_recibido;

-- Pagos anteriores se consideran liquidados sin cambio registrado.
UPDATE pago SET monto_recibido = monto;

ALTER TABLE pago
  MODIFY COLUMN monto_recibido DECIMAL(12,2) NOT NULL,
  ADD CONSTRAINT chk_pago_monto_recibido CHECK (monto_recibido >= monto),
  ADD CONSTRAINT chk_pago_cambio CHECK (cambio >= 0);
