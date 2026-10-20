# SIGR — Contexto del proyecto para una IA

> Archivo pensado para pegarse (o adjuntarse) al inicio de una conversación con una IA.
> Resume qué es el proyecto, qué se decidió, qué ya existe en el código y qué falta.
> Última revisión: octubre de 2026. Si algo de aquí contradice el código, **gana el código**; avísalo y corrige este archivo.

## 0. Instrucciones para la IA

1. Lee este archivo completo antes de responder. Si te falta un dato, pregunta; no lo inventes.
2. Responde en **español**.
3. El equipo prefiere **entregables completos y listos para usar**: archivos completos, comandos para copiar y pegar, scripts terminados, en lugar de explicaciones o ayudas parciales.
4. El entorno de trabajo es **Windows con PowerShell**. Los comandos de ejemplo deben funcionar ahí (no uses sintaxis solo de bash sin avisar).
5. Respeta los códigos de requisito (`RF-…`, `RNF-…`). Cuando propongas algo nuevo, dale un código del patrón existente y márcalo como **propuesto**.
6. No cambies un contrato JSON, un nombre de columna ni un estado sin decirlo explícitamente. Si cambia la base de datos: crea `database/migrations/00N_*.sql` y actualiza `database/init.sql` en el mismo cambio.
7. No subas ni imprimas secretos: `.env`, `.env.local`, `JWT_SECRET`, contraseñas reales.
8. Mantén el estilo del código existente (TypeScript estricto, nombres en español, comentarios que explican el porqué).

## 1. Qué es SIGR

**SIGR** (Sistema Integral de Gestión de Restaurante) es una aplicación web para el restaurante **La Madalena**. Digitaliza la operación diaria: el mesero toma pedidos desde celular o tablet, la cocina los recibe, el gerente administra usuarios, menú e inventario, y la cuenta de cada mesa se lleva de principio a fin. Todos los roles usan una sola base de datos MySQL a través de una API REST.

**Problemas que resuelve** (salen de entrevistas y observación en el restaurante): sistema lento, errores al tomar pedidos, dificultad para modificar información, pedidos poco claros, retrasos entre áreas y reservaciones manejadas por WhatsApp sin control.

**Ámbito:** aplicación web multiplataforma, usable desde navegador en Windows, Linux, macOS, Android o iOS. Escala a nuevas funciones, pero hoy es para una sola sucursal.

**Contexto académico:** proyecto de la materia Ingeniería de Software, Instituto Tecnológico de Tepic, grupo 5A. Docente: Rocío Gabriela Barrientos Luján. Cada práctica genera un documento: P21 diagramas de secuencia, P22 diseño arquitectónico, P23 modelo de datos, P24 diseño de interfaz de usuario, ERS (RP33) y modelo de requisitos (RP41).

**Equipo:** Jonathan Alexis Bernal Machuca, Hannia Elizabeth González Tapia, Cesar Ruben Ramos Gameros, Axel Yael Meza Luna y Carlos David Cortés Hidalgo. Repositorio: `github.com/sikilow/SIGR`.

**Autores de las pantallas del gerente (según el reporte RP24):** Usuarios — González Tapia, Ramos Gameros y Cortés Hidalgo. Productos — Meza Luna y Bernal Machuca.

## 2. Stack (versiones de `package.json`)

| Capa | Herramientas |
| --- | --- |
| Frontend | Vue 3.5 (Composition API, `<script setup>`), Vite 8, TypeScript 6, Pinia 4, Vue Router 5, Vitest 5, vue-tsc |
| Backend | Node.js 22 (mínimo 20.19), Express 5, TypeScript 7, mysql2 (con transacciones), zod 4, jsonwebtoken, bcryptjs, cors, dotenv, tsx |
| Base de datos | MySQL 8.0, base `SIGR`, `utf8mb4` |
| Otras | Git y GitHub, Postman o similar para probar la API |

## 3. Estructura del proyecto (acordada)

Esta es la estructura **acordada**. Toda carpeta o archivo nuevo debe respetarla (la carpeta raíz del repositorio se llama `SIGR`):

```
proyecto-web/
│
├── frontend/                  # Aplicación Vue + Vite
│   ├── public/                # Archivos estáticos
│   ├── src/
│   │   ├── assets/            # Imágenes, íconos
│   │   ├── components/        # Componentes reutilizables
│   │   ├── views/             # Páginas principales
│   │   ├── router/            # Configuración de rutas
│   │   ├── services/          # Llamadas a API
│   │   ├── stores/            # Estado global (Pinia/Vuex)
│   │   ├── mocks/             # Datos falsos para pruebas
│   │   │   ├── clientes.json
│   │   │   └── productos.json
│   │   └── utils/             # Helpers
│   ├── index.html
│   ├── main.ts
│   └── vite.config.ts
│
├── backend/                   # API Node.js + Express
│   ├── src/
│   │   ├── index.ts           # Punto de entrada
│   │   ├── routes/            # Endpoints
│   │   │   ├── clientes.ts
│   │   │   └── productos.ts
│   │   ├── controllers/       # Lógica de negocio
│   │   ├── models/            # Modelos de datos
│   │   ├── services/          # Conexión DB
│   │   ├── mocks/             # Datos falsos para pruebas API
│   │   │   ├── clientes.mock.ts
│   │   │   └── productos.mock.ts
│   │   └── utils/             # Funciones auxiliares
│   ├── tests/                 # Pruebas unitarias
│   ├── package.json
│   └── tsconfig.json
│
├── database/                  # Configuración de la base de datos
│   ├── docker-compose.yml     # Contenedor DB
│   ├── init.sql               # Script inicial (tablas, datos)
│   └── migrations/            # Migraciones de esquema
│       ├── 001_create_clientes.sql
│       └── 002_create_productos.sql
│
├── docs/                      # Documentación
│   └── arquitectura.md
│
└── README.md
```

Los nombres de ejemplo del modelo (`clientes`, `productos`, `001_create_clientes.sql`) se reemplazaron por los reales del restaurante. Así quedó el proyecto:

```
SIGR/
├── backend/
│   ├── src/
│   │   ├── index.ts            arranque de Express, CORS, JSON, montaje de rutas y manejo de errores
│   │   ├── routes/             auth, catalogo, clientes, cuentas, listaEspera, menu, mesas, pedidos,
│   │   │                       productos, reservaciones, usuarios (solo ruta + permiso + controlador)
│   │   ├── controllers/        auth, catalogo, cuentas, hostess (clientes + reservaciones + lista de
│   │   │                       espera), menu, mesas, pedidos, productos, usuarios (la lógica)
│   │   ├── models/dominio.ts   DTOs, consultas compartidas, estados del pedido, reglas de existencia, validar()
│   │   ├── services/           db.ts (pool y transacciones) e idempotencia.ts (Idempotency-Key)
│   │   ├── mocks/              clientes.mock.ts y productos.mock.ts
│   │   └── utils/              config.ts (JWT_SECRET, PUERTO, CORS), errores.ts (ErrorApi),
│   │                           auth.ts (requiereAuth(...roles)) y seed.ts (usuarios de prueba)
│   ├── tests/                  dominio.test.ts y mocks.test.ts (26 pruebas, Vitest)
│   ├── .env.example, package.json, tsconfig.json
├── frontend/
│   ├── index.html, main.ts, vite.config.ts
│   ├── public/
│   └── src/
│       ├── views/              mesero/, hostess/, gerente/ y LoginView
│       ├── components/         diálogos, formularios, insignias; hostess/ aparte
│       ├── router/             rutas y guardas por rol
│       ├── services/           api/ (backend real), mock/ (datos simulados), hostess/, interfaces.ts
│       ├── stores/             Pinia: sesion, mesas, pedidos, cuenta, reservaciones, espera, salon, anuncios
│       ├── mocks/              clientes.json y productos.json (los lee services/mock/baseDatos.ts)
│       ├── utils/              carrito, reglas de negocio, formato, contraste
│       ├── assets/             vacía por ahora (.gitkeep)
│       └── types/, layouts/, composables/, styles/   (adicionales: el código depende de ellas)
├── database/                   init.sql, docker-compose.yml, seed_demo.sql (opcional) y migrations/001 a 004
├── docs/                       arquitectura.md, contratos de API, equivalencias-bd.md, PENDIENTES_Y_FALTANTES.md,
│                               guia-codigo/ y capturas/
├── CONTEXTO_IA.md              este archivo
└── README.md
```

Diferencias menores respecto al modelo: `frontend/` tiene las carpetas adicionales `types`, `layouts`, `composables` y `styles`; `database/` incluye `seed_demo.sql`; el controlador `hostess.ts` atiende las tres rutas de la hostess porque comparten funciones de apoyo.

## 4. Actores, permisos y pantallas

