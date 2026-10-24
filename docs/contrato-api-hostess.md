# Contrato de API esperado por el frontend (rol hostess)

> Las rutas marcadas **«Ya existe»** están implementadas en [`backend/`](../backend/). La edición de la lista de espera
> sigue propuesta. La pantalla usa el mock por defecto
> (`VITE_USE_MOCK=true`); con `VITE_USE_MOCK=false`, los paneles de reservaciones y espera y la acción «Asignar mesa»
> ya funcionan con la API real.
>
> Mismas convenciones que el [contrato del mesero](contrato-api-mesero.md): JSON en snake_case con el **nombre exacto
> de la columna**, lo que no es columna se marca _calculado_, errores `{ "codigo", "mensaje" }`, sesión por JWT
> (`Authorization: Bearer`), fechas `DATETIME` sin zona horaria («2026-10-16 20:30:00», hora local) y números que
> pueden llegar como texto (PDO). Tablas de referencia: [`database/init.sql`](../database/init.sql).

## Resumen

| Endpoint | Estado | Roles que hacen falta |
|---|---|---|
| `GET /api/mesas` | **Ya existe** (sin cambios) | Cualquier rol con sesión (hoy `requiereAuth()` sin roles): **ya sirve a la hostess** |
| `GET /api/reservaciones?fecha=AAAA-MM-DD` | **Ya existe** | `requiereAuth("hostess", "gerente")` |
| `GET /api/lista-espera?estado=esperando` | **Ya existe** | `requiereAuth("hostess", "gerente")` |
| `POST /api/lista-espera` | **Ya existe** (acepta `Idempotency-Key`) | `requiereAuth("hostess", "gerente")` |
| `PATCH /api/lista-espera/{id}` | **CAMBIO PROPUESTO** (H3) | `requiereAuth("hostess", "gerente")` |
| `POST /api/mesas/{id}/asignar` | **Ya existe** (acepta `Idempotency-Key`) | `requiereAuth("hostess", "gerente")` |
| `POST /api/reservaciones` | **Ya existe** (acepta `Idempotency-Key`) | `requiereAuth("hostess", "gerente")` |
| `PATCH /api/reservaciones/{id}` | **Ya existe** (acepta `Idempotency-Key`) | `requiereAuth("hostess", "gerente")` |
| `POST /api/reservaciones/{id}/llegada` | **Ya existe** (acepta `Idempotency-Key`) | `requiereAuth("hostess", "gerente")` |
| `GET /api/clientes?q=` | **Ya existe** | `requiereAuth("hostess", "gerente")` |
| `POST /api/clientes` | **Ya existe** (acepta `Idempotency-Key`) | `requiereAuth("hostess", "gerente")` |
| `PATCH /api/clientes/{id}` | **Ya existe** (actualiza el correo para reservaciones) | `requiereAuth("hostess", "gerente")` |
| `GET /api/catalogo/configuracion-reservacion` | **Ya existe** | `requiereAuth("gerente")` |
| `PATCH /api/catalogo/configuracion-reservacion` | **Ya existe** | `requiereAuth("gerente")` |

