# 02 · Backend: el núcleo (explicado línea por línea)

> **Nota sobre la reorganización:** este documento se escribió **antes** de reorganizar el proyecto a la estructura acordada. Los nombres de funciones, bloques y explicaciones siguen siendo válidos, pero los **números de línea y las rutas de archivo** son los de la versión anterior. El mapa «antes → ahora» está en `00_INDICE_Y_RECURSOS.md`.

Carpeta: `backend/`. Aquí está lo que **todas las rutas usan**: configuración, conexión a MySQL, manejo de errores, autenticación, idempotencia y el arranque del servidor. Léelo antes de `03_backend_rutas.md`.

Cómo leer esta guía: cada bloque dice las **líneas** del archivo, **qué hace** y **por qué está así**. Las palabras técnicas nuevas se explican la primera vez que aparecen.

---

## `package.json`

| Líneas | Qué hace |
| --- | --- |
| 2–5 | Nombre y versión del paquete. `main` apunta a `index.js`, pero no se usa: el proyecto arranca con los scripts. |
| 7 | `dev`: `tsx watch src/index.ts`. **tsx** ejecuta TypeScript directo, sin compilar, y `watch` reinicia el servidor cada vez que guardas un archivo. Es el que usas todos los días: `npm run dev`. |
| 8 | `build`: `tsc` compila TypeScript a JavaScript y lo deja en `dist/` (según `tsconfig.json`). |
| 9 | `start`: `node dist/index.js` corre lo ya compilado. Es lo que se usaría en producción. |
| 14 | `"type": "commonjs"`: el proyecto usa el sistema de módulos clásico de Node (`require`). Por eso en `tsconfig.json` hay una línea que desactiva `verbatimModuleSyntax` (ver abajo). |
| 16–22 | **dependencies** (se necesitan al correr): `bcryptjs` (hash de contraseñas), `cors` (permitir al frontend llamar a la API), `dotenv` (leer `.env`), `express` (servidor web, v5), `jsonwebtoken` (tokens JWT), `mysql2` (conexión a MySQL) y `zod` (validar datos). |
| 24–32 | **devDependencies** (solo para desarrollar): los `@types/...` son archivos de tipos para que TypeScript entienda librerías escritas en JavaScript; `tsx` y `typescript` son las herramientas. |

---

## `tsconfig.json` (cómo se comporta TypeScript)

| Líneas | Qué hace |
| --- | --- |
| 5–6 | `rootDir: ./src` (el código fuente está ahí) y `outDir: ./dist` (aquí deja lo compilado). |
| 10–11 | `module: nodenext` y `target: esnext`: usa las reglas de módulos modernas de Node y genera JavaScript con las funciones más nuevas del lenguaje. |
| 12 | `types: ["node"]`: incluye los tipos de Node (`process`, `Buffer`, etc.). |
| 19–21 | `sourceMap`, `declaration`, `declarationMap`: generan archivos extra para depurar (mapas) y para describir los tipos (`.d.ts`). |
| 24 | `noUncheckedIndexedAccess`: al leer `lista[0]` TypeScript te obliga a considerar que puede ser `undefined`. **Por eso verás `rol[0]?.id_rol` y `if (!fila)` en todo el backend.** |
| 25 | `exactOptionalPropertyTypes`: una propiedad opcional (`campo?: string`) no acepta `undefined` explícito. Evita errores sutiles. |
| 36 | `strict: true`: activa todas las comprobaciones estrictas. |
| 37 | `jsx: react-jsx`: viene de la plantilla de `tsc --init`; este backend no usa JSX. |
| 38–39 | El comentario lo explica: el paquete es CommonJS y con `verbatimModuleSyntax: true` el comando `npm run build` no compila. |
| 40–43 | `isolatedModules` (cada archivo se puede compilar solo), `noUncheckedSideEffectImports` (un `import "dotenv/config"` debe existir de verdad), `moduleDetection: force` (todo archivo es un módulo) y `skipLibCheck` (no revisa los tipos de librerías externas, para compilar más rápido). |
| 45 | `include: ["src"]`: solo compila lo que está en `src/`. |

---

## `src/config.ts` (variables de entorno)

