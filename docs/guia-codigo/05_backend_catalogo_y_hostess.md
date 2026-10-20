# 05 · Backend: catálogo (productos y categorías) y hostess

> **Nota sobre la reorganización:** este documento se escribió **antes** de reorganizar el proyecto a la estructura acordada. Los nombres de funciones, bloques y explicaciones siguen siendo válidos, pero los **números de línea y las rutas de archivo** son los de la versión anterior. El mapa «antes → ahora» está en `00_INDICE_Y_RECURSOS.md`.

Archivos: `routes/catalogo.ts` (256 líneas, solo gerente) y `routes/hostess.ts` (462 líneas: clientes, reservaciones y lista de espera). Con este documento queda completo el backend.

---

## `routes/catalogo.ts`: productos, categorías e inventario (gerente)

Esta es la API que usa la pantalla **Productos e inventario** del gerente.

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 11 | `catalogoRouter.use(requiereAuth("gerente"))`: todo el archivo es solo del gerente. | La seguridad está en el servidor. |
| 13 | `Texto(max)`: crea un esquema de texto recortado, obligatorio y con máximo. | Mismo patrón que en `usuarios.ts`. |
| 15–17 | `esDuplicado(error)`: `true` si MySQL lanzó `ER_DUP_ENTRY` (valor repetido en una columna única). | Para dar un 409 claro en vez de un 500. |

### Categorías (líneas 19–98)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 22–26 | `CategoriaAdminDto`: `id_categoria`, `nombre` y `total_productos` (calculado). | |
| 28–37 | `cargarCategoria`: la categoría con su cuenta de productos: `LEFT JOIN` con `producto`, `COUNT(p.id_producto)` y `GROUP BY`. | `LEFT JOIN` hace que una categoría **sin productos** aparezca con 0. |
| 40–50 | `GET /categorias`: lista todas con su total de productos. | |
| 52 | `CategoriaCuerpo`: `{ nombre }` de hasta 80 caracteres. | |
| 55–64 | `POST /categorias`: inserta y responde 201 con la categoría. Si el nombre ya existe, 409. | |
| 67–79 | `PATCH /categorias/:id`: renombra; 404 si no existe; 409 si el nombre ya está. | |
| 85–98 | `DELETE /categorias/:id`: solo se borra una categoría **vacía** (si tiene productos, 409 con el número). | Los productos no se reasignan solos. |

### Productos e inventario (líneas 100–256)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 103–119 | `ProductoAdminDto`: `activo` es la columna `producto.disponible` (el gerente lo tiene en el menú) y `disponible` es **calculado** (lo que ve el mesero). | Dos conceptos distintos con nombres parecidos: «activo en el menú» y «disponible para pedir». |
| 121–127 | `SELECT_PRODUCTO`: une `producto`, `categoria_menu` y (con `LEFT JOIN`) `disponibilidadProducto`; `COALESCE` pone 0 si no hay fila de inventario. | |
| 129–146 | `aProductoDto`: convierte la fila; la línea 144 calcula `disponible = activo && (!controla || existencia > 0)`. | |
| 153–156 | `exigirCategoria`: comprueba que la categoría exista (422). | |
| 159–162 | `GET /productos`: **todos** los productos (también los inactivos) con su inventario. | |
| 165–169 | `Precio`: número de 0 a 99 999 999 con **máximo 2 decimales**. La validación `refine` multiplica por 100 y comprueba que el resultado sea casi entero (tolerancia `1e-6`). | La columna es `DECIMAL(10,2)`. La tolerancia evita falsos errores por decimales binarios (`0.1 + 0.2`). |
| 170 | `Entero`: entero de 0 a 1 000 000. | Para existencia y stock mínimo. |
| 172–182 | `CrearProducto`: categoría, nombre, descripción opcional, precio y campos opcionales. | |
| 185–202 | `POST /productos`: en una transacción valida la categoría, inserta en `producto` (por defecto activo y con control de existencia) y crea su fila en `disponibilidadProducto`. Responde 201. | Son dos tablas: se guardan las dos o ninguna. |
| 204–215 | `EditarProducto` con `.partial()`: cualquier subconjunto de campos. | |
| 222–256 | `PATCH /productos/:id`: transacción; lee el producto con `FOR UPDATE`; arma un `UPDATE` dinámico con `sets` y `params` para las columnas de `producto`; y si llegó `existencia` o `stock_minimo`, hace un *upsert* en `disponibilidadProducto`. | Cambiar el precio **no altera pedidos ya hechos**, porque cada línea guarda su `precio_unitario`. |
| 246–250 | `INSERT ... ON DUPLICATE KEY UPDATE existencia = COALESCE(?, existencia)`: si la fila de inventario no existe se crea; si existe, solo cambia el campo que llegó (`COALESCE` conserva el valor actual cuando el nuevo es `NULL`). | Evita pisar un campo con 0 cuando solo cambió el otro. |

