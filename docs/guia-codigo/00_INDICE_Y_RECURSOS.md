# SIGR · Guía de estudio del código

Esta carpeta explica el código de SIGR para que el equipo lo entienda y pueda defenderlo. Cada documento va por **bloques de líneas** (`L12–L30`), con **qué hace** y **por qué está así**.

## Importante: el proyecto se reorganizó

Después de escribir los documentos 01 a 05 el proyecto pasó a la estructura acordada (ver `README.md`, sección «Estructura del proyecto»). Las explicaciones siguen valiendo, pero **los números de línea y las rutas de los documentos 01 a 05 corresponden a los archivos anteriores**. Para encontrar cada cosa hoy:

| Antes | Ahora |
| --- | --- |
| `backend/src/db.ts` | `backend/src/services/db.ts` |
| `backend/src/idempotencia.ts` | `backend/src/services/idempotencia.ts` |
| `backend/src/config.ts` | `backend/src/utils/config.ts` |
| `backend/src/errores.ts` | `backend/src/utils/errores.ts` |
| `backend/src/middlewares/auth.ts` | `backend/src/utils/auth.ts` |
| `backend/src/dominio.ts` | `backend/src/models/dominio.ts` |
| `backend/src/seed.ts` | `backend/src/utils/seed.ts` |
| `backend/src/routes/<área>.ts` (ruta y lógica juntas) | `routes/<área>.ts` (solo la ruta y el permiso) y `controllers/<área>.ts` (la lógica: los bloques `async (req, res) => {...}` pasaron a funciones con nombre) |
| `backend/src/routes/hostess.ts` | `routes/clientes.ts`, `routes/reservaciones.ts`, `routes/listaEspera.ts` y la lógica en `controllers/hostess.ts` |
| `database/schema.sql` y `database/seed.sql` | `database/init.sql` (un solo archivo: esquema, catálogos y datos base) |
| `database/migracion_01_front.sql` a `migracion_06_caja.sql` | `database/migrations/001_ajustes_front.sql` a `006_caja.sql` |
| *(no existía)* | `backend/src/mocks/`, `backend/tests/`, `database/docker-compose.yml`, `frontend/src/mocks/*.json` |
| `frontend/src/main.ts` | `frontend/main.ts` |

Nombres de las funciones que antes eran bloques sin nombre (por ejemplo `POST /api/pedidos/:id/enviar`): `enviarPedido`, `cancelarPedido`, `entregarPedido`, `crearPedido`, `listarPedidos`, `asignarMesa`, `iniciarSesion`, `crearUsuario`, `editarUsuario`, `cambiarContrasena`, `solicitarPago`, entre otros (ver `backend/src/controllers/`).

---

## Qué tan completa está

El proyecto tiene unas **25 000 líneas** (backend 2 294, base de datos ~500, frontend 22 183 con pruebas, simulaciones y estilos). Se explica en orden, de lo más importante a lo menos. Estado hoy:

| # | Documento | Cubre | Líneas de código | Estado |
| --- | --- | --- | --- | --- |
| 01 | `01_base_de_datos.md` | `schema.sql`, `seed.sql`, `seed_demo.sql` y las 4 migraciones | ~507 | Hecho |
| 02 | `02_backend_nucleo.md` | `package.json`, `tsconfig`, `config`, `db`, `errores`, `auth` (middleware), `idempotencia`, `index`, `seed.ts` | ~400 | Hecho |
| 03 | `03_backend_dominio_y_rutas_basicas.md` | `dominio.ts` y las rutas `auth`, `productos`, `menu`, `cuentas` y `usuarios` | ~800 | Hecho |
| 04 | `04_backend_mesas_y_pedidos.md` | `routes/mesas.ts` y `routes/pedidos.ts` | 462 | Hecho |
| 05 | `05_backend_catalogo_y_hostess.md` | `routes/catalogo.ts` y `routes/hostess.ts` | 718 | Hecho |
| Caja | `caja_frontend_backend.md` | Operación de caja en backend y frontend | — | Hecho |
| 06 | Frontend: base | `main.ts`, `App.vue`, `router`, `styles/base.css`, `types/`, `utils/` (sin pruebas) | ~2 100 | Pendiente |
| 07 | Frontend: servicios | `services/api` (933), `services/mock` (1 004), `services/hostess` (724), `interfaces.ts` | ~2 900 | Pendiente |
| 08 | Frontend: stores y composables | `stores/` (968) y `composables/` (94) | ~1 060 | Pendiente |
| 09 | Frontend: gerente (lo que presentaron) | `views/gerente/` (598), `GerenteLayout`, `FormularioUsuarioDialog`, `FormularioProductoDialog`, `ContrasenaUsuarioDialog`, `CategoriasDialog`, `ConfirmarAccionDialog`, `DialogoModal` | ~2 000 | Pendiente |
| 10 | Frontend: mesero | `views/mesero/` (1 766), `MeseroLayout`, componentes de pedido y cuenta | ~5 500 | Pendiente |
| 11 | Frontend: hostess | `views/hostess/` (747), `HostessLayout`, `components/hostess/` (4 625) | ~5 600 | Pendiente |
| 12 | Pruebas | 18 archivos `*.test.ts` | 2 843 | Pendiente |

Sobre el **frontend**: no cabe en una sola entrega sin volverse inútil, así que se hace por partes. El documento 09 va primero porque son las pantallas que presentaron en la práctica P24. Pídelos en ese orden con «Continuar».

---

## Cómo estudiar (ruta recomendada)

1. **Idea general** (1 hora): lee el `README.md` y el `CONTEXTO_IA.md`.
2. **Base de datos** (`01`): dibuja el diagrama de tablas a mano; sin esto el backend no se entiende.
3. **Núcleo del backend** (`02`): conexión, errores, JWT e idempotencia.
4. **Rutas simples** (`03`): empieza por `auth` y `usuarios`; son las del gerente que presentaron.
5. **Pedidos y mesas** (`04`), luego **catálogo y hostess** (`05`).
6. **Frontend**, en el orden de la tabla de arriba.
7. **Practica:** corre el sistema (`npm run dev` en `backend/` y en `frontend/`), abre las herramientas del navegador (pestaña *Network*) y mira las peticiones reales a la API mientras haces cada acción.

**Ejercicios para cada archivo:** (a) explícalo en voz alta sin leerlo, (b) cambia algo pequeño (un mensaje, un límite) y verifica el efecto, (c) rómpelo a propósito (por ejemplo, borra `await`) y mira el error.

---

## Mapa de herramientas (qué es cada cosa en una frase)

| Herramienta | Qué es | Dónde se ve |
| --- | --- | --- |
| **Node.js** | Ejecuta JavaScript fuera del navegador. | Todo `backend/` |
| **Express 5** | Define rutas HTTP y middlewares. | `routes/*.ts`, `index.ts` |
| **TypeScript** | JavaScript con tipos; detecta errores antes de ejecutar. | Todo el proyecto |
| **MySQL 8 + mysql2** | Base de datos relacional y su conector. | `database/`, `db.ts` |
| **zod** | Valida y convierte datos de entrada. | `validar(...)` en cada ruta |
| **JWT (jsonwebtoken)** | Token firmado que prueba quién eres. | `middlewares/auth.ts`, `routes/auth.ts` |
| **bcryptjs** | Hash de contraseñas. | `routes/auth.ts`, `usuarios.ts`, `seed.ts` |
| **Vue 3** | Interfaz con componentes reactivos. | `frontend/src/**/*.vue` |
| **Vite** | Servidor de desarrollo y empaquetador. | `frontend/vite.config.ts` |
| **Pinia** | Estado compartido entre componentes. | `frontend/src/stores/` |
| **Vue Router** | Rutas del navegador y guardas por rol. | `frontend/src/router/index.ts` |
| **Vitest** | Pruebas automáticas. | `*.test.ts` |
| **Git / GitHub** | Historial y trabajo en equipo. | `.git`, ramas y Pull Requests |