| Rol (`rol.nombre`) | Qué hace | Pantallas (ruta) | Usuario de prueba |
| --- | --- | --- | --- |
| gerente | Administra usuarios, menú e inventario; supervisa; cancela excepciones | `/gerente/usuarios`, `/gerente/productos` | `gerente` |
| mesero | Pedidos, cuentas de mesa, enviar a cocina, entregar | `/mesero/mesas`, `/mesero/mesas/:id/pedido`, `/mesero/mesas/:id/cuenta`, `/mesero/pedidos/:id?` | `mesero`, `mesero2` |
| cocinero | Ver pedidos y cambiar su estado | pendiente | `cocinero` |
| cajero | Cobrar, tickets, facturas, corte de caja | pendiente | `cajero` |
| hostess | Salón, reservaciones, lista de espera, clientes | `/hostess/salon`, `/hostess/reservaciones`, `/hostess/espera` | `hostess` |

Contraseña de todos los usuarios de prueba: `1234` (solo desarrollo). El gerente también puede usar los endpoints de la hostess y del mesero (por eso aparece en varios `requiereAuth`). La guarda del router manda a cada rol a su pantalla inicial (`rutaInicial` en `router/index.ts`); un rol sin pantalla cae en el aviso «tu rol no tiene acceso».

## 5. Requerimientos

Fuente: documento ERS (RP33) y modelo de requisitos (RP41). Estado según lectura del código: IMPLEMENTADO, PARCIAL (incompleto o distinto al ERS) o PENDIENTE.

Avance de los 22 requisitos funcionales del ERS: 12 implementados, 3 parciales, 7 pendientes.

### 5.1 Requisitos funcionales del ERS

**Gestión de usuarios (Gerente)**

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| RF-USR-001 | Registrar usuario | Gerente | IMPLEMENTADO | `POST /api/usuarios` · Usuarios → Nuevo usuario |
| RF-USR-002 | Actualizar usuario | Gerente | IMPLEMENTADO | `PATCH /api/usuarios/:id` y `POST /api/usuarios/:id/contrasena` · Usuarios → Editar / Contraseña |
| RF-USR-003 | Eliminar usuario | Gerente | PARCIAL | Se implementó como **desactivar / reactivar** (no se borra: el usuario tiene pedidos y ventas ligados) |
| RF-USR-004 | Consultar usuario | Gerente | IMPLEMENTADO | `GET /api/usuarios` · lista con filtros por estado y rol y búsqueda |
| RF-USR-005 | Asignar rol a usuario | Gerente | IMPLEMENTADO | Campo Rol al crear o editar un usuario |

**Gestión de pedidos**

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| RF-PED-001 | Registrar pedido | Mesero | IMPLEMENTADO | `POST /api/pedidos` · Pedido de mesa |
| RF-PED-002 | Cancelar pedido | Mesero, Gerente | IMPLEMENTADO | `POST /api/pedidos/:id/cancelar` (con motivo) · Mis pedidos |
| RF-PED-003 | Consultar pedido | Mesero, Cajero, Gerente, Cocinero | PARCIAL | `GET /api/pedidos` y `/:id` aceptan cualquier rol; solo el mesero tiene pantalla (Mis pedidos) |
| RF-PED-004 | Cambiar estado del pedido | Cocinero, Mesero | PARCIAL | API lista (`/enviar`, `/entregar`, `PATCH /:id/estado` para cocinero y gerente); falta la pantalla de cocina |
| RF-PED-005 | Consultar historial de pedidos | Gerente, Cajero | PENDIENTE | Sin pantalla ni endpoint propio |

**Gestión de ventas**

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| RF-VEN-001 | Registrar venta | Cajero | PENDIENTE | El esquema ya existe (`venta`, `pago`, `metodo_pago`, `corte_caja`); falta API y pantalla de caja |
| RF-VEN-002 | Generar factura | Cajero | PENDIENTE | El esquema ya existe (`factura`, `datos_fiscales`); falta API y pantalla |
| RF-VEN-003 | Consultar historial de ventas | Cajero, Gerente | PENDIENTE | Pendiente |
| RF-VEN-004 | Generar reporte de ventas | Gerente | PENDIENTE | Pendiente |

**Gestión de clientes**

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| RF-CLI-001 | Registrar cliente | Hostess, Cajero | IMPLEMENTADO | `POST /api/clientes` · selector de cliente en Reservaciones y Espera (el cajero aún no tiene pantalla) |
| RF-CLI-002 | Actualizar cliente | Hostess, Cajero | PENDIENTE | Sin endpoint |
| RF-CLI-003 | Eliminar cliente | Gerente, Cajero | PENDIENTE | Sin endpoint |

**Gestión de reservas (Hostess)**

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| RF-RES-001 | Registrar reserva | Hostess | IMPLEMENTADO | `POST /api/reservaciones` · Reservaciones |
| RF-RES-002 | Actualizar reserva | Hostess | IMPLEMENTADO | `PATCH /api/reservaciones/:id` |
| RF-RES-003 | Cancelar reserva | Hostess | IMPLEMENTADO | `PATCH /api/reservaciones/:id` con estado `cancelada` |
| RF-RES-004 | Consultar reserva | Hostess | IMPLEMENTADO | `GET /api/reservaciones?fecha=AAAA-MM-DD` |
| RF-RES-005 | Confirmar reserva | Hostess | IMPLEMENTADO | `PATCH /api/reservaciones/:id` con estado `confirmada` |

### 5.2 Requisitos construidos que NO están en el ERS (códigos propuestos)

Falta aprobarlos con el equipo y agregarlos al ERS.

| Código | Requisito | Actor | Dónde está |
| --- | --- | --- | --- |
| RF-PRO-001 | Registrar producto (nombre, descripción, categoría, precio, existencia y stock mínimo) | Gerente | `POST /api/catalogo/productos` |
| RF-PRO-002 | Actualizar producto (precio, categoría, existencia, stock mínimo) | Gerente | `PATCH /api/catalogo/productos/:id` |
| RF-PRO-003 | Activar o desactivar un producto (no se borra, hay pedidos que lo usan; el mesero lo ve como agotado) | Gerente | `PATCH /api/catalogo/productos/:id` |
| RF-PRO-004 | Consultar productos e inventario con filtros por estado, categoría, poco stock y búsqueda | Gerente | `GET /api/catalogo/productos` |
| RF-PRO-005 | Gestionar categorías del menú (crear, renombrar, borrar) | Gerente | `/api/catalogo/categorias` |
| RF-PRO-006 | Existencia opcional por producto: se descuenta al enviar el pedido a cocina y se bloquea el envío si no alcanza | Sistema | `POST /api/pedidos/:id/enviar`, `POST /api/productos/disponibilidad` |
| RF-USR-006 | Cambiar la contraseña de un usuario | Gerente | `POST /api/usuarios/:id/contrasena` |
| RF-USR-007 | Desactivar y reactivar usuarios (sustituye al borrado de RF-USR-003) | Gerente | `PATCH /api/usuarios/:id` |
| RF-CUE-001 | Solicitar la cuenta de una mesa y elegir pago en caja o digital (la cuenta pasa a `por_pagar`) | Mesero, Gerente | `POST /api/cuentas/:id/solicitar-pago` |
| RF-MES-001 | Asignar mesa a un grupo y cambiar el estado de la mesa (`libre`, `ocupada`, `reservada`) | Hostess, Gerente | `POST /api/mesas/:id/asignar`, `PATCH /api/mesas/:id/estado` |
| RF-RES-006 | Registrar la llegada de un cliente con reservación | Hostess | `POST /api/reservaciones/:id/llegada` |
| RF-ESP-001 | Gestionar la lista de espera: agregar grupos, consultar por orden de llegada y sentarlos; la edición (`PATCH`) sigue pendiente | Hostess | `GET` y `POST /api/lista-espera` |
| RNF-030 | Las acciones críticas (crear, enviar, cancelar, entregar pedidos, solicitar pago, asignar mesa) no deben duplicarse si el cliente reintenta (`Idempotency-Key`) | Sistema | `backend/src/services/idempotencia.ts`, tabla `idempotencia` |

### 5.3 Diferencias entre el ERS y el código

| Tema | El ERS dice | En el código |
| --- | --- | --- |
| RF-USR-003 / RF-CLI-003 | El ERS pide **eliminar** | Los usuarios se **desactivan** (no se borran). Falta decidir qué pasa con clientes |
| Estados de mesa | El ERS dice «disponible u ocupada» | La BD usa `libre`, `ocupada` y `reservada` |
| Estados de pedido | El ERS: pendiente, en preparación, listo, entregado | La BD agrega `Registrado`, `Cancelado` y `Pagado`; `Pendiente` se usa como «enviado a cocina» |
| RNF-011 | Expiración a los 15 min de inactividad | El JWT dura 8 horas |
| RNF-025 | Actualización en < 2 s | Consulta periódica cada 10 s |
| Hostess | El README decía que su API estaba propuesta | Ya existen casi todas sus rutas en `backend/`; solo falta `PATCH /api/lista-espera/:id` |

### 5.4 Requisitos no funcionales (aplican a todo el sistema)

