USE SIGR;

INSERT INTO mesa (numero, capacidad) VALUES (1,2),(2,2),(3,4),(4,4),(5,6),(6,8);

INSERT INTO categoria_menu (nombre) VALUES ('Entradas'),('Platos fuertes'),('Postres'),('Bebidas');

INSERT INTO producto (id_categoria, nombre, descripcion, precio) VALUES
(1, 'Guacamole', 'Con totopos', 85.00),
(1, 'Sopa de tortilla', NULL, 70.00),
(2, 'Tacos de arrachera', 'Orden de 4', 140.00),
(2, 'Enchiladas verdes', 'Con pollo', 120.00),
(3, 'Flan', NULL, 55.00),
(4, 'Agua de horchata', '500 ml', 35.00),
(4, 'Refresco', NULL, 30.00),
(4, 'Cerveza', NULL, 50.00);

INSERT INTO disponibilidadProducto (id_producto, existencia, stock_minimo)
SELECT id_producto, 50, 5 FROM producto;

INSERT INTO motivo_cancelacion (descripcion) VALUES
('Cliente cambió de opinión'),('Producto agotado'),('Error al capturar'),('Otro');

INSERT INTO cliente (nombre, telefono, correo) VALUES
('Cliente Prueba', '3111234567', 'cliente@correo.com');