```ts
import "dotenv/config";
export const JWT_SECRET = process.env.JWT_SECRET ?? "";
```

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 1 | `import "dotenv/config"` lee el archivo `backend/.env` y mete sus valores en `process.env`. | Así las claves y contraseñas no van escritas en el código. |
| 3 | Lee `JWT_SECRET`; si no existe, queda como texto vacío (`?? ""`). | El operador `??` usa lo de la derecha solo si lo de la izquierda es `undefined` o `null`. |
| 4–6 | Si `JWT_SECRET` está vacío, lanza un error y el servidor **no arranca**. | Es mejor fallar al inicio que firmar tokens con una clave vacía, que sería un agujero de seguridad. |
| 8 | `PUERTO`: lee `PORT` y lo convierte a número; si no existe, usa 3000. | `process.env` siempre trae texto, por eso `Number(...)`. |
| 15–18 | Toma `CORS_ORIGIN` (URLs separadas por coma), las parte con `split(",")`, les quita espacios con `trim()` y descarta las vacías con `filter(Boolean)`. | Permite configurar varios orígenes en producción. |
| 20–21 | Si definiste `CORS_ORIGIN`, usa esa lista; si no, usa una **expresión regular** que acepta `http://localhost:PUERTO` o `http://127.0.0.1:PUERTO` con cualquier puerto. | En desarrollo Vite salta al puerto 5174, 5175… si el 5173 está ocupado; así nunca te bloquea. |

**Concepto: CORS.** El navegador, por seguridad, no deja que una página de un origen (`localhost:5173`, el frontend) lea respuestas de otro (`localhost:3000`, la API) a menos que la API lo autorice con cabeceras CORS. El paquete `cors` pone esas cabeceras.

---

## `src/db.ts` (conexión a MySQL)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 1 | Carga `.env` otra vez. | Es inofensivo y hace que `db.ts` funcione solo, también cuando lo usa `seed.ts`. |
| 2–3 | Importa `mysql2/promise` (la versión con `async/await`) y los **tipos** de `mysql2`. | `import type` solo sirve para TypeScript y desaparece al compilar. |
| 5–17 | `mysql.createPool({...})` crea un **pool**: un grupo de hasta 10 conexiones abiertas que se reutilizan. | Abrir una conexión por petición sería lento. `connectionLimit: 10` es el máximo y `waitForConnections: true` hace esperar a la petición si las 10 están ocupadas. |
| 6–9 | `host`, `user`, `password` y `database` salen del `.env`, con valores por defecto (`localhost`, `root`, vacío, `SIGR`). | Funciona en una instalación local típica sin configurar nada. |
| 12–13 | `decimalNumbers: true`. | Sin esto mysql2 devuelve los `DECIMAL` (precios y totales) como texto `"95.00"` y el frontend mostraría `NaN` al sumar. |
| 14–16 | `dateStrings: true`. | Los `DATETIME` llegan como texto `"2026-10-15 16:34:00"`, sin zona horaria. Con objetos `Date` las horas se corrían por la zona horaria del servidor. |
| 20 | `type Ejecutor = Pool \| PoolConnection`. | Una función puede recibir el pool completo o una conexión específica que está dentro de una transacción. |
| 23–30 | `filas(ex, sql, params)`: ejecuta un `SELECT` y devuelve la lista de filas. | `[rows]` toma solo el primer elemento del resultado, porque mysql2 devuelve `[filas, campos]`. Los `?` del SQL se rellenan con `params` de forma segura. |
| 33–36 | `ejecutar(...)`: para `INSERT`, `UPDATE` y `DELETE`; devuelve `insertId` (el id nuevo) y `affectedRows` (filas afectadas). | |
| 39–52 | `transaccion(fn)`: toma una conexión, empieza una transacción (`beginTransaction`), corre `fn`, y si todo sale bien hace `commit`; si algo lanza error hace `rollback` y vuelve a lanzar el error; al final siempre `release()` devuelve la conexión al pool. | Una **transacción** agrupa varios cambios para que se guarden **todos o ninguno**. Ejemplo: enviar un pedido y descontar existencia. |

**Concepto: inyección SQL.** Nunca se arma el SQL pegando texto del usuario (`"... WHERE x = " + valor`). Se escribe `?` y se pasa el valor en `params`; mysql2 lo escapa. Todo el proyecto sigue esta regla.

---

