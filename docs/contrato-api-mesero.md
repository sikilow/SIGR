# Contrato de API esperado por el frontend (rol mesero)

> **PROPUESTA** para acordar con el equipo de API. Nada de esto está implementado ni validado.
> El frontend ya funciona con datos simulados; cuando la API exista, el único ajuste previsto
> está en `frontend/src/services/api/mappers.ts` (formato del JSON) y `cliente.ts` (sesión).

## Convenciones propuestas

- Base: `VITE_API_URL` (por ejemplo `https://servidor/api`). Todas las rutas siguen esta base.
- JSON en UTF-8, propiedades en **snake_case**. Fechas ISO 8601. Importes en MXN como número.
- Sin sobre de respuesta: se devuelve el objeto o arreglo directamente.
- Sesión por **cookie de PHP** (el frontend envía `credentials: include`).
- Errores: HTTP 4xx/5xx con cuerpo `{ "codigo": "...", "mensaje": "..." }`.

Códigos de error que el frontend reconoce: `no_autenticado` (401), `credenciales_invalidas` (401),
`sin_permiso` (403), `requiere_gerente` (403), `no_encontrado` (404), `estado_invalido` (409/422),
`producto_agotado` (409), `mesa_no_disponible` (409).

Estados: mesa `libre | ocupada | reservada`; cuenta `abierta | por_pagar | cerrada`;
pedido `registrado | enviado | en_preparacion | listo | entregado | cancelado | pagado`.

## Objetos compartidos

**Pedido**

```json
{
  "id": 6,
  "mesa_id": 11,
  "cuenta_id": 4,
  "mesero_id": 1,
  "estado": "registrado",
  "detalle": [
    { "producto_id": 14, "nombre_producto": "Café de olla", "cantidad": 2, "observaciones": "", "precio_unitario": 40 }
  ],
  "total": 80,
  "creado_en": "2026-10-14T18:30:00Z",
  "motivo_cancelacion": null
}
```

**Cuenta**

```json
{
  "id": 4,
  "mesa_id": 11,
  "estado": "abierta",
  "pedidos": [ { "...": "objetos Pedido" } ],
  "total": 310,
  "abierta_en": "2026-10-14T18:20:00Z",
  "tipo_pago_solicitado": null
}
```

`total` de la cuenta excluye los pedidos cancelados.

## Endpoints

### POST /auth/login

```json
// petición
{ "usuario": "mesero", "contrasena": "1234" }
// 200
{ "usuario": { "id": 1, "nombre": "Ana Torres", "rol": "mesero" } }
```

Error 401: `{ "codigo": "credenciales_invalidas", "mensaje": "Usuario o contraseña incorrectos." }`

### POST /auth/logout

Sin cuerpo. Responde 204.

### GET /auth/me

```json
// 200
{ "usuario": { "id": 1, "nombre": "Ana Torres", "rol": "mesero" } }
// 401 si no hay sesión
{ "codigo": "no_autenticado", "mensaje": "No hay sesión activa." }
```

### GET /mesas

```json
[
  {
    "id": 1, "numero": 1, "capacidad": 2, "estado": "libre",
    "estado_cuenta": null, "pedidos_activos": 0, "total_cuenta": 0, "pedidos_listos": 0
  },
  {
    "id": 3, "numero": 3, "capacidad": 4, "estado": "ocupada",
    "estado_cuenta": "abierta", "pedidos_activos": 2, "total_cuenta": 470.00, "pedidos_listos": 1
  }
]
```

#### CAMBIO PROPUESTO EN F3

La primera versión de este endpoint solo devolvía `id`, `numero`, `capacidad` y `estado`. El
Panel de mesas necesita, **por cada mesa y en una sola petición**, un resumen de su cuenta activa
(evita pedir `/mesas/{id}/cuenta` y `/pedidos` mesa por mesa cada pocos segundos). Campos nuevos:

| Campo | Tipo | Significado |
|---|---|---|
| `estado_cuenta` | `"abierta"` \| `"por_pagar"` \| `null` | Estado de la cuenta activa; `null` si la mesa no tiene cuenta activa |
| `pedidos_activos` | entero | Pedidos de la cuenta activa que **no** están `cancelado` ni `pagado` |
| `total_cuenta` | número (MXN) | Total acumulado de la cuenta activa, sin contar pedidos cancelados |
| `pedidos_listos` | entero | Pedidos de la cuenta activa en estado `listo` (cocina terminó; falta servirlos) |