| Código | Categoría | Requisito | Estado | Nota |
| --- | --- | --- | --- | --- |
| RNF-001 | Rendimiento | Responder en ≤ 2 s en operaciones transaccionales, ≤ 3 s en consultas comunes y ≤ 5 s en históricos o reportes | POR MEDIR |  |
| RNF-002 | Rendimiento | Permitir múltiples operaciones simultáneas sin degradación significativa | POR MEDIR |  |
| RNF-003 | Rendimiento | Soportar múltiples consultas concurrentes | POR MEDIR |  |
| RNF-004 | Rendimiento | Manejar grandes volúmenes de datos de manera eficiente | POR MEDIR |  |
| RNF-005 | Disponibilidad | Estar disponible durante el horario operativo del restaurante | POR MEDIR |  |
| RNF-006 | Disponibilidad | Garantizar alta disponibilidad para evitar interrupciones | POR MEDIR |  |
| RNF-007 | Seguridad | Requerir usuario y contraseña para cualquier funcionalidad | IMPLEMENTADO | Login con JWT; el resto de la API exige `Authorization: Bearer` |
| RNF-008 | Seguridad | Validar las credenciales contra la base de datos | IMPLEMENTADO |  |
| RNF-009 | Seguridad | Bloquear temporalmente la cuenta tras 5 intentos fallidos de inicio de sesión | PENDIENTE | No se encontró en el código |
| RNF-010 | Seguridad | Almacenar las contraseñas con un hash seguro | IMPLEMENTADO | `bcryptjs` |
| RNF-011 | Seguridad | Sesiones con expiración por inactividad (por ejemplo, 15 minutos) | PARCIAL | El token JWT dura 8 horas fijas, sin control por inactividad |
| RNF-012 | Seguridad | Cierre de sesión seguro que invalide la sesión activa | PARCIAL | El cliente borra el token; el servidor no lo invalida (JWT sin estado) |
| RNF-013 | Seguridad | Control de acceso basado en roles (RBAC) | IMPLEMENTADO | `requiereAuth(...roles)` en el backend y guardas por rol en el router |
| RNF-014 | Seguridad | Restringir las funcionalidades según el rol | IMPLEMENTADO |  |
| RNF-015 | Seguridad | Validar los permisos antes de ejecutar cualquier operación | IMPLEMENTADO |  |
| RNF-016 | Seguridad | Impedir el acceso a recursos no autorizados, incluso por URL o manipulando solicitudes | IMPLEMENTADO | La validación de rol está en el backend, no solo en el frontend |
| RNF-017 | Seguridad | Registrar los intentos de acceso no autorizado para auditoría | PENDIENTE | No se encontró en el código |
| RNF-018 | Seguridad | Restringir la información y funcionalidades a usuarios autorizados | IMPLEMENTADO |  |
| RNF-019 | Usabilidad | Interfaz intuitiva y fácil de usar | IMPLEMENTADO |  |
| RNF-020 | Usabilidad | Mostrar la información de forma clara y ordenada | IMPLEMENTADO |  |
| RNF-021 | Usabilidad | Permitir múltiples criterios de búsqueda | PARCIAL | Hay búsqueda en usuarios, productos y reservaciones; no en todos los módulos |
| RNF-022 | Confiabilidad e integridad | Garantizar la integridad de los datos almacenados | IMPLEMENTADO | Llaves foráneas, `CHECK` y transacciones con `mysql2` |
| RNF-023 | Confiabilidad e integridad | Mantener la consistencia de la información en todo momento | IMPLEMENTADO |  |
| RNF-024 | Confiabilidad e integridad | Garantizar el envío correcto de pedidos a cocina sin errores | IMPLEMENTADO | Envío en transacción y con `Idempotency-Key` para no duplicar |
| RNF-025 | Confiabilidad e integridad | Reflejar las actualizaciones en tiempo real (< 2 s) | PARCIAL | El frontend actualiza por consulta periódica (cada 10 s, configurable con `VITE_POLL_MS`) |
| RNF-026 | Auditoría | Registrar eventos importantes: cancelaciones, confirmaciones y modificaciones | PENDIENTE | No se encontró una bitácora de eventos |
| RNF-027 | Auditoría | Conservar en auditoría el motivo de las cancelaciones | PARCIAL | Se guarda el motivo en `motivo_cancelacion` al cancelar un pedido |
| RNF-028 | Cumplimiento legal | Cumplir la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) | POR REVISAR |  |
| RNF-029 | Cumplimiento legal | Cumplir la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados (LGPDPPSO) | POR REVISAR |  |

De los RNF del ERS, los que pidieron las secciones de cada RF (por ejemplo «registro en 2 s» o cumplimiento de LFPDPPP y LGPDPPSO) se resumen en los de arriba.

### 5.5 Reglas del dominio

1. El restaurante debe definir un tiempo de tolerancia para la llegada de clientes con reserva.
2. Si el cliente no llega dentro del tiempo de tolerancia definido, la reserva puede liberarse o cancelarse.
3. La mesa asociada a una reserva debe liberarse cuando esta sea cancelada o expire.
4. No se pueden registrar reservas en fechas u horarios pasados.
5. Cada reserva debe estar asociada a una mesa disponible.
6. No se deben asignar múltiples reservas a la misma mesa en el mismo horario.
7. El número de personas de una reserva debe ser mayor a cero.
8. Cada mesa debe tener una capacidad máxima de personas.
9. La asignación de mesas debe realizarse en función del número de personas.
10. Una mesa solo puede estar en un estado a la vez (disponible u ocupada).
11. Una mesa no puede tener más de un pedido activo al mismo tiempo.
12. Un pedido solo puede registrarse si la mesa está ocupada.
13. Un pedido debe contener al menos un producto o platillo.
14. Un pedido puede tener múltiples productos o platillos.
15. Un pedido debe estar asociado a una mesa activa.
16. Un pedido no puede modificarse una vez que ha sido marcado como entregado.
17. Un pedido debe seguir un flujo de estados definido (pendiente, en preparación, listo, entregado).
18. No se puede cerrar una cuenta si no existe un pago registrado.
19. El pago debe estar asociado a un pedido existente.
20. El total del pedido debe calcularse en función de los productos registrados.
21. Un cliente puede tener múltiples reservas y pedidos asociados.
22. No se debe registrar más de un cliente con la misma información de contacto cuando esta se utilice como identificador.

### 5.6 Restricciones, supuestos, dependencias y requisitos futuros

Restricciones: tecnológica: el sistema debe funcionar en equipos disponibles del restaurante; operativa: debe operar en tiempo real; interfaz: debe ser intuitiva y fácil de usar; seguridad: protección de datos y transacciones.

Supuestos: el personal tiene conocimientos básicos de cómputo; hay buena comunicación entre áreas; el flujo de trabajo (toma de pedidos, validación, preparación, entrega y pago) no cambia mucho; los usuarios siguen los procedimientos.

Dependencias: equipos de cómputo para meseros, cocina y caja; base de datos centralizada; red interna; suministro eléctrico continuo; soporte técnico.

Requisitos futuros (fuera del alcance actual):

- Integración con sistemas de pago electrónico (tarjetas, transferencias o billeteras digitales)
- Reportes avanzados de ventas, desempeño y análisis de datos
- Aplicación móvil para el personal
- Integración con servicios de entrega a domicilio
- Notificaciones automáticas a clientes (confirmación de reservas, recordatorios)
- Sistema de fidelización (puntos, promociones o descuentos)
- Facturación electrónica
- Control de inventario de ingredientes o insumos
- Integración con impresoras de tickets y pantallas de cocina
- Soporte para múltiples sucursales
- Dashboards en tiempo real para monitoreo de operaciones

### 5.7 Registro de requerimientos nuevos (llenar conforme se descubran)

Cuando aparezca algo que no está arriba, agrégalo aquí y también en la tabla del README.

| Código propuesto | Requerimiento | Actor | Origen (quién lo pidió o dónde apareció) | Estado | Fecha |
| --- | --- | --- | --- | --- | --- |

| RF-MES-002 | Registrar mesa (número, capacidad y zona) | Gerente | Pedido del equipo | PROPUESTO (sin construir) | oct. 2026 |
| RF-MES-003 | Actualizar mesa (número, capacidad, zona) | Gerente | Pedido del equipo | PROPUESTO (sin construir) | oct. 2026 |
| RF-MES-004 | Activar o desactivar mesa (no se borra) | Gerente | Pedido del equipo | PROPUESTO (sin construir) | oct. 2026 |
| RF-MES-005 | Consultar mesas como gerente, incluidas las inactivas, con filtros por zona y estado | Gerente | Pedido del equipo | PROPUESTO (sin construir) | oct. 2026 |
| RF-MES-006 | Zona de mesa: asignarla y filtrar o agrupar por zona (por ejemplo en el Salón) | Gerente, Hostess | Pedido del equipo | PROPUESTO (sin construir) | oct. 2026 |
| RF-ZON-001 | Gestionar zonas (solo si se decide que sean un catálogo) | Gerente | Por decidir (D-1) | PROPUESTO (sin construir) | oct. 2026 |
| RF-AUD-001 | Registrar quién cambia una contraseña, a quién y cuándo (sin guardar la contraseña ni su hash) | Sistema | Pedido del equipo | PROPUESTO (sin construir) | oct. 2026 |
| RF-AUD-002 | Bitácora general de eventos (amplía RNF-017 y RNF-026) | Sistema, Gerente | Hallazgo de la revisión | PROPUESTO (sin construir) | oct. 2026 |
| RF-USR-008 | Que cada usuario cambie su propia contraseña | Todos los roles | Hallazgo de la revisión | PROPUESTO (sin construir) | oct. 2026 |
| RF-CUE-002 | Cerrar cuenta (hoy nada la cierra y la mesa no se puede liberar) | Cajero, Gerente | Hallazgo de la revisión | PROPUESTO (sin construir) | oct. 2026 |
| RF-PED-006 | Registrar quién canceló un pedido y cuándo | Sistema | Hallazgo de la revisión | PROPUESTO (sin construir) | oct. 2026 |

