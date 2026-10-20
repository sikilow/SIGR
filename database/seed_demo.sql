-- =====================================================================
-- SIGR · La Madalena — DATOS DE DEMOSTRACIÓN ADICIONALES (seed_demo.sql)
-- Pensado para el esquema REAL del repo (database/init.sql).
--
-- ORDEN DE CARGA (una sola vez, base recién creada):
--   1) mysql --default-character-set=utf8mb4 -u root -p < database/init.sql
--      (o levantar el contenedor: docker compose -f database/docker-compose.yml up -d)
--   2) cd backend && npx tsx src/utils/seed.ts       (crea gerente, mesero, cocinero,
--                                                     cajero y hostess; contraseña 1234)
--   3) mysql --default-character-set=utf8mb4 -u root -p SIGR < database/seed_demo.sql
--
-- NO repite lo de init.sql (mesas 1-6, categorías, 8 productos, inventario,
-- motivos y 'Cliente Prueba'). Agrega: mesas 7-12 con estados variados, un
-- segundo mesero (mesero2 / 1234), las mesas libres 13-18, cuentas y pedidos de ejemplo, clientes,
-- reservaciones y lista de espera.
-- Las fechas son relativas a NOW(): revisar la zona horaria de MySQL.
--
-- [PENDIENTE-BD] reservacion.estado y lista_espera.estado son texto libre sin
-- catálogo; se usan: reservacion = pendiente | confirmada | llego | cancelada,
-- lista_espera = esperando | asignada. reservacion NO tiene folio.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;
USE SIGR;

-- ---------------------------------------------------------------------
-- 1. SEGUNDO MESERO (para probar que "Mis pedidos" solo muestra los propios)
--    Hash bcrypt de "1234", generado con bcryptjs (la librería del backend).
-- ---------------------------------------------------------------------
INSERT INTO usuario (id_rol, nombre, correo)
SELECT id_rol, 'Rosa Mesera', 'mesero2@sigr.com' FROM rol WHERE nombre = 'Mesero';

INSERT INTO credenciales (id_usuario, nombre_usuario, password_hash)
SELECT id_usuario, 'mesero2', '$2b$10$xc9DwDIQxfhzlvedGdk3Vezb0lTigWOoY5F3FHIVVQue4v/4/gYba' FROM usuario WHERE correo = 'mesero2@sigr.com';

INSERT INTO perfil_usuario (id_usuario)
SELECT id_usuario FROM usuario WHERE correo = 'mesero2@sigr.com';

-- ---------------------------------------------------------------------
-- 2. MESAS: init.sql crea 1-6; aquí 7-12 y se reparten los estados.
--    libre: 1,2,4,7,10 · ocupada: 3,5,6,8,12 · reservada: 9,11
-- ---------------------------------------------------------------------
INSERT INTO mesa (numero, capacidad) VALUES (7,2),(8,4),(9,4),(10,6),(11,2),(12,8);

-- Mesas nuevas: mismas capacidades del conjunto inicial, listas para asignar.
INSERT INTO mesa (numero, capacidad) VALUES (13,2),(14,2),(15,4),(16,4),(17,6),(18,8);

UPDATE mesa SET estado = 'ocupada'   WHERE numero IN (3, 5, 6, 8, 12);
UPDATE mesa SET estado = 'reservada' WHERE numero IN (9, 11);

-- Un producto agotado para probar el bloqueo (Cerveza controla existencia)
UPDATE disponibilidadProducto SET existencia = 0
WHERE id_producto = (SELECT id_producto FROM producto WHERE nombre = 'Cerveza');

