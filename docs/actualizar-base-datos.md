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

Si ya aplicaste 007–014, revisa y aplica solo las migraciones pendientes entre **015** y **017**. La 015 agrega el fondo inicial y el cuadre de efectivo en el corte:

```powershell
Get-Content -Raw "..\database\migrations\015_corte_efectivo.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Desde la raíz del repositorio usa la ruta `.\database\migrations\015_corte_efectivo.sql`. Revisa la sección «Migración 015» antes de aplicarla.

Después de 015, aplica **016** para guardar el método digital que eligió el mesero y bloquear el cobro hasta entregar los pedidos:

```powershell
Get-Content -Raw "..\database\migrations\016_metodo_pago_solicitado.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Desde la raíz del repositorio usa `.\database\migrations\016_metodo_pago_solicitado.sql`.

Después de 016, aplica **017** para organizar métodos de pago en categorías:

```powershell
Get-Content -Raw "..\database\migrations\017_categorias_metodos_pago.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Desde la raíz del repositorio usa `.\database\migrations\017_categorias_metodos_pago.sql`.

Si ya aplicaste 007–013, ejecuta **014** (portal web de clientes), **015**, **016** y **017** en ese orden. Sin la 014, el registro y el inicio de sesión de clientes responden error 500:

```powershell
Get-Content -Raw "..\database\migrations\014_clientes_web.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Desde la raíz del repositorio usa la ruta `.\database\migrations\014_clientes_web.sql`. Revisa la sección «Migración 014» antes de aplicarla.

Si ya aplicaste 007–012, ejecuta **013**, **014**, **015**, **016** y **017** en ese orden:

```powershell
Get-Content -Raw "..\database\migrations\013_auditoria_seguridad.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Ese comando es para PowerShell abierto en `backend\`. Si estás en la raíz del repositorio, usa la ruta `.\database\migrations\013_auditoria_seguridad.sql`. Ejecuta el comando como una línea completa; no pegues varias instrucciones de PowerShell juntas en una sola línea sin separadores.

La migración 013 puede volver a ejecutarse para completar una ejecución interrumpida: conserva las tablas existentes y reemplaza los triggers y el procedimiento de auditoría. Si MySQL informa un error, corrige la causa y vuelve a ejecutar el comando completo; no hace falta borrar manualmente tablas ni triggers.

Si ya aplicaste 007–010, ejecuta **011** a **017** en ese orden:

```powershell
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/011_cola_unificada_resend.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/012_correo_cancelacion.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/013_auditoria_seguridad.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/014_clientes_web.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/015_corte_efectivo.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/016_metodo_pago_solicitado.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/017_categorias_metodos_pago.sql"
```

Si ya aplicaste 007–009, ejecuta 010 a 017 en orden. Para cualquier otro avance parcial, aplica solo las migraciones pendientes y respeta el orden numérico.

Si las migraciones 007–017 siguen pendientes, aplícalas en orden (una sola vez cada una):

```powershell
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/007_catalogo_descripciones_obligatorias.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/008_presentacion_producto.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/009_secciones_mesas.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/010_reservaciones_y_caracteristicas.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/011_cola_unificada_resend.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/012_correo_cancelacion.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/013_auditoria_seguridad.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/014_clientes_web.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/015_corte_efectivo.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/016_metodo_pago_solicitado.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/017_categorias_metodos_pago.sql"
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
| `014_clientes_web.sql` | Contraseñas de clientes del portal web y correo único por cliente | Tras 013; puede repetirse |
| `015_corte_efectivo.sql` | Fondo inicial, efectivo esperado y contado en el corte de caja | Una vez, tras 014 |
| `016_metodo_pago_solicitado.sql` | Método elegido por el mesero y control de entrega antes de cobrar | Tras 015; actualiza triggers de auditoría de cuenta |
| `017_categorias_metodos_pago.sql` | Categorías físicas/digitales configurables y métodos asociados | Tras 016 |
| `018_telefono_unico_y_anticipacion_reserva.sql` | Teléfono de usuarios solo con dígitos y único; anticipación mínima de reservación configurable | Tras 017; puede repetirse |
| `019_pedidos_para_llevar.sql` | Sección «Para llevar» con mesas virtuales (101 a 110), catálogo `canal_pedido` y canal/referencia en la cuenta | Tras 018; puede repetirse |
| `020_acceso_google_clientes.sql` | `cliente_credencial.google_sub` único y contraseña opcional (acceso de clientes con Google) | Tras 019; puede repetirse |
| `021_preferencias_reservacion.sql` | Preferencias de mesa en la reservación (`pref_zona`, `pref_planta_baja`, `pref_carriola`, `pref_sin_escaleras`) | Tras 020; puede repetirse |
| `022_horario_reservaciones.sql` | Horario de reservaciones en `configuracion_reservacion` (primera y última hora, intervalo y días abiertos) | Tras 021; puede repetirse |
| `023_caracteristicas_mesa_y_duracion.sql` | Catálogo de características de mesa (`caracteristica_mesa`, `mesa_caracteristica`, `reservacion_caracteristica`), quita las columnas fijas de acceso y agrega `duracion_reservacion_minutos` | Tras 022; puede repetirse |
| `024_restablecer_contrasena.sql` | Tabla `restablecimiento_contrasena`: enlaces de un solo uso (1 hora) para que el personal cree una contraseña nueva por correo | Tras 023; puede repetirse |
| `028_eliminado_logico_clientes.sql` | Columnas `eliminado_en` y `eliminado_por` en `cliente` (eliminado lógico, fase 3); la auditoría las registra | Tras 027; puede repetirse |
| `029_eliminado_logico_catalogos.sql` | Columnas `eliminado_en` y `eliminado_por` en `mesa`, `seccion`, `caracteristica_mesa`, `canal_pedido`, `categoria_metodo_pago` y `metodo_pago` (eliminado lógico, fase 4); la auditoría las registra | Tras 028; puede repetirse |
| `027_eliminado_logico_usuarios.sql` | Columnas `eliminado_en` y `eliminado_por` en `usuario` (eliminado lógico, fase 2); protege al primer gerente también de ser eliminado; la auditoría las registra | Tras 026; puede repetirse |
| `026_eliminado_logico_productos.sql` | Columnas `eliminado_en` y `eliminado_por` en `producto` y `categoria_menu` (eliminado lógico, fase 1); la auditoría las registra | Tras 025; puede repetirse |
| `025_lada_telefono.sql` | Columna `lada` (código de país, «52» por defecto) en `cliente` y `perfil_usuario`; la auditoría de ambas la registra | Tras 024; puede repetirse |

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

