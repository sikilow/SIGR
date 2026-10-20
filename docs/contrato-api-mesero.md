# Contrato de API esperado por el frontend (rol mesero)

> **Implementado en [`backend/`](../backend/)** (Node + Express + MySQL) y consumido por `frontend/`.
> **Fuente de verdad de los nombres:** [`database/init.sql`](../database/init.sql). Las claves del JSON son los
> **nombres exactos de las columnas**; lo que **no** es columna se marca como _calculado por la API, no es columna_.
> Tabla completa de equivalencias: [`equivalencias-bd.md`](equivalencias-bd.md).
> Si algo del JSON cambia, los únicos archivos del frontend que se tocan son `src/services/api/mappers.ts` y
> `conversion.ts` (formato del JSON) y `cliente.ts` (sesión).

## Convenciones

- Base: `VITE_API_URL` (por ejemplo `https://servidor/api`). Todas las rutas siguen esta base.
- JSON en UTF-8, propiedades en **snake_case con el nombre de la columna** (`id_mesa`, `fecha_hora`, `precio_unitario`).
- Sin sobre de respuesta: se devuelve el objeto o arreglo directamente.
- Sesión por **token JWT**: `POST /auth/login` devuelve `{ token, usuario }` y el frontend envía `Authorization: Bearer <token>`.
- Errores: HTTP 4xx/5xx con cuerpo `{ "codigo": "...", "mensaje": "..." }`.
- **Tipos que el frontend acepta** (PHP/PDO devuelve todo como texto si no se castea; el frontend lo convierte, pero
  conviene castear en la API, ver "Diferencias con la base de datos"):
  - `INT` (ids, cantidad…): `12` o `"12"`.
  - `DECIMAL` (precios y totales): `120` o `"120.00"`.
  - `BOOLEAN` (`disponible`, `activo`): `true`/`false`, `1`/`0` o `"1"`/`"0"`.
  - `DATETIME` (`fecha_hora`, `abierta_en`, `cerrada_en`): `"2026-10-15 16:34:00"`, **sin zona horaria**; el frontend
    la interpreta como **hora local**. También acepta ISO 8601 con zona (`2026-10-15T16:34:00Z`).
  - Columnas `NULL` (`id_motivo`, `cerrada_en`, `indicaciones`): `null`.

Códigos de error que el frontend reconoce: `no_autenticado` (401), `credenciales_invalidas` (401),
`sin_permiso` (403), `requiere_gerente` (403), `no_encontrado` (404), `estado_invalido` (409/422),
`producto_agotado` (409), `mesa_no_disponible` (409).

## Estados

El frontend normaliza los nombres a código (minúsculas, sin acentos, espacios → `_`). La API puede enviar el nombre
del catálogo (`"En preparacion"`) o ya el código (`"en_preparacion"`).

| Dominio | Valores | Notas |
|---|---|---|
| `mesa.estado` | `libre`, `ocupada`, `reservada` | `CHECK` en la BD; `libre` es el valor por defecto. **La interfaz usa el mismo código y muestra «Libre»** (mesero y hostess). El normalizador sigue entendiendo `disponible` como `libre` por tolerancia. |
| `cuenta.estado` | `abierta`, `por_pagar`, `cerrada` | `CHECK` en la BD; `abierta` es el valor por defecto. |
| `reservacion.estado` | `pendiente`, `confirmada`, `llego`, `cancelada` | **Texto libre**, sin `CHECK` (`VARCHAR(25)`, default `pendiente`). Solo lo usa la hostess; los valores son **suposiciones sin confirmar** salvo el default (ver [`contrato-api-hostess.md`](contrato-api-hostess.md)). |
| `lista_espera.estado` | `esperando`, `asignada`, `cancelada` | **Texto libre**, sin `CHECK` (`VARCHAR(25)`, default `esperando`). Solo lo usa la hostess; `cancelada` es un **supuesto del frontend**. |
| `estado_pedido.nombre` | `Registrado`, `Pendiente`, `En preparacion`, `Listo`, `Entregado`, `Cancelado`, `Pagado` | Catálogo de la BD (`Registrado` y `Pagado` vienen en `init.sql`). |
| `rol.nombre` | `Gerente`, `Mesero`, `Cocinero`, `Cajero`, `Hostess` | Catálogo de la BD. |

