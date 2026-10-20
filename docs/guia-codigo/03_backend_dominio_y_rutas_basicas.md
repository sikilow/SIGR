# 03 · Backend: `dominio.ts` y las rutas básicas

> **Nota sobre la reorganización:** este documento se escribió **antes** de reorganizar el proyecto a la estructura acordada. Los nombres de funciones, bloques y explicaciones siguen siendo válidos, pero los **números de línea y las rutas de archivo** son los de la versión anterior. El mapa «antes → ahora» está en `00_INDICE_Y_RECURSOS.md`.

Archivos que cubre: `dominio.ts` (funciones que comparten varias rutas) y las rutas `auth`, `productos`, `menu`, `cuentas` y `usuarios`. Antes lee `02_backend_nucleo.md`.

Una **ruta** de Express se ve así: `router.get("/camino", middleware, async (req, res) => { ... })`. `req` trae lo que manda el cliente (`req.body`, `req.params`, `req.query`, `req.headers`) y `res` sirve para responder (`res.json(...)`, `res.status(201)`).

---

## `src/dominio.ts` (369 líneas): el traductor entre la base de datos y el JSON

La API devuelve JSON cuyas claves son **los nombres exactos de las columnas** de la base de datos. Lo que no es columna se marca como «calculado». Este archivo reúne las consultas y reglas que usan varias rutas.

### Estados del pedido (líneas 12–48)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 15–23 | `ESTADO_PEDIDO_DB`: un objeto que relaciona el **código interno** (`enviado`) con el **nombre en la tabla** `estado_pedido` (`"Pendiente"`). `as const` hace que TypeScript tome los valores como textos exactos, no como `string` genérico. | La BD no tiene un estado «Enviado»; se usa `Pendiente` como «enviado a cocina». |
| 25 | `type EstadoPedido = keyof typeof ESTADO_PEDIDO_DB`: la unión `"registrado" \| "enviado" \| ...`. | Se genera sola a partir del objeto: no se repite la lista. |
| 26 | `ESTADOS_PEDIDO`: la lista de códigos como arreglo; el `as [EstadoPedido, ...EstadoPedido[]]` dice que tiene al menos un elemento. | `z.enum(...)` de zod exige un arreglo no vacío. |
| 29–36 | `normalizarCodigo`: `"En preparación"` pasa a `"en_preparacion"`. `normalize("NFD")` separa cada letra de su acento; el `replace` con `/[\u0300-\u036f]/g` borra los acentos; luego `trim`, minúsculas y los espacios o guiones pasan a `_`. | Así el filtro `?estado=` acepta varias formas de escribirlo. |
| 42–48 | `nombreEstadoDeFiltro`: acepta el código interno, el nombre de catálogo o su versión normalizada y devuelve el nombre exacto de la BD, o `null`. | Es lo que usa `GET /pedidos?estado=`. |

### Utilidades (líneas 50–95)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 51 | `redondear(n)`: `Math.round(n * 100) / 100`. | Evita números como `0.30000000000000004` en dinero. |
| 54–61 | `validar(esquema, datos)`: usa `safeParse` de zod (no lanza, devuelve `success` o `error`). Si falla, arma un texto con cada problema (`campo: mensaje`) y lanza `ErrorApi` 422. Si sale bien, devuelve los datos ya **limpios y tipados** (`z.infer`). | Es la puerta de entrada de datos de **todas** las rutas. |
| 64–70 | `idDeRuta(valor)`: toma el `:id` de la URL. El `Array.isArray` existe porque en Express 5 un parámetro puede ser texto o arreglo. La expresión regular `/^[1-9]\d*$/` exige un entero positivo sin ceros a la izquierda; si no, responde 404. | Evita `/pedidos/abc` o `/pedidos/-1` antes de tocar la BD. |
| 72–84 | `idEstadoPedido`: busca el `id_estado` por nombre en `estado_pedido`; si falta, error 500 que sugiere correr `migracion_01_front.sql`. | Los pedidos guardan el **id** del estado, no su nombre. |
| 90–95 | `idMotivoTexto`: el motivo de cancelación es texto libre (5 a 200 caracteres). Si ya hay un motivo igual en `motivo_cancelacion`, reutiliza su id; si no, lo inserta. | Evita filas repetidas. |