`GET /api/reservaciones?fecha=` (sección 2) ya se usa para el Salón y para la lista de la pantalla **Reservaciones**
(H2), que puede pedir cualquier día. Las rutas marcadas (H2) las necesita esa pantalla; ver la sección
[Reservaciones y clientes (H2)](#reservaciones-y-clientes-h2).

`PATCH /api/mesas/{id}/estado` (ya existe, `hostess` y `gerente`) **no se usa** en esta pantalla: «asignar» es una
operación de más nivel (cambia mesa **y** grupo en una sola transacción).

## Qué datos ve la hostess

Solo mesas, reservaciones y lista de espera. **No** ve pedidos, cuentas ni totales: el frontend usa solo
`id_mesa`, `numero`, `capacidad`, `zona`, `planta_baja`, `espacio_carriola`, `sin_escaleras` y `estado` de `GET /mesas` e **ignora** `estado_cuenta`, `pedidos_activos`,
`total_cuenta`, `pedidos_listos` y `tipo_pago_solicitado` aunque lleguen. Si el equipo de API prefiere no enviárselos
a este rol, puede hacerlo sin avisar al frontend.

## 1. `GET /api/mesas` — ya existe

> **Cambio:** solo devuelve las mesas **disponibles** (`mesa.activa = TRUE`) y agrega `zona` y las características fijas `planta_baja`, `espacio_carriola` y `sin_escaleras`. Una mesa no disponible tampoco se puede sentar, reservar ni cambiar de estado: la API responde `409 mesa_no_disponible`.

Sin cambios. Campos usados: `id_mesa`, `numero`, `capacidad`, `estado` (`libre` | `ocupada` | `reservada`).
La interfaz del salón llama **«Libre»** al estado `libre` (el frontend usa el mismo código `libre`; `aEstadoMesa`
entiende también `disponible` por tolerancia).

## 2. `GET /api/reservaciones?fecha=AAAA-MM-DD` — ya existe

Reservaciones **del día** (`DATE(fecha_hora) = fecha`), de **cualquier estado**, ordenadas por `fecha_hora`.
El frontend manda `fecha` = hoy en hora local y filtra en pantalla las `pendiente` y `confirmada` para «Próximas
reservaciones».

```json
[
  {
    "id_reservacion": 1,
    "id_cliente": 1,
    "id_mesa": 9,
    "fecha_hora": "2026-10-16 20:30:00",
    "personas": 4,
    "estado": "confirmada",
    "llegada_en": null,
    "cliente_nombre": "Carlos Medina",
    "cliente_telefono": "3115550201",
    "cliente_correo": "carlos.medina@correo.test",
    "mesa_numero": 9
  }
]
```

| Campo | Origen |
|---|---|
| `id_reservacion`, `id_cliente`, `id_mesa`, `fecha_hora`, `personas`, `estado`, `llegada_en` | columnas de `reservacion` (`id_mesa` y `llegada_en` pueden ser `null`) |
| `cliente_nombre`, `cliente_telefono`, `cliente_correo` | **calculados**: `JOIN cliente` (`nombre`, `telefono`, `correo`; teléfono/correo pueden ser `null`) |
| `mesa_numero` | **calculado**: `LEFT JOIN mesa` (`mesa.numero`); `null` si no tiene mesa |

`reservacion` **no tiene folio**: el frontend no lo muestra ni lo espera.

## 3. `GET /api/lista-espera?estado=esperando` — ya existe

Grupos de `lista_espera` con ese `estado`, del que lleva más tiempo al más reciente (`ORDER BY registrado_en`).

**Sin `estado`** (lo usa la pantalla Espera de H3): todos los grupos registrados **hoy** (`DATE(registrado_en) = CURDATE()`)
de cualquier estado, **más** los que siguen `esperando` aunque se hayan anotado otro día (para que un grupo que cruza la
medianoche no desaparezca). Con `estado=asignada` o `cancelada` devuelve ese estado sin límite de fecha.

```json
[
  {
    "id_espera": 1,
    "id_cliente": 6,
    "personas": 3,
    "registrado_en": "2026-10-16 19:05:00",
    "estado": "esperando",
    "cliente_nombre": "Héctor Salas",
    "cliente_telefono": null
  }
]
```

`cliente_nombre` y `cliente_telefono` son **calculados** (`JOIN cliente`). El tiempo de espera se calcula en el
frontend con `registrado_en` (no es campo de la API).

## 4. `POST /api/mesas/{id}/asignar` — ya existe

Sienta a un grupo en la mesa. Lleva la cabecera **`Idempotency-Key`** (una clave por intención; el backend ya tiene
`conIdempotencia` para eso, el frontend reutiliza la clave en los reintentos tras un fallo de red).

**Cuerpo: exactamente UNA de estas tres claves** (más de una, o ninguna → `422 estado_invalido`):

| Cuerpo | Grupo |
|---|---|
| `{ "id_reservacion": 3 }` | una reservación (`pendiente` o `confirmada`) |
| `{ "id_espera": 1 }` | un grupo de `lista_espera` (`esperando`) |
| `{ "personas": 5 }` | grupo sin registro (entero ≥ 1; el frontend limita a 99) |

**Efecto, en una sola transacción** (todo o nada):

1. `UPDATE mesa SET estado = 'ocupada' WHERE id_mesa = ? AND estado IN ('libre', 'reservada')`. Si no afecta ninguna
   fila → la mesa ya no estaba disponible (otra hostess pudo sentarla): `409 mesa_no_disponible`. Esto cubre la
   concurrencia sin bloqueos adicionales.
2. Si viene `id_reservacion`: debe existir, tener `estado IN ('pendiente', 'confirmada')` y `id_mesa IS NULL` **o** igual
   a la mesa. Se actualiza `id_mesa = {id}`, `estado = 'llego'`, `llegada_en = NOW()`.
3. Si viene `id_espera`: debe existir y estar `esperando`. Se actualiza `estado = 'asignada'`.
4. Si viene `personas`: no cambia nada más (no hay a quién ligarlo).

**No** abre cuenta: la cuenta la abre el mesero al tomar el primer pedido (suposición; hoy `seed_demo.sql` deja la mesa 12
ocupada sin cuenta y el panel del mesero la muestra con 0 pedidos).

**Respuesta `200`** (la mesa ya actualizada y, según el caso, el grupo con los mismos campos que en los GET de arriba;
el que no aplica se omite o va `null`):

```json
{
  "mesa": { "id_mesa": 4, "numero": 4, "capacidad": 4, "estado": "ocupada" },
  "reservacion": { "id_reservacion": 3, "id_cliente": 3, "id_mesa": 4, "fecha_hora": "2026-10-16 21:00:00",
                   "personas": 6, "estado": "llego", "llegada_en": "2026-10-16 20:58:12",
                   "cliente_nombre": "Familia González", "cliente_telefono": "3115550203", "mesa_numero": 4 }
}
```

**Errores** (formato `{ "codigo", "mensaje" }`, códigos que el frontend ya reconoce):

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 401 | `no_autenticado` | sin token o vencido |
| 403 | `sin_permiso` | el rol no es `hostess` ni `gerente` |
| 404 | `no_encontrado` | la mesa, la reservación o el grupo en espera no existen |
| 409 | `mesa_no_disponible` | la mesa está `ocupada` (o cambió entre que se mostró y se confirmó) |
| 409 | `estado_invalido` | la reservación no es `pendiente`/`confirmada`, tiene **otra** mesa, o el grupo ya estaba `asignada` |
| 422 | `estado_invalido` | cuerpo inválido (ninguna o varias claves, `personas` no entero ≥ 1) |

El frontend traduce `mesa_no_disponible` a «La mesa N ya no está disponible» y `estado_invalido` a «Ese grupo ya no se
puede asignar a esta mesa».

## Reservaciones y clientes (H2)

Las rutas de consulta, creación, edición y llegada están implementadas con `requiereAuth("hostess", "gerente")`.
Mismo formato de error que el resto (`{ "codigo", "mensaje" }`). Las escrituras llevan
**`Idempotency-Key`** (una clave por intención; los reintentos tras un fallo de red la reutilizan). Una reservación solo
se **edita** si está `pendiente` o `confirmada`; en cualquier otro estado la API responde `409 estado_invalido`.

### Reglas de negocio que la API debe aplicar

| Regla | Detalle |
|---|---|
| Estado inicial | Una reservación nueva nace `pendiente`. |
| Transiciones | `pendiente → confirmada \| cancelada \| llego`, `confirmada → cancelada \| llego`. `llego` y `cancelada` son finales. |
| Personas | Entero de **1 a 20**. |
| Fecha | `fecha_hora` **no puede ser pasada** al crear (se compara por minuto) ni estar a más de un año. Al editar solo se exige si la fecha **cambia**. |
| Mesa solo para hoy | `mesa` solo puede ligarse a una reservación **de hoy**: `mesa.estado` solo guarda el estado actual, no por día. Para otro día la mesa se elige al llegar. |
| Mesa libre | Al crear o cambiar la mesa, la mesa debe estar `libre`; pasa a `reservada`. Si no, `409 mesa_no_disponible`. La capacidad **no** se valida (el frontend solo avisa). |
| Cancelar libera la mesa | Al cancelar, la reservación queda con `id_mesa = NULL`; si su mesa estaba `reservada` y **no queda otra reservación vigente** (`pendiente`/`confirmada`) con esa `id_mesa`, la mesa vuelve a `libre`. |
| Cambiar de mesa o quitarla | Misma regla: la mesa anterior se libera si nadie más la necesita. |

### `POST /api/clientes` — ya existe

Cuerpo: `{ "nombre": "Laura Pérez", "telefono": "3115550999", "correo": null }` (`correo` opcional, `null` si no se
captura). Respuesta `201` con la fila de `cliente`:

```json
{ "id_cliente": 9, "nombre": "Laura Pérez", "telefono": "3115550999", "correo": null }
```

Validaciones (`422 estado_invalido`): `nombre` obligatorio (≤ 100), `telefono` de **10 dígitos** (el frontend quita
separadores; SUPOSICIÓN: la BD admite `NULL` y hasta 20 caracteres, pero para reservar se pide teléfono), `correo` con
forma válida (≤ 120). Si ya existe un cliente con ese teléfono → `409 estado_invalido` (el frontend lo muestra junto al
campo y sugiere buscarlo).

### `GET /api/clientes?q=texto` — ya existe

Hasta **20** clientes cuyo `nombre` contiene `q` (sin importar mayúsculas ni acentos) o cuyo `telefono` contiene los
dígitos de `q` (solo si `q` trae al menos 3). El frontend no consulta con menos de 2 caracteres. Respuesta: arreglo de
filas de `cliente`, ordenado por `nombre`.

### `POST /api/reservaciones` — ya existe

Cuerpo (todas son columnas de `reservacion`):

```json
{ "id_cliente": 6, "fecha_hora": "2026-10-16 21:00:00", "personas": 4, "id_mesa": null }
```

Respuesta `201`: la reservación con los mismos campos que `GET /reservaciones` (incluidos `cliente_nombre`,
`cliente_telefono`, `cliente_correo` y `mesa_numero`, **calculados**). El cliente debe tener correo válido antes del alta.
Errores: `404 no_encontrado` (cliente o mesa), `409 mesa_no_disponible`, `422 estado_invalido` (correo faltante,
fecha pasada o a más de un año, personas fuera de 1 a 20, o `id_mesa` con fecha que no es hoy).

El frontend crea primero al cliente (si es nuevo) y después la reservación (dos llamadas, cada una con su clave). Si la
segunda falla, el cliente ya existe y **no se vuelve a crear** al reintentar.

### `PATCH /api/clientes/{id}` — actualizar correo

Cuerpo: `{ "correo": "cliente@correo.test" }`. Completa o corrige el correo de un cliente existente antes de crear una
reservación. Valida formato y longitud máxima de 120. Errores: `404 no_encontrado` si no existe y `422 estado_invalido`
si el correo no es válido.

### Vencimientos, correo y configuración (migración 010)

La API procesa notificaciones en segundo plano. El recordatorio se programa los minutos configurados antes de la hora
reservada. Si una reservación `pendiente` o `confirmada` no registra llegada antes de `fecha_hora + tolerancia`, pasa a
`vencida`, pierde su mesa reservada (que se libera si no hay otra reservación vigente) y genera un correo vía Resend. Los
fallos quedan en `notificacion_reservacion` y se reintentan.

Solo Gerencia puede consultar y modificar `GET/PATCH /api/catalogo/configuracion-reservacion`:

```json
{ "tolerancia_minutos": 15, "recordatorio_minutos": 5 }
```

La actualización requiere ambos campos enteros; tolerancia de 5–180 minutos y recordatorio de 1–30 minutos. Configura el
envío con `RESEND_API_KEY` y `RESEND_FROM` en `backend/.env`; ver [`resend-reservaciones.md`](resend-reservaciones.md).

### `PATCH /api/reservaciones/{id}`

O **cambia el estado** o **edita datos**, nunca las dos cosas (si vienen juntas → `422 estado_invalido`). Solo viajan los
campos que cambian.

| Cuerpo | Efecto |
|---|---|
| `{ "estado": "confirmada" }` | Solo desde `pendiente`. |
| `{ "estado": "cancelada" }` | Desde `pendiente` o `confirmada`. Libera la mesa según la regla de arriba. |
| `{ "fecha_hora": "…", "personas": 5, "id_mesa": 4 }` | Edita lo que venga. `id_mesa: null` **quita** la mesa; si se mueve la fecha a un día que no es hoy, el frontend manda también `id_mesa: null`. |

Respuesta `200`: la reservación actualizada. Errores como en el alta, más `404 no_encontrado` y `409 estado_invalido`
(la reservación ya no es `pendiente`/`confirmada`, o se quiere confirmar una que no está `pendiente`).

### `POST /api/reservaciones/{id}/llegada`

Registra que el grupo llegó. **Es el mismo efecto que `POST /mesas/{id}/asignar` con `id_reservacion`** (conviene
implementar ambos con el mismo código): la reservación pasa a `llego` y se llena `llegada_en`, y la mesa pasa a
`ocupada`. Cuerpo opcional:

| Cuerpo | Significado |
|---|---|
| `{}` | Se sienta en la mesa que la reservación ya tiene. Si no tiene → `422 estado_invalido` («elige la mesa»). |
| `{ "id_mesa": 4 }` | Se sienta en esa mesa. Si es distinta de la que tenía, la reservación se liga a la nueva y la anterior se libera (si nadie más la necesita). |

La mesa debe estar `libre` o `reservada` (si no → `409 mesa_no_disponible`). Respuesta `200` con la misma forma que
`POST /mesas/{id}/asignar`: `{ "mesa": { … }, "reservacion": { … } }`. Errores: `404 no_encontrado`,
`409 estado_invalido` (la reservación ya no está `pendiente`/`confirmada`).

## Lista de espera (H3)

La creación y consulta están implementadas con `requiereAuth("hostess", "gerente")`; el cambio de estado sigue
propuesto. Mismo formato de error que el resto. Las escrituras llevan **`Idempotency-Key`**. Para **sentar** a un grupo
no hay ruta nueva: se **reutiliza**
`POST /api/mesas/{id}/asignar` con `{ "id_espera": n }` (sección 4); la mesa pasa a `ocupada` y el grupo a `asignada`.
El cliente se busca y se da de alta con `GET`/`POST /api/clientes` (sección de H2).

### Reglas de negocio que la API debe aplicar

| Regla | Detalle |
|---|---|
| Estado inicial | Un grupo nuevo nace `esperando` con `registrado_en` = ahora (lo pone la API, no el frontend). |
| Transiciones | `esperando → asignada` (solo vía `POST /mesas/{id}/asignar`) y `esperando → cancelada` (solo vía `PATCH`). `asignada` y `cancelada` son **finales**. |
| Nunca se borra | Quitar a un grupo cambia su `estado` a `cancelada`; la fila se conserva. No hay `DELETE`. |
| Personas | Entero de **1 a 20**. |
| Un solo grupo activo por cliente | Si el cliente ya tiene un grupo `esperando` → `409 estado_invalido` («Ese cliente ya está en la lista de espera»). Un cliente cuya espera ya terminó se puede volver a anotar. |

### `POST /api/lista-espera` — ya existe

Cuerpo (columnas de `lista_espera`; `registrado_en` y `estado` los pone la API):

```json
{ "id_cliente": 6, "personas": 3 }
```

Respuesta `201`: el grupo con los mismos campos que en `GET /lista-espera` (incluidos `cliente_nombre` y
`cliente_telefono`, **calculados**):

```json
{ "id_espera": 4, "id_cliente": 6, "personas": 3, "registrado_en": "2026-10-16 20:35:10",
  "estado": "esperando", "cliente_nombre": "Héctor Salas", "cliente_telefono": "3115550206" }
```

Errores: `404 no_encontrado` (cliente), `409 estado_invalido` (el cliente ya espera), `422 estado_invalido` (personas fuera de 1 a 20).

El frontend crea primero al cliente (si es nuevo, `POST /clientes`) y después el grupo; si la segunda llamada falla, el cliente
ya existe y **no se vuelve a crear** al reintentar.

### `PATCH /api/lista-espera/{id}`

Hoy solo **quitar de la lista** (el grupo se fue):

```json
{ "estado": "cancelada" }
```

Respuesta `200`: el grupo actualizado. Errores: `404 no_encontrado`; `409 estado_invalido` si el grupo **no está `esperando`**
(ya se sentó o ya se quitó); `422 estado_invalido` si `estado` trae cualquier otro valor (no se puede «asignar» por aquí).
No toca ninguna mesa.

### Qué muestra la pantalla Espera

- **Orden:** primero los que siguen esperando (el que lleva más tiempo, arriba) y después los demás, por `registrado_en`.
- **Tiempo de espera:** «hace 25 min», calculado en el frontend con `registrado_en` y la hora del dispositivo (conviene que
  `registrado_en` y la hora del dispositivo vayan en la misma zona horaria).
- **Espera larga:** se marca a partir de **30 minutos** (constante `UMBRAL_ESPERA_LARGA_MIN` en `src/utils/espera.ts`; no
  viene de la API).
- **Mesas sugeridas** para sentar a N personas: las **libres**, primero las que alcanzan (de la más justa a la más grande) y
  al final las que no (se avisa, no se bloquea). Las mesas `reservadas` no se ofrecen aquí; desde el Salón sí se puede.

## Reglas que aplica el frontend (y que la API debe validar también)

Viven en `src/utils/asignacion.ts`, con pruebas en `asignacion.test.ts`.

- **Mesa asignable:** `libre` o `reservada`. Una `ocupada` (o con estado desconocido) no se asigna: el botón queda con
  `aria-disabled` y se explica el motivo.
- **Reservación asignable:** `pendiente` o `confirmada` y (`id_mesa` nulo **o** esta misma mesa).
- **Lista de espera asignable:** `esperando`.
- **Avisos que NO bloquean:** personas > `capacidad` de la mesa; mesa `reservada` que se da a un grupo distinto de su
  reservación. La API **no** debe rechazarlos (la hostess decide: junta sillas, etc.).

## Estados persistidos como texto libre

`reservacion.estado` y `lista_espera.estado` son `VARCHAR(25)` **sin `CHECK`**. El backend y el frontend usan estos
valores; `vencida` se asigna al procesar la tolerancia de llegada:

| Columna | Valores asumidos | Por defecto en la BD |
|---|---|---|
| `reservacion.estado` | `pendiente`, `confirmada`, `llego`, `cancelada`, `vencida` | `pendiente` |
| `lista_espera.estado` | `esperando`, `asignada`, `cancelada` | `esperando` |

> **SUPUESTO sin confirmar (H3):** `cancelada` (el grupo se fue) **no** sale de los datos de ejemplo (`seed_demo.sql` solo trae
> `esperando` y `asignada`); lo agregó el frontend para poder quitar a alguien de la lista sin borrar su fila. Hay que
> confirmarlo con el equipo de BD (o acordar otro nombre; solo cambia `ESTADOS_ESPERA` en `src/types/estados.ts`).

Los normalizadores (`aEstadoReservacion`, `aEstadoEspera` en `services/api/conversion.ts`) toleran mayúsculas, acentos y
espacios (`Llegó` → `llego`). Un valor fuera de la lista se muestra como «Estado desconocido» y deja **una**
advertencia en la consola; esa fila no se ofrece para asignar. **Recomendación:** agregar un `CHECK` a ambas columnas
como ya tiene `mesa.estado`.

## Diferencias entre el mock y la base de datos de ejemplo

El mock **comparte las mesas con el mesero** (si la hostess ocupa una mesa, el mesero la ve ocupada), así que conserva
los estados de mesa del mock del mesero en lugar de los de `seed_demo.sql`:

| | `seed_demo.sql` (BD) | Mock |
|---|---|---|
| Mesas libres | 1, 2, 4, 7, 10 | 1, 2, 4, 6, 9 |
| Mesas ocupadas | 3, 5, 6, 8, 12 | 3, 5, 8, 11, 12 |
| Mesas reservadas | 9, 11 | 7, 10 |
| Reservaciones | 5 (Familia González es de **mañana**) | las mismas 5 personas, pero Familia González es de **hoy** para poder probar «sentar una reservación sin mesa» |

Los datos de la BD **sí** cumplen todas las reglas de arriba; con ellos la pantalla debe mostrar las mesas 9 y 11
reservadas, con Carlos Medina (mesa 9) y Patricia Ruiz (mesa 11).

## Archivos del frontend que dependen de este contrato

| Archivo | Para qué |
|---|---|
| `src/services/hostess/interfaces.ts` | contrato de servicio (`HostessService`) |
| `src/services/hostess/mappers.ts` | JSON ↔ tipos; **único** lugar que conoce los nombres de las columnas |
| `src/services/hostess/api.ts` | las cuatro llamadas |
| `src/services/hostess/mock.ts` | implementación simulada (`VITE_USE_MOCK=true`) |
| `src/services/api/conversion.ts` | normalizadores `aEstadoReservacion` / `aEstadoEspera` |
| `src/types/hostess.ts` | `Cliente`, `Reservacion`, `ListaEspera`, `MesaSalon`, `GrupoAsignacion` |
| `src/utils/asignacion.ts` | reglas de asignación |
| `src/utils/reservaciones.ts` | reglas de reservaciones: transiciones, qué se edita, fechas, personas, mesas y cliente |
| `src/stores/reservaciones.ts` | estado de la pantalla Reservaciones (día, filtros, búsqueda y acciones) |
| `src/utils/espera.ts` | reglas de la lista de espera: transiciones, tiempo de espera, umbral, orden, resumen y mesas sugeridas |
| `src/stores/espera.ts` | estado de la pantalla Espera (grupos, filtro, búsqueda y acciones) |