- **`Pendiente` es "enviado a cocina"** (la BD no tiene `Enviado`): el mesero puede cancelarlo, no puede editarlo y cocina lo ve.
  `Registrado` es el pedido capturado todavía editable. El frontend trata `Pendiente` exactamente igual que su estado interno
  `enviado` (ver la sección final, punto a).
- Cualquier otro valor se muestra como «Estado desconocido» (y se avisa en la consola del navegador): no rompe la pantalla.

## Objetos compartidos

**Pedido** (`pedido` + `detalle_pedido`)

```json
{
  "id_pedido": 6,
  "id_cuenta": 4,
  "id_mesero": 1,
  "id_estado": 1,
  "estado": "Pendiente",
  "fecha_hora": "2026-10-15 16:34:00",
  "id_motivo": null,

  "id_mesa": 11,
  "mesa_numero": 11,
  "motivo_descripcion": null,
  "total": 80,
  "detalle": [
    { "id_detalle": 9, "id_producto": 14, "nombre_producto": "Café de olla", "cantidad": 2, "indicaciones": "", "precio_unitario": 40 }
  ]
}
```

| Campo | Origen | Naturaleza |
|---|---|---|
| `id_pedido`, `id_cuenta`, `id_mesero`, `fecha_hora`, `id_motivo` | `pedido.*` | columna |
| `estado` | `estado_pedido.nombre` (JOIN por `pedido.id_estado`) | **calculado por la API, no es columna** (la columna es `id_estado`) |
| `id_mesa` | `cuenta.id_mesa` (JOIN por `pedido.id_cuenta`) | **calculado por la API, no es columna** (`pedido` no tiene `id_mesa`) |
| `mesa_numero` | `mesa.numero` (JOIN) | **calculado por la API, no es columna** |
| `motivo_descripcion` | `motivo_cancelacion.descripcion` (JOIN por `pedido.id_motivo`); `null` si no está cancelado | **calculado por la API, no es columna** |
| `total` | suma de `cantidad × precio_unitario` del detalle | **calculado por la API, no es columna** |
| `detalle[].id_producto`, `cantidad`, `indicaciones`, `precio_unitario` | `detalle_pedido.*` | columna |
| `detalle[].nombre_producto` | `producto.nombre` (JOIN) | **calculado por la API, no es columna** |

El frontend no consume `id_estado` ni `detalle[].id_detalle` (la API los envía por ser columnas); tampoco usa `pedido.observaciones`.

**Cuenta** (`cuenta`)

```json
{
  "id_cuenta": 4,
  "id_mesa": 11,
  "estado": "abierta",
  "abierta_en": "2026-10-15 16:20:00",
  "cerrada_en": null,

  "pedidos": [ { "...": "objetos Pedido" } ],
  "total": 310,
  "tipo_pago_solicitado": null
}
```

| Campo | Naturaleza |
|---|---|
| `id_cuenta`, `id_mesa`, `estado`, `abierta_en`, `cerrada_en` | columna de `cuenta` |
| `pedidos` | **calculado por la API, no es columna** (`pedido.id_cuenta`) |
| `total` | **calculado por la API, no es columna**: suma de `cantidad × precio_unitario`, **sin pedidos cancelados** |
| `tipo_pago_solicitado` | columna de `cuenta`: `"fisico"` \| `"digital"` \| `null` (`CHECK` en la BD) |

## Endpoints

### POST /auth/login

```json
// petición
{ "nombre_usuario": "mesero", "contrasena": "1234" }
// 200
{ "token": "<JWT>", "usuario": { "id_usuario": 1, "id_rol": 2, "nombre": "Ana Torres", "correo": "ana@madalena.mx", "activo": true, "rol": "Mesero" } }
```

