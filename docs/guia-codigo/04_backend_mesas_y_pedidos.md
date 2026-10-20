# 04 · Backend: rutas de mesas y pedidos

> **Nota sobre la reorganización:** este documento se escribió **antes** de reorganizar el proyecto a la estructura acordada. Los nombres de funciones, bloques y explicaciones siguen siendo válidos, pero los **números de línea y las rutas de archivo** son los de la versión anterior. El mapa «antes → ahora» está en `00_INDICE_Y_RECURSOS.md`.

Archivos: `routes/mesas.ts` (190 líneas) y `routes/pedidos.ts` (272 líneas). Son las rutas con más reglas de negocio. Necesitas haber leído `02` y `03`.

**Ideas clave antes de empezar**

- Un **pedido** pertenece a una **cuenta**, y la cuenta a una **mesa**. La tabla `pedido` no tiene `id_mesa`: la mesa se obtiene por la cuenta.
- Ciclo de vida de un pedido: `registrado` → `enviado` (a cocina) → `en_preparacion` → `listo` → `entregado`. Desde varios de esos estados se puede pasar a `cancelado`.
- Las acciones que cambian cosas se hacen dentro de una **transacción** y con `FOR UPDATE`, para que dos personas a la vez no se pisen.

---

## `routes/mesas.ts`

### `GET /api/mesas` (líneas 11–58): el panel de mesas

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 17 | `requiereAuth()`: cualquier usuario con sesión. | El mesero y la hostess ven el panel. |
| 20 | Columnas de la mesa: `id_mesa`, `numero`, `capacidad`, `estado`. | |
| 21 | Toma `estado` y `tipo_pago_solicitado` de la cuenta activa. | |
| 22–24 | `COALESCE(..., 0)`: si no hay cuenta o pedidos, devuelve 0 en vez de `NULL`. | |
| 26 | `LEFT JOIN cuenta c ON c.id_mesa = m.id_mesa AND c.estado <> 'cerrada'`: une cada mesa con su cuenta **no cerrada**. `LEFT JOIN` conserva las mesas sin cuenta. | La condición `<> 'cerrada'` está en el `ON`, no en el `WHERE`; si estuviera en el `WHERE`, las mesas sin cuenta desaparecerían. |
| 27–33 | Subconsulta que, por cuenta, cuenta los pedidos activos (`SUM(ep.nombre NOT IN ('Cancelado','Pagado'))`) y los listos (`SUM(ep.nombre = 'Listo')`). | En MySQL una comparación vale 1 o 0, así que `SUM` de comparaciones **cuenta** cuántas son verdaderas. |
| 34–41 | Otra subconsulta que suma `cantidad * precio_unitario` de los pedidos no cancelados: el total de la cuenta. | |
| 42 | `ORDER BY m.numero`. | |
| 45–57 | Convierte cada fila al JSON final con `Number(...)` para los números calculados. | `SUM` puede llegar como texto o decimal. |

### `GET /api/mesas/:id/cuenta` (líneas 60–71)

Busca la cuenta no cerrada más reciente de esa mesa (`ORDER BY id_cuenta DESC LIMIT 1`), la carga con `cargarCuenta` y responde. Si no hay, 404 «La mesa no tiene una cuenta activa».

### `POST /api/mesas/:id/asignar` (líneas 73–169): sentar a un grupo

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 74 | `CambioEstado`: el estado debe ser `libre`, `ocupada` o `reservada`. | Coincide con el `CHECK` de `schema.sql`. |
| 75–79 | `Asignacion`: `z.union` de **tres formas posibles** de asignar: por `id_reservacion`, por `id_espera` o por número de `personas` (1 a 99). Cada una es `.strict()`. | `.strict()` rechaza campos extra, así que no se pueden mezclar formas. |
| 82 | Solo `hostess` y `gerente`. | |
| 86–87 | Todo corre en `conIdempotencia(...)` y dentro de `transaccion(...)`. | Si falla algo, no queda nada a medias y reintentar no duplica. |
| 88 | `"id_reservacion" in grupo`: el operador `in` revisa qué forma llegó. | TypeScript lo usa para estrechar el tipo. |
| 89–98 | Si es reservación: la lee con `FOR UPDATE`; debe existir (404), estar `pendiente` o `confirmada` y, si ya tenía mesa, ser **esta** mesa (409). | Bloquear la fila evita que dos hostess sienten la misma reservación. |
| 99–109 | Si es lista de espera: la lee con `FOR UPDATE`; debe existir y estar `esperando`. | |
| 111–115 | `UPDATE mesa SET estado = 'ocupada' WHERE id_mesa = ? AND estado IN ('libre','reservada')`. | La condición hace de **candado lógico**: si la mesa ya estaba ocupada no se afecta ninguna fila. |
| 116–120 | Si `affectedRows === 0`: 404 si la mesa no existe, o 409 `mesa_no_disponible` si ya estaba ocupada. | |
| 125–131 | Si era reservación: la marca `llego`, le pone la mesa y `llegada_en = NOW()`. | |
| 132–135 | Si era espera: la marca `asignada`. | |
| 137–166 | Vuelve a leer la mesa, la reservación y la espera (con datos del cliente) y devuelve `{ mesa, reservacion, espera }`. | La pantalla de la hostess actualiza todo con una sola respuesta. |