Para una mesa sin cuenta activa: `estado_cuenta: null` y los tres contadores en `0`.
El panel consulta este endpoint periódicamente (ver pregunta 4), así que debe ser barato.
Nota: se propone `pedidos_listos` como conteo (no booleano) para mostrar cuántos pedidos faltan
por servir; el frontend solo necesita saber si es mayor que cero para resaltar la mesa.

### GET /menu

```json
[
  {
    "id": 1,
    "nombre": "Entradas",
    "productos": [
      { "id": 1, "categoria_id": 1, "nombre": "Guacamole con totopos", "descripcion": "Aguacate fresco", "precio": 95, "disponible": true }
    ]
  }
]
```

El menú **no maneja cantidades en existencia**: cada producto solo está `disponible: true` o
`disponible: false` (agotado). Ver "CAMBIO PROPUESTO EN F4" más abajo.

### POST /productos/disponibilidad

Se llama al abrir la revisión "¿El pedido es correcto?", antes de registrar.

```json
// petición
{ "items": [ { "producto_id": 3 }, { "producto_id": 7 } ] }
// 200: un elemento por producto pedido
{ "items": [ { "producto_id": 3, "disponible": false }, { "producto_id": 7, "disponible": true } ] }
```

#### CAMBIO PROPUESTO EN F4

La versión anterior mandaba `cantidad` y devolvía `cantidad_solicitada` y `existencias`. Por
decisión de producto el menú ya no maneja cantidades: solo importa si el producto está
disponible o agotado. Se eliminan esos campos (en la petición y en la respuesta) y también
`existencias` de `GET /menu`.

### POST /pedidos

Crea el pedido en estado `registrado`. Si la mesa no tiene cuenta activa, se abre una
(suposición; ver pregunta 10).

```json
// petición
{
  "mesa_id": 11,
  "detalle": [ { "producto_id": 14, "cantidad": 2, "observaciones": "Sin azúcar" } ]
}
// 201: objeto Pedido (con precios y total calculados por el servidor)
```

Reglas: el pedido tiene al menos un producto; `cantidad` > 0; `observaciones` opcional (máx. 120
caracteres). **El cliente no envía precios**: `precio_unitario` y `total` los fija el servidor, y el
frontend reemplaza su total estimado por el de la respuesta.

Errores: `mesa_no_disponible` (409, la mesa no está ocupada), `estado_invalido` (409, la cuenta
está `por_pagar`), `producto_agotado` (409), `no_encontrado` (404).

#### CAMBIO PROPUESTO EN F4

El error `producto_agotado` debe indicar **cuáles** productos están agotados, para que la interfaz
los liste sin perder el pedido en armado:

```json
// 409
{
  "codigo": "producto_agotado",
  "mensaje": "Hay productos agotados en el pedido.",
  "productos": [ { "producto_id": 16, "disponible": false } ]
}
```

### GET /pedidos

Filtros opcionales por query string: `mesa_id`, `estado`. Ejemplo: `/pedidos?mesa_id=11&estado=enviado`.

```json
// 200: arreglo de Pedido
[ { "id": 5, "mesa_id": 11, "estado": "enviado", "...": "..." } ]
```

### GET /pedidos/{id}

200: objeto Pedido (con `detalle` completo, incluidas `observaciones`). 404 `no_encontrado` si no
existe. La pantalla "Pedido de mesa" lo usa para precargar un pedido `registrado` que se va a
editar, y valida en el cliente que pertenezca a la mesa y siga en `registrado`.

### PATCH /pedidos/{id}

#### CAMBIO PROPUESTO EN F4

Modifica un pedido mientras **no** se haya enviado a cocina. Reemplaza el detalle completo
(no es una edición parcial por línea).

```json
// petición
{
  "detalle": [
    { "producto_id": 5, "cantidad": 3, "observaciones": "Sin crema" },
    { "producto_id": 14, "cantidad": 1, "observaciones": "" }
  ]
}
// 200: objeto Pedido actualizado (estado "registrado", total recalculado por el servidor)
```

Errores: `estado_invalido` (409, el pedido ya no está en `registrado`), `producto_agotado` (409, con
la lista `productos` como en `POST /pedidos`), `no_encontrado` (404), `sin_permiso` (403, el pedido
es de otro mesero). El cliente no envía precios.

### POST /pedidos/{id}/enviar

Pasa de `registrado` a `enviado`. Sin cuerpo. 200: Pedido actualizado. Se vuelve a verificar que
ningún producto del pedido esté agotado.
Errores: `estado_invalido` (si no estaba `registrado`), `producto_agotado` (con la lista
`productos`).

La interfaz hace "Enviar a cocina" en dos llamadas (`POST /pedidos` y luego esta). Si esta falla,
el pedido ya quedó registrado y la interfaz ofrece **solo** reintentar el envío (no vuelve a crear
el pedido). Por eso `enviar` debe ser idempotente sobre un pedido ya `enviado` o responder
`estado_invalido`.