## Migración 014: portal web de clientes

Crea `cliente_credencial` (contraseñas de los clientes del portal), guarda los correos de `cliente` en minúsculas y sin espacios, convierte los correos vacíos en `NULL` y agrega el índice único `uq_cliente_correo`. Haz un respaldo antes de aplicarla.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-014.sql"
Get-Content -Raw ".\database\migrations\014_clientes_web.sql" | mysql -h localhost -P 3306 -u root -p SIGR
```

Si dos clientes comparten correo, la migración no crea el índice y muestra esos correos con los `id_cliente` que los usan. Deja cada correo en un solo cliente y vuelve a ejecutar el archivo completo; es seguro repetirlo. Para comprobar el resultado:

```powershell
mysql -h localhost -P 3306 -u root -p SIGR -e "SHOW TABLES LIKE 'cliente_credencial'; SHOW INDEX FROM cliente WHERE Key_name = 'uq_cliente_correo';"
```

Un cliente que la hostess ya registró con su correo puede crear su cuenta en el portal con ese mismo correo y el teléfono que dio en el restaurante; conserva sus reservaciones anteriores.

## Migración 015: fondo inicial y cuadre de efectivo

Agrega a `corte_caja` el fondo inicial con el que abre el cajero, el efectivo esperado (fondo inicial más cobros en efectivo, sin el cambio entregado) y el efectivo contado al cerrar. También recrea los triggers de auditoría de `corte_caja` para que registren esas columnas. Un corte que siga abierto al aplicarla queda con fondo inicial de 0. Haz un respaldo antes.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-015.sql"
Get-Content -Raw ".\database\migrations\015_corte_efectivo.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SHOW COLUMNS FROM corte_caja;"
```

Deben aparecer `fondo_inicial`, `efectivo_esperado` y `efectivo_contado`. Los cortes cerrados antes de la 015 se conservan: aparecen en **Gerente → Cortes** sin conteo de efectivo y con el total que se reportó en su momento. La 015 recrea los triggers de auditoría de corte para incluir las columnas nuevas; si vuelves a aplicar la 013, vuelve a aplicar la 015.

## Migración 016: método de pago digital solicitado