### `PATCH /api/mesas/:id/estado` (líneas 171–190)

Cambia el estado de una mesa (sentar, liberar, reservar). Solo `hostess` y `gerente`. Si el nuevo estado **no** es `ocupada`, primero comprueba que la mesa **no tenga una cuenta activa** (409): hay que cerrarla antes.

---

## `routes/pedidos.ts`

### Esquemas de validación (líneas 26–49)

| Líneas | Qué valida |
| --- | --- |
| 27–31 | `Linea`: `id_producto` entero positivo, `cantidad` de 1 a 99 e `indicaciones` hasta 255 caracteres (por defecto `""`). **No existe campo de precio**: el cliente nunca envía precios. |
| 32 | `LineaPedido = z.infer<typeof Linea>`: el tipo TypeScript sale del esquema. |
| 34–35 | `NuevoPedido` (con `id_mesa`) y `Actualizacion`: ambos exigen al menos una línea. |
| 37–43 | `Cancelacion`: la `descripcion` va recortada, de 5 a 200 caracteres (es el tamaño de la columna). |
| 44 | `CambioCocina`: el estado solo puede ser `en_preparacion` o `listo`. |
| 45–49 | `Filtros` de la consulta (`req.query`). `z.coerce.number()` convierte el texto `"3"` de la URL en número. |

### Funciones de apoyo (líneas 51–78)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 52–56 | `guardarDetalle`: llama a `exigirDisponibles`, arma una lista de filas `[pedido, producto, cantidad, precio, indicaciones]` y las inserta de una vez con `INSERT ... VALUES ?`. El **precio** sale de `productos.get(...)!.precio`, o sea de la BD. | Un solo `INSERT` para todas las líneas es más rápido. Se guarda el precio **vigente**: si el menú sube después, este pedido conserva su precio. |
| 59–72 | `bloquearPedido`: lee el pedido con `FOR UPDATE OF p` (bloquea solo la fila de `pedido`, no las de `estado_pedido` ni `cuenta`) y devuelve el estado en código interno y si la cuenta está `por_pagar`. | Las acciones sobre un pedido empiezan bloqueándolo para que dos peticiones no lo cambien a la vez. |
| 70 | Busca el código interno cuyo nombre coincide con el de la BD; si no encuentra, usa `"registrado"`. | |
| 74–78 | `pedidoOError`: carga el pedido o lanza 404. | |

### `POST /api/pedidos` (líneas 80–113): crear un pedido

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 84 | Solo `mesero` y `gerente`. | |
| 86 | `meseroId = req.usuario!.id`: el mesero es quien tiene la sesión, no se manda en el cuerpo. | Nadie puede crear pedidos «a nombre de otro». |
| 88–89 | `conIdempotencia(req, res, 201, ...)` y `transaccion(...)`. | 201 = «creado». |
| 91–95 | Lee la mesa con `FOR UPDATE`; debe existir y estar `ocupada` (409 `mesa_no_disponible`). | Regla: un pedido solo se registra si la mesa está ocupada. El bloqueo evita abrir dos cuentas a la vez. |
| 98–99 | `exigirDisponibles` (¿existen y están activos?) y `verificarExistencia(..., false)`, que avisa sin descontar. | Se valida **antes** de crear la cuenta: si hay agotados, no se crea nada. |
| 101–102 | Busca la cuenta no cerrada de la mesa; si está `por_pagar`, 409. | Con el pago solicitado ya no se aceptan más pedidos. |
| 103–105 | Si hay cuenta, usa su id; si no, **crea** una (`INSERT INTO cuenta`) y toma el `insertId`. | La cuenta se abre con el primer pedido. |
| 107–109 | Busca el id del estado `registrado`, inserta el pedido y guarda su detalle. | |
| 110 | Devuelve el pedido completo. | |