Detalle, decisiones pendientes (D-1 a D-5) y hallazgos P-01 a P-16: `docs/PENDIENTES_Y_FALTANTES.md`.

## 6. Modelo de datos (MySQL, base `SIGR`)

Notación: `*` clave primaria, `→tabla` clave foránea. El esquema completo está en `database/init.sql` (23 tablas, más catálogos y datos base). Las migraciones (`database/migrations/`): `001_ajustes_front` (ajustes para conectar el frontend del mesero), `002_api_idempotencia` (motivo libre de cancelación e idempotencia), `003_existencia_producto` (existencia opcional por producto, `producto.controla_existencia`) y `004_mesas_13_a_18`. Si la base ya existe, no la recrees: corre en orden las migraciones que falten.

```

rol: id_rol*, nombre
usuario: id_usuario*, id_rol→rol, nombre, correo, activo, creado_en
credenciales: id_usuario*→usuario, nombre_usuario, password_hash, ultimo_acceso
perfil_usuario: id_usuario*→usuario, telefono, direccion
cliente: id_cliente*, nombre, telefono, correo
mesa: id_mesa*, numero, capacidad, estado
categoria_menu: id_categoria*, nombre
producto: id_producto*, id_categoria→categoria_menu, nombre, descripcion, precio, disponible, controla_existencia
disponibilidadProducto: id_inventario*, id_producto→producto, existencia, stock_minimo
reservacion: id_reservacion*, id_cliente→cliente, id_mesa→mesa, fecha_hora, personas, estado, llegada_en
lista_espera: id_espera*, id_cliente→cliente, personas, registrado_en, estado
cuenta: id_cuenta*, id_mesa→mesa, abierta_en, cerrada_en, estado, tipo_pago_solicitado
estado_pedido: id_estado*, nombre
motivo_cancelacion: id_motivo*, descripcion
pedido: id_pedido*, id_cuenta→cuenta, id_mesero→usuario, id_estado→estado_pedido, id_motivo→motivo_cancelacion, fecha_hora, observaciones
detalle_pedido: id_detalle*, id_pedido→pedido, id_producto→producto, cantidad, precio_unitario, indicaciones
corte_caja: id_corte*, id_cajero→usuario, inicio, fin, total_reportado
venta: id_venta*, id_cuenta→cuenta, id_corte→corte_caja, id_cajero→usuario, fecha_hora, total
metodo_pago: id_metodo*, nombre
pago: id_pago*, id_venta→venta, id_metodo→metodo_pago, monto, pagado_en, referencia
datos_fiscales: id_datos_fiscales*, id_cliente→cliente, rfc, razon_social, regimen_fiscal, codigo_postal
factura: id_factura*, id_venta→venta, id_datos_fiscales→datos_fiscales, folio, fecha_emision, estado
idempotencia: clave, id_usuario, ruta, estado_http, respuesta, creado_en
```

**Valores permitidos (`CHECK` o catálogo)**

| Campo | Valores |
| --- | --- |
| `mesa.estado` | `libre`, `ocupada`, `reservada` |
| `cuenta.estado` | `abierta`, `por_pagar`, `cerrada` |
| `cuenta.tipo_pago_solicitado` | `fisico`, `digital`, o nulo |
| `estado_pedido.nombre` | `Registrado`, `Pendiente` (usado como «enviado a cocina»), `En preparacion`, `Listo`, `Entregado`, `Cancelado`, `Pagado` |
| `reservacion.estado` | `pendiente` (por defecto), `confirmada`, `cancelada`, `llego` (al registrar la llegada). Es `VARCHAR` sin `CHECK` |
| `lista_espera.estado` | `esperando` (por defecto), `asignada`, `cancelada`. Es `VARCHAR` sin `CHECK` |
| `rol.nombre` | `gerente`, `mesero`, `cocinero`, `cajero`, `hostess` |

Reglas en la BD: `capacidad > 0`, `precio >= 0`, `existencia >= 0`, `stock_minimo >= 0`, `personas > 0`, `cantidad > 0`. Las contraseñas se guardan con `bcryptjs` en `credenciales.password_hash`. Los productos y usuarios **no se borran** (tienen pedidos y ventas ligados): se desactivan.

## 7. API REST (`/api`, JSON, JWT en `Authorization: Bearer <token>`)

Formato de error: `{ "codigo", "mensaje" }`. Códigos: `no_autenticado`, `credenciales_invalidas`, `sin_permiso`, `requiere_gerente`, `no_encontrado`, `estado_invalido` (también para validación zod, HTTP 422), `producto_agotado`, `mesa_no_disponible`, `desconocido`.

| Método y ruta | Roles | Para qué |
| --- | --- | --- |
| `POST /auth/login` | público | Inicia sesión; devuelve JWT (dura 8 h) |
| `GET /auth/me` | cualquiera con sesión | Usuario de la sesión |
| `GET /mesas` | cualquiera con sesión | Mesas con estado y cuenta |
| `GET /mesas/:id/cuenta` | cualquiera con sesión | Cuenta activa con sus pedidos |
| `POST /mesas/:id/asignar` | hostess, gerente | Ocupa la mesa para una reservación, un grupo en espera o un número de personas |
| `PATCH /mesas/:id/estado` | hostess, gerente | Cambia el estado de la mesa |
| `GET /menu` | cualquiera con sesión | Menú para el mesero |
| `POST /productos/disponibilidad` | cualquiera con sesión | Verifica existencia de productos |
| `POST /pedidos` | mesero, gerente | Crea un pedido |
| `GET /pedidos`, `GET /pedidos/:id` | cualquiera con sesión | Lista y detalle (filtro `?estado=`) |
| `PATCH /pedidos/:id` | mesero, gerente | Edita un pedido registrado |
| `POST /pedidos/:id/enviar` | mesero, gerente | Envía a cocina; descuenta existencia y bloquea si no alcanza |
| `POST /pedidos/:id/cancelar` | mesero, gerente | Cancela con motivo |
| `POST /pedidos/:id/entregar` | mesero, gerente | Marca como entregado |
| `PATCH /pedidos/:id/estado` | cocinero, gerente | Cambia el estado de preparación |
| `POST /cuentas/:id/solicitar-pago` | mesero, gerente | Pasa la cuenta a `por_pagar` (pago físico o digital) |
| `GET /clientes`, `POST /clientes` | hostess, gerente | Buscar y registrar clientes (teléfono único) |
| `GET /reservaciones?fecha=` | hostess, gerente | Reservaciones del día |
| `POST /reservaciones` | hostess, gerente | Crea una reservación |
| `PATCH /reservaciones/:id` | hostess, gerente | Confirma, cancela o cambia fecha, personas o mesa |
| `POST /reservaciones/:id/llegada` | hostess, gerente | Registra la llegada |
| `GET /lista-espera?estado=`, `POST /lista-espera` | hostess, gerente | Consulta y agrega grupos |
| `PATCH /lista-espera/:id` | hostess, gerente | **PROPUESTO, no implementado** |
| `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/contrasena` | gerente | Administración de usuarios |
| `GET/POST /catalogo/categorias`, `PATCH/DELETE /catalogo/categorias/:id` | gerente | Categorías del menú |
| `GET/POST /catalogo/productos`, `PATCH /catalogo/productos/:id` | gerente | Productos e inventario |

Las rutas de crear, enviar, cancelar, entregar, solicitar pago, asignar mesa y reservaciones aceptan la cabecera `Idempotency-Key`: una clave es una intención del usuario; si se reintenta con la misma clave, el servidor devuelve la respuesta guardada sin repetir la acción (usa un candado `GET_LOCK` de MySQL).

## 8. Convenciones que no hay que romper

- **JSON en snake_case con el nombre exacto de la columna** (`id_mesa`, `fecha_hora`, `precio_unitario`). Lo que no es columna está marcado como «calculado» en `docs/equivalencias-bd.md` (estado y total del pedido, `mesa_numero`, `nombre_producto`…).
- **El total del pedido lo calcula siempre el servidor.**
- **Estados:** el frontend los normaliza a código (`En preparacion` pasa a `en_preparacion`: minúsculas, sin acentos, guion bajo). `frontend/src/types/estados.ts` es la fuente de verdad. `pendiente` se trata igual que `enviado`.
- **Fechas:** `DATETIME` sin zona horaria, texto `AAAA-MM-DD HH:MM:SS`, hora local. **Dinero:** `DECIMAL`, llega como número (`decimalNumbers: true`).
- **Dos modos del frontend:** `VITE_USE_MOCK=true` (sin backend, con franja «Modo demo») y `false` (API real). `services/mock/` y `services/api/` implementan las mismas interfaces. `npm run dev` usa la API y `npm run dev:demo` usa el mock.
- **Actualización automática** por consulta periódica (`VITE_POLL_MS`, 10 s por defecto, mínimo 1 s).
- **Accesibilidad:** foco al cambiar de pantalla, enlace «Saltar al contenido», contraste revisado con `npm run contraste`.
- **Validación:** todas las peticiones con zod en el backend; un `ErrorApi` lanzado en una ruta llega al manejador global.