## `src/errores.ts` (errores uniformes)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 7–16 | `CodigoError`: lista cerrada de códigos de error (`no_autenticado`, `sin_permiso`, `producto_agotado`…). | El frontend (`services/errores.ts`) usa los mismos nombres para decidir qué mensaje mostrar. |
| 18–29 | `class ErrorApi extends Error`: un error con `estado` (HTTP), `codigo`, `mensaje` y datos `extra`. | Las rutas hacen `throw new ErrorApi(404, "no_encontrado", "...")` y listo. |
| 32 | `manejarErrores(err, _req, res, _next)`: el **manejador global**. | Express reconoce un manejador de errores porque tiene **4 parámetros**; por eso `_next` está aunque no se use. |
| 33–36 | Si el error es un `ErrorApi`, responde con su estado HTTP y `{ codigo, mensaje, ...extra }`. | Formato único de error para toda la API. |
| 38–41 | Si el error trae `status: 400`, es un JSON mal formado en el cuerpo de la petición (lo lanza `express.json()`); responde 400. | |
| 42–43 | Cualquier otro error: lo imprime en consola y responde 500 con un mensaje genérico. | No se muestran detalles internos al usuario por seguridad. |

**Concepto: Express 5 y `async`.** En Express 5, si una ruta `async` lanza un error (o su promesa falla) Express lo manda solo al manejador de errores. En Express 4 había que escribir `try/catch` y `next(err)` en cada ruta.

---

## `src/middlewares/auth.ts` (quién eres y qué puedes hacer)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 6 | `type Rol`: los cinco roles posibles. | Si escribes un rol mal, TypeScript te avisa. |
| 8–11 | `UsuarioSesion`: lo que se guarda de la sesión (`id` y `rol`). | Es lo que va dentro del token JWT. |
| 13–20 | `declare global { namespace Express { interface Request { usuario?: UsuarioSesion } } }` | **Ampliación de tipos**: le dice a TypeScript que el objeto `req` de Express puede tener `req.usuario`. Sin esto daría error al usarlo en las rutas. |
| 26 | `requiereAuth(...roles)` **devuelve** una función middleware. | Es una *fábrica*: `requiereAuth("gerente")` crea un middleware que exige ese rol. Sin argumentos, solo exige estar logueado. |
| 28–31 | Lee la cabecera `Authorization`. Si no empieza con `Bearer `, lanza 401 `no_autenticado`. | El cliente manda `Authorization: Bearer <token>`. |
| 33–38 | `jwt.verify(token, JWT_SECRET)` revisa la firma y la fecha de expiración. `cabecera.slice(7)` quita los 7 caracteres de `"Bearer "`. Si el token es falso o venció, lanza 401. | La firma garantiza que el servidor lo emitió y nadie lo modificó. |
| 39–41 | Comprueba que el contenido del token tenga `id` numérico y `rol` de texto. | Defensa extra: un token válido pero con forma rara también se rechaza. |
| 43–46 | Si se exigieron roles y el del token no está en la lista, lanza 403 `sin_permiso`. | **401** = no sabemos quién eres; **403** = sabemos quién eres pero no puedes hacer esto. |
| 47–48 | Guarda `req.usuario` y llama `next()` para continuar con la ruta. | Las rutas leen `req.usuario!.id` y `req.usuario!.rol`. |

---

## `src/idempotencia.ts` (que reintentar no duplique)

**El problema:** el mesero toca «Enviar a cocina», se va la señal, no ve respuesta y vuelve a tocar. Sin protección se crearían dos pedidos. **La solución:** el frontend manda una cabecera `Idempotency-Key` con una clave única por intención; si el servidor ya la procesó, devuelve la **misma respuesta guardada** sin repetir la acción.

| Líneas | Qué hace |
| --- | --- |
| 15–20 | `conIdempotencia(req, res, estadoOk, accion)`: envuelve una acción. `estadoOk` es el código HTTP de éxito (200 o 201) y `accion` es la función que hace el trabajo real. |
| 21–25 | Lee la cabecera. Si **no** viene, ejecuta la acción normal y responde. La idempotencia es opcional. |
| 26–28 | Si la clave mide más de 100 caracteres, responde 422 (la columna de la tabla tiene ese límite). |
| 30–32 | Prepara tres datos: el id del usuario, la **ruta** (`POST /api/pedidos/5/enviar`, sin el `?query`) y un **nombre de candado**: `idem_` + el hash SHA-1 de `usuario:clave`. El hash se usa porque los candados de MySQL aceptan nombres de hasta 64 caracteres. |
| 34 | Toma una conexión exclusiva del pool para mantener el candado. |
| 36–39 | `SELECT GET_LOCK(nombre, 10)`: pide un **candado de MySQL** esperando hasta 10 segundos. Devuelve 1 si lo obtuvo. Si no, responde 409 «hay otra petición con la misma clave en curso». Esto evita que dos peticiones simultáneas con la misma clave corran a la vez. |
| 41–45 | Busca en la tabla `idempotencia` si esa clave (de ese usuario) ya se usó. |
| 46–53 | Si ya existía: si la ruta es **distinta**, responde 422 (la clave se reutilizó en otra operación). Si es la misma, **devuelve la respuesta guardada** (`JSON.parse` si MySQL la entregó como texto) con su mismo código HTTP, **sin ejecutar la acción otra vez**. |
| 55 | Primera vez: ejecuta `accion()`. Si lanza un error, se salta el guardado, así que los **errores no quedan registrados** y se puede reintentar. |
| 56–60 | Guarda la respuesta exitosa en la tabla `idempotencia`. |
| 61 | Responde al cliente. |
| 62–69 | `finally`: pase lo que pase, libera el candado (`RELEASE_LOCK`) y devuelve la conexión al pool. Si falla liberar, el candado se libera solo al cerrar la conexión. |

