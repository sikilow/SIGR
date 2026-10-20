# Integración del frontend con la API real

Guía para conectar el frontend con la API real, que vive en [`backend/`](../backend/) (Node + Express + MySQL). El frontend ya
funciona completo con datos simulados; cambiar a la API real no requiere tocar ninguna vista ni store, solo la
configuración y, si las respuestas no coinciden, [`services/api/mappers.ts`](../frontend/src/services/api/mappers.ts)
(y los helpers de conversión de [`conversion.ts`](../frontend/src/services/api/conversion.ts)).

**Levantar la API (una vez):** crear la base con `database/init.sql` (y, si la base ya existía, las migraciones `01` y `02`),
copiar `backend/.env.example` a `backend/.env` (clave `JWT_SECRET` y datos de MySQL), `npm install` y `npm run dev` dentro de
`backend/` (escucha en `http://localhost:3000`). Los usuarios de prueba se crean con `npx tsx src/utils/seed.ts` (contraseña `1234`).

Documentos relacionados: [`contrato-api-mesero.md`](contrato-api-mesero.md) (lo que el frontend espera),
[`equivalencias-bd.md`](equivalencias-bd.md) (cada identificador del frontend frente a la tabla y columna de la BD) y
[`pantallas-mesero.md`](pantallas-mesero.md) (qué pantalla usa cada endpoint).

## 1. Cambiar del mock a la API real

La implementación se elige en un solo lugar, `frontend/src/services/index.ts`, según `VITE_USE_MOCK`:

| Variable | Mock (demo) | API real |
|---|---|---|
| `VITE_USE_MOCK` | `true` (o sin definir) | `false` |
| `VITE_API_URL` | no se usa | URL base de la API, por ejemplo `/api` o `https://servidor/api` |

1. Copia `frontend/.env.example` a `frontend/.env.local` (no se versiona) y ajusta:

   ```env
   VITE_USE_MOCK=false
   VITE_API_URL=/api
   ```

2. Reinicia `npm run dev` (Vite lee el `.env` solo al arrancar).
3. Comprueba que ya **no** aparece la franja "Modo demo · datos simulados" ni los "Usuarios demo" en el
   login: es la señal de que se está usando la API real.

### Builds

| Comando | Qué hace |
|---|---|
| `npm run build` | Verifica tipos y compila **con lo que diga `VITE_USE_MOCK`** (sin definir = mock, con franja demo). Sirve para demostraciones sin API. |
| `npm run build:api` | Igual, pero con `--mode api`: lee `frontend/.env.api` (`VITE_USE_MOCK=false`). El mock **y sus datos de prueba no viajan en el paquete** y no aparece la franja demo. Es el que se entrega con la API real. |
| `npm run check` | Tipos (`vue-tsc`) + pruebas (`vitest`) + `build`. Debe pasar antes de entregar cambios. |

Con `build:api`, `VITE_API_URL` se toma de `.env.api`, de `.env.api.local` o del entorno; si no se define,
vale `/api` (mismo origen).

## 2. Evitar CORS en desarrollo (proxy de Vite)

Mientras la API corre en otro puerto (el backend usa `http://localhost:3000`), lo más simple es que el
navegador solo hable con Vite y Vite reenvíe las peticiones:

```env
# frontend/.env.local
VITE_USE_MOCK=false
VITE_API_URL=/api
API_PROXY_TARGET=http://localhost:3000
```

- `GET /api/mesas` llega a la API como `GET http://localhost:3000/api/mesas`: el prefijo `/api` se **conserva**, porque
  forma parte de las rutas del backend (ver `frontend/vite.config.ts`).
- Con el proxy, todo es el mismo origen y no hace falta CORS.
- `API_PROXY_TARGET` solo existe en desarrollo; no llega al navegador ni al build.

### Si la API NO está en el mismo origen (producción o sin proxy)

El backend usa el paquete `cors` con los orígenes de `CORS_ORIGIN` (por defecto, `localhost` y `127.0.0.1` en cualquier puerto). El
frontend manda el token en `Authorization: Bearer ...`, así que el servidor debe permitir esa cabecera además de las demás:

```
Access-Control-Allow-Origin: https://origen-exacto-del-frontend      (no puede ser *)
Access-Control-Allow-Headers: Content-Type, Accept, Authorization, Idempotency-Key
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
```

> **`Idempotency-Key` es obligatorio en `Access-Control-Allow-Headers`.** Si falta, el navegador bloquea el
> *preflight* y fallan registrar pedido, enviar, cancelar, entregar y solicitar cuenta (los `GET` sí
> funcionarían, lo que despista). El paquete `cors` refleja por defecto las cabeceras que pide el navegador.

## 3. Orden recomendado de integración

Se recomienda integrar **un endpoint a la vez** y probarlo en la interfaz antes de pasar al siguiente. Para
cada paso: abre las herramientas de desarrollo → pestaña **Red** (Network), y revisa el código HTTP, el JSON
de respuesta contra el contrato y las cabeceras de la petición.

