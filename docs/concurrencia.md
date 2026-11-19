# Varias personas a la vez: cómo se evita que se pisen

Cuando dos o más personas usan el sistema al mismo tiempo (dos meseros, la hostess y un cliente en el portal, dos
cajeros…), la base de datos no se daña ni se mezclan los datos por estas protecciones. Todo está en `backend/src`.

| Riesgo | Protección | Dónde |
|---|---|---|
| Una operación a medias (se creó el pedido pero no su detalle) | **Transacciones**: o se guarda todo o nada | `services/db.ts` → `transaccion()` |
| Dos personas cambian lo mismo a la vez (cobrar la misma cuenta, abrir la misma mesa virtual, cerrar el mismo corte) | **Bloqueo de fila** (`SELECT … FOR UPDATE`): la segunda espera a que la primera termine y ve su resultado | controladores `caja`, `cuentas`, `mesas`, `pedidos`, `hostess`, `usuarios`, `catalogo` |
| Se toca dos veces «Enviar» o se pierde la respuesta y se reintenta | **`Idempotency-Key`**: la misma clave devuelve la respuesta guardada sin repetir la acción | `services/idempotencia.ts` |
| Datos repetidos (correo, teléfono, número de mesa, folio…) | Restricciones **`UNIQUE`** en la base | `database/init.sql` |
| **Dos reservaciones se llevan la última mesa** | **Candado de disponibilidad**: antes de comprobar si «cabe» una reservación se bloquea la fila única de `configuracion_reservacion`; las demás comprobaciones esperan y leen con `FOR SHARE` lo que ya confirmó la otra | `services/disponibilidadReservacion.ts` (`bloquearDisponibilidadReservaciones`) |
| **La API se congela con muchas peticiones a la vez** | Cada petición con `Idempotency-Key` usa **dos** conexiones del pool; un tope (`LIMITE_IDEMPOTENTES`) hace que las que pasan de ahí esperen turno, y el pool es configurable | `services/idempotencia.ts`, `services/db.ts` |
| MySQL cancela una transacción por **interbloqueo** (error 1213) | `transaccion()` la **repite sola** hasta 2 veces | `services/db.ts` |

## Reglas para quien programe

- Todo lo que cambie dos o más filas va dentro de `transaccion()`, y la función **solo toca la base de datos**: puede
  repetirse por un interbloqueo, así que no envíes correos ni hagas otros efectos fuera de MySQL dentro de ella (déjalos
  para después del `COMMIT`, como hace `solicitarProcesamientoReservaciones`).
- Dentro de una transacción usa **la conexión `cx`**, nunca `pool`: usar `pool` ahí ocupa una segunda conexión.
- Antes de comprobar si hay mesa para una reservación, pide el candado de disponibilidad **antes** de bloquear la
  reservación o las mesas (`exigirMesaDisponible` lo pide solo; en `PATCH /api/reservaciones/:id` se pide al inicio).
  Siempre el mismo orden evita interbloqueos.
- Una lectura normal dentro de una transacción ve la base como estaba al empezar (`REPEATABLE READ`). Si la decisión
  depende de lo que otros acaban de confirmar, lee con `FOR UPDATE` o `FOR SHARE`.

## Configuración

`DB_POOL_LIMIT` (en `backend/.env`, de 4 a 200; por omisión 30): conexiones simultáneas con MySQL. Con más usuarios a la
vez, súbelo. Revisa que `max_connections` de MySQL (por omisión 151) sea mayor que este valor.

## Lo que todavía no cubre

- **Dos gerentes editando el mismo registro** (producto, mesa…): gana el último en guardar y no se avisa que se pisó el
  cambio. Si hiciera falta, se resuelve con una columna de versión (control optimista).
- Hay **una sola instancia de la API**: el tope de peticiones idempotentes vive en su memoria. Con varias instancias
  detrás de un balanceador, cada una tendría su propio tope (el candado de la clave sí es de MySQL y vale para todas).

## Cómo se probó

Con una base temporal y 8 confirmaciones simultáneas de reservaciones para la única mesa de 20 personas: antes del arreglo
quedaban 2 confirmadas (sobreventa); después, siempre 1 (las otras 7 reciben `409 mesa_no_disponible`). Con un pool de 10
conexiones, 40 peticiones simultáneas con `Idempotency-Key` dejaban la API congelada; ahora terminan en menos de un segundo.
La misma clave enviada 5 veces a la vez crea una sola reservación. Pruebas automáticas:
`backend/tests/transaccionInterbloqueo.test.ts`.