## 9. Cómo correrlo

```powershell
# Base de datos (base nueva; elige una opción)
docker compose -f database/docker-compose.yml up -d      # opción 1: MySQL en Docker (root: sigr1234)
mysql -u root -p -e "source database/init.sql"           # opción 2: MySQL ya instalado

# Backend (puerto 3000)
cd backend
npm install
Copy-Item .env.example .env     # edita DB_PASSWORD y JWT_SECRET
npx tsx src/utils/seed.ts       # crea los usuarios de prueba
npm run dev

# Frontend (puerto 5173), en otra terminal
cd frontend
npm install
Copy-Item .env.example .env.local   # pon VITE_USE_MOCK=false para usar el backend
npm run dev
```

Variables: `backend/.env` con `PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` y opcional `CORS_ORIGIN`; `frontend/.env.local` con `VITE_USE_MOCK` y `VITE_API_URL=http://localhost:3000/api`.

Antes de entregar: `npm run build` y `npm test` en `backend/`, y `npm run check` en `frontend/` (tipos, pruebas y build).

## 10. Flujo de trabajo con Git

`main` siempre compila y pasa las pruebas. Cada cambio va en una rama (`feature/cocina`, `fix/login`…) y entra por Pull Request. Cambios en la BD: nueva `migrations/00N_*.sql` y `init.sql` actualizado en el mismo PR. Nunca se suben `.env`, `.env.local` ni `node_modules`.

## 11. Pendientes (en el orden más útil)

1. **Pantalla de cocina** (RF-PED-003, RF-PED-004): la API ya existe.
2. **Caja** (RF-VEN-001 a 004): cobro, pagos divididos, corte, historial y reporte de ventas. El esquema ya existe; faltan API y pantalla.
3. **Facturación** (RF-VEN-002): el esquema ya existe.
4. **Historial de pedidos** (RF-PED-005) y **actualizar o eliminar clientes** (RF-CLI-002 y 003).
5. **`PATCH /api/lista-espera/:id`** para quitar o editar grupos en espera.
6. **Seguridad del ERS sin cubrir:** bloqueo tras 5 intentos (RNF-009), expiración por inactividad (RNF-011), invalidar la sesión al salir (RNF-012), registro de accesos no autorizados (RNF-017) y bitácora de eventos (RNF-026).
7. Medir los tiempos de respuesta (RNF-001) y decidir si hace falta tiempo real (RNF-025).
8. Decidir qué pasa con el borrado de clientes y actualizar el ERS con los requisitos de la sección 5.2.
9. **Mesas del gerente** (RF-MES-002 a 006): registrar, editar, activar o desactivar y zona de mesa. Hoy las mesas solo se crean con SQL. Falta decidir si la zona es texto libre o catálogo.
10. **Auditoría** (RF-AUD-001 y 002): quién cambia una contraseña, a quién y cuándo. Un trigger de MySQL no conoce al usuario del sistema; la API tendría que pasarle su id. Opciones y recomendación en `docs/PENDIENTES_Y_FALTANTES.md`.
11. **Cerrar cuentas** (RF-CUE-002): hoy nada cierra una cuenta, así que una mesa con pedidos no se puede liberar desde el sistema.
12. Cambio de contraseña propio (RF-USR-008), quién canceló un pedido (RF-PED-006) y las reglas del dominio sin aplicar (tolerancia de reservas, capacidad, regla 11).
13. Pruebas de las rutas del backend contra una base de datos (hoy solo hay 26 pruebas de funciones puras y mocks) y protecciones básicas de la API (límite de intentos, cabeceras de seguridad).

## 12. Glosario

- **ERS:** Especificación de Requisitos de Software. **RF / RNF:** requisito funcional / no funcional.
- **Mock:** datos simulados en memoria para trabajar el frontend sin backend.
- **Idempotencia:** repetir una petición con la misma clave no repite la acción.
- **Pedido:** lo que pide una mesa en un momento; **cuenta:** agrupa los pedidos de una mesa hasta que se paga; **venta:** el cobro de una cuenta.
- **Salón:** la vista de la hostess con el estado de las mesas. **Corte de caja:** cierre de las ventas de un cajero en un periodo.

## 13. Plantilla para pedirle ayuda a la IA

```
Contexto: te adjunto CONTEXTO_IA.md del proyecto SIGR.
Quiero: <qué necesitas, por ejemplo "la pantalla de cocina (RF-PED-003 y RF-PED-004)">.
Archivos relacionados: <rutas, por ejemplo backend/src/controllers/pedidos.ts>.
Entrégamelo: completo y listo para pegar, en español, con comandos para PowerShell.
Si algo no está en el contexto, pregúntame antes de suponerlo.
```

## 14. Recetas con código: cómo se hace en SIGR

Esta sección existe para que una IA (o una persona nueva) pueda explicar y repetir los patrones del proyecto **sin tener el código completo**. Todos los fragmentos son **copias reales** del repositorio (a veces recortadas). Si algo cambia en el código, hay que actualizar aquí también (ver sección 15).

### 14.1 Dónde va cada cosa

| Quiero… | Lo pongo en… |
| --- | --- |
| Una ruta nueva de la API | `backend/src/routes/<recurso>.ts` (solo la ruta, el permiso y el controlador) y se monta en `backend/src/index.ts` |
| La lógica de esa ruta (validar, reglas, SQL, respuesta) | `backend/src/controllers/<recurso>.ts` |
| Una consulta o regla que usan varios controladores | `backend/src/models/dominio.ts` |
| Algo de conexión, transacciones o idempotencia | `backend/src/services/` |
| Configuración, errores, permisos o un script auxiliar | `backend/src/utils/` |
| Datos falsos para probar la API | `backend/src/mocks/<recurso>.mock.ts` |
| Una prueba del backend | `backend/tests/<tema>.test.ts` |
| Una tabla o columna nueva | `database/migrations/00N_<nombre>.sql` **y** `database/init.sql` |
| Una pantalla nueva | `frontend/src/views/<rol>/` más su ruta en `frontend/src/router/index.ts` |
| Un componente reutilizable | `frontend/src/components/` |
| Una llamada nueva a la API | interfaz en `services/interfaces.ts`, versión real en `services/api/`, versión simulada en `services/mock/` |
| Estado compartido entre pantallas | `frontend/src/stores/` |
| Datos falsos del modo demo | `frontend/src/mocks/*.json` |

### 14.2 Backend: una ruta y su controlador

La **ruta** solo enlaza el camino con el permiso y el controlador (`backend/src/routes/usuarios.ts`):

```ts
import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarUsuarios, crearUsuario, editarUsuario, cambiarContrasena } from "../controllers/usuarios";

export const usuariosRouter = Router();

usuariosRouter.use(requiereAuth("gerente"));

usuariosRouter.get("/", listarUsuarios);
usuariosRouter.post("/", crearUsuario);
usuariosRouter.patch("/:id", editarUsuario);
usuariosRouter.post("/:id/contrasena", cambiarContrasena);
```

El **controlador** hace el trabajo (`backend/src/controllers/usuarios.ts`):

```ts
export const listarUsuarios = async (_req: Request, res: Response) => {
  const rows = await filas(pool, `${SELECT_USUARIO} ORDER BY u.activo DESC, u.nombre`);
  res.json(rows.map(aDto));
};
```

Después se monta en `backend/src/index.ts` con `app.use("/api/usuarios", usuariosRouter);`. Los controladores tienen la forma `async (req: Request, res: Response)`; en Express 5 un error lanzado dentro llega solo al manejador global.

### 14.3 Validar con zod, calcular el hash y guardar en una transacción

El esquema describe la entrada; `validar(...)` lanza un error 422 si no cumple; `transaccion(...)` guarda todo o nada (`backend/src/controllers/usuarios.ts`):

```ts
const Crear = z.object({
  nombre: Texto(100),
  correo: Correo,
  nombre_usuario: NombreUsuario,
  contrasena: Contrasena,
  rol: Rol,
  telefono: z.string().trim().max(20).optional(),
});

export const crearUsuario = async (req: Request, res: Response) => {
  const d = validar(Crear, req.body);
  const hash = await bcrypt.hash(d.contrasena, 10);

  const id = await transaccion(async (cx) => {
    const [existe] = await filas(cx, "SELECT 1 AS x FROM credenciales WHERE nombre_usuario = ?", [d.nombre_usuario]);
    if (existe) throw new ErrorApi(409, "estado_invalido", "Ya existe otro usuario con ese nombre de usuario.");
    try {
      const u = await ejecutar(cx, "INSERT INTO usuario (id_rol, nombre, correo) VALUES (?, ?, ?)", [
        await idRol(cx, d.rol),
        d.nombre,
        d.correo,
      ]);
      await ejecutar(cx, "INSERT INTO credenciales (id_usuario, nombre_usuario, password_hash) VALUES (?, ?, ?)", [
        u.insertId,
        d.nombre_usuario,
        hash,
      ]);
      await ejecutar(cx, "INSERT INTO perfil_usuario (id_usuario, telefono) VALUES (?, ?)", [
        u.insertId,
        d.telefono || null,
      ]);
      return u.insertId;
    } catch (e) {
      return traducirDuplicado(e);
    }
  });

  res.status(201).json(await cargarUsuario(pool, id));
};
```