---

## Recursos para entender mejor

### Enlaces que verifiqué al buscar

| Tema | Recurso |
| --- | --- |
| Git | **Pro Git** (libro gratuito, en español): https://git-scm.com/book/es/v2 |
| Express y Node | Tutorial de MDN «Express web framework (Node.js)» (la página trae selector de idioma): https://developer.mozilla.org/pt-BR/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs |
| Express y Node | Lección de The Odin Project «Introduction to Express» (sigue el tutorial de MDN y recomienda el libro *Express in Action*): https://www.theodinproject.com/lessons/nodejs-introduction-to-express |
| JWT y roles con MySQL | https://www.corbado.com/blog/nodejs-express-mysql-jwt-authentication-roles |
| Vue 3 en español | Ruta de aprendizaje: https://www.cursosdesarrolloweb.es/paths/ruta-aprendizaje-vue-3-composition-api |

### Documentación oficial (de mi conocimiento; confirma que sigan vigentes)

- Vue: `vuejs.org` (sección *Guide*), Pinia: `pinia.vuejs.org`, Vue Router: `router.vuejs.org`, Vite: `vite.dev`.
- Express: `expressjs.com`; zod: `zod.dev`; MySQL: `dev.mysql.com/doc`; TypeScript: `typescriptlang.org/docs` (*Handbook*); JWT: `jwt.io/introduction`.
- Atajos de MDN para conceptos web: `developer.mozilla.org` (busca *fetch*, *Promise*, *async function*, *HTTP status*).

### Libros (de mi conocimiento; no verifiqué disponibilidad ni precio)

| Libro | Para qué te sirve |
| --- | --- |
| *Pro Git* (Chacon y Straub) | Git desde cero hasta ramas y fusiones. Gratis en línea. |
| *Eloquent JavaScript* (Marijn Haverbeke) | Base de JavaScript: funciones, objetos, `async`. Hay versión gratuita en línea. |
| *Express in Action* (Evan Hahn) | Express y middlewares; lo recomienda The Odin Project. |
| *Learning SQL* (Alan Beaulieu) | `SELECT`, `JOIN`, subconsultas y diseño de tablas. |
| *The Pragmatic Programmer* (Hunt y Thomas) | Buenas prácticas para trabajar en equipo. |

### Videos (YouTube)

No pude abrir YouTube desde aquí, así que no te doy enlaces que no verifiqué. Búsquedas que funcionan bien (agrega el año actual para ver contenido reciente):

| Para entender | Busca en YouTube |
| --- | --- |
| Express y rutas | `curso express js desde cero` |
| MySQL y JOIN | `curso mysql joins explicados` |
| Transacciones y bloqueos | `mysql transacciones for update explicado` |
| JWT | `jwt autenticación explicado node` |
| Vue 3 | `curso vue 3 composition api script setup` |
| Pinia | `pinia vue 3 tutorial` |
| Git en equipo | `git y github trabajo en equipo ramas pull request` |

---

## Glosario rápido

- **API REST:** servidor que responde a peticiones HTTP (`GET`, `POST`, `PATCH`, `DELETE`) con JSON.
- **Middleware:** función que corre antes de la ruta (por ejemplo, revisar el token).
- **Transacción:** varios cambios en la base que se guardan todos o ninguno.
- **Idempotencia:** repetir una petición con la misma clave no repite la acción.
- **DTO:** objeto con la forma exacta de lo que viaja entre cliente y servidor.
- **CRUD:** crear, leer (Read), actualizar y borrar.
- **Mock:** datos simulados para trabajar sin backend.
- **Pool de conexiones:** grupo de conexiones a la base que se reutilizan.
