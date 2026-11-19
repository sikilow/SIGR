# Contrato de API que usa el gerente (pantalla Pedidos)

> Las rutas marcadas **«Ya existe»** están implementadas en [`backend/`](../backend/) y la pantalla
> `/gerente/pedidos` las usa **sin cambios**. Lo marcado **CAMBIO PROPUESTO** no está implementado: es una propuesta
> para el equipo de backend. El frontend no depende de ella.
>
> Mismas convenciones que el [contrato del mesero](contrato-api-mesero.md): JSON en snake_case con el **nombre exacto
> de la columna**, lo que no es columna se marca _calculado_, errores `{ "codigo", "mensaje" }`, sesión por JWT
> (`Authorization: Bearer`) y fechas `DATETIME` sin zona horaria («2026-10-21 14:30:00», hora local).

## Resumen

| Endpoint | Estado | Roles | Uso en la pantalla |
|---|---|---|---|
| `GET /api/pedidos` | **Ya existe** | Cualquier rol con sesión (`requiereAuth()`) | Lista de todo el salón (sin filtros) |
| `GET /api/pedidos/:id` | **Ya existe** | Cualquier rol con sesión | Detalle cuando el pedido no viene en la lista (p. ej. URL directa) |
| `POST /api/pedidos/:id/cancelar` | **Ya existe** (acepta `Idempotency-Key`) | `requiereAuth("mesero", "gerente")` | Cancelar como gerente, incluso en preparación |
| `GET /api/mesas/:id/cuenta` | **Ya existe** | Cualquier rol con sesión | Cuenta activa de la mesa del pedido |
| `GET /api/pedidos?desde=&hasta=&limite=&pagina=` | **CAMBIO PROPUESTO** (P-11) | Igual que hoy | Historial sin traer todo |
| Quién canceló y cuándo (RF-PED-006) | Bitácora `sigr_auditoria` (migración 013), no columnas de `pedido` | `sp_consultar_auditoria` (acceso a base de datos) | Consultable en auditoría; no incluido en la respuesta del pedido |

## 1. `GET /api/pedidos` — Ya existe

Devuelve **todos** los pedidos (de todos los meseros) del más nuevo al más viejo. Filtros actuales: `?id_mesa=` y
`?estado=` (código interno, nombre del catálogo o su versión normalizada). **No pagina ni filtra por fecha.**

Cada pedido trae, entre otros: `id_pedido`, `id_cuenta`, `id_mesero`, `nombre_mesero` (_calculado_: `usuario.nombre`),
`estado` (_calculado_: `estado_pedido.nombre`), `fecha_hora`, `id_motivo`, `motivo_descripcion` (_calculado_),
`id_mesa` y `mesa_numero` (_calculados_: salen de la cuenta), `total` (_calculado_) y `detalle[]`.

> **Observaciones:** la columna `pedido.observaciones` existe en `database/init.sql`, pero la API **no la envía**
> (`SELECT_PEDIDO` en `backend/src/models/dominio.ts`). La pantalla muestra las observaciones de cada producto
> (`detalle_pedido.indicaciones`), que sí llegan. Si se quiere mostrar la observación general del pedido, es un
> cambio de contrato: agregar `observaciones` (columna) a la respuesta. **No implementado.**

## 2. `POST /api/pedidos/:id/cancelar` — Ya existe

Cuerpo: `{ "descripcion": "texto de 5 a 200 caracteres" }` (`motivo_cancelacion.descripcion` es `VARCHAR(200)`).
Cabecera opcional `Idempotency-Key`: el frontend genera **una clave por intención** (mismo pedido y mismo motivo); un
reintento tras un fallo de red reutiliza la clave y no repite la cancelación.

Reglas del servidor, en este orden:

| Caso | Respuesta |
|---|---|
| Mesero que no es dueño del pedido | `403 sin_permiso` (el gerente no tiene esta restricción) |
| Pedido en preparación y el usuario **no** es gerente | `403 requiere_gerente` |
| Estado distinto de registrado, enviado (`Pendiente`) o en preparación | `409 estado_invalido` |
| La cuenta ya está `por_pagar` | `409 estado_invalido` |
| Ya se había enviado a cocina | Se devuelve la existencia al inventario y se cancela |
| Éxito | `200` con el pedido (`estado: "Cancelado"`, `motivo_descripcion`) |

## 3. `GET /api/pedidos` con historial — CAMBIO PROPUESTO (P-11)

**Problema:** sin fechas ni paginación, la pantalla descarga todos los pedidos de la historia en cada actualización
(cada 10 s). Con el tiempo esto rompe RNF-001 (≤ 5 s en históricos) y RNF-004 (grandes volúmenes).

**Propuesta** (compatible con lo que hay: sin parámetros nuevos, la respuesta no cambia):