**Por qué no hay `DELETE` de productos:** hay pedidos que los referencian. Se desactivan con `activo: false`, y el mesero los ve como agotados.

---

## `routes/hostess.ts`: clientes, reservaciones y lista de espera

Todas las rutas son para `hostess` y `gerente`. El router se monta en `/api`, por eso las rutas se llaman `/clientes`, `/reservaciones` y `/lista-espera`.

### Esquemas de validación (líneas 11–40)

| Líneas | Qué valida |
| --- | --- |
| 11–13 | Filtros de consulta: `fecha` (opcional), `estado` de la espera (`esperando`, `asignada`, `cancelada`) y `q` (texto de búsqueda de clientes). |
| 14–18 | `ClienteNuevo`: nombre de 1 a 100; **teléfono con exactamente 10 dígitos** (`/^\d{10}$/`); correo opcional (válido o vacío). `.strict()` rechaza campos desconocidos. |
| 19–24 | `ReservacionNueva`: cliente, `fecha_hora` con formato `AAAA-MM-DD HH:MM:SS`, personas de 1 a 20 y mesa opcional. |
| 25–28 | `EsperaNueva`: cliente y personas de 1 a 20. |
| 29–37 | `CambioReservacion`: estado (`confirmada` o `cancelada`), fecha, personas y mesa, todos opcionales. El `refine` exige **al menos un campo** con valor. |
| 38–40 | `LlegadaReservacion`: mesa opcional. |

### Funciones de apoyo (líneas 42–127)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 42–44 | `esDuplicado`. | Igual que en el catálogo. |
| 46–58 | `esFechaHoraMySQLValida`: separa la cadena con una regex en año, mes, día, hora, minuto y segundo; rechaza años menores a 1000; construye una fecha con `Date.UTC(...)` y comprueba que **cada componente coincida**. | JavaScript «corrige» fechas imposibles (30 de febrero pasa a 2 de marzo). Si el resultado no coincide con lo escrito, la fecha era inválida. |
| 60–95 | `cargarCliente`, `cargarReservacion`, `cargarEspera`: leen un registro con los datos del cliente (y número de mesa). `exigirRegistro` lanza un 500 si un registro recién creado no se encuentra. | Evitan repetir las mismas consultas. |
| 97–102 | `esFechaISOValida(fecha)`: valida `AAAA-MM-DD` con la misma idea: crea la fecha y compara su `toISOString()`. | |
| 104–108 | `diaSiguiente(fecha)`: suma un día en UTC. | Para filtrar «desde las 00:00 del día hasta las 00:00 del siguiente». |
| 110–127 | `liberarMesaSiCorresponde`: si una mesa estaba `reservada` y **ya no hay otra reservación vigente** (`pendiente` o `confirmada`) para ella, la pasa a `libre`. | Se llama al cancelar o cambiar de mesa una reservación. |

### `GET /api/clientes?q=` (líneas 129–149)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 131–135 | Si `q` tiene menos de 2 caracteres, devuelve `[]`. | Evita búsquedas enormes con una sola letra. |
| 137–138 | `digitos = q.replace(/\D/g, "")` deja solo números; se busca por teléfono si hay 3 o más. | |
| 143 | `LOCATE(?, nombre) > 0`: busca el texto **dentro** del nombre (búsqueda parcial). | |
| 145 | `LIMIT 20`. | Máximo 20 resultados. |

### `POST /api/clientes` (líneas 151–174)

Valida, normaliza el correo (`?.trim() || null`) y, con idempotencia, comprueba si **ya existe un cliente con ese teléfono** (409 «Búscalo para seleccionarlo»). Inserta y devuelve el cliente (201). También captura `ER_DUP_ENTRY` por si dos peticiones llegan a la vez.

### `GET /api/reservaciones?fecha=` (líneas 176–207)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 179–181 | Si llega `fecha`, debe ser válida (422). | |
| 185–187 | Sin `fecha`: usa **hoy** (`CURDATE()` hasta `CURDATE() + 1 día`). | |
| 188–190 | Caso especial `9999-12-31`: usa un rango inclusivo hasta las 23:59:59. | No se puede calcular «el día siguiente» de la última fecha de MySQL. |
| 191–194 | Caso normal: desde las 00:00 de ese día hasta antes de las 00:00 del siguiente. | Un rango abierto por la derecha incluye todo el día. |
| 195–205 | Une con `cliente` y (`LEFT JOIN`) `mesa`, ordena por fecha. | |