### 14.4 Transacción con bloqueo de filas (`FOR UPDATE`)

Para que dos personas no cambien lo mismo a la vez: se bloquea la fila, se comprueba el estado y se actúa (`backend/src/controllers/pedidos.ts`):

```ts
export const enviarPedido = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);

  await conIdempotencia(req, res, 200, () =>
    transaccion(async (cx) => {
      const { estado } = await bloquearPedido(cx, id);
      if (estado !== "registrado") {
        throw new ErrorApi(409, "estado_invalido", "Solo se puede enviar un pedido registrado.");
      }
      // Un producto pudo agotarse entre el registro y el envío: se bloquea el inventario, se verifica que
      // alcance y se descuenta. Si no alcanza, lanza 409 y la transacción se deshace (nada se descuenta).
      const detalle = await filas(cx, "SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = ?", [id]);
      await verificarExistencia(
        cx,
        detalle.map((d) => ({ id_producto: d.id_producto as number, cantidad: d.cantidad as number })),
        true,
      );

      await ejecutar(cx, "UPDATE pedido SET id_estado = ? WHERE id_pedido = ?", [await idEstadoPedido(cx, "enviado"), id]);
      return pedidoOError(cx, id);
    }),
  );
};
```

### 14.5 Idempotencia: que reintentar no duplique

Se envuelve la acción en `conIdempotencia(...)`. Si llega la misma cabecera `Idempotency-Key`, se devuelve la respuesta guardada (`backend/src/controllers/cuentas.ts`):

```ts
export const solicitarPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { tipo } = validar(SolicitudPago, req.body);

  await conIdempotencia(req, res, 200, async () => {
    const [cuenta] = await filas(pool, "SELECT estado FROM cuenta WHERE id_cuenta = ?", [id]);
    if (!cuenta) throw new ErrorApi(404, "no_encontrado", `La cuenta ${id} no existe.`);
    if (cuenta.estado !== "abierta") throw new ErrorApi(409, "estado_invalido", "La cuenta no está abierta.");

    // Sin pedidos vigentes (todos cancelados o ninguno) no hay nada que cobrar.
    const actual = await cargarCuenta(pool, id);
    if (!actual || actual.total === 0) {
      throw new ErrorApi(409, "estado_invalido", "La cuenta no tiene pedidos activos.");
    }

    // `AND estado = 'abierta'` evita que dos peticiones simultáneas la soliciten dos veces.
    const r = await ejecutar(
      pool,
      "UPDATE cuenta SET estado = 'por_pagar', tipo_pago_solicitado = ? WHERE id_cuenta = ? AND estado = 'abierta'",
      [tipo, id],
    );
    if (r.affectedRows === 0) throw new ErrorApi(409, "estado_invalido", "La cuenta no está abierta.");

    return cargarCuenta(pool, id);
  });
};
```

### 14.6 Iniciar sesión (JWT) y proteger por rol

El login compara el hash con bcrypt y firma un token (`backend/src/controllers/auth.ts`):

```ts
export const iniciarSesion = async (req: Request, res: Response) => {
  const { usuario, contrasena } = validar(Login, req.body ?? {});

  const [fila] = await filas(
    pool,
    `SELECT ${SELECT_PERFIL}, c.password_hash
       FROM credenciales c
       JOIN usuario u ON u.id_usuario = c.id_usuario
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE c.nombre_usuario = ? AND u.activo = TRUE`,
    [usuario],
  );

  if (!fila || !(await bcrypt.compare(contrasena, fila.password_hash as string))) {
    throw new ErrorApi(401, "credenciales_invalidas", "Usuario o contraseña incorrectos.");
  }

  await ejecutar(pool, "UPDATE credenciales SET ultimo_acceso = NOW() WHERE id_usuario = ?", [fila.id_usuario]);

  // En la BD el rol es "Mesero"; dentro del token (uso interno de la API) se guarda en minúsculas.
  const rol = (fila.rol as string).toLowerCase() as Rol;
  const token = jwt.sign({ id: fila.id_usuario as number, rol }, JWT_SECRET, { expiresIn: "8h" });

  res.json({ token, usuario: aPerfil(fila) });
};
```

El permiso se pide en la ruta con `requiereAuth(...roles)` (`backend/src/utils/auth.ts`):

```ts
export function requiereAuth(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    const cabecera = req.headers.authorization;
    if (!cabecera?.startsWith("Bearer ")) {
      throw new ErrorApi(401, "no_autenticado", "Debes iniciar sesión.");
    }

    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(cabecera.slice(7), JWT_SECRET);
    } catch {
      throw new ErrorApi(401, "no_autenticado", "La sesión no es válida o ya venció.");
    }
    if (typeof payload === "string" || typeof payload.id !== "number" || typeof payload.rol !== "string") {
      throw new ErrorApi(401, "no_autenticado", "La sesión no es válida.");
    }

    const rol = payload.rol as Rol;
    if (roles.length > 0 && !roles.includes(rol)) {
      throw new ErrorApi(403, "sin_permiso", "Tu rol no tiene permiso para esta acción.");
    }
    req.usuario = { id: payload.id, rol };
    next();
  };
}
```

Uso en una ruta: `usuariosRouter.use(requiereAuth("gerente"))` (todo el archivo, solo gerente) o `pedidosRouter.post("/", requiereAuth("mesero", "gerente"), crearPedido)` (solo esa ruta).

### 14.7 Base de datos: una migración

Se crea `database/migrations/00N_<nombre>.sql` para las bases que ya existen y **el mismo cambio** se aplica a `database/init.sql` para las nuevas. Ejemplo real (`003_existencia_producto.sql`):

```sql
-- MIGRACIÓN 03: no todos los productos controlan existencia.
-- Lo que se prepara al momento (platos, guisados, aguas frescas) no tiene "existencia" que contar: el mesero
-- puede pedir cualquier cantidad. Lo que viene hecho o embotellado (refrescos, cerveza, postres de vitrina)
-- sí la controla, y el mesero no puede agregar más de lo que hay.
-- Ejecutar UNA SOLA VEZ sobre una base que ya tiene las migraciones 01 y 02:
--   mysql --default-character-set=utf8mb4 -u root -p -e "source E:/gitPrubs/SIGR/database/migrations/003_existencia_producto.sql"
-- (Si recreas la BD desde el init.sql nuevo, NO la ejecutes: ya incluye todo esto.)
USE SIGR;

-- 1) Por defecto TODOS los productos siguen controlando existencia (el comportamiento de antes).
ALTER TABLE producto ADD COLUMN controla_existencia BOOLEAN NOT NULL DEFAULT TRUE AFTER disponible;

-- 2) Entradas, platos fuertes y la horchata se preparan al momento: dejan de controlar existencia.
--    Ajusta esta lista a tu menú, o cámbialo después producto por producto desde Gerente > Productos.
UPDATE producto
   SET controla_existencia = FALSE
 WHERE id_categoria IN (SELECT id_categoria FROM categoria_menu WHERE nombre IN ('Entradas', 'Platos fuertes'))
    OR nombre = 'Agua de horchata';

SELECT id_producto, nombre, disponible, controla_existencia FROM producto ORDER BY id_producto;
```

### 14.8 Mocks y pruebas del backend

Un mock es un arreglo tipado con datos falsos (`backend/src/mocks/productos.mock.ts`):

```ts
/**
 * Datos falsos del menú para probar la API sin tocar la base de datos real.
 * Salen de `database/init.sql` (las 4 categorías y los 8 productos). NO se usan en producción.
 */
export interface CategoriaMock {
  id_categoria: number;
  nombre: string;
}

export interface ProductoMock {
  id_producto: number;
  id_categoria: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  /** `false` = se prepara al momento (no hay existencia que contar). */
  controla_existencia: boolean;
  existencia: number;
  stock_minimo: number;
}

export const categoriasMock: CategoriaMock[] = [
  { id_categoria: 1, nombre: "Entradas" },
  { id_categoria: 2, nombre: "Platos fuertes" },
  { id_categoria: 3, nombre: "Postres" },
  { id_categoria: 4, nombre: "Bebidas" },
];

export const productosMock: ProductoMock[] = [
  { id_producto: 1, id_categoria: 1, nombre: "Guacamole", descripcion: "Con totopos", precio: 85, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 2, id_categoria: 1, nombre: "Sopa de tortilla", descripcion: null, precio: 70, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 3, id_categoria: 2, nombre: "Tacos de arrachera", descripcion: "Orden de 4", precio: 140, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 4, id_categoria: 2, nombre: "Enchiladas verdes", descripcion: "Con pollo", precio: 120, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  // ... 8 productos en total (ver el archivo)
];
```

