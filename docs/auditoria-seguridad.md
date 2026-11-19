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

## Acceso, sesiones y límites (migración 031)

Controles de acceso de la API. Se probaron contra MySQL con una base temporal (45 comprobaciones) y con pruebas unitarias.

| Control | Qué hace | Requisito |
|---|---|---|
| **Bloqueo por intentos fallidos** | Al 5.º intento fallido (en 15 minutos) el acceso de ese usuario o correo se bloquea **5 minutos** (`429 cuenta_bloqueada`, con los segundos que faltan). Mientras dura, ni la contraseña correcta entra. Vale para personal y para clientes del portal, aunque el usuario **no exista** (así no se revela quién existe). Mayúsculas y espacios no lo esquivan. Al vencer el bloqueo el contador empieza de cero. | RNF-009 |
| **Registro de accesos** | Tabla `registro_acceso`: inicios de sesión correctos, fallidos, bloqueados, salidas, sesiones vencidas y accesos no autorizados (rol sin permiso, token inválido), con IP y ruta. Se borra lo de más de 180 días. | RNF-017 |
| **Cierre de sesión en el servidor** | Cada inicio de sesión crea una fila en `sesion_empleado` y el token lleva su id (`sid`). «Salir» (`POST /api/auth/logout`) la cierra: el mismo token deja de servir (`401 sesion_expirada`). | RNF-012 |
| **Cierre por inactividad** | Tras **15 minutos** sin actividad la sesión se cierra (`INACTIVIDAD_MINUTOS`). La pantalla avisa un minuto antes («¿Sigues ahí?»). La **pantalla de Cocina**, que queda fija sin que la toquen, tiene 480 minutos (`INACTIVIDAD_MINUTOS_COCINA`). `0` = sin límite. | RNF-011 |
| **Qué cuenta como actividad** | Lo que la persona toca (la pantalla avisa con `POST /api/auth/actividad`, como mucho cada 30 s) y cualquier petición que no sea de solo lectura. Las consultas automáticas (cada 10 s) **no** la mantienen viva. | RNF-011 |
| **Límite de peticiones por IP** | General: 1500 por minuto (amplio: todo el personal sale con la misma IP y cada pantalla consulta cada pocos segundos). Inicio de sesión y registro: 40 **fallos** por 15 minutos. Recuperar contraseña: 15 por 15 minutos. Respuesta `429 demasiadas_peticiones`. | Hallazgo P-04 |
| **Cabeceras de seguridad** | `helmet`: `X-Content-Type-Options`, HSTS, sin `X-Powered-By`, etc. Cuerpo JSON de hasta 200 kb. | Hallazgo P-04 |
| **Política de contraseñas** | De 8 a 72 caracteres, con al menos una letra y un número, que no sea de las más comunes (`12345678`, `password1`…) y que no contenga el nombre de usuario. Aplica a crear usuario, cambiar contraseña, restablecer y registro de clientes, en el servidor y en el formulario. | Hallazgo P-14 |
| **Avisos al arrancar** | La API avisa si `JWT_SECRET` es corto o de ejemplo, y cuántos usuarios siguen con una contraseña de prueba (`1234`). Con `NODE_ENV=production` no arranca con un `JWT_SECRET` débil. | Hallazgo P-13 |

**Variables de entorno** (todas opcionales, ver `backend/.env.example`): `TRUST_PROXY`, `INACTIVIDAD_MINUTOS`, `INACTIVIDAD_MINUTOS_COCINA`, `ACCESO_BLOQUEO_MINUTOS`, `RATE_LIMIT_POR_MINUTO`, `RATE_LIMIT_ACCESO`.

**Detrás de un proxy** (Nginx, etc.) define `TRUST_PROXY=1`. Sin eso, el bloqueo por IP y los límites verían la IP del proxy y todos contarían como una sola persona.

**Consultar el registro de accesos** (solo con acceso a la base):

```sql
SELECT creado_en, ambito, identificador, resultado, detalle, ip, ruta
  FROM registro_acceso
 WHERE resultado IN ('fallido', 'bloqueado', 'no_autorizado')
 ORDER BY creado_en DESC LIMIT 100;
```

**Límites que quedan** (ver también [`PENDIENTES_Y_FALTANTES.md`](PENDIENTES_Y_FALTANTES.md)):

- El bloqueo es por usuario o correo: alguien podría bloquear a propósito la cuenta de otra persona durante 5 minutos. Es el
  costo habitual de este control; el límite por IP y el aviso en el registro ayudan a detectarlo.
- Las sesiones de los **clientes** del portal siguen siendo un token de 8 horas sin sesión en el servidor (tienen bloqueo y
  registro de accesos, pero no cierre por inactividad ni invalidación al salir).
- No se obliga a cambiar la contraseña inicial al primer acceso: el personal no puede cambiar su propia contraseña (solo
  Gerencia, por diseño). Los usuarios de prueba con `1234` hay que cambiarlos o eliminarlos antes de entregar.
- La bitácora de accesos no tiene pantalla: se consulta con SQL.
- HTTPS no lo configura el proyecto: se activa en el proxy o servidor donde se despliegue.