### POST /pedidos/{id}/cancelar

```json
// petición
{ "motivo": "cliente_desiste" }
// 200: Pedido con "estado": "cancelado" y "motivo_cancelacion": "cliente_desiste"
```

Motivos: `error_captura`, `cliente_desiste`, `producto_agotado`, `otro`.

El mesero solo cancela en `registrado` o `enviado`. En `en_preparacion` la API debe responder 403:

```json
{ "codigo": "requiere_gerente", "mensaje": "El pedido está en preparación: solo el gerente puede cancelarlo." }
```

El frontend ya deshabilita el botón en ese caso, pero la API debe validar igualmente.

### GET /mesas/{id}/cuenta

200: objeto Cuenta de la cuenta activa de la mesa. Si la mesa no tiene cuenta activa:
404 con `codigo: "no_encontrado"` (el frontend lo interpreta como "sin cuenta").

### POST /cuentas/{id}/solicitar-pago

```json
// petición
{ "tipo": "fisico" }   // "fisico" | "digital"
// 200: Cuenta con "estado": "por_pagar" y "tipo_pago_solicitado": "fisico"
```

Error `estado_invalido` si la cuenta no está `abierta`.

## Preguntas abiertas para el equipo de API

1. **Sesión.** ¿Cookie de sesión de PHP (`PHPSESSID`) o token (JWT / Bearer)? El frontend asume
   cookie. Si es cookie en otro origen, hace falta CORS con credenciales (ver punto 5) y
   `SameSite` adecuado; si es token, ¿dónde se guarda y cómo se renueva?
2. **Formato de errores.** ¿Aceptan `{ "codigo", "mensaje" }` como se propone? ¿Hay un catálogo
   de códigos? ¿Cómo se informan errores de validación por campo?
3. **Convención de nombres.** ¿snake_case (propuesto) o camelCase? ¿Fechas en ISO 8601 con zona
   horaria? ¿Importes como número o como cadena decimal?
4. **Actualización de estados.** Los pedidos cambian de estado en cocina (`en_preparacion` →
   `listo`). ¿Habrá polling (cada cuántos segundos es razonable), SSE/WebSocket u otro mecanismo?
   Esto afecta el aviso de "pedido listo" al mesero.
5. **CORS.** ¿Frontend y API estarán en el mismo origen o no? Si no, ¿qué orígenes y cabeceras
   se permiten (incluido `Access-Control-Allow-Credentials` si se usa cookie)?
6. **Alcance de `GET /pedidos`.** Sin filtros, ¿devuelve solo los pedidos del mesero en sesión o
   todos? El mock devuelve solo los del mesero en sesión.
7. **Estados y reglas.** ¿Coinciden los estados y las transiciones de este documento con el
   modelo real? ¿Una mesa reservada puede recibir pedidos? ¿Se permiten pedidos nuevos cuando la
   cuenta está `por_pagar`? (El mock rechaza ambos casos.)
8. **Resumen en `GET /mesas` (F3).** ¿Pueden entregar `estado_cuenta`, `pedidos_activos`,
   `total_cuenta` y `pedidos_listos` en esa misma respuesta? ¿Cada cuánto se podrá consultar sin
   problema (el panel lo pide cada 10 s por mesero, configurable)?
9. **Productos agotados.** El menú solo maneja "disponible" o "agotado" (sin cantidades). ¿Quién
   marca un producto como agotado y cuándo (cocina, gerente, automático)? ¿Un producto agotado se
   vuelve a validar al enviar el pedido? (El mock lo hace.)
10. **Creación de la cuenta (F4).** ¿Cuándo se crea la cuenta de una mesa: al ocuparla la hostess o
    con el primer pedido? El mock supone lo segundo: el primer pedido de una mesa ocupada sin
    cuenta abre la cuenta `abierta`.
11. **Modificar un pedido ya enviado (F4).** El frontend solo permite editar pedidos `registrado`
    (`PATCH /pedidos/{id}`). ¿Se podrá modificar uno `enviado` (p. ej. agregar productos) o solo
    cancelarlo y crear otro?
12. **Idempotencia al registrar (F4).** Un reintento tras un fallo de red puede duplicar el pedido
    (la respuesta se pierde, pero el servidor sí lo creó). ¿Aceptan una cabecera
    `Idempotency-Key` (o un identificador de cliente en el cuerpo) para que `POST /pedidos` sea
    seguro de repetir? Hoy el frontend bloquea los botones mientras hay una petición en curso, pero
    no envía ninguna clave.