| # | Endpoint(s) | Pantalla que lo usa |
|---|---|---|
| 1 | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | Login, guardia de rutas, "Salir" |
| 2 | `GET /mesas` | Panel de mesas |
| 3 | `GET /menu`, `POST /productos/disponibilidad` | Pedido de mesa, revisión |
| 4 | `POST /pedidos` | Revisión → Registrar |
| 5 | `POST /pedidos/{id}/enviar`, `PATCH /pedidos/{id}` | Enviar a cocina, editar pedido registrado |
| 6 | `GET /pedidos`, `GET /pedidos/{id}`, `GET /mesas/{id}/cuenta` | Mis pedidos, detalle, Cuenta de mesa |
| 7 | `POST /pedidos/{id}/cancelar` | Cancelar pedido |
| 8 | `POST /pedidos/{id}/entregar` | Marcar como entregado |
| 9 | `POST /cuentas/{id}/solicitar-pago` | Solicitar cuenta |

### Pruebas manuales por paso

Usuario de prueba: un mesero real de la base de datos. Antes de cada prueba, recarga la página con
`Ctrl+Shift+R`.

**1. Autenticación**
- [ ] Credenciales correctas: entra al Panel de mesas y la petición `POST /auth/login` responde 200 con
      `{ "token": ..., "usuario": { id_usuario, id_rol, nombre, correo, activo, rol } }` (con `rol` = `"Mesero"`). El token queda en
      `sessionStorage` (`sigr.token`) y las siguientes peticiones llevan `Authorization: Bearer ...`.
- [ ] Contraseña incorrecta: el login muestra "Usuario o contraseña incorrectos." (o el `mensaje` de la API)
      junto al campo y el foco vuelve a la contraseña.
- [ ] Recargar `/mesero/mesas` con sesión abierta **no** pide login (`GET /auth/me` responde 200).
- [ ] Sin sesión, abrir `/mesero/mesas` redirige a `/login` (`GET /auth/me` responde 401 `no_autenticado`).
- [ ] Entrar con un rol que no es mesero muestra el aviso "Tu rol no tiene acceso a esa pantalla".
- [ ] "Salir" cierra la sesión (`POST /auth/logout`, 204) y regresa al login.

**2. Mesas**
- [ ] El panel muestra todas las mesas con su estado, capacidad, pedidos activos, total y los avisos
      "Pedido listo" / "Cuenta solicitada".
- [ ] El JSON trae las columnas de `mesa` (`id_mesa`, `numero`, `capacidad`, `estado`) y los 4 campos calculados
      por la API (`estado_cuenta`, `pedidos_activos`, `total_cuenta`, `pedidos_listos`); una mesa sin cuenta trae
      `null` y ceros. Opcional: `tipo_pago_solicitado` (columna de `cuenta`) para mostrar "Cuenta solicitada · Pago digital".
- [ ] Un `estado` de mesa fuera de `libre`/`ocupada`/`reservada` se ve como «Estado desconocido» (y avisa en consola).
- [ ] Se repite la petición cada 10 s (`VITE_POLL_MS`) y se detiene con la pestaña oculta.
- [ ] Con la API apagada aparece "No se pudo actualizar…" con **Reintentar** y se conservan las mesas.

**3. Menú y disponibilidad**
- [ ] Las categorías y productos aparecen con su precio; un producto con `disponible: false` muestra
      "Agotado" y no se puede agregar.
- [ ] En la revisión del pedido, `POST /productos/disponibilidad` marca como agotado el producto correcto y
      bloquea "Registrar" y "Enviar a cocina".

