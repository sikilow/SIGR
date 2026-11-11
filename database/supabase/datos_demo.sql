-- =====================================================================
-- SIGR · La Madalena — DATOS DE DEMOSTRACIÓN (PostgreSQL / Supabase)
-- Equivale a database/seed_demo.sql. Se carga con `npm run db:demo` (una sola vez),
-- después de `npm run db:migrar` y `npm run seed`.
--
-- Agrega: un segundo mesero (mesero2 / 1234), mesas 7-18 con estados variados,
-- cuentas y pedidos de ejemplo, clientes, reservaciones y lista de espera.
-- Las fechas son relativas a LOCALTIMESTAMP (hora del restaurante).
-- =====================================================================
SET search_path TO sigr, public;

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
-- 2. MESAS: el esquema crea 1-6; aquí 7-18 y se reparten los estados.
--    libre: 1,2,4,7,10 · ocupada: 3,5,6,8,12 · reservada: 9,11
-- ---------------------------------------------------------------------
INSERT INTO mesa (numero, capacidad, zona) VALUES
  (7, 2, 'Salón'), (8, 4, 'Salón'), (9, 4, 'Terraza'), (10, 6, 'Terraza'), (11, 2, 'Terraza'), (12, 8, 'Terraza'),
  (13, 2, 'Terraza'), (14, 2, 'Terraza'), (15, 4, 'Barra'), (16, 4, 'Barra'), (17, 6, 'Barra'), (18, 8, 'General');

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
--    Los id se generan solos; las cuentas se ligan por mesa y los pedidos por un número de demostración.
-- ---------------------------------------------------------------------
INSERT INTO cuenta (id_mesa, abierta_en, estado, tipo_pago_solicitado)
SELECT m.id_mesa, LOCALTIMESTAMP(0) - make_interval(mins => c.minutos), c.estado, c.tipo_pago
  FROM (VALUES
    (3, 50, 'abierta', NULL),
    (5, 75, 'abierta', NULL),
    (6, 95, 'por_pagar', 'digital'),
    (8, 30, 'abierta', NULL)
  ) AS c (numero, minutos, estado, tipo_pago)
  JOIN mesa m ON m.numero = c.numero;

CREATE TEMPORARY TABLE demo_pedido (
  demo INT, numero_mesa INT, mesero TEXT, estado TEXT, motivo TEXT, minutos INT, observaciones TEXT, id_pedido INT
) ON COMMIT DROP;
INSERT INTO demo_pedido (demo, numero_mesa, mesero, estado, motivo, minutos, observaciones) VALUES
  (1, 3, 'mesero',  'Pendiente',      NULL, 20, 'Sin cebolla'),
  (2, 3, 'mesero',  'Registrado',     NULL, 5,  NULL),
  (3, 3, 'mesero',  'Cancelado',      'Cliente cambió de opinión', 35, NULL),
  (4, 5, 'mesero',  'Entregado',      NULL, 65, NULL),
  (5, 5, 'mesero',  'Listo',          NULL, 10, NULL),
  (6, 6, 'mesero',  'Entregado',      NULL, 85, NULL),
  (7, 8, 'mesero2', 'En preparacion', NULL, 15, 'Sin chile'),
  (8, 8, 'mesero',  'En preparacion', NULL, 12, NULL);