Una prueba con Vitest (`backend/tests/dominio.test.ts`). Se ejecuta con `npm test` dentro de `backend/`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ESTADO_PEDIDO_DB,
  ESTADOS_PEDIDO,
  idDeRuta,
  nombreEstadoDeFiltro,
  normalizarCodigo,
  validar,
} from "../src/models/dominio";
import { ErrorApi } from "../src/utils/errores";

/** Ejecuta `fn`, espera que lance un ErrorApi y lo devuelve para revisar su estado y código. */
function errorDe(fn: () => unknown): ErrorApi {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorApi);
    return e as ErrorApi;
  }
  throw new Error("Se esperaba que lanzara un ErrorApi");
}

describe("normalizarCodigo", () => {
  it("quita acentos, pasa a minúsculas y usa guion bajo", () => {
    expect(normalizarCodigo("En preparación")).toBe("en_preparacion");
    expect(normalizarCodigo("EN PREPARACION")).toBe("en_preparacion");
    expect(normalizarCodigo("en-preparacion")).toBe("en_preparacion");
  });

  it("recorta los espacios de los extremos", () => {
    expect(normalizarCodigo("  Listo  ")).toBe("listo");
  });
});

describe("estados del pedido", () => {
  it("tiene los 7 estados del catálogo", () => {
    expect(ESTADOS_PEDIDO).toHaveLength(7);
    expect(ESTADOS_PEDIDO).toContain("registrado");
    expect(ESTADOS_PEDIDO).toContain("pagado");
  });

  it("«enviado» se guarda como «Pendiente» en la base de datos", () => {
    expect(ESTADO_PEDIDO_DB.enviado).toBe("Pendiente");
  });
});

describe("nombreEstadoDeFiltro", () => {
  it("acepta el código interno", () => {
    expect(nombreEstadoDeFiltro("enviado")).toBe("Pendiente");
    expect(nombreEstadoDeFiltro("en_preparacion")).toBe("En preparacion");
  });

  it("acepta el nombre del catálogo, con o sin acento y en cualquier caso", () => {
    expect(nombreEstadoDeFiltro("En preparacion")).toBe("En preparacion");
    expect(nombreEstadoDeFiltro("EN PREPARACIÓN")).toBe("En preparacion");
    expect(nombreEstadoDeFiltro("pendiente")).toBe("Pendiente");
    expect(nombreEstadoDeFiltro("Listo")).toBe("Listo");
  });

  it("devuelve null si el estado no existe", () => {
    expect(nombreEstadoDeFiltro("volando")).toBeNull();
    expect(nombreEstadoDeFiltro("")).toBeNull();
  });
});
```

### 14.9 Frontend: un servicio con interfaz, versión API y versión mock

Las pantallas nunca llaman a `fetch` directamente: usan `servicios.<área>.<método>()`. La **interfaz** define el contrato (`frontend/src/services/interfaces.ts`):

```ts
export interface UsuariosService {
  /** GET /usuarios (activos e inactivos) */
  listar(): Promise<UsuarioAdmin[]>
  /** POST /usuarios. Falla con `estado_invalido` si el usuario o el correo ya existen. */
  crear(usuario: NuevoUsuario): Promise<UsuarioAdmin>
  /** PATCH /usuarios/{id}. Desactivar = `{ activo: false }` (los usuarios no se borran). */
  actualizar(id: number, cambio: CambioUsuario): Promise<UsuarioAdmin>
  /** POST /usuarios/{id}/contrasena */
  cambiarContrasena(id: number, contrasena: string): Promise<void>
}
```

La **versión real** llama a la API (`frontend/src/services/api/index.ts`):

```ts
    usuarios: {
      async listar() {
        const r = await solicitar<UsuarioAdminDto[]>('GET', '/usuarios')
        return r.map(aUsuarioAdmin)
      },

      async crear(usuario) {
        return aUsuarioAdmin(await solicitar<UsuarioAdminDto>('POST', '/usuarios', { cuerpo: deNuevoUsuario(usuario) }))
      },

      async actualizar(id, cambio) {
        const cuerpo = deCambioUsuario(cambio)
        return aUsuarioAdmin(await solicitar<UsuarioAdminDto>('PATCH', `/usuarios/${id}`, { cuerpo }))
      },

      async cambiarContrasena(id, contrasena) {
        await solicitar<{ ok: boolean }>('POST', `/usuarios/${id}/contrasena`, { cuerpo: { contrasena } })
      },
    },
```

La **versión simulada** trabaja en memoria (`frontend/src/services/mock/adminMock.ts`):

```ts
export function crearUsuariosMock(): UsuariosService {
  return {
    listar() {
      return conRetraso(() => baseDatos.usuarios.map((u) => aAdmin(u.idUsuario)).sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)))
    },

    crear(n) {
      return conRetraso(() => {
        if (baseDatos.usuarios.some((u) => u.nombreUsuario.toLowerCase() === n.nombreUsuario.trim().toLowerCase())) throw duplicado('nombre de usuario')
        if (baseDatos.usuarios.some((u) => datosExtra(u.idUsuario, u.nombreUsuario).correo.toLowerCase() === n.correo.trim().toLowerCase())) throw duplicado('correo')
        const id = Math.max(0, ...baseDatos.usuarios.map((u) => u.idUsuario)) + 1
        baseDatos.usuarios.push({
          idUsuario: id,
          idRol: ROL_ID[n.rol],
          nombre: n.nombre.trim(),
          correo: n.correo.trim(),
          rol: n.rol,
          nombreUsuario: n.nombreUsuario.trim(),
          contrasena: n.contrasena,
          activo: true,
        })
        extra.set(id, { correo: n.correo.trim(), telefono: n.telefono?.trim() || null, creadoEn: new Date(), ultimoAcceso: null })
        return aAdmin(id)
      })
    },

    // ... actualizar(), cambiarContrasena() y desactivar siguen el mismo patrón
  }
}
```

Y un solo archivo elige cuál usar según `VITE_USE_MOCK` (`frontend/src/services/index.ts`):

```ts
// Único punto donde se elige la implementación de los servicios.
// VITE_USE_MOCK=false usa la API real; cualquier otro valor (o ausente) usa el mock.
import { crearServiciosApi } from './api'
import type { Servicios } from './interfaces'

export type { Servicios } from './interfaces'
export { ErrorServicio } from './errores'
export type { CodigoError } from './errores'

export const usandoMock: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

// El mock se importa de forma dinámica: con VITE_USE_MOCK=false (npm run build:api) esa rama queda
// descartada al compilar y los datos de demostración (usuarios, contraseña de prueba) no viajan en el build.
export const servicios: Servicios = usandoMock
  ? (await import('./mock')).crearServiciosMock()
  : crearServiciosApi()
```

### 14.10 Frontend: un store de Pinia

Estado compartido: la sesión y los permisos (`frontend/src/stores/sesion.ts`):

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { servicios } from '../services'
import type { Credenciales, Usuario } from '../types'

export const useSesionStore = defineStore('sesion', () => {
  const usuario = ref<Usuario | null>(null)
  /** `true` cuando ya se intentó recuperar la sesión existente (GET /auth/me). */
  const restaurada = ref(false)

  const rol = computed(() => usuario.value?.rol ?? null)

  /** Recupera la sesión al cargar la app; un fallo de red se trata como "sin sesión". */
  async function restaurar(): Promise<void> {
    try {
      usuario.value = await servicios.auth.obtenerSesion()
    } catch {
      usuario.value = null
    } finally {
      restaurada.value = true
    }
  }

  async function iniciarSesion(credenciales: Credenciales): Promise<void> {
    usuario.value = await servicios.auth.iniciarSesion(credenciales)
    restaurada.value = true
  }

  async function cerrarSesion(): Promise<void> {
    try {
      await servicios.auth.cerrarSesion()
    } finally {
      // Aunque la API falle, la interfaz queda sin sesión.
      usuario.value = null
    }
  }

  return { usuario, rol, restaurada, restaurar, iniciarSesion, cerrarSesion }
})
```

### 14.11 Frontend: una vista que usa el servicio

La pantalla de usuarios del gerente carga datos al montarse y los muestra (`frontend/src/views/gerente/UsuariosView.vue`, parte del script):

