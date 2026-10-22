# 01 · Base de datos (carpeta `database/`)

> **Nota sobre la reorganización:** este documento se escribió **antes** de reorganizar el proyecto a la estructura acordada. Los nombres de funciones, bloques y explicaciones siguen siendo válidos, pero los **números de línea y las rutas de archivo** son los de la versión anterior. El mapa «antes → ahora» está en `00_INDICE_Y_RECURSOS.md`.

Archivos: `schema.sql` (227 líneas, crea todo), `seed.sql` (25), `seed_demo.sql` (168), y las migraciones `migracion_01` a `04`. Motor: **MySQL 8**, base `SIGR`.

---

## Conceptos que necesitas

| Concepto | Qué es | Dónde se ve aquí |
| --- | --- | --- |
| **Tabla** | Una «hoja» con columnas y filas. | `CREATE TABLE usuario (...)` |
| **Clave primaria (PK)** | Columna que identifica de forma única cada fila. | `id_usuario INT AUTO_INCREMENT PRIMARY KEY` |
| **`AUTO_INCREMENT`** | MySQL asigna el siguiente número solo. | Todos los `id_...` |
| **Clave foránea (FK)** | Columna que apunta a la PK de otra tabla; garantiza que lo referenciado existe. | `FOREIGN KEY (id_rol) REFERENCES rol (id_rol)` |
| **`ON DELETE RESTRICT`** | No deja borrar una fila si otra la referencia. | En **todas** las FK del proyecto |
| **`ON UPDATE CASCADE`** | Si cambia la PK, las FK se actualizan solas. | En todas las FK |
| **`UNIQUE`** | No se puede repetir el valor. | `correo`, `nombre_usuario`, `numero` de mesa |
| **`CHECK`** | Regla que deben cumplir los valores. | `capacidad > 0`, `precio >= 0` |
| **`DEFAULT`** | Valor por omisión. | `estado ... DEFAULT 'libre'` |
| **`NULL`** | «Sin valor». `NOT NULL` lo prohíbe. | `llegada_en DATETIME NULL` |
| **Índice** | Estructura que acelera búsquedas por una columna. | `CREATE INDEX idx_pedido_fecha_hora ...` |
| **Vista** | Una consulta guardada con nombre. | `vista_ventas_detalle` |
| **Relación 1 a 1 / 1 a N** | Una fila ↔ una fila, o una fila ↔ muchas filas. | `usuario`↔`credenciales` es 1 a 1; `cuenta`→`pedido` es 1 a N |

---

## `schema.sql`, línea por línea

### Encabezado (líneas 1–4)

| Líneas | Qué hace |
| --- | --- |
| 1 | Comentario: es el resultado de la práctica P23 (modelo de datos). |
| 3 | Crea la base `SIGR` si no existe, con `utf8mb4` (acepta acentos y emojis) y `utf8mb4_unicode_ci` (comparación sin distinguir mayúsculas ni acentos). |
| 4 | `USE SIGR`: las siguientes sentencias se aplican a esa base. |

### Personas y acceso

| Líneas | Tabla | Qué guarda | Detalles |
| --- | --- | --- | --- |
| 6–9 | `rol` | Los roles del sistema. | `nombre` único. Se llena en la línea 219. |
| 11–19 | `usuario` | Empleados. | `id_rol` es FK a `rol`; `correo` único; `activo` (por defecto verdadero) permite **desactivar** sin borrar; `creado_en` se llena solo con `CURRENT_TIMESTAMP`. |
| 21–27 | `credenciales` | Cómo entra cada usuario. | **Su PK es `id_usuario`**: relación 1 a 1 con `usuario`. Guarda `nombre_usuario` (único), `password_hash` (nunca la contraseña) y `ultimo_acceso`. |
| 29–34 | `perfil_usuario` | Datos extra (teléfono, dirección). | También 1 a 1 con `usuario`. |

**Por qué 3 tablas para un usuario:** separar `credenciales` de `usuario` evita traer el hash en consultas normales y permite cambiar la forma de iniciar sesión sin tocar el resto.

### Clientes, mesas y menú