### Productos y disponibilidad (líneas 97–141)

Un producto está **disponible** si está activo (`producto.disponible`) **y** (no controla existencia **o** tiene existencia mayor a 0).

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 107–128 | `productosPorId(ex, ids)`: devuelve un `Map` de `id → {nombre, precio, disponible}`. El `WHERE p.id_producto IN (?)` recibe el arreglo `ids` y mysql2 lo expande a `IN (1,2,3)`. El `LEFT JOIN` con `disponibilidadProducto` trae la existencia (puede no haber fila). El `COALESCE(i.existencia, 0)` convierte «sin fila» en 0. | `precio` se convierte con `Number(...)` y `disponible` con `Boolean(...)` porque MySQL devuelve 0/1. |
| 109 | Si `ids` está vacío devuelve el mapa vacío. | `IN ()` vacío es un error de SQL. |
| 131–141 | `exigirDisponibles`: quita repetidos (`new Set`), pide los productos y, si alguno no existe o está agotado, lanza 409 `producto_agotado` con la lista. Devuelve el mapa para que la ruta use los precios. | **El precio sale de la BD, nunca del cliente.** |

### Existencia / inventario (líneas 143–237)

Regla: la existencia se **descuenta al enviar** el pedido a cocina y se **devuelve si se cancela** después de enviarlo. Si solo está `registrado`, no se descuenta (solo se avisa si ya no alcanza).

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 153–157 | `sumarPorProducto`: junta las cantidades por producto (el mismo producto puede venir en varias líneas). `mapa.get(id) ?? 0` es la cantidad acumulada. | |
| 165–168 | `verificarExistencia(ex, lineas, descontar)`: suma por producto y ordena los ids de menor a mayor. | **Ordenar evita interbloqueos** (deadlocks): si dos transacciones bloquean las mismas filas en distinto orden, MySQL puede trabarlas. |
| 170–180 | Lee de `producto` el nombre, si está activo y si controla existencia. | |
| 184–193 | `controlados`: solo los productos con `controla_existencia`. Lee su existencia de `disponibilidadProducto`. Si `descontar` es verdadero agrega `FOR UPDATE`. | `FOR UPDATE` **bloquea esas filas** hasta el fin de la transacción: dos meseros que piden lo último a la vez no pueden vender el mismo producto dos veces. |
| 195–201 | `faltantes`: para cada producto calcula `queda` y lo compara con lo pedido. Los productos activos que **no** controlan existencia no tienen límite (línea 197). Si el producto está inactivo, `queda` vale 0. | `flatMap` devuelve `[]` (nada) o `[objeto]` (un faltante). |
| 203–210 | Si hay faltantes, lanza 409 `producto_agotado` con un mensaje legible («Taco (pides 3, solo quedan 1)») y los datos en `extra.productos`. | El frontend usa ese detalle para marcar los productos. |
| 212–216 | Si `descontar`, hace `UPDATE ... SET existencia = existencia - ?` por cada producto controlado. | Debe llamarse dentro de una transacción. |
| 220–237 | `devolverExistencia(ex, pedidoId)`: suma por producto lo que tenía el pedido y lo **regresa** al inventario. | Se usa al cancelar un pedido ya enviado. |