**Ojo (para tu reporte):** la acción corre en otra conexión del pool, no en `cx`. Si la acción tiene éxito pero el `INSERT` en `idempotencia` falla, la acción ya ocurrió y no quedó registrada. Es un caso raro y está aceptado, pero conviene conocerlo.

---

## `src/index.ts` (arranque del servidor)

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 1–13 | Importa `cors`, `express`, la configuración, el manejo de errores y **un router por área** (auth, catálogo, cuentas, hostess, menú, mesas, pedidos, productos, usuarios). | Cada archivo de `routes/` define un `Router` con sus rutas. |
| 15 | `const app = express()` crea la aplicación. | |
| 16 | `app.use(cors({ origin: ORIGENES_PERMITIDOS }))`. | Permite al frontend llamar a la API. |
| 17 | `app.use(express.json())`. | Convierte el cuerpo JSON de las peticiones en un objeto (`req.body`). Sin esto `req.body` sería `undefined`. |
| 19–21 | `GET /api/health` responde `{ ok: true }`. | Sirve para comprobar que el servidor está vivo. |
| 23–31 | `app.use("/api/xxx", router)` monta cada router con su prefijo. **La hostess se monta en `/api`** porque sus rutas ya traen su ruta completa (`/clientes`, `/reservaciones`, `/lista-espera`). `usuarios` y `catalogo` son solo para gerente. | **El orden importa:** Express prueba los `app.use` de arriba hacia abajo. |
| 33–36 | Cualquier otra ruta que empiece con `/api` lanza un 404 en JSON. | Sin esto Express respondería con una página HTML de error. |
| 38 | `app.use(manejarErrores)` **al final**. | El manejador de errores debe ir después de todas las rutas. |
| 40 | `app.listen(PUERTO, ...)` pone el servidor a escuchar y muestra el mensaje en consola. | |

---

## `src/seed.ts` (crear los usuarios de prueba)

Se ejecuta a mano con `npx tsx src/seed.ts`. Crea los 5 usuarios (uno por rol) con contraseña `1234`.

| Líneas | Qué hace | Por qué |
| --- | --- | --- |
| 6–12 | Lista de 5 usuarios: rol, nombre, correo, usuario y contraseña. | Datos de desarrollo. |
| 14–38 | `main()`: recorre la lista. | |
| 16–19 | Si ya existe ese `nombre_usuario` en `credenciales`, lo salta (`continue`). | Puedes correr el script varias veces sin duplicar. |
| 21–25 | Busca el `id_rol` por nombre. Si no existe lanza un error que sugiere correr `schema.sql`. | Los roles los crea `schema.sql`. |
| 26–29 | Inserta la fila en `usuario`; `ins.insertId` es el id recién creado. | |
| 30 | `bcrypt.hash(u.pass, 10)`: el hash de la contraseña. | El 10 es el **costo**: cuántas veces se repite el cálculo. Más alto = más seguro y más lento. |
| 31–34 | Guarda `nombre_usuario` y `password_hash` en `credenciales`. | La contraseña **nunca** se guarda en texto. |
| 35 | Crea una fila vacía en `perfil_usuario`. | |
| 38 | `pool.end()` cierra las conexiones para que el script termine. | |
| 41 | Si algo falla, lo imprime y sale con código 1. | |

---

## Resumen de conceptos de este archivo

- **Pool** de conexiones, **transacción** y consultas **parametrizadas** (`?`).
- **Middleware**: función que se ejecuta antes de la ruta; recibe `req`, `res` y `next`.
- **JWT**: token firmado con `id` y `rol`; se verifica en cada petición.
- **401 vs 403**, **CORS**, **hash con bcrypt** y **idempotencia**.

Siguiente: `03_backend_rutas.md`.
