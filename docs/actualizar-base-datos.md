# Base de datos de SIGR en Supabase

Desde noviembre de 2026 SIGR usa **PostgreSQL en Supabase** (proyecto `zsyjplhuynvmqxoxgjtw`) en lugar de MySQL local. Todos los dispositivos y todo el equipo trabajan sobre la misma base en la nube; el backend de Express sigue siendo el único que habla con ella.

- Esquema: [`database/supabase/001_esquema.sql`](../database/supabase/001_esquema.sql). Equivale a `init.sql` más las migraciones MySQL 001 a 017.
- Datos de demostración: [`database/supabase/datos_demo.sql`](../database/supabase/datos_demo.sql). Equivale a `seed_demo.sql`.
- Los archivos MySQL (`database/init.sql`, `database/migrations/`, `database/seed_demo.sql`, `database/docker-compose.yml`) quedan solo como referencia histórica; el backend ya no los usa.

## 1. Conectar el backend

1. En el panel de Supabase abre el proyecto y pulsa **Connect**. Copia la URI del **Session pooler** (puerto `5432`, usuario `postgres.zsyjplhuynvmqxoxgjtw`).
   - No uses la conexión directa (`db.zsyjplhuynvmqxoxgjtw.supabase.co`): en el plan gratuito solo funciona por IPv6 y muchas redes no lo tienen.
   - No uses el *Transaction pooler* (puerto `6543`): el backend necesita transacciones con bloqueos y candados de sesión.
2. En `backend/.env` pon la URI con la contraseña de la base (la que se eligió al crear el proyecto; se puede restablecer en *Project Settings → Database*):

   ```
   DATABASE_URL=postgresql://postgres.zsyjplhuynvmqxoxgjtw:TU_CONTRASEÑA@aws-0-us-west-2.pooler.supabase.com:5432/postgres
   ```

   Si la contraseña tiene caracteres como `@`, `#` o `/`, escríbelos codificados (`%40`, `%23`, `%2F`).
3. Opcional: `DB_ZONA_HORARIA` (por defecto `America/Mazatlan`, la hora de Tepic) y `DB_SSL_CA` (ruta al certificado que Supabase ofrece en *Database → SSL Configuration*; sin él la conexión va cifrada pero sin verificar el servidor).

`backend/.env` nunca se sube a Git. Cada integrante pone ahí la misma `DATABASE_URL`.

## 2. Crear el esquema (una sola vez por proyecto de Supabase)

Desde `backend/`:

```powershell
npm run db:migrar   # crea el esquema sigr, catálogos y menú inicial; fija la zona horaria de la base
npm run seed        # usuarios de prueba: gerente, mesero, cocinero, cajero, hostess (contraseña 1234)
npm run db:demo     # opcional: mesas 7-18, pedidos, clientes, reservaciones y a mesero2
```

`db:migrar` anota cada archivo aplicado en la tabla `sigr.migracion`, así que se puede volver a ejecutar sin riesgo: solo aplica lo que falte. Cada archivo corre en una transacción; si falla, no queda nada a medias. `db:demo` solo se carga una vez.

Después, `npm run dev` levanta la API. Si al arrancar dice que falta una migración, ejecuta `npm run db:migrar`.

## 3. Cambios futuros al esquema

1. Crea un archivo nuevo en `database/supabase/` con el siguiente número: `002_lo_que_cambia.sql`. No edites `001_esquema.sql` una vez aplicado en Supabase.
2. Escribe SQL de PostgreSQL. Las tablas viven en el esquema `sigr`; empieza el archivo con `SET search_path TO sigr, public;`.
3. Si la API depende del cambio, actualiza `MIGRACION_REQUERIDA` en `backend/src/index.ts` para que avise cuando falte aplicarlo.
4. Si agregas una tabla, actívale RLS y la auditoría como las demás (ver el final de `001_esquema.sql`).
5. Ejecuta `npm run db:migrar`.

## 4. Qué cambió respecto a MySQL

| Tema | MySQL | Supabase / PostgreSQL |
| --- | --- | --- |
| Dónde están las tablas | Base `SIGR` | Esquema `sigr` de la base `postgres` |
| Acceso | Usuario root local | Solo el backend; RLS activado y sin acceso para las claves públicas `anon`/`authenticated` |
| Texto | `utf8mb4_unicode_ci` | Collation `sigr.es_ci`: tampoco distingue mayúsculas ni acentos (`cajero` = `Cajero`, `Salon` = `Salón`) |
| Booleanos | `TINYINT(1)` | `BOOLEAN`; la API los sigue devolviendo como `1`/`0` |
| Fechas | `DATETIME` en hora del servidor | `TIMESTAMP(0)` en la hora de `DB_ZONA_HORARIA`; la API devuelve el mismo texto `AAAA-MM-DD HH:MM:SS` |
| Auditoría | 3 triggers por tabla y `CALL sp_consultar_auditoria(...)` | Una función genérica `sigr.fn_auditar` y `SELECT * FROM sigr.consultar_auditoria(NULL, NULL, NULL, NULL, 100)` |
| Candado de idempotencia | `GET_LOCK` | `pg_advisory_lock` |
| Migraciones | Scripts manuales con `mysql` | `npm run db:migrar`, con registro en `sigr.migracion` |

Para el código del backend, la capa `backend/src/services/db.ts` conserva la misma forma de trabajo: parámetros con `?`, `filas`, `ejecutar` y `transaccion`. Al escribir SQL nuevo:

- Para obtener el id de un `INSERT`, agrega `RETURNING id_...`; `ejecutar(...).insertId` toma la primera columna devuelta.
- Usa `ON CONFLICT (...) DO UPDATE/NOTHING` en vez de `ON DUPLICATE KEY`, `LOCALTIMESTAMP(0)` para guardar la hora actual, `CURRENT_DATE` en vez de `CURDATE()` e `INTERVAL '30 minutes'` o `make_interval(mins => ...)` en vez de `INTERVAL 30 MINUTE`.
- Las columnas booleanas se comparan como booleanos (`WHERE activo`, no `activo = 1`).
- Para buscar texto dentro de otro sin mayúsculas ni acentos usa `contiene(columna, ?)`: `LIKE` y `strpos` no funcionan con la collation `sigr.es_ci`.
- Un `FOR UPDATE` con `LEFT JOIN` debe indicar la tabla: `FOR UPDATE OF m`.
- Un valor repetido en una llave única se detecta con `esDuplicado(error)` y la restricción con `restriccionDe(error)`.

## 5. Precauciones

- **El proyecto gratuito se pausa** tras unos 7 días sin actividad. Antes de una revisión o presentación entra al panel de Supabase y confirma que esté activo; si está pausado, reactívalo y espera a que termine de arrancar.
- **Respaldo:** en el plan gratuito Supabase no garantiza copias que puedas restaurar tú. Para guardar una copia: `pg_dump "TU_DATABASE_URL" --schema=sigr --file=sigr-respaldo.sql` (requiere las herramientas cliente de PostgreSQL).
- **Latencia:** cada consulta viaja a la nube. Si una pantalla se siente lenta, revisa que la región del proyecto sea la más cercana (se elige al crearlo).
- La contraseña de la base da acceso completo: no la pegues en el frontend, en variables `VITE_*` ni en el chat del equipo; compártela por un canal privado.
