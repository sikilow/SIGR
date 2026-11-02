# Protección de usuarios y auditoría

## Primer gerente

La migración `013_auditoria_seguridad.sql` identifica como gerente inicial al gerente con la fecha de creación más antigua; en caso de empate, el de menor `id_usuario`. Si aún no existe ninguno al aplicarla, queda designado el primer usuario que se cree o se cambie al rol Gerente.

El gerente inicial no se puede desactivar ni cambiar de rol, y la base rechaza su eliminación directa. La interfaz lo identifica como **Gerente inicial protegido**. Las reglas se validan en la API y también en MySQL para cubrir operaciones que no pasen por la interfaz. Puede actualizar sus demás datos; para cambiar su contraseña, también debe proporcionar la anterior por el flujo de Gerencia.

## Cambio de contraseña

- Solo Gerencia puede iniciar el cambio desde **Gerencia → Usuarios → Contraseña**. La persona dueña de la cuenta debe proporcionar su contraseña anterior a la persona gerente que realiza el cambio; la interfaz la valida y la API también la compara con el hash bcrypt antes de guardar la nueva.
- La misma verificación se exige al cambiar la contraseña del propio gerente. No existe un flujo para que otros roles la cambien directamente ni para que Gerencia omita la contraseña anterior del usuario.
- El endpoint `POST /api/usuarios/:id/contrasena` requiere autenticación de Gerencia, la contraseña anterior del usuario afectado y la contraseña nueva.
- La auditoría identifica una actualización de `credenciales` y registra `campos_modificados: ["password_hash"]`, junto con el actor y la hora. Nunca almacena la contraseña ni el hash.

## Auditoría en MySQL

La migración instala triggers `AFTER INSERT`, `AFTER UPDATE` y `AFTER DELETE` en las 26 tablas de negocio existentes y en la nueva configuración del gerente inicial. Por cada fila modificada se registra en `sigr_auditoria`:

- el usuario autenticado (`actor_id`), la tabla y la operación;
- la llave de la fila, la hora y la cuenta de MySQL;
- los valores anteriores y nuevos para revisar el cambio, excepto campos secretos;
- `campos_modificados` para marcar, sin registrar su contenido, cambios de credenciales como `password_hash`.

Las instantáneas excluyen `credenciales.password_hash` y `idempotencia.respuesta`, que puede repetir datos de la respuesta de una operación. Los registros de auditoría no se pueden actualizar ni borrar mediante DML ordinario. Las operaciones de scripts, herramientas externas y procesos de fondo que no tengan usuario autenticado quedan con `actor_id = NULL`; se conserva la cuenta de MySQL para distinguir el origen técnico.

La API toma el ID del token verificado y lo establece en la conexión MySQL justo antes de cada consulta. Las escrituras y su fila de auditoría ocurren dentro de la misma sentencia/transacción: si la operación se revierte, también se revierte su auditoría. Las nuevas tablas de negocio que se agreguen en el futuro necesitan sus propios tres triggers en una migración.

Para consultar los eventos con permisos de lectura sobre la tabla:

```sql
CALL sp_consultar_auditoria(NULL, NULL, NULL, NULL, 100);
```

Los parámetros filtran por `actor_id`, tabla, fecha inicial y fecha final, en ese orden; se puede usar `NULL` para omitir un filtro y el límite queda acotado entre 1 y 500. La salida contiene datos personales y operativos: limita el acceso a la tabla y al procedimiento a personal autorizado.

## Decisión de almacenamiento y límites

La auditoría se almacena en la misma base MySQL que los datos del sistema para que triggers, cambios y reversión sean atómicos. Separar la tabla a otra base o servidor sin una arquitectura transaccional distribuida puede dejar cambios sin su registro si una de las conexiones falla. La misma base **no** protege el historial ante alguien que tenga permisos para alterar o eliminar triggers, cambiar el esquema o restaurar un respaldo. En producción, separa la cuenta de despliegue (puede crear triggers/procedimientos y tiene `INSERT` en auditoría) de la cuenta de ejecución de la API; no concedas a esta última `INSERT`, `UPDATE`, `DELETE` ni `SELECT` sobre `sigr_auditoria`, restringe DDL y conserva respaldos protegidos e independientes. Los triggers se crean con el definidor de quien aplica la migración, que debe conservar su permiso de inserción en la tabla de auditoría.

La migración 013 es necesaria tanto en una base existente como en una nueva. En una base nueva, carga el esquema y los usuarios iniciales primero, aplica las migraciones que correspondan y ejecuta 013 antes de iniciar la API con el esquema actualizado. Consulta [Actualizar la base](actualizar-base-datos.md#migracion-013-seguridad-y-auditoria).