### Pedidos y cuentas (líneas 239–369)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 240–269 | Las interfaces `DetallePedidoDto` y `PedidoDto` describen la forma exacta del JSON. Los comentarios marcan lo **calculado**: `estado`, `id_mesa`, `mesa_numero`, `motivo_descripcion`, `total` y `nombre_producto`. | Es el contrato que espera el frontend. |
| 271–278 | `SELECT_PEDIDO`: une `pedido` con `cuenta` (de ahí sale `id_mesa`), `mesa` (el número), `estado_pedido` (el nombre del estado) y, con `LEFT JOIN`, `motivo_cancelacion`. | `pedido` no tiene `id_mesa`: se obtiene por la cuenta. |
| 281–328 | `cargarPedidos(ex, condicion, params)`: **dos consultas**: una para los pedidos y otra para todos sus detalles (`WHERE dp.id_pedido IN (?)`). Después agrupa los detalles por pedido con un `Map` y arma cada `PedidoDto`. | Es más eficiente que una consulta por pedido (el problema «N+1»). |
| 324 | `total = redondear(suma de cantidad × precio_unitario)`. | **El total siempre se calcula en el servidor.** |
| 330–333 | `cargarPedido`: un solo pedido o `null`. | |
| 351–369 | `cargarCuenta`: lee la cuenta, carga sus pedidos y calcula `total` **excluyendo los cancelados** (línea 367). | Un pedido cancelado no se cobra. |

---

## `routes/auth.ts` (78 líneas): iniciar sesión

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 1–9 | Imports. `import { requiereAuth, type Rol }` mezcla un valor y un tipo. | |
| 11 | `export const authRouter = Router()`: un mini-servidor de rutas que `index.ts` monta en `/api/auth`. | |
| 15–24 | `Login`: esquema zod con tres campos opcionales y un `.transform` que los convierte a `{ usuario, contrasena }`. Acepta `contrasena` o `password` (este último para probar con `Invoke-RestMethod`). | `transform` cambia la forma de los datos ya validados. |
| 27 | `SELECT_PERFIL`: las columnas del perfil que viajan al cliente. `r.nombre AS rol` es el rol calculado. | Se reutiliza en login y en `/me`. |
| 29–38 | `aPerfil`: arma el objeto de respuesta. `Boolean(f.activo)` convierte 0/1 en `false/true`. | |
| 41–42 | `POST /login`: valida el cuerpo con `validar(Login, req.body ?? {})`. | `?? {}` evita fallar si no llega cuerpo. |
| 44–52 | Busca el usuario por `nombre_usuario`, **solo si está activo** (`u.activo = TRUE`), con dos `JOIN` (usuario y rol), y trae `password_hash`. | Un usuario desactivado no puede entrar. |
| 54–56 | Si no existe **o** `bcrypt.compare(contrasena, hash)` da falso, responde 401 con el **mismo mensaje** para ambos casos. | Así no se revela si el usuario existe. |
| 58 | Actualiza `ultimo_acceso = NOW()`. | |
| 61 | El rol en la BD es `"Mesero"`; dentro del token se guarda en minúsculas. | `requiereAuth("mesero")` compara en minúsculas. |
| 62 | `jwt.sign({ id, rol }, JWT_SECRET, { expiresIn: "8h" })` crea el token. | Dura 8 horas, sin control por inactividad (ver RNF-011 en el README). |
| 64 | Responde `{ token, usuario }`. | El frontend guarda el token. |
| 68–78 | `GET /me` con `requiereAuth()`: devuelve el perfil del usuario del token, solo si sigue activo; si no, 401. | El frontend lo llama al recargar para recuperar la sesión. |

**Ojo:** si el usuario no existe, el código no llega a ejecutar `bcrypt.compare`, así que responde un poco más rápido que cuando la contraseña es incorrecta. Con mediciones finas eso permitiría adivinar qué usuarios existen. En un restaurante es riesgo bajo, pero es un buen punto para el apartado de seguridad.

---

## `routes/productos.ts` (19 líneas): ¿hay existencia?

| Líneas | Qué hace |
| --- | --- |
| 9–11 | `Consulta`: `{ items: [{ id_producto }] }`, máximo 200 elementos; cada id debe ser entero positivo. |
| 14 | `POST /api/productos/disponibilidad`, con `requiereAuth()` (cualquier rol logueado). Es POST porque envía una lista en el cuerpo. |
| 16 | `[...new Set(...)]` quita ids repetidos. |
| 17–18 | Busca los productos y responde `{ items: [{ id_producto, disponible }] }`. Un id que no existe da `disponible: false` (`?? false`). |