| Parámetro | Tipo | Regla |
|---|---|---|
| `desde` | `AAAA-MM-DD` | Incluye pedidos con `fecha_hora >= desde 00:00:00` (hora local) |
| `hasta` | `AAAA-MM-DD` | Incluye pedidos con `fecha_hora < (hasta + 1 día) 00:00:00` |
| `limite` | entero 1 a 200 | Por defecto 50 **solo si** viene `pagina` |
| `pagina` | entero ≥ 1 | Página de `limite` pedidos, del más nuevo al más viejo |

- Validación con zod; un valor inválido responde `422 estado_invalido`.
- Total para «Mostrando N de M»: cabecera `X-Total-Count` (agregar `exposedHeaders: ["X-Total-Count"]` en la
  configuración de `cors` de `backend/src/index.ts`). Así el cuerpo sigue siendo el mismo arreglo y el mesero y la
  cocina no cambian.
- Índice: ya existe `idx_pedido_fecha_hora`.
- Cuando exista, el frontend cambiaría `listar()` de `services/api/` y del mock para pasar `desde`, `hasta` y
  `pagina`; la pantalla ya está separada en «día» y «todos los días».

## 4. Quién canceló y cuándo (RF-PED-006)

Después de aplicar `013_auditoria_seguridad.sql`, la auditoría general registra quién y cuándo cambió una fila de
`pedido`, con los estados y valores anterior/nuevo. Consulta los eventos mediante `sp_consultar_auditoria` (ver
[Protección de usuarios y auditoría](auditoria-seguridad.md)). El esquema todavía no tiene las columnas
`pedido.id_cancelado_por` ni `pedido.cancelado_en`; si se necesitan directamente en cada respuesta de pedido,
se requiere una migración adicional.

## 5. Otras limitaciones que la pantalla explica

- `GET /api/mesas/:id/cuenta` solo devuelve la cuenta **activa**. Para un pedido de una cuenta ya cobrada no hay forma
  de consultar esa cuenta; la pantalla lo dice en lugar de mostrar la cuenta nueva de la mesa. Un
  `GET /api/cuentas/:id` (solo gerente y cajero) lo resolvería: **propuesta, no implementado**.


## Características de mesa (migración 023)

Catálogo que administra Gerencia en **Gerente → Mesas → Características** («Planta baja», «Junto a la ventana»…). Todas las
rutas son solo del gerente.

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/catalogo/caracteristicas` | — | `[{ "id_caracteristica", "nombre", "activa", "total_mesas", "total_reservaciones" }]` (activas e inactivas) |
| `POST /api/catalogo/caracteristicas` | `{ "nombre" }` (1 a 40 caracteres, único) | `201` con la característica; `409` si el nombre ya existe |
| `PATCH /api/catalogo/caracteristicas/:id` | `{ "nombre" }` o `{ "activa": false }` | la característica actualizada |
| `DELETE /api/catalogo/caracteristicas/:id` | — | `{ "ok": true }`; `409` si alguna mesa o reservación la usa (entonces se desactiva) |

Desactivar una característica la deja de ofrecer en el portal, en la hostess y para nuevas asignaciones, pero las mesas que
ya la tenían la conservan. En `POST/PATCH /api/catalogo/mesas`, `caracteristicas` es la lista de ids (activos) de la mesa y
`GET /api/catalogo/mesas` la devuelve con los ids de todas sus características (también las desactivadas). Las columnas fijas
`mesa.planta_baja`, `espacio_carriola` y `sin_escaleras` se eliminaron: sus valores pasaron al catálogo.

## Recuperar contraseña del personal (migración 024)

Enlace de un solo uso por correo: el empleado crea su contraseña nueva; nadie más la ve. Caduca en 1 hora, pedir otro invalida el anterior y se mandan como máximo 3 por usuario por hora.

| Método y ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|
| `POST /api/auth/recuperar` | Público | `{ usuario_o_correo }` | 200 `{ mensaje }` siempre igual, exista o no la cuenta (también si llegó al límite) |
| `GET /api/auth/restablecer/:token` | Público | — | 200 `{ nombre_usuario, nombre }` · 410 `enlace_invalido` si se usó o caducó |
| `POST /api/auth/restablecer` | Público | `{ token, contrasena }` (6 a 72 caracteres) | 200 `{ ok: true }` · 410 `enlace_invalido` · 422 `estado_invalido` |
| `POST /api/usuarios/:id/restablecer` | Gerente | — | 200 `{ ok: true, correo: "c***@dominio" }` · 404 · 409 usuario inactivo · 429 límite por hora · 502 `correo_no_enviado` |

El correo (`plantillaRestablecerContrasena`) lleva el nombre de usuario y el botón «Crear nueva contraseña» que abre `/restablecer?token=…` en el front. La contraseña anterior sigue funcionando hasta que se use el enlace.