### `GET /api/pedidos` (líneas 115–140): listar

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 120 | Valida los filtros de `req.query`. | |
| 121–133 | Arma el `WHERE` poco a poco con `condiciones` y `params`: `id_mesa` y/o `estado` (traducido con `nombreEstadoDeFiltro`; si no existe, 422). | Solo se agregan los filtros que llegaron. |
| 134–137 | **Un mesero solo ve sus propios pedidos** (`p.id_mesero = ?`); los demás roles ven todos. | La regla está en el servidor. |
| 139 | `condiciones.join(" AND ")` une las condiciones. | |

### `GET /api/pedidos/:id` (líneas 142–147)

Un pedido por id; 404 si no existe. Cualquier usuario con sesión puede consultarlo.

### `PATCH /api/pedidos/:id` (líneas 149–173): editar el detalle

Solo si el pedido sigue `registrado` y la cuenta no pidió el pago. **Reemplaza todo el detalle**: borra las líneas (`DELETE FROM detalle_pedido`), valida disponibilidad y existencia, y vuelve a insertarlas. Todo en una transacción.

### `POST /api/pedidos/:id/enviar` (líneas 175–198): mandar a cocina

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 181–184 | Bloquea el pedido; debe estar `registrado`. | |
| 185–192 | Lee las líneas y llama a `verificarExistencia(..., true)`: **bloquea el inventario, verifica y descuenta**. | Un producto pudo agotarse entre el registro y el envío. |
| 194 | Cambia el estado a `enviado` (en la BD, `Pendiente`). | Si algo falló antes, la transacción se deshace y **no se descuenta nada**. |

### `POST /api/pedidos/:id/cancelar` (líneas 200–234)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 207 | Solo `mesero` y `gerente`. | |
| 215–217 | Si está `en_preparacion` y quien cancela **no** es gerente: 403 `requiere_gerente`. | La cocina ya gastó ingredientes; solo el gerente decide. |
| 218–220 | Solo se cancelan `registrado`, `enviado` o `en_preparacion`. | |
| 221–223 | Si la cuenta ya pidió el pago, no se puede. | |
| 225 | Si ya se había enviado, `devolverExistencia` regresa lo descontado al inventario. | |
| 226–230 | Pone estado `cancelado` y guarda el motivo (`idMotivoTexto`). | El pedido **no se borra**: queda en el historial. |

### `POST /api/pedidos/:id/entregar` (líneas 236–250)

Solo si el pedido está `listo` pasa a `entregado` (el mesero ya lo sirvió).

### `PATCH /api/pedidos/:id/estado` (líneas 252–272): acciones de la cocina

Solo `cocinero` y `gerente`. El estado nuevo solo puede **avanzar un paso**: `enviado → en_preparacion` y `en_preparacion → listo` (línea 260 calcula el estado requerido). Si no está en el estado previo, 409. **Aún no existe pantalla de cocina**, pero la API ya está lista.

---

## Cómo se ve el flujo completo (para estudiar)

1. El mesero crea el pedido: `registrado` (se abre la cuenta si no existía).
2. Puede editarlo mientras siga `registrado`.
3. Lo envía: se descuenta la existencia y pasa a `enviado`.
4. La cocina lo avanza: `en_preparacion` y luego `listo`.
5. El mesero lo entrega: `entregado`.
6. Pide la cuenta: la cuenta pasa a `por_pagar`.
7. Si se cancela después de enviarlo, la existencia **regresa** al inventario.

## Conceptos nuevos en este archivo

- **Bloqueo pesimista** (`FOR UPDATE`) y **bloqueo lógico** (`UPDATE ... WHERE estado = ...`).
- **Máquina de estados**: cada acción solo es válida desde ciertos estados.
- **Idempotencia** más **transacción** en cada acción que cambia datos.
- **`z.union`**, **`.strict()`**, **`z.coerce`**.
- **Consultas con subconsultas** que agregan datos (`SUM`, `GROUP BY`).

Siguiente: `05_backend_catalogo_y_hostess.md`.