---

## `routes/menu.ts` (54 líneas): el menú del mesero

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 7–16 | `ProductoMenu`: la forma de cada producto. `existencia: number \| null`; `null` significa «no controla existencia». | |
| 22 | `GET /api/menu` con `requiereAuth()`. | |
| 23–33 | Una sola consulta: categorías, productos y existencia. `COALESCE(p.descripcion, '')` cambia `NULL` por texto vacío; la columna `disponible` es calculada (activo **y** con existencia o sin control). Ordena por categoría y producto. | `JOIN` entre `categoria_menu` y `producto` solo trae categorías **con** productos. |
| 35 | Un `Map` de categorías: `id → { id_categoria, nombre, productos: [] }`. | Un `Map` conserva el orden en que se insertó. |
| 36–52 | Recorre cada fila: si la categoría no está en el mapa la crea, y agrega el producto con los tipos correctos (`Number(r.precio)`, `Boolean(...)`). `existencia` es el número solo si el producto controla existencia; si no, `null`. | La consulta devuelve una fila por producto; el JSON agrupa por categoría. |
| 53 | `res.json([...categorias.values()])`: convierte los valores del mapa en un arreglo. | |

---

## `routes/cuentas.ts` (46 líneas): pedir la cuenta

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 12–18 | `SolicitudPago`: `tipo_pago_solicitado` debe ser `"fisico"` o `"digital"` (acepta `tipo` como alias). `.refine(...)` exige que venga alguno de los dos y `.transform` lo deja como `{ tipo }`. | `refine` es una validación personalizada. |
| 21 | `POST /api/cuentas/:id/solicitar-pago`, solo `mesero` y `gerente`. | |
| 22–23 | Toma el id de la URL y valida el cuerpo. | |
| 25 | Envuelve todo en `conIdempotencia(req, res, 200, async () => {...})`. | Si el mesero toca dos veces el botón, no se repite. |
| 26–28 | La cuenta debe existir (404) y estar `abierta` (409). | |
| 31–34 | Carga la cuenta; si `total === 0` (sin pedidos o todos cancelados) no hay nada que cobrar. | |
| 37–42 | `UPDATE cuenta SET estado = 'por_pagar', tipo_pago_solicitado = ? WHERE id_cuenta = ? AND estado = 'abierta'`. Si `affectedRows === 0`, alguien la cambió justo antes. | El `AND estado = 'abierta'` es **control de concurrencia**: dos peticiones simultáneas no la solicitan dos veces. |
| 44 | Devuelve la cuenta ya actualizada. | |

---