WITH nuevos AS (
  INSERT INTO pedido (id_cuenta, id_mesero, id_estado, id_motivo, fecha_hora, observaciones)
  SELECT c.id_cuenta, cr.id_usuario, e.id_estado,
         (SELECT id_motivo FROM motivo_cancelacion WHERE descripcion = p.motivo LIMIT 1),
         -- El segundo de diferencia por número de demostración permite ligar cada pedido con su fila.
         LOCALTIMESTAMP(0) - make_interval(mins => p.minutos, secs => p.demo),
         p.observaciones
    FROM demo_pedido p
    JOIN mesa m ON m.numero = p.numero_mesa
    JOIN cuenta c ON c.id_mesa = m.id_mesa AND c.estado <> 'cerrada'
    JOIN estado_pedido e ON e.nombre = p.estado
    JOIN credenciales cr ON cr.nombre_usuario = p.mesero
  RETURNING id_pedido, id_cuenta, fecha_hora
)
UPDATE demo_pedido p
   SET id_pedido = n.id_pedido
  FROM nuevos n
  JOIN cuenta c ON c.id_cuenta = n.id_cuenta
  JOIN mesa m ON m.id_mesa = c.id_mesa
 WHERE m.numero = p.numero_mesa
   AND n.fecha_hora = LOCALTIMESTAMP(0) - make_interval(mins => p.minutos, secs => p.demo);

-- Detalle: precio unitario copiado del producto (como lo haría el servidor)
INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario, indicaciones)
SELECT p.id_pedido, pr.id_producto, d.cantidad, pr.precio, d.indicaciones
  FROM (VALUES
    (1, 'Tacos de arrachera', 2, 'Sin cebolla'),
    (1, 'Refresco', 2, NULL),
    (2, 'Agua de horchata', 1, NULL),
    (3, 'Guacamole', 1, NULL),
    (4, 'Enchiladas verdes', 1, NULL),
    (4, 'Agua de horchata', 1, NULL),
    (5, 'Sopa de tortilla', 2, NULL),
    (5, 'Flan', 1, NULL),
    (6, 'Tacos de arrachera', 2, NULL),
    (6, 'Cerveza', 2, NULL),
    (6, 'Flan', 1, NULL),
    (7, 'Enchiladas verdes', 1, 'Sin chile'),
    (8, 'Sopa de tortilla', 2, NULL),
    (8, 'Guacamole', 1, NULL)
  ) AS d (demo, producto, cantidad, indicaciones)
  JOIN demo_pedido p ON p.demo = d.demo
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
  FROM (VALUES
    ('Carlos Medina',    9,    LOCALTIMESTAMP(0) + INTERVAL '90 minutes',  4, 'confirmada', NULL::TIMESTAMP),
    ('Patricia Ruiz',    11,   LOCALTIMESTAMP(0) + INTERVAL '120 minutes', 2, 'confirmada', NULL),
    ('Familia González', NULL, LOCALTIMESTAMP(0) + INTERVAL '1 day',       6, 'pendiente',  NULL),
    ('Daniel Ortega',    6,    LOCALTIMESTAMP(0) - INTERVAL '100 minutes', 5, 'llego',      LOCALTIMESTAMP(0) - INTERVAL '95 minutes'),
    ('Elena Castillo',   NULL, LOCALTIMESTAMP(0) - INTERVAL '1 day',       3, 'cancelada',  NULL)
  ) AS r (cliente, numero, fecha_hora, personas, estado, llegada_en)
  JOIN cliente c ON c.nombre = r.cliente
  LEFT JOIN mesa m ON m.numero = r.numero;

INSERT INTO lista_espera (id_cliente, personas, registrado_en, estado)
SELECT c.id_cliente, w.personas, LOCALTIMESTAMP(0) - make_interval(mins => w.minutos), w.estado
  FROM (VALUES
    ('Héctor Salas', 3, 25, 'esperando'),
    ('Valeria Núñez', 2, 10, 'esperando'),
    ('Elena Castillo', 4, 120, 'asignada')
  ) AS w (cliente, personas, minutos, estado)
  JOIN cliente c ON c.nombre = w.cliente;

-- ---------------------------------------------------------------------
-- 5. VERIFICACIÓN (ejecutar a mano en el editor SQL de Supabase si se quiere revisar)
--    usuarios 6 · mesas 18 · productos 8 · cuentas 4 · pedidos 8 · detalles 14
--    clientes 8 · reservaciones 5 · lista_espera 3
--    Totales sin cancelados: mesa 3 = 375, mesa 5 = 350, mesa 6 = 435, mesa 8 = 345
-- ---------------------------------------------------------------------