- `nombre_usuario` = `credenciales.nombre_usuario`. `contrasena` es el texto que escribe la persona; la API lo compara con
  `credenciales.password_hash` (el frontend nunca lo guarda).
- `rol` = `rol.nombre` (JOIN por `usuario.id_rol`): **calculado por la API, no es columna**. Un rol que no sea uno de los cinco
  conocidos no entra a ninguna pantalla.

Error 401: `{ "codigo": "credenciales_invalidas", "mensaje": "Usuario o contraseña incorrectos." }`

### POST /auth/logout

Sin cuerpo. Responde 204.

### GET /auth/me

```json
// 200
{ "usuario": { "id_usuario": 1, "id_rol": 2, "nombre": "Ana Torres", "correo": "ana@madalena.mx", "activo": 1, "rol": "Mesero" } }
// 401 si no hay sesión
{ "codigo": "no_autenticado", "mensaje": "No hay sesión activa." }
```

### GET /mesas

```json
[
  {
    "id_mesa": 1, "numero": 1, "capacidad": 2, "estado": "libre",
    "estado_cuenta": null, "pedidos_activos": 0, "total_cuenta": 0, "pedidos_listos": 0
  },
  {
    "id_mesa": 3, "numero": 3, "capacidad": 4, "estado": "ocupada",
    "estado_cuenta": "abierta", "pedidos_activos": 2, "total_cuenta": 470, "pedidos_listos": 1,
    "tipo_pago_solicitado": null
  }
]
```

| Campo | Naturaleza |
|---|---|
| `id_mesa`, `numero`, `capacidad`, `estado` | columna de `mesa` |
| `estado_cuenta` | **calculado por la API, no es columna**: `cuenta.estado` de la cuenta activa (`"abierta"` \| `"por_pagar"`); `null` si la mesa no tiene cuenta activa |
| `pedidos_activos` | **calculado por la API, no es columna**: pedidos de la cuenta activa que no están `Cancelado` (ni `pagado`, si existiera) |
| `total_cuenta` | **calculado por la API, no es columna**: total de la cuenta activa, sin pedidos cancelados |
| `pedidos_listos` | **calculado por la API, no es columna**: pedidos de la cuenta activa en estado `Listo` (cocina terminó; falta servirlos) |
| `tipo_pago_solicitado` | columna de `cuenta` (de la cuenta activa); opcional: si la API no lo envía, el panel muestra solo "Cuenta solicitada" |

El Panel de mesas necesita este resumen **por cada mesa y en una sola petición** (evita pedir la cuenta y los pedidos mesa por
mesa cada pocos segundos). Para una mesa sin cuenta activa: `estado_cuenta: null` y los tres contadores en `0`. El panel consulta
este endpoint periódicamente (ver pregunta 4), así que debe ser barato.

### GET /menu

```json
[
  {
    "id_categoria": 1,
    "nombre": "Entradas",
    "productos": [
      { "id_producto": 1, "id_categoria": 1, "nombre": "Guacamole con totopos", "descripcion": "Aguacate fresco", "precio": 95, "disponible": true }
    ]
  }
]
```

- `id_categoria`, `nombre` = `categoria_menu.*`; `productos` es **calculado por la API, no es columna** (`producto.id_categoria`).
- `productos[]` = `producto.*`. `disponible` es **calculado**: `producto.disponible` (activo) **y** existencia mayor a 0. El menú del
  mesero **no muestra cantidades**: cada producto solo está disponible o agotado.

### POST /productos/disponibilidad

Se llama al abrir la revisión "¿El pedido es correcto?", antes de registrar. Devuelve `producto.disponible` de cada producto.

```json
// petición
{ "items": [ { "id_producto": 3 }, { "id_producto": 7 } ] }
// 200: un elemento por producto pedido
{ "items": [ { "id_producto": 3, "disponible": false }, { "id_producto": 7, "disponible": true } ] }
```