| Líneas | Tabla | Qué guarda | Detalles |
| --- | --- | --- | --- |
| 36–41 | `cliente` | Clientes (para reservas y lista de espera). | `telefono` y `correo` pueden ser `NULL`. **No hay `UNIQUE` en el teléfono**: la unicidad la valida el backend con una consulta (`routes/hostess.ts`). |
| 43–48 | `mesa` | Mesas del salón. | `numero` único; `capacidad > 0`; `estado` solo puede ser `libre`, `ocupada` o `reservada` (`CHECK`). *Después se agregaron `zona` (sección) y `activa` (disponible): migración 005.* |
| 50–53 | `categoria_menu` | Entradas, Platos fuertes, Postres, Bebidas. | `nombre` único. |
| 55–65 | `producto` | Platillos y bebidas. | `precio DECIMAL(10,2)` (hasta 99 999 999.99) con `CHECK >= 0`; `disponible` = **activo en el menú**; `controla_existencia`: verdadero = se cuenta inventario; falso = se prepara al momento (comentario de la línea 62). |
| 67–73 | `disponibilidadProducto` | El inventario. | `id_producto` **único**: una fila de inventario por producto. `existencia` y `stock_minimo` no pueden ser negativos. |

**Por qué `DECIMAL` y no `FLOAT`:** `FLOAT` guarda aproximaciones binarias (`0.1 + 0.2 = 0.30000000000000004`). `DECIMAL` guarda el valor exacto, indispensable para dinero.

### Reservaciones y espera

| Líneas | Tabla | Qué guarda | Detalles |
| --- | --- | --- | --- |
| 75–85 | `reservacion` | Reservaciones. | `id_mesa` puede ser `NULL` (aún sin mesa); `fecha_hora`; `personas > 0`; `estado` es texto libre (por defecto `pendiente`); `llegada_en` se llena al registrar la llegada. FK a `cliente` y `mesa`. |
| 87–94 | `lista_espera` | Grupos esperando mesa. | `registrado_en` con la hora de llegada (define el orden); `estado` por defecto `esperando`. |

### Cuentas y pedidos (el corazón del sistema)

| Líneas | Tabla | Qué guarda | Detalles |
| --- | --- | --- | --- |
| 96–104 | `cuenta` | La cuenta de una mesa. | `estado`: `abierta`, `por_pagar` o `cerrada` (`CHECK`); `tipo_pago_solicitado`: `fisico`, `digital` o `NULL`; `abierta_en` y `cerrada_en`. |
| 106–109 | `estado_pedido` | Catálogo de estados. | Se llena en la línea 220. |
| 111–114 | `motivo_cancelacion` | Textos de motivos. | `descripcion` hasta 200 caracteres. |
| 116–128 | `pedido` | Un pedido. | FK a `cuenta`, `usuario` (el mesero), `estado_pedido` y `motivo_cancelacion` (`NULL` mientras no se cancele). **No tiene `id_mesa`**: se llega a la mesa por la cuenta. |
| 130–139 | `detalle_pedido` | Las líneas de un pedido. | `cantidad > 0`; **`precio_unitario` guarda el precio al momento de pedir**, así cambiar el menú no altera pedidos viejos. |

### Caja y facturación (la API aún no los usa)

| Líneas | Tabla | Para qué será |
| --- | --- | --- |
| 141–148 | `corte_caja` | El corte de un cajero (inicio, fin y total reportado). |
| 150–160 | `venta` | El cobro de una cuenta. `id_cuenta` es **único**: una venta por cuenta. |
| 162–165 | `metodo_pago` | Efectivo, Tarjeta, Transferencia. |
| 167–176 | `pago` | Cada pago de una venta (puede haber varios: pago dividido). `monto > 0`. |
| 178–186 | `datos_fiscales` | RFC, razón social, régimen y código postal de un cliente. |
| 188–197 | `factura` | Factura de una venta (única por venta) con `folio` único. |

### Idempotencia, índices y vista

| Líneas | Qué hace |
| --- | --- |
| 199–207 | `idempotencia`: guarda por **(clave, usuario)** la ruta, el código HTTP y la respuesta en formato `JSON`. La PK compuesta impide repetir la misma clave para el mismo usuario. Es la tabla que usa `backend/src/idempotencia.ts`. |
| 209–212 | Cuatro índices sobre columnas de fecha (`reservacion`, `pedido`, `venta`, `lista_espera`) porque se filtra y ordena mucho por ellas. |
| 214–217 | `vista_ventas_detalle`: junta venta, cajero y número de mesa para reportes. |
| 219 | Inserta los 5 roles: Gerente, Mesero, Cocinero, Cajero, Hostess. |
| 220 | Inserta los 7 estados de pedido. **Orden de ids:** Pendiente=1, En preparacion=2, Listo=3, Entregado=4, Cancelado=5, Registrado=6, Pagado=7. |
| 221 | Nota: `Pendiente` significa «enviado a cocina». |
| 222 | Inserta los 3 métodos de pago. |
| 224–228 | Consultas de verificación al final. |

