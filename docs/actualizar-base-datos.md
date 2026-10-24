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
4. Abre PowerShell en la raíz del repositorio. El cliente `mysql` debe estar instalado y ser accesible desde la terminal. Si usas otros valores de conexión, reemplaza `root` y `localhost:3306` por `DB_USER` y `DB_HOST`/puerto; estos scripts usan explícitamente la base `SIGR`, así que ese es el valor esperado de `DB_NAME`. `DB_PASSWORD` se solicita de forma interactiva con `-p`.

## 2. Aplicar solo las migraciones pendientes

Si ya aplicaste 007–009, ejecuta únicamente **010**:

```powershell
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/010_reservaciones_y_caracteristicas.sql"
```

Si ya aplicaste 007–008, pero aún no 009, ejecuta 009 y después 010. Para cualquier otro avance parcial, aplica solo las migraciones pendientes y respeta el orden numérico.

Si las migraciones 007–010 siguen pendientes, aplícalas en orden (una sola vez cada una):

```powershell
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/007_catalogo_descripciones_obligatorias.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/008_presentacion_producto.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/009_secciones_mesas.sql"
mysql -h localhost -P 3306 -u root -p -e "source database/migrations/010_reservaciones_y_caracteristicas.sql"
```

Escribe la contraseña de MySQL cuando la solicite. Asegúrate de conectarte al mismo servidor y usuario configurados en `backend/.env`.

La migración **007** convierte las descripciones vacías o `NULL` a «Detalle pendiente de completar» y luego las vuelve obligatorias. La migración **008** agrega la columna `presentacion` y un índice para buscar productos por categoría, nombre y presentación. La migración **009** crea el catálogo de secciones, registra las secciones ya usadas, asigna «General» a mesas sin sección y hace obligatoria `mesa.zona`. La migración **010** agrega características de acceso de mesas, configuración de tolerancia y recordatorio, y la cola de notificaciones por correo. Las descripciones de relleno deben sustituirse después desde **Gerente → Productos** por información real.

No ejecutes de nuevo 007–010 si ya se aplicaron: son cambios de esquema que no están diseñados para repetirse. Si no sabes si se ejecutaron, revisa primero el esquema:

```powershell
mysql -h localhost -P 3306 -u root -p -e "USE SIGR; SHOW COLUMNS FROM producto LIKE 'descripcion'; SHOW COLUMNS FROM producto LIKE 'presentacion'; SHOW INDEX FROM producto WHERE Key_name = 'idx_producto_variante'; SHOW TABLES LIKE 'seccion'; SHOW COLUMNS FROM mesa LIKE 'zona';"
```

Si la columna `presentacion` y el índice ya existen, 008 ya fue aplicada. Si la descripción ya figura como `NOT NULL`, 007 probablemente ya fue aplicada. Si existe la tabla `seccion` y `mesa.zona` es `NOT NULL`, 009 ya fue aplicada. Para 010 confirma que existen `mesa.planta_baja`, `mesa.espacio_carriola`, `mesa.sin_escaleras`, `configuracion_reservacion` y `notificacion_reservacion`; confirma también con quien administra la base antes de repetir una migración.

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

La tabla es una referencia, no indica qué scripts están instalados en una base particular. Para una base antigua, revisa el esquema y el historial del equipo y ejecuta únicamente los pendientes en orden; no asumas que todos están pendientes.

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

Confirma que `producto.presentacion` exista como `VARCHAR(100)`, que `descripcion` sea `NOT NULL`, que aparezca el índice `idx_producto_variante`, que `seccion` contenga las secciones del restaurante, que `mesa.zona` sea obligatoria y que existan las columnas/tablas de 010. Las mesas que antes estaban sin sección quedan en «General» y pueden reasignarse desde **Gerente → Mesas**. Completa las descripciones de productos con texto pendiente con su información real.

Después de verificar, inicia el backend con las variables de conexión apuntando a esa misma base. Desde la raíz:

```powershell
Push-Location backend
npm run dev
Pop-Location
```

En el formulario **Gerente → Productos**, una variante nueva se identifica por categoría, nombre y presentación. Si ya existe, el sistema rechaza el alta y pide editar el producto existente para cambiar su inventario. Ejemplo: Coca-Cola «lata de 355 ml» y «botella de 1 litro» son variantes diferentes; repetir la misma presentación no crea otra fila.

## Correo de reservaciones con Resend

Las reservaciones nuevas requieren un correo del cliente. Desde **Gerente → Reservas** se pueden cambiar la tolerancia (15 minutos por defecto; de 5 a 180) y la anticipación del recordatorio (5 minutos por defecto; de 1 a 30). La tolerancia se cuenta desde la hora reservada. Si no se registra la llegada antes de vencer, la reservación cambia a `vencida`, se libera su mesa y se pone en cola un correo explicativo. La API procesa recordatorios y reintenta las notificaciones fallidas.

Para habilitar los correos, configura `RESEND_API_KEY` y `RESEND_FROM` en `backend/.env`, luego reinicia el backend. Resend requiere un dominio emisor verificado. No compartas ni guardes la API key en Git. Los mensajes que fallen quedan en la cola con su error y se reintentan. Revisa la guía completa de instalación, operación y diagnóstico en [`resend-reservaciones.md`](resend-reservaciones.md).

## Base nueva o entorno de demostración

- **Base nueva y vacía:** ejecuta `database/init.sql`; este esquema ya incluye los cambios de las migraciones. No apliques después 001–010 sobre esa misma base.
- **Base de desarrollo en Docker que ya contiene datos:** no uses `docker compose down -v`, ya que elimina el volumen de la base. Con el contenedor activo y el puerto 3306 publicado, los comandos `mysql` anteriores la actualizan igual que una instalación local.
- Guarda el respaldo de forma segura. No lo agregues al repositorio ni lo compartas: contiene los datos de la base.

## Secciones de mesas

En **Gerente → Mesas → Secciones** se pueden crear, renombrar, inhabilitar, habilitar y borrar secciones. Renombrar actualiza las mesas asociadas. Una sección solo se puede borrar cuando no tiene mesas asignadas. Al inhabilitarla, sus mesas se conservan pero dejan de aparecer para meseros y hostess; para evitar ocultar trabajo activo, primero hay que liberar las mesas y resolver sus cuentas y reservaciones vigentes. No se permite asignar mesas a secciones inhabilitadas.