### POST /pedidos

Crea el pedido en estado `registrado`. Si la mesa no tiene cuenta activa, se abre una (suposición; ver pregunta 10).

```json
// petición (el cliente NO envía precios)
{
  "id_mesa": 11,
  "detalle": [ { "id_producto": 14, "cantidad": 2, "indicaciones": "Sin azúcar" } ]
}
// 201: objeto Pedido (con precios y total calculados por el servidor)
```

`pedido` no tiene `id_mesa`: la API usa el `id_mesa` de la petición para **resolver (o abrir) la cuenta** y guardar `pedido.id_cuenta`.

Reglas: el pedido tiene al menos un producto; `cantidad` > 0 (1 a 99); `indicaciones` opcional (la interfaz limita a 120 caracteres; la
columna admite 255). **`precio_unitario` y `total` los fija el servidor** (`producto.precio` vigente); el frontend reemplaza su
total estimado por el de la respuesta.

Errores: `mesa_no_disponible` (409, la mesa no está ocupada), `estado_invalido` (409, la cuenta está `por_pagar`),
`producto_agotado` (409), `no_encontrado` (404). Con `Idempotency-Key` (ver "Idempotencia").

El error `producto_agotado` debe indicar **cuáles** productos están agotados, para que la interfaz los liste sin perder el pedido en armado:

```json
// 409
{
  "codigo": "producto_agotado",
  "mensaje": "Hay productos agotados en el pedido.",
  "productos": [ { "id_producto": 16, "disponible": false, "existencia": 0, "solicitado": 2 } ]
}
```

`existencia` (cuántas quedan) y `solicitado` (cuántas se pidieron) son opcionales; el frontend usa `existencia` para decir «solo quedan N».

### GET /pedidos

Filtros opcionales por query string: `id_mesa`, `estado`. Ejemplo: `/pedidos?id_mesa=11`.

```json
// 200: arreglo de Pedido
[ { "id_pedido": 5, "id_mesa": 11, "mesa_numero": 11, "estado": "Pendiente", "...": "..." } ]
```

"Mis pedidos" pide `GET /pedidos` (con `id_mesa` cuando la URL trae `?mesa=`) y **filtra por estado en el cliente** ("Activos" =
todo menos `Cancelado`), así que no hace falta un filtro con varios estados. Cada pedido debe traer su `detalle` completo: el detalle
se pinta con esos datos sin otra petición (si el pedido abierto no está en la lista, se pide con `GET /pedidos/{id}`). Ver preguntas 6 y
18 sobre el alcance y el volumen de esta lista.

### GET /pedidos/{id}

200: objeto Pedido (con `detalle` completo, incluidas las `indicaciones`). 404 `no_encontrado` si no existe. La pantalla "Pedido de
mesa" lo usa para precargar un pedido `registrado` que se va a editar, y valida en el cliente que pertenezca a la mesa y siga editable.

### PATCH /pedidos/{id}

Modifica un pedido mientras **no** se haya enviado a cocina. Reemplaza el detalle completo (no es una edición parcial por línea).

```json
// petición (sin precios)
{
  "detalle": [
    { "id_producto": 5, "cantidad": 3, "indicaciones": "Sin crema" },
    { "id_producto": 14, "cantidad": 1, "indicaciones": "" }
  ]
}
// 200: objeto Pedido actualizado (estado "registrado", total recalculado por el servidor)
```

Errores: `estado_invalido` (409, el pedido ya no es editable), `producto_agotado` (409, con la lista `productos` como en
`POST /pedidos`), `no_encontrado` (404), `sin_permiso` (403, el pedido es de otro mesero).

### POST /pedidos/{id}/enviar