### Diagrama de relaciones (resumido)

```
rol 1──N usuario 1──1 credenciales
              │  └──1 perfil_usuario
              ├──N pedido (como mesero)
              ├──N corte_caja / venta (como cajero)

mesa 1──N cuenta 1──N pedido 1──N detalle_pedido N──1 producto N──1 categoria_menu
 │                │        └──N──1 estado_pedido        └──1 disponibilidadProducto
 │                │        └──N──1 motivo_cancelacion (opcional)
 │                └──1 venta 1──N pago N──1 metodo_pago
 │                       └──1 factura N──1 datos_fiscales N──1 cliente
 └──N reservacion N──1 cliente 1──N lista_espera
```

---

## `seed.sql`: datos base (25 líneas)

| Líneas | Qué inserta |
| --- | --- |
| 3 | Mesas 1 a 6 con capacidades 2, 2, 4, 4, 6 y 8. |
| 5 | Las 4 categorías del menú. |
| 7–17 | 8 productos. Los platos que se hacen al momento (guacamole, sopa, tacos, enchiladas, horchata) llevan `controla_existencia = FALSE`; el flan, el refresco y la cerveza llevan `TRUE`. |
| 19–20 | **Inventario automático:** `INSERT ... SELECT id_producto, 50, 5 FROM producto` crea una fila de inventario con existencia 50 y stock mínimo 5 para cada producto. |
| 22–23 | Los motivos de cancelación de ejemplo. |
| 25–26 | Un cliente de prueba. |

## `seed_demo.sql`: datos de demostración (168 líneas)

Se carga **después** de `seed.sql` y de `npx tsx src/seed.ts`. Agrega mesas 7 a 12 (con estados variados) y 13 a 18, un segundo mesero (`mesero2`), cuentas y pedidos de ejemplo (para ver cada estado en pantalla), clientes, reservaciones y lista de espera. Las fechas son relativas a `NOW()`. El comentario `[PENDIENTE-BD]` de las líneas 18–20 recuerda que `reservacion.estado` y `lista_espera.estado` son texto libre, sin catálogo ni `CHECK`.

**Orden de carga:** `schema.sql` → `seed.sql` → `seed.ts` (usuarios con hash) → `seed_demo.sql`.

---

## Migraciones (para bases que ya existían)

Una **migración** es un script que cambia una base ya creada sin perder datos. Si recreas la base desde el `schema.sql` actual, **no** corras las migraciones: ya incluye todo.

| Migración | Qué cambia |
| --- | --- |
| `01_front` | Los estados de mesa pasan de `disponible` a `libre`; agrega el `CHECK` de `mesa.estado`; agrega `cuenta.tipo_pago_solicitado` con sus `CHECK`; inserta los estados `Registrado` y `Pagado` (con `INSERT IGNORE`, que ignora duplicados) y el motivo «Otro». |
| `02_api` | `motivo_cancelacion.descripcion` pasa a `VARCHAR(200)`; crea la tabla `idempotencia`. |
| `03_existencia` | Agrega `producto.controla_existencia` (todos en `TRUE`) y desactiva el control para entradas, platos fuertes y la horchata. |
| `04_mesas` | Agrega las mesas 13 a 18 **solo si no existen** (un `LEFT JOIN` con la tabla `mesa` y `WHERE existente.id_mesa IS NULL`), por eso se puede correr varias veces. |

---

## Para repasar (preguntas de estudio)

1. ¿Por qué `pedido` no tiene `id_mesa`? ¿Cómo se llega a la mesa de un pedido?
2. ¿Por qué `detalle_pedido` guarda `precio_unitario` si ya existe `producto.precio`?
3. ¿Qué pasaría si las llaves foráneas usaran `ON DELETE CASCADE` en vez de `RESTRICT`?
4. ¿Por qué `credenciales.id_usuario` es a la vez PK y FK?
5. ¿Qué diferencia hay entre `producto.disponible` y la disponibilidad que ve el mesero?

Siguiente: `00_INDICE_Y_RECURSOS.md`.