-- ---------------------------------------------------------------------
-- 3. CUENTAS Y PEDIDOS
--    Mesa 3  · abierta   · Pendiente (enviado) + Registrado (editable) + Cancelado
--    Mesa 5  · abierta   · Entregado + Listo                (→ "Pedido listo")
--    Mesa 6  · por_pagar · Entregado, pago digital          (→ "Cuenta solicitada")
--    Mesa 8  · abierta   · 2 En preparacion (mesero y mesero2)
--    Mesa 12 · ocupada SIN cuenta (el primer pedido la abre)
-- ---------------------------------------------------------------------
INSERT INTO cuenta (id_cuenta, id_mesa, abierta_en, estado, tipo_pago_solicitado)
SELECT c.id_cuenta, m.id_mesa, NOW() - INTERVAL c.minutos MINUTE, c.estado, c.tipo_pago
FROM (
  SELECT 1 AS id_cuenta, 3 AS numero, 50 AS minutos, 'abierta'   AS estado, NULL AS tipo_pago
  UNION ALL SELECT 2, 5, 75, 'abierta',   NULL
  UNION ALL SELECT 3, 6, 95, 'por_pagar', 'digital'
  UNION ALL SELECT 4, 8, 30, 'abierta',   NULL
) c
JOIN mesa m ON m.numero = c.numero;

INSERT INTO pedido (id_pedido, id_cuenta, id_mesero, id_estado, id_motivo, fecha_hora, observaciones)
SELECT p.id_pedido, p.id_cuenta, u.id_usuario, e.id_estado,
       (SELECT id_motivo FROM motivo_cancelacion WHERE descripcion = p.motivo LIMIT 1),
       NOW() - INTERVAL p.minutos MINUTE, p.observaciones
FROM (
  SELECT 1 AS id_pedido, 1 AS id_cuenta, 'mesero' AS mesero, 'Pendiente'      AS estado, NULL AS motivo, 20 AS minutos, 'Sin cebolla' AS observaciones
  UNION ALL SELECT 2, 1, 'mesero',  'Registrado',     NULL, 5, NULL
  UNION ALL SELECT 3, 1, 'mesero',  'Cancelado',      'Cliente cambió de opinión', 35, NULL
  UNION ALL SELECT 4, 2, 'mesero',  'Entregado',      NULL, 65, NULL
  UNION ALL SELECT 5, 2, 'mesero',  'Listo',          NULL, 10, NULL
  UNION ALL SELECT 6, 3, 'mesero',  'Entregado',      NULL, 85, NULL
  UNION ALL SELECT 7, 4, 'mesero2', 'En preparacion', NULL, 15, 'Sin chile'
  UNION ALL SELECT 8, 4, 'mesero',  'En preparacion', NULL, 12, NULL
) p
JOIN estado_pedido e ON e.nombre = p.estado
JOIN credenciales cr ON cr.nombre_usuario = p.mesero
JOIN usuario u ON u.id_usuario = cr.id_usuario;

-- Detalle: precio unitario copiado del producto (como lo haría el servidor)
INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario, indicaciones)
SELECT d.id_pedido, pr.id_producto, d.cantidad, pr.precio, d.indicaciones
FROM (
  SELECT 1 AS id_pedido, 'Tacos de arrachera' AS producto, 2 AS cantidad, 'Sin cebolla' AS indicaciones
  UNION ALL SELECT 1, 'Refresco', 2, NULL
  UNION ALL SELECT 2, 'Agua de horchata', 1, NULL
  UNION ALL SELECT 3, 'Guacamole', 1, NULL
  UNION ALL SELECT 4, 'Enchiladas verdes', 1, NULL
  UNION ALL SELECT 4, 'Agua de horchata', 1, NULL
  UNION ALL SELECT 5, 'Sopa de tortilla', 2, NULL
  UNION ALL SELECT 5, 'Flan', 1, NULL
  UNION ALL SELECT 6, 'Tacos de arrachera', 2, NULL
  UNION ALL SELECT 6, 'Cerveza', 2, NULL
  UNION ALL SELECT 6, 'Flan', 1, NULL
  UNION ALL SELECT 7, 'Enchiladas verdes', 1, 'Sin chile'
  UNION ALL SELECT 8, 'Sopa de tortilla', 2, NULL
  UNION ALL SELECT 8, 'Guacamole', 1, NULL
) d
JOIN producto pr ON pr.nombre = d.producto;