## `routes/usuarios.ts` (231 líneas): administración de usuarios (gerente)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 12 | `usuariosRouter.use(requiereAuth("gerente"))`: **todas** las rutas de este archivo exigen ser gerente. | La seguridad está en el servidor, no solo en el frontend. |
| 14–19 | `ROLES` y el esquema `Rol`: recibe el texto, lo recorta y lo pasa a minúsculas (`transform`), y luego exige que sea uno de los 5 roles (`pipe(z.enum(ROLES))`). | Acepta `"Mesero"` y `"mesero"`. |
| 21 | `Texto(max)`: una función que **crea** un esquema de texto: recortado, obligatorio y con máximo. | Se reutiliza para el nombre. |
| 22–26 | `Correo`: máximo 120 y una expresión regular simple (algo, `@`, algo, punto, algo). | |
| 27–32 | `NombreUsuario`: de 3 a 60 caracteres con solo letras, números, punto, guion y guion bajo. | |
| 33–34 | `Contrasena`: de 6 a 72 caracteres. | bcrypt solo usa los primeros 72 **bytes**; el límite evita contraseñas «recortadas» sin avisar. |
| 37–49 | `UsuarioAdminDto`: la forma del usuario que se envía al frontend. | |
| 51–57 | `SELECT_USUARIO`: une `usuario`, `rol`, `credenciales` y `perfil_usuario` (estos dos con `LEFT JOIN`, por si faltan). | |
| 59–73 | `aDto`: convierte una fila en el DTO (`?? null` para valores opcionales). | |
| 75–78 | `cargarUsuario`: un usuario por id o `null`. | |
| 80–84 | `idRol`: busca el id del rol por nombre. | |
| 87–94 | `traducirDuplicado(error): never`: si MySQL lanza `ER_DUP_ENTRY` (valor repetido), lo convierte en un 409 legible según el mensaje diga `correo` o no. `never` significa que **nunca regresa** (siempre lanza). | Las columnas `correo` y `nombre_usuario` son únicas. |
| 97–100 | `GET /`: lista todos (activos primero, luego por nombre). | |
| 102–109 | Esquema `Crear` de los campos del alta; `telefono` es opcional. | |
| 112–141 | `POST /`: valida, **calcula el hash fuera de la transacción** (es lento y no debe mantener bloqueos), y en una transacción comprueba que el nombre de usuario no exista e inserta en `usuario`, `credenciales` y `perfil_usuario`. Responde 201 con el usuario creado. | Las 3 inserciones se guardan juntas o ninguna. |
| 143–152 | Esquema `Editar` con `.partial()`: todos los campos pasan a ser opcionales. | Es un `PATCH`: se manda solo lo que cambia. |
| 162 | Si no se mandó ningún campo, 422 «No hay nada que cambiar». | |
| 166–172 | Dentro de una transacción lee el usuario con `FOR UPDATE` (bloquea la fila). | Dos gerentes editando a la vez no pueden dejar el sistema sin gerente. |
| 174–177 | `dejaDeSerGerenteActivo`: es gerente activo **y** se le quiere desactivar o cambiar el rol. | |
| 179–192 | Si ocurre: no puede hacerlo a sí mismo (409) y debe quedar al menos otro gerente activo (cuenta los demás). | Regla del negocio que protege el acceso al sistema. |
| 195–201 | Construye el `UPDATE` **dinámico**: arreglos `sets` y `params`; cada campo recibido agrega `"campo = ?"`. El operador coma `(sets.push(...), params.push(...))` ejecuta ambas acciones en una línea. Si hay cambios, corre `UPDATE usuario SET ...`. | Solo toca lo que el cliente mandó. Los nombres de columna son fijos (no vienen del cliente), así que no hay inyección. |
| 203–205 | Cambia el `nombre_usuario` en `credenciales`. | |
| 206–212 | El teléfono usa `INSERT ... ON DUPLICATE KEY UPDATE`: si la fila de perfil no existe la crea y si existe la actualiza. | Se llama *upsert*. |
| 213–215 | Si MySQL avisa de un duplicado, se traduce a 409. | |
| 218 | Responde con el usuario actualizado. | |
| 221–231 | `POST /:id/contrasena`: el gerente restablece la contraseña de cualquiera: valida, hace el hash y actualiza `credenciales`; 404 si no se afectó ninguna fila. | |

**Por qué no hay `DELETE`:** los usuarios tienen pedidos, ventas y cortes ligados con llaves foráneas `RESTRICT`. Borrarlos rompería el historial, así que se **desactivan** (`activo = false`).

---

## Conceptos que ya viste en este archivo

- **zod:** `object`, `string`, `enum`, `optional`, `partial`, `transform`, `pipe`, `refine`, `safeParse`.
- **SQL:** `JOIN`, `LEFT JOIN`, `COALESCE`, `IN (?)`, `FOR UPDATE`, `ON DUPLICATE KEY UPDATE`.
- **Concurrencia:** bloqueo de filas, orden de bloqueos y `UPDATE ... WHERE estado = ...` con `affectedRows`.
- **Seguridad:** hash, mensajes iguales para usuario y contraseña, roles en el servidor y precio/total calculados por el servidor.

Siguiente: `04_backend_mesas_catalogo_pedidos_hostess.md`.
