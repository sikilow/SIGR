# Contexto de la base de datos para una IA (init.sql, migraciones y verificación)

> Léelo completo **antes** de tocar cualquier archivo de `database/`, cualquier consulta SQL del backend o cualquier columna.
> Última verificación: 15 de noviembre de 2026 (`node database/verificar_init.mjs` sin diferencias contra la base de desarrollo `SIGR`).
> Si algo de aquí contradice al código o a la base, gana la base que ya funciona; avísalo y corrige este documento.

## 1. La regla de oro

**Hay dos caminos para llegar al mismo esquema y siempre deben dar el mismo resultado:**

| Camino | Para quién | Cómo |
| --- | --- | --- |
| `database/init.sql` | Una base **nueva y vacía** (Docker, un compañero, el servidor nuevo) | Se ejecuta una sola vez. Ya es el **estado final de las migraciones 001 a 017**: no se aplica ninguna migración encima. |
| `database/migrations/00N_*.sql` | Una base **que ya existe y tiene datos** | Se aplican, en orden y una sola vez, solo las que le falten. |

Por eso, **todo cambio de esquema o de catálogo base se escribe en los dos sitios, en el mismo cambio (mismo commit/PR)**:

1. Una migración nueva `database/migrations/0NN_<nombre>.sql` (para las bases existentes).
2. El mismo cambio, ya en su forma final, dentro de `database/init.sql` (para las bases nuevas).
3. Se corre `node database/verificar_init.mjs` y debe terminar con `exit 0`.

Si falta cualquiera de los tres pasos, una base nueva queda distinta de la que usa el equipo y el sistema falla en otra computadora o en el servidor.

## 2. Qué NO hacer (protege la base que ya funciona)

- **Nunca** ejecutes `init.sql` sobre una base con datos (`CREATE TABLE` fallaría o, peor, mezclaría datos). Es solo para bases vacías.
- **Nunca** hagas `DROP DATABASE SIGR`, `docker compose down -v` ni `TRUNCATE` sobre la base de desarrollo del equipo sin respaldo y sin que el usuario lo pida.
- **Nunca** edites una migración que ya se aplicó en alguna base: crea una nueva. (Excepción: corregir un error evidente que impide aplicarla, avisando.)
- **Nunca** copies tablas o columnas a `init.sql` de memoria. Se toman de la migración o de la base que ya funciona y se **verifica** (sección 5).
- **Nunca** imprimas ni subas `backend/.env` ni contraseñas. El script de verificación las lee de ahí pero no las muestra.
- Las pruebas con bases temporales usan nombres como `SIGR_verif_init`. No toques `SIGR`.

## 3. Cómo está organizado `database/init.sql`

Orden fijo (no lo cambies sin motivo):

1. `CREATE DATABASE` y `USE SIGR`.
2. Tablas de negocio (`CREATE TABLE`), en orden de dependencia: usuarios y clientes, mesas, catálogo, reservaciones, cuentas y pedidos, caja y pagos, facturación, `idempotencia`.
3. Índices, la vista `vista_ventas_detalle` y los catálogos base (roles, estados de pedido, categorías y métodos de pago).
4. Datos base: mesas 1 a 6, categorías y productos de ejemplo, motivos de cancelación, cliente de prueba.
5. **Al final**, la sección «SEGURIDAD Y AUDITORIA»: `configuracion_seguridad`, `sigr_auditoria`, los triggers del gerente inicial y **todos los triggers `trg_aud_*`**, y `sp_consultar_auditoria`.

Por qué la auditoría va al final: así la bitácora no registra el relleno inicial como si fueran cambios de un usuario.

Los usuarios con contraseña **no** se crean aquí. Se crean con `npx tsx src/utils/seed.ts` (en `backend/`), y el primer usuario con rol Gerente queda protegido por un trigger.

## 4. Flujo para cada cambio de base de datos

Ejemplo: agregar la columna `pedido.para_llevar` o una tabla nueva.

1. **Pregunta o confirma el requisito** y su código `RF-…` (ver `CONTEXTO_IA.md`).
2. **Respalda** la base de desarrollo antes de aplicar nada (PowerShell):

   ```powershell
   mysqldump -h localhost -P 3306 -u root -p SIGR --result-file="$env:USERPROFILE\Desktop\SIGR-antes-migracion.sql"
   ```
3. **Escribe la migración** `database/migrations/0NN_<nombre>.sql` con el siguiente número libre.
   - Que sea **repetible** cuando se pueda (`CREATE TABLE IF NOT EXISTS`, o comprobar en `information_schema` antes de `ALTER`, como hacen la 016 y la 017).
   - Empieza con `USE SIGR;` y comenta qué hace, a quién aplica y en qué orden.