**4. Registrar pedido**
- [ ] Registrar un pedido en una mesa ocupada: 201 con el objeto Pedido y **los precios y el total calculados por el
      servidor** (el cuerpo lleva `id_mesa` y el detalle con `id_producto`, `cantidad` e `indicaciones`: **nunca precios**;
      compruébalo en la pestaña Red). El pedido nuevo queda en `Registrado`; al enviarlo pasa a `Pendiente` (ver el contrato, "Diferencias con
      la base de datos", punto a).
- [ ] La petición lleva la cabecera `Idempotency-Key` (UUID). Si la respuesta se pierde y se reintenta,
      **no se crea un segundo pedido**.
- [ ] Errores: mesa no ocupada → `mesa_no_disponible`; cuenta por pagar → `estado_invalido`; producto
      agotado → `producto_agotado` con la lista `productos`. La interfaz los explica sin perder el pedido.

**5. Enviar y editar**
- [ ] "Enviar a cocina" (desde la revisión o desde el detalle): `POST /pedidos/{id}/enviar` → `enviado`.
- [ ] Forzar un fallo y usar "Reintentar envío": se repite **solo** el envío, con la misma `Idempotency-Key`.
- [ ] Editar un pedido `registrado` (`?editar=`): `PATCH /pedidos/{id}` reemplaza el detalle completo y
      devuelve el total recalculado. Uno ya enviado responde `estado_invalido`.

**6. Pedidos y cuenta**
- [ ] Mis pedidos lista los pedidos (¿solo los del mesero o todos? ver pregunta abierta 6/18); los filtros
      Activos / Registrado / … funcionan y el chip "Mesa N ×" pide `GET /pedidos?id_mesa=`.
- [ ] El detalle muestra líneas, observaciones (`indicaciones`), hora (`fecha_hora`), mesa (`mesa_numero`) y, si está
      cancelado, el motivo (`motivo_descripcion`, texto libre).
- [ ] Cuenta de mesa: el total es el de la API y **no** suma los pedidos cancelados; una mesa sin cuenta
      responde 404 `no_encontrado` y la pantalla muestra "Aún no hay pedidos en esta mesa".

**7. Cancelar**
- [ ] Un pedido `Pendiente` se cancela con motivo (`{ "descripcion": ... }`, 5 a 200 caracteres) y el pedido trae
      `id_motivo` y `motivo_descripcion`.
- [ ] En `En preparacion` la API responde 403 `requiere_gerente` y la interfaz lo explica.
- [ ] En `Listo`, `Entregado` o `Cancelado`: 409 `estado_invalido`.
- [ ] Con la cuenta `por_pagar`: 409 `estado_invalido` (suposición; ver pregunta abierta 15).
- [ ] Tras cancelar, el total de la cuenta se recalcula y el panel se actualiza.

**8. Entregar**
- [ ] Un pedido `Listo` pasa a `Entregado` y desaparece "Pedido listo" de esa mesa en el panel.
- [ ] Desde cualquier otro estado responde 409 `estado_invalido`.

**9. Solicitar cuenta**
- [ ] Con "Pago físico" y con "Pago digital": 200 con `estado: por_pagar` y `tipo_pago_solicitado`; la
      pantalla muestra "Cuenta solicitada · Pago … · Esperando al cajero" y el panel "Cuenta solicitada".
- [ ] Una cuenta ya solicitada, o sin pedidos vigentes, responde 409 `estado_invalido`.
- [ ] Después ya no se pueden agregar pedidos a esa mesa.

## 4. Cuando la respuesta no coincide con lo esperado

La traducción entre el JSON de la API y los tipos del frontend vive **solo** en
`frontend/src/services/api/mappers.ts`. Procedimiento:

1. Copia la respuesta real (pestaña Red → Respuesta) y compárala con el contrato.
2. En `mappers.ts`, ajusta la interfaz `*Dto` (forma del JSON de la API) y la función de conversión
   (`aMesa`, `aPedido`, `aCuenta`, `aCategoriaMenu`…, y `de*` para los cuerpos que se envían). Los helpers para números,
   booleanos, fechas y nombres de estado/rol están en `conversion.ts`.
   - Nombres distintos (otro nombre de campo): se arregla ahí. Las claves esperadas son los nombres exactos de las columnas.
   - Números, `DECIMAL` o booleanos como texto, `DATETIME` sin zona: ya se convierten (`aNumero`, `aBooleano`, `parseFechaMySQL`).
   - Un campo que no llega: dale un valor por omisión en el mapper (`dto.campo ?? null`) en vez de tocar
     las vistas.
3. **No** se tocan las vistas ni los stores: ellos solo conocen los tipos de `src/types/`.
4. Actualiza la prueba correspondiente en `services/api/mappers.test.ts` (o `conversion.test.ts`) y ejecuta `npm run check`.
5. Anota la diferencia en la tabla de la sección 5 y avisa al equipo de API (o ajusta el contrato).

Otros archivos que sí pueden requerir un cambio puntual, y solo ellos:

| Si la diferencia es… | Se edita |
|---|---|
| Cambiar cómo viaja o se guarda el token (hoy `Authorization: Bearer`, en `sessionStorage`) | `services/api/cliente.ts` y `token.ts` |
| Formato del cuerpo de error (`codigo`, `mensaje`) o códigos de error nuevos | `services/api/cliente.ts` (`CODIGOS_CONOCIDOS`, `codigoPorEstadoHttp`) y `services/errores.ts` |
| Rutas o métodos HTTP distintos | `services/api/index.ts` |

Problemas frecuentes: **404 en todo** → revisa `VITE_API_URL`/`API_PROXY_TARGET` y que el proxy quite `/api`;
**401 después de iniciar sesión** → el token no se guardó o ya venció (8 h): revisa `sessionStorage` y que `Authorization` esté permitida en CORS; **solo fallan los POST** → falta `Idempotency-Key` en `Access-Control-Allow-Headers`.

## 5. Diferencias detectadas

Anota aquí cada diferencia entre el contrato y la API real conforme se integren los endpoints.

| Fecha | Endpoint | Esperado (contrato) | Recibido (API real) | Dónde se resolvió | Estado |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

Estados sugeridos: _pendiente_, _ajustado en el mapper_, _ajustado en la API_, _contrato actualizado_.

## 6. Lista de cierre antes de entregar

- [ ] `npm run check` pasa (tipos, pruebas y build).
- [ ] `npm run build:api` genera el paquete sin la franja demo ni los usuarios de prueba.
- [ ] Los nueve pasos de la sección 3 probados con la API real y la tabla de diferencias al día.
- [ ] Preguntas abiertas del contrato respondidas por el equipo de API (en especial 1, 5 y 12).
