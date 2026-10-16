USE SIGR;

INSERT INTO mesa (numero, capacidad) VALUES (1,2),(2,2),(3,4),(4,4),(5,6),(6,8);

INSERT INTO categoria_menu (nombre) VALUES ('Entradas'),('Platos fuertes'),('Postres'),('Bebidas');

-- controla_existencia = FALSE: se prepara al momento (no hay existencia que contar).
-- TRUE: viene ya hecho o embotellado (postre, refresco, cerveza) y su existencia sí se controla.
INSERT INTO producto (id_categoria, nombre, descripcion, precio, controla_existencia) VALUES
(1, 'Guacamole', 'Con totopos', 85.00, FALSE),
(1, 'Sopa de tortilla', NULL, 70.00, FALSE),
(2, 'Tacos de arrachera', 'Orden de 4', 140.00, FALSE),
(2, 'Enchiladas verdes', 'Con pollo', 120.00, FALSE),
(3, 'Flan', NULL, 55.00, TRUE),
(4, 'Agua de horchata', '500 ml', 35.00, FALSE),
(4, 'Refresco', NULL, 30.00, TRUE),
(4, 'Cerveza', NULL, 50.00, TRUE);

INSERT INTO disponibilidadProducto (id_producto, existencia, stock_minimo)
SELECT id_producto, 50, 5 FROM producto;

INSERT INTO motivo_cancelacion (descripcion) VALUES
('Cliente cambió de opinión'),('Producto agotado'),('Error al capturar'),('Otro');

INSERT INTO cliente (nombre, telefono, correo) VALUES
('Cliente Prueba', '3111234567', 'cliente@correo.com');