Pasa el pedido de `Registrado` a "enviado a cocina" (`Pendiente`, ver la sección final, punto a). Sin cuerpo. 200: Pedido actualizado.
Se vuelve a verificar que alcance la existencia de cada producto y se **descuenta** del inventario (una cancelación posterior la devuelve). Errores: `estado_invalido` (si no estaba en su estado inicial),
`producto_agotado` (con la lista `productos`). Con `Idempotency-Key`.

La interfaz hace "Enviar a cocina" en dos llamadas (`POST /pedidos` y luego esta). Si esta falla, el pedido ya quedó registrado y la
interfaz ofrece **solo** reintentar el envío (no vuelve a crear el pedido), con la misma `Idempotency-Key`. "Mis pedidos" también lo
usa para el botón "Enviar a cocina" de un pedido sin enviar.

### POST /pedidos/{id}/cancelar

```json
// petición
{ "descripcion": "El cliente cambió de opinión" }
// 200: Pedido con "estado": "Cancelado", "id_motivo": 3 y "motivo_descripcion": "El cliente cambió de opinión"
```

`descripcion` es la columna `motivo_cancelacion.descripcion` (**VARCHAR(200)**): **texto libre obligatorio de 5 a 200 caracteres**.
La API crea la fila de `motivo_cancelacion` y guarda su `id_motivo` en el pedido. El frontend ofrece atajos que solo rellenan el
texto; lo que se envía es el texto. La API debe validar la longitud (422).

El mesero solo cancela un pedido sin enviar o enviado (`Pendiente`). Respuestas esperadas:

| Estado del pedido | Respuesta |
|---|---|
| `Registrado`, `Pendiente` | 200 (la cuenta recalcula su total sin este pedido; si ya estaba enviado, se devuelve la existencia) |
| `En preparacion` | 403 `requiere_gerente` |
| `Listo`, `Entregado`, `Cancelado`, `Pagado` | 409 `estado_invalido` |
| cualquiera, con la cuenta en `por_pagar` | 409 `estado_invalido` (**suposición**, pregunta 15) |

```json
{ "codigo": "requiere_gerente", "mensaje": "El pedido está en preparación: solo el gerente puede cancelarlo." }
```

El frontend ya bloquea el botón en esos casos ("Requiere autorización del gerente"), pero la API debe validar igualmente. Con
`Idempotency-Key`. Ver también la sección final, punto e (quién cancela y quién autoriza).

### POST /pedidos/{id}/entregar

Marca como `Entregado` un pedido que cocina dejó en `Listo` (el mesero ya lo llevó a la mesa). Sin cuerpo. Con `Idempotency-Key`.
200: Pedido actualizado. Errores: `estado_invalido` (409, el pedido no estaba `Listo`), `no_encontrado` (404), `sin_permiso` (403).
Efecto en el panel: `GET /mesas` deja de contarlo en `pedidos_listos` y la etiqueta "Pedido listo" de la mesa desaparece. Ver
pregunta 13 sobre quién debe poder hacerlo.

### GET /mesas/{id}/cuenta

200: objeto Cuenta de la cuenta activa de la mesa. Si la mesa no tiene cuenta activa: 404 con `codigo: "no_encontrado"` (el frontend lo
interpreta como "sin cuenta").

### POST /cuentas/{id}/solicitar-pago

```json
// petición
{ "tipo_pago_solicitado": "fisico" }   // "fisico" | "digital"  (columna cuenta.tipo_pago_solicitado)
// 200: Cuenta con "estado": "por_pagar" y "tipo_pago_solicitado": "fisico"
```

Errores: `estado_invalido` (409) si la cuenta no está `abierta` (p. ej. ya se solicitó) **o si no tiene pedidos vigentes** (total 0; el
frontend ya lo bloquea, pero la API debe validarlo). Los pedidos sin entregar **no** bloquean: el frontend solo avisa (pregunta 14).
Con `Idempotency-Key`.

## Idempotencia

Un reintento tras un fallo de red puede repetir una acción cuya respuesta se perdió (el servidor sí la aplicó). Para evitarlo, el
frontend genera un **UUID por cada intención del usuario** y lo envía en la cabecera `Idempotency-Key` de:

`POST /pedidos` (registrar), `POST /pedidos/{id}/enviar`, `POST /pedidos/{id}/cancelar`,
`POST /pedidos/{id}/entregar` y `POST /cuentas/{id}/solicitar-pago`.

Reglas del cliente:

- Los **reintentos de la misma intención** (p. ej. "Reintentar envío", reintentar una cancelación que falló por red) reutilizan **la
  misma clave**. Una intención nueva (otro diálogo, otros datos) genera una clave nueva.
- Solo se reutiliza la clave cuando el resultado es desconocido (sin conexión o error inesperado del servidor). Si el servidor rechaza
  con claridad (`estado_invalido`, `requiere_gerente`…), la intención termina y no se reintenta con esa clave.

Comportamiento esperado del servidor: si recibe una clave ya vista (mismo usuario y mismo endpoint), **devuelve la respuesta anterior** en
vez de repetir la acción. Se sugiere conservarlas al menos 24 h y no guardar las respuestas de error.

> **CORS:** si el frontend y la API están en orígenes distintos, el servidor debe permitir esta cabecera personalizada:
> `Access-Control-Allow-Headers: Content-Type, Idempotency-Key` (además de `Access-Control-Allow-Credentials: true` y el origen
> exacto). Sin esto el navegador bloquea las peticiones de preflight y **todas** las acciones de arriba fallarían.

El mock lo respeta: con la misma clave devuelve el resultado anterior sin repetir la acción
(`sessionStorage.setItem('sigr.mock.perderRespuesta', '1')` simula una respuesta perdida).

## Preguntas abiertas para el equipo de API

1. **Sesión.** La API usa JWT (8 h). El frontend lo guarda en `sessionStorage` y no lo renueva: al vencer, el siguiente intento responde `no_autenticado` y pide iniciar sesión. ¿Se necesita renovación?
2. **Formato de errores.** ¿Aceptan `{ "codigo", "mensaje" }` como se propone? ¿Hay un catálogo de códigos? ¿Cómo se informan errores de
   validación por campo?
3. **Fechas e importes.** ¿Los `DATETIME` se entregan tal cual (`"2026-10-15 16:34:00"`, hora local del servidor) o con zona horaria? El
   frontend los interpreta como hora local del navegador cuando no traen zona.
4. **Actualización de estados.** Los pedidos cambian de estado en cocina (`En preparacion` → `Listo`). ¿Habrá polling (cada cuántos
   segundos es razonable), SSE/WebSocket u otro mecanismo? Esto afecta el aviso de "pedido listo" al mesero.
5. **CORS.** ¿Frontend y API estarán en el mismo origen o no? Si no, ¿qué orígenes y cabeceras se permiten (incluido
   `Access-Control-Allow-Credentials` si se usa cookie)?
6. **Alcance de `GET /pedidos`.** Sin filtros, ¿devuelve solo los pedidos del mesero en sesión o todos? El mock devuelve solo los del mesero
   en sesión.
7. **Estados y reglas.** ¿Coinciden los estados y las transiciones de este documento con el modelo real? ¿Una mesa reservada puede recibir
   pedidos? ¿Se permiten pedidos nuevos cuando la cuenta está `por_pagar`? (El mock rechaza ambos casos.)
8. **Resumen en `GET /mesas`.** ¿Pueden entregar `estado_cuenta`, `pedidos_activos`, `total_cuenta` y `pedidos_listos` en esa misma respuesta?
   ¿Cada cuánto se podrá consultar sin problema (el panel lo pide cada 10 s por mesero, configurable)?
9. **Productos agotados.** El menú solo maneja "disponible" o "agotado" (`producto.disponible`). ¿Quién marca un producto como agotado y
   cuándo (cocina, gerente, automático)? ¿Un producto agotado se vuelve a validar al enviar el pedido? (El mock lo hace.)