```vue
<script setup lang="ts">
// Usuarios (/gerente/usuarios): consultar, crear, editar, cambiar contraseña y desactivar/reactivar.
// Los usuarios no se borran (tienen pedidos y ventas ligados): se desactivan y dejan de poder entrar.
import { computed, onMounted, ref } from 'vue'
import ConfirmarAccionDialog from '../../components/ConfirmarAccionDialog.vue'
import ContrasenaUsuarioDialog from '../../components/ContrasenaUsuarioDialog.vue'
import FormularioUsuarioDialog from '../../components/FormularioUsuarioDialog.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { ErrorServicio, servicios } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useSesionStore } from '../../stores/sesion'
import { ETIQUETA_ROL, type Rol, type UsuarioAdmin } from '../../types'

const sesion = useSesionStore()
const anuncios = useAnunciosStore()

const usuarios = ref<UsuarioAdmin[]>([])
const cargando = ref(true)
const error = ref('')

type Filtro = 'todos' | 'activos' | 'inactivos'
const filtro = ref<Filtro>('activos')
const rolFiltro = ref<Rol | 'todos'>('todos')
const busqueda = ref('')

const lista = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return usuarios.value.filter((u) => {
    if (filtro.value === 'activos' && !u.activo) return false
    if (filtro.value === 'inactivos' && u.activo) return false
    if (rolFiltro.value !== 'todos' && u.rol !== rolFiltro.value) return false
    if (q && !`${u.nombre} ${u.nombreUsuario} ${u.correo}`.toLowerCase().includes(q)) return false
    return true
  })
})

const cuenta = computed(() => ({
  todos: usuarios.value.length,
  activos: usuarios.value.filter((u) => u.activo).length,
  inactivos: usuarios.value.filter((u) => !u.activo).length,
}))

async function cargar(conEsqueleto = false) {
  if (conEsqueleto) cargando.value = true
  try {
    usuarios.value = await servicios.usuarios.listar()
    error.value = ''
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar los usuarios.'
  } finally {
    cargando.value = false
  }
}

onMounted(() => void cargar(true))

// ---------- Crear / editar ----------
const formAbierto = ref(false)
const usuarioEnEdicion = ref<UsuarioAdmin | null>(null)
const origenForm = ref<HTMLElement | null>(null)

function abrirNuevo(e: Event) {
  usuarioEnEdicion.value = null
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

function abrirEdicion(u: UsuarioAdmin, e: Event) {
  usuarioEnEdicion.value = u
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

async function alGuardar(u: UsuarioAdmin, creado: boolean) {
  formAbierto.value = false
```

### 14.12 Frontend: rutas protegidas por rol

Cada grupo de rutas declara qué roles entran y una guarda global lo hace cumplir (`frontend/src/router/index.ts`):

```ts
      path: '/gerente',
      component: GerenteLayout,
      meta: { roles: ['gerente'] },
      redirect: '/gerente/usuarios',
      children: [
        {
          path: 'usuarios',
          name: 'gerente-usuarios',
          component: () => import('../views/gerente/UsuariosView.vue'),
        },
        {
          path: 'productos',
          name: 'gerente-productos',
          component: () => import('../views/gerente/ProductosView.vue'),
        },
      ],
    },
    {
      path: '/hostess',
...
router.beforeEach(async (to) => {
  if (to.name === 'inicio') {
    const sesion = useSesionStore()
    if (!sesion.restaurada) await sesion.restaurar()
    return sesion.usuario ? rutaInicial(sesion.usuario.rol) : { name: 'login' }
  }

  const roles = to.matched.find((r) => r.meta.roles)?.meta.roles
  if (!roles) return true

  const sesion = useSesionStore()
  if (!sesion.restaurada) await sesion.restaurar()

  if (!sesion.usuario) {
    return { name: 'login', query: { redirigir: to.fullPath } }
  }
  // Un rol que la API envía y no se reconoce (`null`) tampoco entra.
  if (!sesion.usuario.rol || !roles.includes(sesion.usuario.rol)) {
    return { name: 'login', query: { motivo: 'rol' } }
  }
  return true
})
```

> La guarda del router solo mejora la experiencia: la seguridad real está en el backend (`requiereAuth`).

### 14.13 Receta completa: agregar un recurso nuevo de punta a punta

Ejemplo: «administrar mesas» (pendiente RF-MES-002 a 006). El orden que se sigue siempre:

1. **Requisito:** escribirlo en `README.md` y en la sección 5.7 de este archivo con su código `RF-…`.
2. **Base de datos:** `database/migrations/00N_*.sql` y el mismo cambio en `database/init.sql`.
3. **Modelo:** si hay consultas o reglas compartidas, en `backend/src/models/dominio.ts`.
4. **Controlador:** `backend/src/controllers/<recurso>.ts` con esquemas zod (`validar`), reglas, SQL con `?` y respuesta JSON con los nombres de columna.
5. **Ruta:** `backend/src/routes/<recurso>.ts` con `requiereAuth(...)`, y montarla en `backend/src/index.ts`.
6. **Mock y pruebas del backend:** `backend/src/mocks/` y `backend/tests/`.
7. **Frontend, servicio:** método en `services/interfaces.ts`, versión real en `services/api/`, versión simulada en `services/mock/`, y datos en `src/mocks/*.json` si hacen falta.
8. **Frontend, pantalla:** vista en `views/<rol>/`, su ruta con `meta.roles` y su entrada en el menú del layout.
9. **Pruebas del frontend** de lo que tenga lógica (`*.test.ts`).
10. **Documentación:** contratos en `docs/`, `docs/equivalencias-bd.md`, el README y este archivo (secciones 5, 7 y 16).
11. **Verificar:** `npm run build` y `npm test` en `backend/`; `npm run check` en `frontend/`.

### 14.14 Comandos de verificación

```powershell
cd backend;  npm run build; npm test
cd ../frontend; npm run check
```

## 15. Protocolo para IAs: guardar y actualizar el contexto

**Objetivo:** que este archivo sea la única memoria del proyecto. No hace falta pasar el `.zip`: basta pegar este `.md` y, si se necesita un archivo concreto, solo ese archivo.

**Al empezar una conversación nueva, pegar este mensaje:**

```
Lee CONTEXTO_IA.md completo. Es la memoria del proyecto SIGR.
Reglas: responde en español; no inventes nada que no esté en el archivo (pregunta);
mantén la estructura de carpetas de la sección 3; usa los códigos RF/RNF.
Hoy quiero: <tarea>.
Al terminar, dame el BLOQUE DE ACTUALIZACIÓN de la sección 15.
```

**Qué debe hacer la IA durante la conversación**

1. Si la tarea crea, mueve o borra archivos, decir en qué carpeta va cada uno según la sección 3.
2. Si descubre o inventa un requerimiento, darle un código `RF-XXX-NNN` o `RNF-NNN` y marcarlo **propuesto**.
3. No escribir contraseñas, tokens ni el contenido de `.env`. Los usuarios de prueba (`1234`) son solo para desarrollo.
4. Si algo de este archivo contradice el código que se le muestra, decirlo y proponer la corrección.

**Al terminar, la IA entrega un BLOQUE DE ACTUALIZACIÓN con este formato (se pega en la sección 16):**

```
### AAAA-MM-DD · <título corto>
- Qué se hizo: <1 a 3 líneas>
- Archivos nuevos o cambiados: <rutas>
- Decisiones tomadas: <decisión y motivo>
- Requerimientos nuevos o cambiados: <código y texto> (o «ninguno»)
- Pendiente o por verificar: <lista> (o «ninguno»)
- Secciones de este archivo que hay que actualizar: <números> (o «ninguna»)
```

**Quién lo aplica:** una persona del equipo pega el bloque en la sección 16 y actualiza las secciones indicadas. Así el archivo no se desfasa del código.

## 16. Registro de cambios y decisiones

Más reciente primero. Cada IA agrega aquí su bloque de actualización.

### 2026-10 · Reorganización a la estructura acordada
- Qué se hizo: el proyecto se reorganizó a la estructura de la sección 3. El backend separa rutas, controladores, modelos y servicios; se agregaron mocks y pruebas del backend; la base de datos pasó a `init.sql` y `migrations/`; se agregó `docker-compose.yml`; los mocks del frontend pasaron a JSON y `main.ts` quedó en la raíz del frontend.
- Archivos movidos: `db.ts` e `idempotencia.ts` a `services/`; `config.ts`, `errores.ts`, `middlewares/auth.ts` (ahora `utils/auth.ts`) y `seed.ts` a `utils/`; `dominio.ts` a `models/`; `routes/hostess.ts` se dividió en `routes/clientes.ts`, `routes/reservaciones.ts` y `routes/listaEspera.ts` con la lógica en `controllers/hostess.ts`; `schema.sql` y `seed.sql` se unieron en `init.sql`; las migraciones se renombraron `001` a `004`.
- Decisiones tomadas: las carpetas extra del frontend (`types`, `layouts`, `composables`, `styles`) se conservan porque el código depende de ellas; `docker-compose.yml` no se probó en el entorno de trabajo.
- Verificación: el backend compila (`npm run build`), pasan sus 26 pruebas y las rutas responden; el frontend pasa `vue-tsc`, sus 427 pruebas y el build.
- Pendiente: las referencias de línea de `docs/guia-codigo/` son de la versión anterior (ver el mapa en su índice).

### 2026-10 · Requerimientos propuestos y hallazgos
- Qué se hizo: se documentaron los faltantes en `docs/PENDIENTES_Y_FALTANTES.md` (mesas del gerente, zona de mesa, auditoría de contraseñas, cerrar cuentas, seguridad del ERS).
- Decisiones pendientes: D-1 a D-5 de ese documento y la opción de auditoría (A, B o C).

