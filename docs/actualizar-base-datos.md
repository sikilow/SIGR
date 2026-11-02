# Actualizar la base de datos de SIGR

Guía para poner una base MySQL existente al día con el esquema del proyecto sin borrarla. Los scripts de migración están en [`database/migrations/`](../database/migrations/); ejecútalos **una sola vez y en orden**, omitiendo los que ya se aplicaron.

> **Importante:** SIGR no lleva una tabla automática de migraciones aplicadas. Antes de ejecutar scripts, confirma con el equipo qué cambios ya recibió esa base. No ejecutes `database/init.sql` sobre una base con datos: es para crear una base nueva, no para actualizarla.

## 1. Antes de empezar

1. Detén temporalmente el backend y cualquier otra aplicación que esté escribiendo en la base.
2. Desde PowerShell, crea un respaldo fuera del repositorio:

   ```powershell
   mysqldump -h localhost -P 3306 -u root -p SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-antes-migraciones.sql"
   ```

   Cambia host, puerto y usuario si tu servidor usa otros valores. En Docker, el puerto publicado por `database/docker-compose.yml` es `3306`; la contraseña predeterminada de desarrollo es `sigr1234`.
3. Comprueba que el respaldo exista y no esté vacío antes de continuar.
4. Abre PowerShell en la raíz del repositorio. Si la terminal está en `backend`, puedes calcular la ruta al archivo desde cualquiera de esas dos carpetas con los comandos de la sección siguiente. El cliente `mysql` debe estar instalado y ser accesible desde la terminal. Si usas otros valores de conexión, reemplaza `root` y `localhost:3306` por `DB_USER` y `DB_HOST`/puerto; estos scripts usan explícitamente la base `SIGR`, así que ese es el valor esperado de `DB_NAME`. `DB_PASSWORD` se solicita de forma interactiva con `-p`.

## 2. Aplicar solo las migraciones pendientes

Si ya aplicaste 007–012, ejecuta únicamente **013**:

```powershell
Get-Content -Raw "..\database\migrations\013_auditoria_seguridad.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Ese comando es para PowerShell abierto en `backend\`. Si estás en la raíz del repositorio, usa la ruta `.\database\migrations\013_auditoria_seguridad.sql`. Ejecuta el comando como una línea completa; no pegues varias instrucciones de PowerShell juntas en una sola línea sin separadores.

La migración 013 puede volver a ejecutarse para completar una ejecución interrumpida: conserva las tablas existentes y reemplaza los triggers y el procedimiento de auditoría. Si MySQL informa un error, corrige la causa y vuelve a ejecutar el comando completo; no hace falta borrar manualmente tablas ni triggers.

Si ya aplicaste 007–010, ejecuta **011**, **012** y **013** en ese orden:

```powershell
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/011_cola_unificada_resend.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/012_correo_cancelacion.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/013_auditoria_seguridad.sql"
```

Si ya aplicaste 007–009, ejecuta 010, 011, 012 y 013 en ese orden. Para cualquier otro avance parcial, aplica solo las migraciones pendientes y respeta el orden numérico.

Si las migraciones 007–013 siguen pendientes, aplícalas en orden (una sola vez cada una):

```powershell
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/007_catalogo_descripciones_obligatorias.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/008_presentacion_producto.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/009_secciones_mesas.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/010_reservaciones_y_caracteristicas.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/011_cola_unificada_resend.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/012_correo_cancelacion.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/013_auditoria_seguridad.sql"
```

Escribe la contraseña de MySQL cuando la solicite. Asegúrate de conectarte al mismo servidor y usuario configurados en `backend/.env`.

La migración **007** convierte las descripciones vacías o `NULL` a «Detalle pendiente de completar» y luego las vuelve obligatorias. La migración **008** agrega la columna `presentacion` y un índice para buscar productos por categoría, nombre y presentación. La migración **009** crea el catálogo de secciones, registra las secciones ya usadas, asigna «General» a mesas sin sección y hace obligatoria `mesa.zona`. La migración **010** agrega características de acceso de mesas, configuración de tolerancia y recordatorio, y la cola de notificaciones por correo. La migración **011** agrega `evento` a la cola, permite confirmaciones y cambia la deduplicación por `(id_reservacion, tipo, evento)`. La migración **012** permite el tipo `cancelacion` en esa misma cola. La **013** protege al gerente inicial y audita INSERT/UPDATE/DELETE en las 26 tablas de negocio y en la tabla de configuración de seguridad mediante triggers; también crea `sp_consultar_auditoria`. Requiere privilegios MySQL para crear tablas, triggers y procedimientos. Las descripciones de relleno deben sustituirse después desde **Gerente → Productos** por información real.

No ejecutes de nuevo 007–012 si ya se aplicaron: son cambios de esquema que no están diseñados para repetirse. La 013 puede volver a crear sus triggers y procedimiento; aun así, detén la API y respalda la base antes de reaplicarla. Si no sabes si se ejecutaron, revisa primero el esquema:

```powershell
mysql -h localhost -P 3306 -u root -p -e "USE SIGR; SHOW COLUMNS FROM producto LIKE 'descripcion'; SHOW COLUMNS FROM producto LIKE 'presentacion'; SHOW INDEX FROM producto WHERE Key_name = 'idx_producto_variante'; SHOW TABLES LIKE 'seccion'; SHOW COLUMNS FROM mesa LIKE 'zona';"
```

Si la columna `presentacion` y el índice ya existen, 008 ya fue aplicada. Si la descripción ya figura como `NOT NULL`, 007 probablemente ya fue aplicada. Si existe la tabla `seccion` y `mesa.zona` es `NOT NULL`, 009 ya fue aplicada. Para 010 confirma que existen `mesa.planta_baja`, `mesa.espacio_carriola`, `mesa.sin_escaleras`, `configuracion_reservacion` y `notificacion_reservacion`. Para 011 confirma que `notificacion_reservacion` tiene la columna `evento` y la clave única `uq_notificacion_reservacion_evento`. Para 012 revisa que los CHECK de `tipo` incluyan `cancelacion`:

```sql
SHOW CREATE TABLE notificacion_reservacion\G
```

Confirma también con quien administra la base antes de repetir una migración.

### Historial de migraciones

| Script | Cambio principal | Nota |
| --- | --- | --- |
| `001_ajustes_front.sql` | Ajustes de estados de mesa y cuenta, catálogo de estados de pedido y motivo «Otro» | Una vez, en bases anteriores |
| `002_api_idempotencia.sql` | Motivos de cancelación de texto libre y tabla de idempotencia | Requiere 001 |
| `003_existencia_producto.sql` | Control de existencia de productos | Requiere 001 y 002 |
| `004_mesas_13_a_18.sql` | Inserta mesas 13 a 18 | Diseñada para poder repetirse |
| `005_mesas_zona_activa.sql` | Sección y disponibilidad de mesa | Una vez |
| `006_caja.sql` | Efectivo recibido y cambio en pagos | Una vez |
| `007_catalogo_descripciones_obligatorias.sql` | Completa descripciones vacías y exige descripción | Una vez |
| `008_presentacion_producto.sql` | Presentación/variante del producto e índice de búsqueda | Una vez |
| `009_secciones_mesas.sql` | Catálogo administrable de secciones y sección obligatoria en cada mesa | Una vez |
| `010_reservaciones_y_caracteristicas.sql` | Características de acceso, configuración de reservaciones y cola de correo | Una vez |
| `011_cola_unificada_resend.sql` | Evento de confirmación y deduplicación por `(id_reservacion, tipo, evento)` | Una vez, tras 010 |
| `012_correo_cancelacion.sql` | Tipo `cancelacion` en la cola de correo de reservaciones | Una vez, tras 011 |
| `013_auditoria_seguridad.sql` | Protege al gerente inicial y audita INSERT/UPDATE/DELETE en las tablas de negocio | Una vez, tras el esquema y usuarios iniciales |

La tabla es una referencia, no indica qué scripts están instalados en una base particular. Para una base antigua, revisa el esquema y el historial del equipo y ejecuta únicamente los pendientes en orden; no asumas que todos están pendientes. Las migraciones 011 y 012 tienen sus propios pasos de respaldo, inspección y verificación en las secciones «Migración 011» y «Migración 012».

## 3. Verificar el resultado

Conéctate a MySQL:

```powershell
mysql -h localhost -P 3306 -u root -p
```

En el cliente de MySQL, ejecuta:

```sql
USE SIGR;
SHOW COLUMNS FROM producto;
SHOW INDEX FROM producto WHERE Key_name = 'idx_producto_variante';
SHOW TABLES LIKE 'seccion';
SHOW COLUMNS FROM mesa LIKE 'zona';
SHOW COLUMNS FROM mesa LIKE 'planta_baja';
SHOW COLUMNS FROM mesa LIKE 'espacio_carriola';
SHOW COLUMNS FROM mesa LIKE 'sin_escaleras';
SHOW TABLES LIKE 'configuracion_reservacion';
SHOW TABLES LIKE 'notificacion_reservacion';
SHOW CREATE TABLE notificacion_reservacion\G
SELECT * FROM configuracion_reservacion;
SELECT nombre, activa FROM seccion ORDER BY nombre;
SELECT id_mesa, numero, zona FROM mesa ORDER BY numero;
SELECT id_producto, id_categoria, nombre, presentacion, descripcion
FROM producto
ORDER BY id_categoria, nombre, presentacion;
SELECT COUNT(*) AS descripciones_pendientes
FROM producto
WHERE descripcion = 'Detalle pendiente de completar';
```

Confirma que `producto.presentacion` exista como `VARCHAR(100)`, que `descripcion` sea `NOT NULL`, que aparezca el índice `idx_producto_variante`, que `seccion` contenga las secciones del restaurante, que `mesa.zona` sea obligatoria y que existan las columnas/tablas de 010. En `notificacion_reservacion` deben existir `evento`, la clave única por `(id_reservacion, tipo, evento)` y los CHECK con `confirmacion` y `cancelacion`. Las mesas que antes estaban sin sección quedan en «General» y pueden reasignarse desde **Gerente → Mesas**. Completa las descripciones de productos con texto pendiente con su información real.

Después de verificar, inicia el backend con las variables de conexión apuntando a esa misma base. Desde la raíz:

```powershell
Push-Location backend
npm run dev
Pop-Location
```

En el formulario **Gerente → Productos**, una variante nueva se identifica por categoría, nombre y presentación. Si ya existe, el sistema rechaza el alta y pide editar el producto existente para cambiar su inventario. Ejemplo: Coca-Cola «lata de 355 ml» y «botella de 1 litro» son variantes diferentes; repetir la misma presentación no crea otra fila.

## Correo de reservaciones con Resend o Gmail SMTP

El correo del cliente es opcional para registrar una reservación. Si existe, las confirmaciones, recordatorios, avisos de vencimiento y cancelaciones se procesan en la misma cola y se envían a la dirección guardada para ese cliente. Desde **Gerente → Reservas** se configuran la tolerancia (15 minutos por defecto; 5–180) y la anticipación del recordatorio (5 minutos por defecto; 1–30). Sin llegada tras `fecha_hora + tolerancia_minutos`, el servicio revalida bajo bloqueo que siga pendiente o confirmada, marca `vencida`, libera la mesa y encola una sola notificación. Si la reservación se cancela desde hostess, se encola un correo de cancelación solo cuando la reservación estaba pendiente o confirmada y el cliente tiene un correo válido.

Configura un único remitente `CORREO_REMITENTE` y selecciona `CORREO_PROVEEDOR=resend` o `smtp`. Si no se selecciona proveedor, el backend prefiere Resend cuando hay `RESEND_API_KEY`, después SMTP cuando hay usuario y contraseña; si no hay credenciales, el correo queda desactivado. Gmail requiere contraseña de aplicación (16 caracteres, no la contraseña habitual), `smtp.gmail.com`, puerto 465, y que el correo autenticado coincida con `CORREO_REMITENTE`. El límite aproximado de una cuenta personal es 500 mensajes al día y 100 destinatarios por mensaje; el error `550 5.4.5` reintenta después de seis horas. Los avisos usan las plantillas HTML y de texto de `backend/src/services/plantillasCorreo.ts`. Consulta [`resend-reservaciones.md`](resend-reservaciones.md) para el resto de la configuración. No guardes credenciales en Git ni en documentación.

## Migración 011: cola unificada de correo

La migración requiere que 010 ya esté aplicada. Haz el respaldo y la prueba únicamente en una base de desarrollo aislada; sustituye `SIGR_desarrollo` si tu base de desarrollo tiene otro nombre.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR_desarrollo --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR_desarrollo-antes-011.sql"

# Inspecciona el nombre real del CHECK existente antes de cambiarlo.
mysql -h localhost -P 3306 -u root -p SIGR_desarrollo -e "SHOW CREATE TABLE notificacion_reservacion\G"

# Aplica el archivo al esquema de desarrollo seleccionado (sin ejecutar la migración en producción).
Get-Content -Raw ".\database\migrations\011_cola_unificada_resend.sql" | mysql -h localhost -P 3306 -u root -p SIGR_desarrollo

# Comprueba el CHECK, el índice compuesto y que no se duplicó ningún evento.
mysql -h localhost -P 3306 -u root -p SIGR_desarrollo -e "SHOW CREATE TABLE notificacion_reservacion\G; SHOW INDEX FROM notificacion_reservacion; SELECT id_reservacion, tipo, evento, COUNT(*) AS cantidad FROM notificacion_reservacion GROUP BY id_reservacion, tipo, evento HAVING COUNT(*) > 1;"
```