Agrega a `cuenta` el método de pago digital elegido por el mesero y actualiza sus triggers de auditoría. Puede volver a ejecutarse: comprueba la columna y la llave foránea antes de crearlas y reemplaza los triggers.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-016.sql"
Get-Content -Raw ".\database\migrations\016_metodo_pago_solicitado.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SHOW COLUMNS FROM cuenta LIKE 'id_metodo_pago_solicitado'; SHOW CREATE TABLE cuenta;"
```

La columna admite `NULL` para cuentas existentes. La API solo permite solicitar cuentas después de entregar todos sus pedidos activos; un pedido listo en cocina todavía no se puede cobrar.

## Migración 017: categorías de métodos de pago

Crea las categorías iniciales **Físico** y **Digital**, asigna los métodos existentes (Efectivo a Físico; otros métodos a Digital), asegura que los métodos tengan su indicador de activación y agrega la marca que determina qué método suma efectivo al cuadre de caja. La migración puede repetirse si se interrumpe: agrega las columnas faltantes, rellena los métodos sin categoría y verifica la llave foránea antes de crearla.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-017.sql"
Get-Content -Raw ".\database\migrations\017_categorias_metodos_pago.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SELECT cmp.nombre, cmp.tipo, mp.nombre AS metodo, mp.activo, cmp.activo AS categoria_activa, mp.es_efectivo FROM categoria_metodo_pago cmp LEFT JOIN metodo_pago mp USING (id_categoria_metodo_pago) ORDER BY cmp.id_categoria_metodo_pago, mp.id_metodo;"
```

Gerencia puede crear categorías nuevas indicando si son físicas o digitales, agregarles métodos y desactivar cada categoría o método por separado. El personal solo recibe categorías y métodos activos. Los métodos ya solicitados para una cuenta siguen disponibles en Caja aunque luego se desactiven.

## Migración 018: teléfono único y anticipación de reservaciones

Deja el teléfono de los usuarios solo con dígitos (por ejemplo `311 116 5727` pasa a `3111165727`), agrega el índice único `uq_perfil_usuario_telefono` y crea `configuracion_reservacion.anticipacion_minutos` (por defecto 60, rango 0 a 1440) con su `CHECK`. También recrea los triggers de auditoría de `configuracion_reservacion` para que registren la columna nueva. Puede repetirse. Haz un respaldo antes.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-018.sql"
Get-Content -Raw ".\database\migrations\018_telefono_unico_y_anticipacion_reserva.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SELECT * FROM configuracion_reservacion; SHOW INDEX FROM perfil_usuario WHERE Key_name = 'uq_perfil_usuario_telefono';"
```

Si el índice no se puede crear («Duplicate entry»), dos usuarios tienen el mismo teléfono: corrige uno desde **Gerente → Usuarios** (o en SQL) y vuelve a ejecutar el archivo. La API no arranca sin esta migración.

## Migración 019: pedidos para llevar

Crea la sección **«Para llevar»** (`seccion.es_para_llevar = TRUE`) con las mesas virtuales 101 a 110, el catálogo `canal_pedido` (Mostrador, Teléfono, Rappi, Uber Eats, DiDi Food y Mandadito) y las columnas `cuenta.id_canal` y `cuenta.referencia`. También actualiza los triggers de auditoría de `seccion` y `cuenta` y crea los de `canal_pedido`. Puede repetirse. Si ya existe una mesa con alguno de los números 101 a 110, esa no se vuelve a crear.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-019.sql"
Get-Content -Raw ".\database\migrations\019_pedidos_para_llevar.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SELECT nombre, es_para_llevar FROM seccion; SELECT * FROM canal_pedido; SELECT numero, estado FROM mesa WHERE zona = 'Para llevar';"
```

La API no arranca sin esta migración. Para tener más pedidos para llevar a la vez, Gerencia agrega mesas en **Gerente → Mesas** dentro de la sección «Para llevar».

## Migración 020: acceso de clientes con Google

Agrega `cliente_credencial.google_sub` (único) y hace opcional `password_hash`: quien entra con Google no tiene contraseña. No cambia los datos existentes. Puede repetirse. Haz un respaldo antes.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-020.sql"
Get-Content -Raw ".\database\migrations\020_acceso_google_clientes.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SHOW COLUMNS FROM cliente_credencial;"
```

La API no arranca sin esta migración. Configuración del botón de Google: [`google-clientes.md`](google-clientes.md).

## Migración 021: preferencias de mesa en la reservación

Agrega a `reservacion` las columnas `pref_zona` (texto, `NULL` = cualquier sección), `pref_planta_baja`, `pref_carriola` y `pref_sin_escaleras` (`FALSE` por defecto). Las llenan el portal de clientes y la hostess; no cambian los datos existentes. Puede repetirse. Haz un respaldo antes.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-021.sql"
Get-Content -Raw ".\database\migrations\021_preferencias_reservacion.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SHOW COLUMNS FROM reservacion LIKE 'pref%';"
```