10. **Creación de la cuenta.** ¿Cuándo se crea la cuenta de una mesa: al ocuparla la hostess o con el primer pedido? El mock supone lo
    segundo: el primer pedido de una mesa ocupada sin cuenta abre la cuenta `abierta`.
11. **Modificar un pedido ya enviado.** El frontend solo permite editar pedidos sin enviar (`PATCH /pedidos/{id}`). ¿Se podrá modificar uno
    enviado (p. ej. agregar productos) o solo cancelarlo y crear otro?
12. **Idempotencia.** El frontend ya envía `Idempotency-Key` (un UUID por intención; los reintentos de la misma intención reutilizan la clave)
    en registrar pedido, enviar, cancelar, entregar y solicitar cuenta. ¿La API la aceptará y devolverá la respuesta anterior? ¿Cuánto tiempo
    conserva las claves? **¿Permitirán `Idempotency-Key` en `Access-Control-Allow-Headers`?** (sin eso, con orígenes distintos, el preflight falla).
13. **Entregar un pedido.** ¿Quién marca un pedido `Listo` como `Entregado`: el mesero o cocina/otro rol? El frontend asume que el mesero lo
    hace con `POST /pedidos/{id}/entregar` (propuesto).
14. **Solicitar la cuenta con pedidos sin entregar.** ¿Se puede solicitar con pedidos sin enviar o sin entregar? El frontend lo permite y solo
    avisa ("Hay 2 pedidos sin entregar"); bloquea únicamente si no hay pedidos vigentes (total 0).
15. **Cancelar con la cuenta `por_pagar`.** ¿Se puede cancelar un pedido cuando la cuenta ya está `por_pagar`? **Suposición del mock y de la
    interfaz:** no (`estado_invalido`; el botón se bloquea con el motivo escrito). Lo mismo para editar un pedido sin enviar.
16. **Deshacer "Solicitar cuenta".** ¿El mesero puede deshacerlo (volver la cuenta a `abierta`) si el cliente pide agregar algo? Hoy no hay
    endpoint y la interfaz no lo ofrece: tras solicitarla ya no se agregan pedidos.
17. **Autorización del gerente.** ¿Cómo se entera el mesero de que el gerente autorizó la cancelación de un pedido `En preparacion`? El
    frontend no consulta nada especial: lo vería como `Cancelado` en el siguiente polling de `GET /pedidos`. Esta aplicación tampoco ofrece al
    mesero pedir esa autorización.
18. **Alcance y volumen de `GET /pedidos`.** (Amplía la pregunta 6.) ¿Para el mesero devuelve solo sus pedidos o todos? ¿Incluye históricos de
    turnos anteriores? Se pide cada 10 s: conviene limitarlo al turno actual o paginar.

## Diferencias con la base de datos (para el equipo de BD y API)

Revisión contra [`database/init.sql`](../database/init.sql). Lo que ya está resuelto se indica así; el resto son pendientes.

**a) `estado_pedido` no tiene `Enviado`.** `Registrado` y `Pagado` ya existen, pero "enviado a cocina" se guarda como **`Pendiente`**
(nombre que no dice lo que significa). El frontend lo trata exactamente igual que su estado interno `enviado`. **Propuesta:** agregar `Enviado` al
catálogo (y que `Pendiente` deje de usarse), o renombrar `Pendiente` a `Enviado`. El cambio es de una línea en `ESTADO_PEDIDO_DB`
([`backend/src/models/dominio.ts`](../backend/src/models/dominio.ts)) y, en el frontend, en `ESTADOS_SIN_EQUIVALENTE_EN_BD` ([`types/estados.ts`](../frontend/src/types/estados.ts)).

**b) ✔ Resuelto: `cuenta.tipo_pago_solicitado`** existe (`fisico` o `digital`, `CHECK`).