El script localiza por su expresión el `CHECK` anterior de `tipo`, cuyo nombre autogenerado se ve con `SHOW CREATE TABLE`; así no supone que la restricción se llame igual en todas las bases. Agrega `evento` (vacío para recordatorios y vencimientos; `creada` o `confirmada` para confirmaciones) y reemplaza la clave única por `(id_reservacion, tipo, evento)`. No inserta confirmaciones retroactivas para reservaciones antiguas. En `database/init.sql` ya está el esquema final para bases nuevas.

## Migración 012: correo de cancelación

La migración requiere que 011 ya esté aplicada: reemplaza los CHECK nombrados `chk_notificacion_tipo` y `chk_notificacion_evento` que crea 011. Si tu base tiene otros nombres, inspecciónalos antes con `SHOW CREATE TABLE notificacion_reservacion\G` y ajusta los `DROP CHECK` del script.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR_desarrollo --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR_desarrollo-antes-012.sql"

mysql -h localhost -P 3306 -u root -p SIGR_desarrollo -e "SHOW CREATE TABLE notificacion_reservacion\G"
Get-Content -Raw ".\database\migrations\012_correo_cancelacion.sql" | mysql -h localhost -P 3306 -u root -p SIGR_desarrollo

mysql -h localhost -P 3306 -u root -p SIGR_desarrollo -e "SHOW CREATE TABLE notificacion_reservacion\G; SELECT tipo, COUNT(*) FROM notificacion_reservacion GROUP BY tipo;"
```

El CHECK de `tipo` queda con `recordatorio`, `vencida`, `confirmacion` y `cancelacion`; el de `evento` exige `creada` o `confirmada` para confirmaciones y `''` para los demás tipos. Si el script falla porque los CHECK no se llaman así, no lo repitas a ciegas: corrige los nombres en una copia revisada. La cancelación de una reservación pendiente o confirmada encola el aviso una sola vez por reservación. En `database/init.sql` ya está el esquema final para bases nuevas.

## Migración 013: seguridad y auditoría

Haz un respaldo y detén la API antes de aplicar esta migración. Debe ejecutarse después de que existan las tablas y los usuarios iniciales; identifica al gerente más antiguo como protegido. La API en ejecución necesita que se haya aplicado, pues la consulta de usuarios incluye esa marca.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-013.sql"
Get-Content -Raw ".\database\migrations\013_auditoria_seguridad.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Verifica el gerente designado, los triggers y el procedimiento antes de reiniciar la API:

```powershell
mysql -h localhost -P 3306 -u root -p SIGR -e "SELECT * FROM configuracion_seguridad; SELECT COUNT(*) AS triggers_auditoria FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME LIKE 'trg_aud_%'; SHOW PROCEDURE STATUS WHERE Db = DATABASE() AND Name = 'sp_consultar_auditoria'; CALL sp_consultar_auditoria(NULL, NULL, NULL, NULL, 10);"
```

La migración requiere `CREATE TRIGGER`, `CREATE ROUTINE` y permisos para crear las tablas de auditoría. Los triggers guardan cada cambio de fila junto con el actor autenticado de la API. Se excluyen el hash de contraseña y la respuesta almacenada para idempotencia. Los procesos SQL o de fondo sin actor autenticado producen `actor_id = NULL`. Consulta [Protección de usuarios y auditoría](auditoria-seguridad.md) para entender los datos registrados y los límites de seguridad.

## Base nueva o entorno de demostración

- **Base nueva y vacía:** ejecuta `database/init.sql` y el seed de usuarios iniciales; aplica `013_auditoria_seguridad.sql` después del seed y antes de iniciar la API. `init.sql` ya incluye los cambios de esquema anteriores (001–012), así que no los apliques otra vez.
- **Base de desarrollo en Docker que ya contiene datos:** no uses `docker compose down -v`, ya que elimina el volumen de la base. Con el contenedor activo y el puerto 3306 publicado, los comandos `mysql` anteriores la actualizan igual que una instalación local.
- Guarda el respaldo de forma segura. No lo agregues al repositorio ni lo compartas: contiene los datos de la base.

## Secciones de mesas

En **Gerente → Mesas → Secciones** se pueden crear, renombrar, inhabilitar, habilitar y borrar secciones. Renombrar actualiza las mesas asociadas. Una sección solo se puede borrar cuando no tiene mesas asignadas. Al inhabilitarla, sus mesas se conservan pero dejan de aparecer para meseros y hostess; para evitar ocultar trabajo activo, primero hay que liberar las mesas y resolver sus cuentas y reservaciones vigentes. No se permite asignar mesas a secciones inhabilitadas.