La API de reservaciones falla (`Unknown column 'r.pref_zona'`) sin esta migración. Los triggers de auditoría de `reservacion` no registran estas columnas.

## Migración 022: horario de reservaciones

Agrega a `configuracion_reservacion` la primera y la última hora para reservar (13:00 y 21:00), el intervalo de las horas del portal (30 minutos) y los días que se reciben reservaciones (todos). Gerencia los cambia en **Gerente → Reservas**. No cambia los datos existentes. Puede repetirse. Haz un respaldo antes.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-022.sql"
Get-Content -Raw ".\database\migrations\022_horario_reservaciones.sql" | mysql -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SELECT hora_apertura, hora_ultima_reservacion, intervalo_minutos, dias_abiertos FROM configuracion_reservacion;"
```

La API no arranca sin las migraciones 021 y 022 (lo avisa al iniciar).

## Migración 023: características de mesa y duración de la reservación

Crea el catálogo de características que administra Gerencia (Gerente → Mesas → Características), pasa a él lo que tenían las columnas fijas `mesa.planta_baja/espacio_carriola/sin_escaleras` y `reservacion.pref_planta_baja/pref_carriola/pref_sin_escaleras`, **elimina esas columnas** y reemplaza los triggers de auditoría de `mesa`. También agrega `configuracion_reservacion.duracion_reservacion_minutos` (90 por defecto). Puede repetirse. Haz un respaldo antes: quita columnas.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Desktop\SIGR-respaldos" | Out-Null
mysqldump -h localhost -P 3306 -u root -p --databases SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-respaldos\SIGR-antes-023.sql"
Get-Content -Raw ".\database\migrations\023_caracteristicas_mesa_y_duracion.sql" | mysql --default-character-set=utf8mb4 -h localhost -P 3306 -u root -p SIGR
mysql -h localhost -P 3306 -u root -p SIGR -e "SELECT * FROM caracteristica_mesa; SELECT duracion_reservacion_minutos FROM configuracion_reservacion;"
```

La API no arranca sin esta migración (lo avisa al iniciar). Si el backend ya estaba encendido cuando la aplicaste, **reinícialo**.

## Migración 024: recuperar contraseña por correo

Crea `restablecimiento_contrasena`, donde se guardan los enlaces para crear una contraseña nueva («¿Olvidaste tu contraseña?» en el inicio de sesión y Gerente → Usuarios → Restablecer). Solo se guarda la huella SHA-256 del enlace, su caducidad y cuándo se usó. Solo agrega una tabla; puede repetirse.

```powershell
Get-Content -Raw ".\database\migrations\024_restablecer_contrasena.sql" | mysql --default-character-set=utf8mb4 -h localhost -P 3306 -u root -p SIGR
```

Necesita el correo configurado (Resend o SMTP, igual que las reservaciones). El enlace apunta al front desde el que se pidió; si se pide desde otro lado se usa `URL_APP` de `backend/.env` (por omisión `http://localhost:5173`). En producción define `URL_APP` con la dirección pública del front. La API no arranca sin esta migración.

## Migración 025: lada del teléfono

Agrega `lada` (código de país sin «+», por defecto `52`) a `cliente` y `perfil_usuario`, y vuelve a crear sus triggers de auditoría para que la registren. El teléfono se guarda solo con dígitos y cuántos son depende del país (tabla `PAISES_LADA` del código, sin cambios en la base); los registros existentes quedan con `52`, que pide 10 dígitos. Puede repetirse.

```powershell
Get-Content -Raw ".\database\migrations\025_lada_telefono.sql" | mysql --default-character-set=utf8mb4 -h localhost -P 3306 -u root -p SIGR
```

Usa `--default-character-set=utf8mb4`: la restricción CHECK guarda el juego de caracteres de la conexión y, con otro, `verificar_init.mjs` marcaría una diferencia aparente. La API no arranca sin esta migración; si ya estaba encendida, **reinícialo**.

## Migración 026: eliminado lógico de productos y categorías

Agrega `eliminado_en` (cuándo) y `eliminado_por` (quién) a `producto` y `categoria_menu`; vacío significa vigente. «Eliminar» en Gerente → Productos ya no borra: marca el registro, deja de mostrarse y se puede restaurar desde «Eliminados». Los pedidos y ventas anteriores siguen mostrando el producto. Puede repetirse.