-- ---------------------------------------------------------------------
-- 4. CLIENTES, RESERVACIONES Y LISTA DE ESPERA (hostess)
-- ---------------------------------------------------------------------
INSERT INTO cliente (nombre, telefono, correo) VALUES
  ('Carlos Medina',    '3115550201', 'carlos.medina@correo.test'),
  ('Patricia Ruiz',    '3115550202', NULL),
  ('Familia González', '3115550203', NULL),
  ('Daniel Ortega',    '3115550204', 'daniel.ortega@correo.test'),
  ('Elena Castillo',   '3115550205', NULL),
  ('Héctor Salas',     '3115550206', NULL),
  ('Valeria Núñez',    '3115550207', NULL);

INSERT INTO reservacion (id_cliente, id_mesa, fecha_hora, personas, estado, llegada_en)
SELECT c.id_cliente, m.id_mesa, r.fecha_hora, r.personas, r.estado, r.llegada_en
FROM (
  SELECT 'Carlos Medina' AS cliente, 9 AS numero, NOW() + INTERVAL 90 MINUTE AS fecha_hora, 4 AS personas, 'confirmada' AS estado, NULL AS llegada_en
  UNION ALL SELECT 'Patricia Ruiz',    11,   NOW() + INTERVAL 120 MINUTE, 2, 'confirmada', NULL
  UNION ALL SELECT 'Familia González', NULL, NOW() + INTERVAL 1 DAY,     6, 'pendiente',  NULL
  UNION ALL SELECT 'Daniel Ortega',    6,    NOW() - INTERVAL 100 MINUTE, 5, 'llego',      NOW() - INTERVAL 95 MINUTE
  UNION ALL SELECT 'Elena Castillo',   NULL, NOW() - INTERVAL 1 DAY,      3, 'cancelada',  NULL
) r
JOIN cliente c ON c.nombre = r.cliente
LEFT JOIN mesa m ON m.numero = r.numero;

INSERT INTO lista_espera (id_cliente, personas, registrado_en, estado)
SELECT c.id_cliente, w.personas, NOW() - INTERVAL w.minutos MINUTE, w.estado
FROM (
  SELECT 'Héctor Salas' AS cliente, 3 AS personas, 25 AS minutos, 'esperando' AS estado
  UNION ALL SELECT 'Valeria Núñez', 2, 10, 'esperando'
  UNION ALL SELECT 'Elena Castillo', 4, 120, 'asignada'
) w
JOIN cliente c ON c.nombre = w.cliente;

-- ---------------------------------------------------------------------
-- 5. VERIFICACIÓN (conteos esperados tras init.sql + utils/seed.ts + este archivo)
-- ---------------------------------------------------------------------
SELECT 'usuarios (6)' AS tabla, COUNT(*) AS filas FROM usuario
UNION ALL SELECT 'mesas (18)', COUNT(*) FROM mesa
UNION ALL SELECT 'productos (8)', COUNT(*) FROM producto
UNION ALL SELECT 'cuentas (4)', COUNT(*) FROM cuenta
UNION ALL SELECT 'pedidos (8)', COUNT(*) FROM pedido
UNION ALL SELECT 'detalles (14)', COUNT(*) FROM detalle_pedido
UNION ALL SELECT 'clientes (8)', COUNT(*) FROM cliente
UNION ALL SELECT 'reservaciones (5)', COUNT(*) FROM reservacion
UNION ALL SELECT 'lista_espera (3)', COUNT(*) FROM lista_espera;

-- Totales esperados (sin cancelados): mesa 3 = 375, mesa 5 = 350, mesa 6 = 435, mesa 8 = 345
SELECT m.numero, m.estado AS estado_mesa, c.estado AS estado_cuenta, c.tipo_pago_solicitado,
       COALESCE(SUM(CASE WHEN ep.nombre <> 'Cancelado' THEN d.cantidad * d.precio_unitario END), 0) AS total_cuenta
FROM mesa m
LEFT JOIN cuenta c ON c.id_mesa = m.id_mesa AND c.estado <> 'cerrada'
LEFT JOIN pedido p ON p.id_cuenta = c.id_cuenta
LEFT JOIN estado_pedido ep ON ep.id_estado = p.id_estado
LEFT JOIN detalle_pedido d ON d.id_pedido = p.id_pedido
GROUP BY m.numero, m.estado, c.estado, c.tipo_pago_solicitado
ORDER BY m.numero;