4. **Aplícala a la base de desarrollo** (la que ya funciona) y prueba la API contra ella.
5. **Actualiza `init.sql`** con el resultado final:
   - Columna o tabla nueva: en el `CREATE TABLE` correspondiente, con el mismo tipo, `NULL`, valor por defecto y restricciones que la migración (los `CHECK` con nombre explícito si la migración los nombra).
   - Datos base nuevos (catálogos): en la sección de datos.
   - **Triggers de auditoría:** si la tabla es nueva, o si agregas/quitas columnas de una tabla auditada, los triggers `trg_aud_<tabla>_ai/_au/_ad` deben listar las columnas nuevas. Copia el patrón de `013_auditoria_seguridad.sql` y deja la versión final en la sección «SEGURIDAD Y AUDITORIA» de `init.sql`. Si la migración recrea triggers (como la 015, 016 y 017), esa versión es la que va en `init.sql`.
6. **Verifica** (sección 5). Debe decir que el esquema es idéntico.
7. **Actualiza el código de arranque** si procede: `backend/src/index.ts` comprueba al iniciar que existan las migraciones recientes (`SELECT … LIMIT 0` y conteo de triggers). Agrega ahí la nueva comprobación para que una base desactualizada falle con un mensaje claro.
8. **Documenta**: `docs/actualizar-base-datos.md` (tabla del historial y el paso de la migración), `docs/equivalencias-bd.md` (columna ↔ JSON ↔ TypeScript), el contrato de API afectado y la sección 16 de `CONTEXTO_IA.md`.
9. Corre `npm run build` y `npm test` en `backend/`, y `npm run check` en `frontend/`.

## 5. Cómo verificar (obligatorio antes de dar por terminado un cambio de BD)

```powershell
node database/verificar_init.mjs            # compara init.sql contra la base de backend/.env (DB_NAME, por defecto SIGR)
node database/verificar_init.mjs --solo-init # solo comprueba que init.sql corre sin errores en una base nueva
```

Desde `backend/` también: `npm run bd:verificar`.

Qué hace el script:

1. Crea una base **temporal** `SIGR_verif_init` ejecutando `init.sql` en ella.
2. Compara tablas, columnas, índices, llaves foráneas, `CHECK`, triggers (por hash de su cuerpo), rutinas y vistas contra la base real. **La base real solo se lee.**
3. Borra la base temporal siempre, incluso si hubo error.

Resultado: `exit 0` = idéntico; `exit 1` = hay diferencias y las lista («solo en SIGR» = falta en `init.sql`; «solo en init.sql» = sobra o la base real no lo tiene todavía). No se comparan los nombres autogenerados de `CHECK` (`tabla_chk_N`), que dependen del orden de creación.

Requisitos: cliente `mysql` en el PATH y credenciales en `backend/.env`. En esta máquina la base real es la local `SIGR`.

**Si compares contra una base que todavía no tiene tu migración**, el script marcará diferencias: aplica primero la migración a esa base (paso 4 del flujo).

### Prueba extra recomendada: arrancar el backend sobre una base creada solo con `init.sql`

```powershell
# Con DB_NAME apuntando a una base TEMPORAL (nunca SIGR) y otro puerto
$env:DB_NAME="SIGR_verif_e2e"; $env:PORT="3999"
# crear la base temporal (init.sql con el nombre cambiado), sembrar y arrancar
cd backend; npx tsx src/utils/seed.ts; npx tsx src/index.ts   # debe imprimir «API en http://localhost:3999»
```

Si el backend arranca, pasaron todas sus comprobaciones de migraciones, que es la mejor señal de que `init.sql` está completo. Borra la base temporal al terminar.

## 6. Estado actual (para no repetir trabajo)

Migraciones y dónde viven sus efectos en `init.sql`:

| Migración | Efecto | En `init.sql` |
| --- | --- | --- |
| 001–006 | Ajustes de estados, idempotencia, existencia, mesas 13–18, zona/activa de mesa, caja (`monto_recibido`, `cambio`) | En los `CREATE TABLE` |
| 007–009 | Descripción obligatoria, `presentacion`, catálogo `seccion` | En los `CREATE TABLE` |
| 010–012 | Características de mesa, `configuracion_reservacion`, cola `notificacion_reservacion` (evento, cancelación) | En los `CREATE TABLE` |
| 013 | `configuracion_seguridad`, `sigr_auditoria`, triggers y `sp_consultar_auditoria` | Sección final «SEGURIDAD Y AUDITORIA» |
| 014 (portal de clientes) | `cliente_credencial`, correo único por cliente | En los `CREATE TABLE` |
| 014 (`caja_inicio_y_cortes_parciales`) | **Obsoleta**: diseño anterior de caja (`efectivo_inicial`, `tipo_cierre`) que la 015 reemplazó | **No** se incorpora: el código usa la 015 |
| 015 | `corte_caja.fondo_inicial/efectivo_esperado/efectivo_contado` y sus triggers | `CREATE TABLE corte_caja` + triggers al final |
| 016 | `cuenta.id_metodo_pago_solicitado` y sus triggers | `CREATE TABLE cuenta` + triggers al final |
| 017 | `categoria_metodo_pago`, `metodo_pago.activo/es_efectivo` y sus triggers | `CREATE TABLE` + datos base + triggers al final |
| 018 | `perfil_usuario.telefono` único (`uq_perfil_usuario_telefono`) y `configuracion_reservacion.anticipacion_minutos` (+ triggers de auditoría de esa tabla) | `CREATE TABLE perfil_usuario` / `configuracion_reservacion` + triggers al final |
| 019 | `seccion.es_para_llevar`, tabla `canal_pedido`, `cuenta.id_canal/referencia`, sección «Para llevar» con las mesas 101–110 y triggers de auditoría de `seccion`, `cuenta` y `canal_pedido` | `CREATE TABLE` + datos base + triggers al final |
| 020 | `cliente_credencial.google_sub` (único) y `password_hash` opcional | En el `CREATE TABLE cliente_credencial` (sin triggers nuevos: esa tabla no se audita) |
| 021 | `reservacion.pref_zona/pref_planta_baja/pref_carriola/pref_sin_escaleras` (preferencias de mesa del cliente) | En el `CREATE TABLE reservacion` (los triggers de auditoría no cambian) |
| 022 | `configuracion_reservacion.hora_apertura/hora_ultima_reservacion/intervalo_minutos/dias_abiertos` (horario de reservaciones; la 030 pasó el horario a una tabla por día y quitó estas tres columnas, queda `intervalo_minutos`) | En el `CREATE TABLE configuracion_reservacion` (los triggers de auditoría no cambian) |
| 023 | Tablas `caracteristica_mesa`, `mesa_caracteristica` y `reservacion_caracteristica`; quita `mesa.planta_baja/espacio_carriola/sin_escaleras` y `reservacion.pref_planta_baja/pref_carriola/pref_sin_escaleras`; agrega `configuracion_reservacion.duracion_reservacion_minutos` | `CREATE TABLE` nuevos, datos base y triggers de `mesa` sin las columnas quitadas |

Notas importantes:

- **Hay dos archivos con número 014.** `014_clientes_web.sql` es la vigente. La `014_caja_inicio_y_cortes_parciales.sql` quedó de una rama anterior; no la apliques en bases nuevas. No renombres archivos de migración sin avisar: la documentación y las bases de otros equipos los citan por nombre. Para el próximo cambio usa el número **021**.
- El `init.sql` anterior estaba mezclado de dos ramas: tenía `efectivo_inicial`, `tipo_cierre` y la columna `efectivo_contado` duplicada, por lo que **fallaba en una base nueva**. Ya está corregido y verificado. Si vuelves a ver un error `Duplicate column name` al ejecutar `init.sql`, hubo otro mal merge: compara con la base real.
- Los nombres de `CHECK` con significado (`chk_mesa_estado`, `chk_cuenta_estado`, `chk_cuenta_tipo_pago`, `chk_pago_cambio`, `chk_corte_fondo_inicial`, `chk_corte_efectivo_contado`) están nombrados en `init.sql` igual que en la base real. Las migraciones 011 y 012 buscan `chk_notificacion_tipo`/`chk_notificacion_evento` por nombre.
- En Docker, `init.sql` solo corre la primera vez, cuando el volumen está vacío (`database/docker-compose.yml`). Para volver a correrlo hay que borrar el volumen: eso **destruye los datos**, hazlo solo con permiso.
- El archivo usa `DELIMITER $$` para los triggers: hay que ejecutarlo con el cliente `mysql` (o el entrypoint de Docker), no con un driver que ejecute sentencias sueltas.
- `USE SIGR` y `CREATE DATABASE SIGR` están escritos a mano. El script de verificación los reemplaza por la base temporal; no cambies el nombre de la base en el archivo.
- Las fechas son `DATETIME` en hora local; el contenedor usa `--default-time-zone=-06:00`.

## 7. Lista de comprobación rápida

- [ ] Hice respaldo antes de aplicar la migración.
- [ ] Migración nueva con el siguiente número (032 o más) y repetible si fue posible.
- [ ] La apliqué a la base de desarrollo y la API sigue funcionando.
- [ ] `init.sql` tiene el mismo cambio en su forma final (tablas, datos base y triggers de auditoría).
- [ ] `node database/verificar_init.mjs` termina con `exit 0`.
- [ ] Actualicé `backend/src/index.ts` (comprobación de arranque), `docs/actualizar-base-datos.md`, `docs/equivalencias-bd.md`, el contrato de API y `CONTEXTO_IA.md` (sección 16).
- [ ] `npm run build` y `npm test` en `backend/`; `npm run check` en `frontend/`.
- [ ] No subí `.env`, contraseñas ni respaldos al repositorio.