```powershell
Get-Content -Raw ".\database\migrations\026_eliminado_logico_productos.sql" | mysql --default-character-set=utf8mb4 -h localhost -P 3306 -u root -p SIGR
```

Diseño y fases siguientes (usuarios, clientes, mesas…): [`eliminado-logico.md`](eliminado-logico.md). La API no arranca sin esta migración; si ya estaba encendida, **reinícialo**.

## Migración 027: eliminado lógico de usuarios

Agrega `eliminado_en` y `eliminado_por` a `usuario`. «Eliminar» en Gerente → Usuarios marca al usuario: ya no puede entrar, se oculta de las listas y se restaura desde «Eliminados» (vuelve **inactivo**). Su historial (pedidos, ventas, cortes) se conserva. El trigger que protege al primer gerente ahora también impide eliminarlo. Puede repetirse.

```powershell
Get-Content -Raw ".\database\migrations\027_eliminado_logico_usuarios.sql" | mysql --default-character-set=utf8mb4 -h localhost -P 3306 -u root -p SIGR
```

**Cambio importante en la API (junto con esta migración):** ahora cada petición de un empleado consulta la base. Si el usuario fue desactivado o eliminado, su sesión se rechaza de inmediato (`401`), y un cambio de rol se aplica al instante; antes la sesión seguía hasta 8 horas. La API no arranca sin esta migración; si ya estaba encendida, **reinícialo**.

## Migración 028: eliminado lógico de clientes

Agrega `eliminado_en` y `eliminado_por` a `cliente`. «Eliminar» en Gerente → Clientes marca al cliente: deja de aparecer en la búsqueda de la hostess, no puede entrar al portal (su sesión se rechaza de inmediato) y se restaura desde «Eliminados». Sus reservaciones y su lugar en el historial se conservan. Puede repetirse.

```powershell
Get-Content -Raw ".\database\migrations\028_eliminado_logico_clientes.sql" | mysql --default-character-set=utf8mb4 -h localhost -P 3306 -u root -p SIGR
```

La API no arranca sin esta migración; si ya estaba encendida, **reinícialo**.

## Migración 029: eliminado lógico de mesas, secciones, características, canales y métodos de pago

Agrega `eliminado_en` y `eliminado_por` a `mesa`, `seccion`, `caracteristica_mesa`, `canal_pedido`, `categoria_metodo_pago` y `metodo_pago`. «Eliminar» en Gerente → Mesas (Secciones y Características), Canales de pedido y Métodos de pago los oculta y los deja también inactivos; se restauran desde «Eliminados» (vuelven inactivos). Las cuentas, reservaciones y pagos anteriores se conservan. Puede repetirse.

```powershell
Get-Content -Raw ".\database\migrations\029_eliminado_logico_catalogos.sql" | mysql --default-character-set=utf8mb4 -h localhost -P 3306 -u root -p SIGR
```

La API no arranca sin esta migración; si ya estaba encendida, **reinícialo**.

## Base nueva o entorno de demostración

- **Base nueva y vacía:** ejecuta `database/init.sql` y el seed de usuarios iniciales. `init.sql` ya es el estado final de las migraciones 001 a 017 (tablas, categorías y métodos de pago, gerente inicial protegido, bitácora y triggers de auditoría), así que **no hay que aplicar ninguna migración**. Para comprobarlo: `node database/verificar_init.mjs` (ver [`CONTEXTO_BASE_DE_DATOS.md`](CONTEXTO_BASE_DE_DATOS.md)).
- **Base de desarrollo en Docker que ya contiene datos:** no uses `docker compose down -v`, ya que elimina el volumen de la base. Con el contenedor activo y el puerto 3306 publicado, los comandos `mysql` anteriores la actualizan igual que una instalación local.
- Guarda el respaldo de forma segura. No lo agregues al repositorio ni lo compartas: contiene los datos de la base.

## Secciones de mesas

En **Gerente → Mesas → Secciones** se pueden crear, renombrar, inhabilitar, habilitar y eliminar secciones (eliminar es lógico: se restaura desde «Eliminadas»). Renombrar actualiza las mesas asociadas. Una sección solo se puede eliminar cuando no tiene mesas vigentes asignadas. Al inhabilitarla, sus mesas se conservan pero dejan de aparecer para meseros y hostess; para evitar ocultar trabajo activo, primero hay que liberar las mesas y resolver sus cuentas y reservaciones vigentes. No se permite asignar mesas a secciones inhabilitadas.