### `POST /api/reservaciones` (líneas 209–254)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 212–214 | La fecha debe ser válida según `esFechaHoraMySQLValida`. | |
| 218–225 | Pregunta a **MySQL** si la fecha es `pasada` (anterior a «ahora» al minuto), `lejana` (más de 365 días) y si `es_hoy`. | Usa el reloj de la base de datos, que es el mismo con el que se guardan las fechas. |
| 227–229 | Pasada o lejana: 422. | Regla del negocio: no se registran reservas en fechas pasadas. |
| 230–232 | Solo se asigna mesa a reservaciones **de hoy**. | |
| 234–235 | El cliente debe existir (404). | |
| 237–244 | Si se eligió mesa: la bloquea con `FOR UPDATE`, debe estar `libre` (409) y la pasa a `reservada`. | |
| 246–251 | Inserta la reservación (estado `pendiente` por defecto) y la devuelve. | |

### `PATCH /api/reservaciones/:id` (líneas 256–350)

Confirmar, cancelar o editar una reservación **pendiente o confirmada**.

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 263–271 | Lee la reservación con `FOR UPDATE`; solo `pendiente` o `confirmada` se pueden cambiar. | |
| 274–277 | Si se manda `estado`, **no** puede venir ningún otro campo («cambia el estado o edita los datos, no las dos cosas»). | |
| 278–282 | `confirmada`: solo desde `pendiente`. | |
| 283–286 | `cancelada`: pone el estado, **quita la mesa** (`id_mesa = NULL`) y llama a `liberarMesaSiCorresponde`. | Una reserva cancelada libera su mesa (regla 3 del dominio). |
| 287–345 | Edición: calcula los valores finales (los nuevos o los actuales), valida la fecha nueva (si cambió, no pasada ni lejana), exige que la mesa sea para una reservación de hoy, y si cambió de mesa, bloquea la nueva, comprueba que esté `libre` y la marca `reservada`. | |
| 329–343 | Arma el `UPDATE` dinámico solo con los campos recibidos. | |
| 344 | Si cambió la mesa, libera la anterior si corresponde. | |

### `POST /api/reservaciones/:id/llegada` (líneas 352–417)

Registra que el cliente llegó y lo **sienta** en una mesa.

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 359–367 | Bloquea la reservación; debe estar `pendiente` o `confirmada`. | |
| 369–373 | La mesa es la elegida o la que ya tenía; si no hay ninguna, 422. | |
| 374–382 | Bloquea la mesa; debe estar `libre` o `reservada` (409 si está ocupada). | |
| 383–395 | Si la mesa está `reservada` pero para **otra** reservación vigente, 409. | |
| 397–402 | Marca la mesa `ocupada` y la reservación `llego` con `llegada_en = NOW()`. | |
| 403 | Si cambió de mesa, libera la anterior. | |
| 405–414 | Responde `{ mesa, reservacion, espera: null }`. | Misma forma de respuesta que `/mesas/:id/asignar`. |

### `GET /api/lista-espera` (líneas 419–437)

Con `?estado=` filtra por ese estado. Sin él, devuelve los grupos **de hoy** más cualquiera que siga `esperando` aunque sea de días anteriores. Ordena por hora de registro (orden de llegada).

### `POST /api/lista-espera` (líneas 439–462)

En una transacción: bloquea al cliente (`FOR UPDATE`), comprueba que **no tenga ya un grupo esperando** (409) e inserta. Devuelve el grupo con los datos del cliente. **Falta** `PATCH /api/lista-espera/:id` para editar o quitar un grupo.

---

## Lo que ya sabes del backend

Con los documentos 02 a 05 cubres el backend completo (`config`, `db`, `errores`, `auth`, `idempotencia`, `index`, `seed`, `dominio` y las 9 rutas). Los patrones que más se repiten:

1. **Validar** con zod en la puerta (`validar`).
2. **Autorizar** por rol (`requiereAuth`).
3. **Transacción** más bloqueo (`FOR UPDATE`) cuando varios cambios deben ir juntos.
4. **Idempotencia** en acciones que no deben duplicarse.
5. **Errores uniformes** (`ErrorApi` con código y mensaje).
6. **Calcular en el servidor** precios, totales y disponibilidad.

Siguiente: `01_base_de_datos.md` y el índice con recursos de estudio.