**c) ✔ Resuelto: `mesa.estado` y `cuenta.estado` tienen `CHECK`.** La BD guarda **`libre`** y la interfaz usa ahora el mismo código y el mismo
texto («Libre») en mesero y hostess; ya no hay conversión. Por tolerancia, el normalizador (`aEstadoMesa`) sigue entendiendo `disponible` como `libre`.
`reservacion.estado` y `lista_espera.estado`, en cambio, son **texto libre sin `CHECK`** (ver el punto j).

**d) No hay restricción de una sola cuenta activa por mesa.** Nada impide dos cuentas abiertas para la misma mesa. Hoy la API lo evita al crear
pedidos (bloquea la fila de la mesa con `FOR UPDATE`), pero la BD no lo garantiza. **Propuesta:** un `UNIQUE` sobre una columna generada
(por ejemplo `id_mesa` solo cuando `estado <> 'cerrada'`).

**e) `motivo_cancelacion` no guarda quién cancela ni quién autoriza.** Para la autorización del gerente (cancelar un pedido `En preparacion`) hace
falta saber quién pidió la cancelación y quién la autorizó. **Propuesta:** agregar `id_usuario_cancela` e `id_usuario_autoriza` (este último `NULL`
cuando no se requiere) y la fecha de la cancelación. Además, la API reutiliza la fila si ya existe un motivo con el mismo texto, lo que
mezclaría autores si se agregan esas columnas: habría que insertar siempre una fila nueva.

**f) La tabla `disponibilidadProducto` está en camelCase y su PK y FK dicen "inventario"** (`id_inventario`, `fk_inventario_id_producto`). MySQL en
Linux distingue mayúsculas en los nombres de tabla. **Recomendación:** renombrarla a `inventario` (y alinear PK y FK). La API la usa para las
existencias; el mesero no la ve.

**g) ✔ Resuelto en la API: tipos del JSON.** El pool de MySQL entrega `DECIMAL` como número, `DATETIME` como texto `"2026-10-15 16:34:00"` y la API
envía los booleanos como `true`/`false`. El frontend igualmente tolera texto (`aNumero`, `aBooleano`, `parseFechaMySQL` en `conversion.ts`).

**h) ✔ Resuelto en la API: totales.** `total` de pedido y de cuenta se calculan como suma de `cantidad × precio_unitario`, **sin pedidos cancelados** en
la cuenta (y en `total_cuenta` de `GET /mesas`). El cliente nunca envía precios: `precio_unitario` sale de `producto.precio` al registrar.

**i) `pedido.observaciones` no se usa.** El frontend guarda las observaciones por producto (`detalle_pedido.indicaciones`). Si el pedido necesita una
nota general, habría que agregarla al contrato.

**j) `reservacion.estado` y `lista_espera.estado` son texto libre.** No tienen `CHECK` (a diferencia de `mesa` y `cuenta`). El frontend de la hostess asume
`pendiente`/`confirmada`/`llego`/`cancelada` y `esperando`/`asignada`/`cancelada`; solo `pendiente` y `esperando` son los `DEFAULT` y `cancelada` de la
lista de espera es un supuesto. Un valor desconocido se muestra como «Estado desconocido». **Propuesta:** agregar el `CHECK` con esos valores.

**k) `producto.controla_existencia`.** Existe en `init.sql` (`FALSE` = se prepara al momento, sin existencia que contar). Para el mesero, `disponible` se
calcula como `producto.disponible AND (controla_existencia = 0 OR existencia > 0)` (ver `backend/src/models/dominio.ts`); el mesero no ve cantidades.

**l) Faltan las rutas de la hostess.** El backend solo tiene `GET /mesas` y `PATCH /mesas/{id}/estado` para este rol; reservaciones, lista de espera, clientes y
«asignar mesa» están **propuestos** en [`contrato-api-hostess.md`](contrato-api-hostess.md) y no implementados. Columnas relevantes: `cliente.telefono` y
`cliente.correo` admiten `NULL`; `reservacion.id_mesa` y `reservacion.llegada_en` admiten `NULL`; `reservacion` **no tiene folio**.
