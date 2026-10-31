<div align="center">

# SIGR

**Sistema de gestión para restaurantes**
*Del pedido en la mesa a la cuenta, en un solo lugar.*

![Vue](https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Pinia](https://img.shields.io/badge/Pinia-state-F7D336?style=flat-square&logo=pinia&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)

</div>

> 🚧 **Estado del repositorio:** cocina ya tiene pantalla para recibir pedidos y avanzar su preparación. En la API de hostess solo falta `PATCH /api/lista-espera/:id` para editar la lista de espera (ver [`docs/contrato-api-hostess.md`](docs/contrato-api-hostess.md)). Con `VITE_USE_MOCK=true` todo corre sin backend.

---

## ¿Qué es SIGR?

SIGR digitaliza la operación diaria de un restaurante (**La Madalena**): el mesero toma pedidos desde el celular o la tablet, la cocina los recibe, el gerente administra menú, inventario y personal, y la cuenta de cada mesa se lleva de principio a fin. Todos los roles trabajan sobre una misma base de datos MySQL a través de una API REST.

---

## Funcionalidades

| Módulo | Descripción | Estado |
| --- | --- | --- |
| 🔐 **Autenticación** | Inicio de sesión con roles (gerente, mesero, cocinero, cajero, hostess) mediante JWT | ✅ |
| 🍽️ **Panel de mesas** | Estado de cada mesa, cuenta abierta, total y pedidos listos; se actualiza solo | ✅ |
| 🧾 **Pedidos** | Crear, editar, enviar a cocina y cancelar con motivo. El total lo calcula siempre el servidor | ✅ |
| 💳 **Cuenta de mesa** | Consulta de pedidos y total; solicitud de pago en caja o digital | ✅ |
| 👥 **Usuarios** *(gerente)* | Alta, edición, activación y cambio de contraseña | ✅ |
| 📦 **Productos e inventario** *(gerente)* | Categorías, descripción obligatoria, presentación opcional para bebidas y postres, prevención de variantes duplicadas y estados Disponible, Stock bajo y Agotado. Las existencias se ajustan al editar el producto | ✅ |
| 👨‍🍳 **Cocina** | Cola de pedidos enviados y en preparación; iniciar preparación y marcarlos listos. Actualización automática | ✅ |
| 💵 **Caja** | Apertura/cierre de corte, cobro de cuentas solicitadas, pagos divididos, cambio y ticket imprimible | ✅ |
| 🪑 **Hostess: Salón** | Estado de las mesas (libres, ocupadas, reservadas), próximas reservaciones y lista de espera; asignar mesa a un grupo. No ve pedidos ni cuentas | ✅ |
| 📅 **Reservaciones** | Hostess: lista por día, alta y edición con correo opcional, sugerencias de mesa y accesibilidad, confirmar, cancelar y registrar llegada. Gerente: configura la tolerancia y anticipación de recordatorios. Confirmaciones, recordatorios, vencimientos y cancelaciones usan una cola común con reintentos y correos HTML con texto alternativo | ✅ |
| ⏳ **Hostess: Lista de espera** | Grupos por orden de llegada, tiempo de espera con marca de espera larga, agregar y sentar. Quitar de la lista: pendiente en la API (`PATCH`) | 🟡 |
| 🧮 **Facturación** | Datos fiscales y facturas (el esquema ya existe) | 🚧 |

---

## Actores del sistema

| Actor | Qué necesita del sistema | Pantallas hoy |
| --- | --- | --- |
| 🧑‍💼 **Gerente** | Supervisar la operación: usuarios, menú e inventario, mesas y pedidos del salón; administrar secciones y configurar reservaciones | Usuarios, Productos e inventario, Mesas, Reservas, Pedidos |
| 🍽️ **Mesero** | Capturar pedidos rápido y sin errores, ver su estado, enviarlos a cocina y pedir la cuenta | Mesas, Pedido de mesa, Cuenta, Mis pedidos |
| 👨‍🍳 **Cocinero** | Recibir pedidos claros y en orden, iniciar preparación y marcarlos listos | Cocina |
| 💵 **Cajero** | Consultar cuentas solicitadas, cobrar, imprimir ticket y hacer el corte de caja | Caja |
| 🪑 **Hostess** | Asignar mesas, controlar reservaciones y la lista de espera, registrar clientes | Salón, Reservaciones, Lista de espera |

---

## Requerimientos

Los requerimientos salen del documento **ERS** del equipo (Especificación de Requisitos de Software, práctica RP33). Cada uno tiene un código único: `RF` es funcional, `RNF` no funcional, y las tres letras del medio indican el módulo (`USR` usuarios, `PED` pedidos, `VEN` ventas, `CLI` clientes, `RES` reservas).

El estado se revisó leyendo el código del repositorio; no es una prueba de extremo a extremo.

> **Leyenda:** ✅ implementado · 🟡 parcial o distinto a lo que pide el ERS · 🚧 pendiente · 🔎 aún sin medir o revisar

**Avance de requisitos funcionales del ERS:** 14 ✅ · 2 🟡 · 6 🚧 de 22.

### Requisitos funcionales

#### Gestión de usuarios (Gerente)

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| `RF-USR-001` | Registrar usuario | Gerente | ✅ | `POST /api/usuarios` · Usuarios → Nuevo usuario |
| `RF-USR-002` | Actualizar usuario | Gerente | ✅ | `PATCH /api/usuarios/:id` y `POST /api/usuarios/:id/contrasena` · Usuarios → Editar / Contraseña |
| `RF-USR-003` | Eliminar usuario | Gerente | 🟡 | Se implementó como **desactivar / reactivar** (no se borra: el usuario tiene pedidos y ventas ligados) |
| `RF-USR-004` | Consultar usuario | Gerente | ✅ | `GET /api/usuarios` · lista con filtros por estado y rol y búsqueda |
| `RF-USR-005` | Asignar rol a usuario | Gerente | ✅ | Campo Rol al crear o editar un usuario |

#### Gestión de pedidos

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| `RF-PED-001` | Registrar pedido | Mesero | ✅ | `POST /api/pedidos` · Pedido de mesa |
| `RF-PED-002` | Cancelar pedido | Mesero, Gerente | ✅ | `POST /api/pedidos/:id/cancelar` (con motivo) · Mis pedidos |
| `RF-PED-003` | Consultar pedido | Mesero, Cajero, Gerente, Cocinero | 🟡 | Mesero: Mis pedidos; cocinero: cola operativa de pedidos enviados y en preparación. Historial para cajero y gerente pendiente |
| `RF-PED-004` | Cambiar estado del pedido | Cocinero, Mesero | ✅ | Mesero envía y entrega; cocina avanza `Pendiente` → `En preparacion` → `Listo` en `/cocinero/cocina` |
| `RF-PED-005` | Consultar historial de pedidos | Gerente, Cajero | 🚧 | Sin pantalla ni endpoint propio |

#### Gestión de ventas

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| `RF-VEN-001` | Registrar venta | Cajero | ✅ | `POST /api/caja/cuentas/:id/cobrar`; pago exacto o dividido, cambio en efectivo y cierre de cuenta |
| `RF-VEN-002` | Generar factura | Cajero | 🚧 | El esquema ya existe (`factura`, `datos_fiscales`); falta API y pantalla |
| `RF-VEN-003` | Consultar historial de ventas | Cajero, Gerente | 🚧 | Pendiente |
| `RF-VEN-004` | Generar reporte de ventas | Gerente | 🚧 | Pendiente |

#### Gestión de clientes

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| `RF-CLI-001` | Registrar cliente | Hostess, Cajero | ✅ | `POST /api/clientes` · selector de cliente en Reservaciones y Espera |
| `RF-CLI-002` | Actualizar cliente | Hostess, Cajero | 🚧 | Sin endpoint |
| `RF-CLI-003` | Eliminar cliente | Gerente, Cajero | 🚧 | Sin endpoint |

#### Gestión de reservas (Hostess)

| Código | Requisito | Actor(es) | Estado | Dónde está / nota |
| --- | --- | --- | --- | --- |
| `RF-RES-001` | Registrar reserva | Hostess | ✅ | `POST /api/reservaciones` · Reservaciones |
| `RF-RES-002` | Actualizar reserva | Hostess | ✅ | `PATCH /api/reservaciones/:id` |
| `RF-RES-003` | Cancelar reserva | Hostess | ✅ | `PATCH /api/reservaciones/:id` con estado `cancelada` |
| `RF-RES-004` | Consultar reserva | Hostess | ✅ | `GET /api/reservaciones?fecha=AAAA-MM-DD` |
| `RF-RES-005` | Confirmar reserva | Hostess | ✅ | `PATCH /api/reservaciones/:id` con estado `confirmada` |

### Requisitos que construimos y no estaban en el ERS

Aparecieron durante el desarrollo. Los códigos son **propuestos**: falta aprobarlos con el equipo y agregarlos al ERS.

| Código | Requisito | Actor | Dónde está |
| --- | --- | --- | --- |
| `RF-PRO-001` | Registrar producto con descripción obligatoria; presentación solo para Bebidas y Postres | Gerente | `POST /api/catalogo/productos` |
| `RF-PRO-002` | Editar un producto, incluidos precio y existencias; no actualizar stock desde un alta duplicada | Gerente | `PATCH /api/catalogo/productos/:id` |
| `RF-PRO-003` | Activar o desactivar un producto (estado independiente de Disponible, Stock bajo o Agotado) | Gerente | `PATCH /api/catalogo/productos/:id` |
| `RF-PRO-004` | Consultar catálogo e inventario con filtros por estado, categoría, poco stock y búsqueda | Gerente | `GET /api/catalogo/productos` |
| `RF-PRO-005` | Gestionar categorías del menú (crear, renombrar, borrar) | Gerente | `/api/catalogo/categorias` |
| `RF-PRO-006` | Existencia opcional por producto: se descuenta al enviar el pedido a cocina y se bloquea el envío si no alcanza | Sistema | `POST /api/pedidos/:id/enviar`, `POST /api/productos/disponibilidad` |
| `RF-MES-002` | Registrar mesa: número, capacidad, sección obligatoria y disponibilidad | Gerente | `POST /api/catalogo/mesas` · Mesas → Nueva mesa |
| `RF-MES-003` | Actualizar mesa (número, cantidad de personas, sección) | Gerente | `PATCH /api/catalogo/mesas/:id` · Mesas → Editar |
| `RF-MES-004` | Marcar una mesa como disponible o no disponible (no se borra). Una mesa no disponible no aparece para la hostess ni para el mesero y no se puede sentar, reservar ni cambiar de estado. No se puede desactivar si está ocupada, reservada, con cuenta abierta o con reservaciones vigentes | Gerente | `PATCH /api/catalogo/mesas/:id` · Mesas → No disponible / Disponible |
| `RF-MES-005` | Consultar las mesas como gerente, incluidas las no disponibles, con filtros por disponibilidad, sección y búsqueda | Gerente | `GET /api/catalogo/mesas` · Mesas |
| `RF-MES-006` | Sección obligatoria por mesa: el gerente administra el catálogo (crear, renombrar, inhabilitar/habilitar y borrar secciones); una sección inhabilitada no ofrece sus mesas al mesero ni a la hostess | Gerente | `seccion`, `mesa.zona` |
| `RF-MES-007` | Mostrar y agrupar las mesas por sección en el Panel del mesero y el Salón de la hostess, con filtro «Sección» (`?seccion=`) combinable con el de estado | Mesero, Hostess | `/mesero/mesas`, `/hostess/salon` |
| `RF-USR-006` | Cambiar la contraseña de un usuario | Gerente | `POST /api/usuarios/:id/contrasena` |
| `RF-USR-007` | Desactivar y reactivar usuarios (sustituye al borrado de RF-USR-003) | Gerente | `PATCH /api/usuarios/:id` |
| `RF-CUE-001` | Solicitar la cuenta de una mesa y elegir pago en caja o digital (la cuenta pasa a `por_pagar`) | Mesero, Gerente | `POST /api/cuentas/:id/solicitar-pago` |
| `RF-CUE-002` | Cerrar cuenta únicamente al registrar su pago | Cajero | `POST /api/caja/cuentas/:id/cobrar` |
| `RF-MES-001` | Asignar mesa a un grupo y cambiar el estado de la mesa (`libre`, `ocupada`, `reservada`) | Hostess, Gerente | `POST /api/mesas/:id/asignar`, `PATCH /api/mesas/:id/estado` |
| `RF-RES-006` | Registrar la llegada de un cliente con reservación | Hostess | `POST /api/reservaciones/:id/llegada` |
| `RF-RES-007` | Configurar tolerancia y recordatorio; vencer la reservación, liberar la mesa y encolar avisos de correo | Gerente, Sistema | `GET/PATCH /api/catalogo/configuracion-reservacion` y servicio de notificaciones |
| `RF-COR-001` | Encolar correos de confirmación y cancelación de reservaciones dentro de la transacción; procesarlos sin bloquear la respuesta y enviarlos con HTML y texto alternativo | Sistema | `POST /api/reservaciones`, `PATCH /api/reservaciones/:id`, `notificacion_reservacion` y `backend/src/services/plantillasCorreo.ts` |
| `RF-ESP-001` | Gestionar la lista de espera: agregar grupos, consultar por orden de llegada y sentarlos; la edición (`PATCH`) sigue pendiente | Hostess | `GET` y `POST /api/lista-espera` |
| `RNF-030` | Las acciones críticas (crear, enviar, cancelar, entregar pedidos, solicitar pago, asignar mesa y cobrar) no deben duplicarse si el cliente reintenta (`Idempotency-Key`) | Sistema | `backend/src/services/idempotencia.ts`, tabla `idempotencia` |

### Requerimientos propuestos que aún no se construyen

Salen de lo que pidió el equipo y de la revisión del proyecto. El detalle, las decisiones pendientes y otros hallazgos están en [`docs/PENDIENTES_Y_FALTANTES.md`](docs/PENDIENTES_Y_FALTANTES.md).

| Código | Requisito | Actor | Origen |
| --- | --- | --- | --- |
| `RF-AUD-001` | Registrar quién cambia una contraseña, a quién y cuándo (sin guardar la contraseña ni su hash) | Sistema | Pedido del equipo |
| `RF-AUD-002` | Bitácora general de eventos (amplía RNF-017 y RNF-026) | Sistema, Gerente | Hallazgo de la revisión |
| `RF-USR-008` | Que cada usuario cambie su propia contraseña | Todos los roles | Hallazgo de la revisión |
| `RF-PED-006` | Registrar quién canceló un pedido y cuándo | Sistema | Hallazgo de la revisión |
| `RF-PED-007` | Historial de pedidos paginado y filtrable por fechas en la API | Gerente, Cajero | Pantalla Pedidos del gerente |
| `RF-PED-008` | Incluir la observación general del pedido en las respuestas de la API | Gerente, Mesero, Cocinero | Pantalla Pedidos del gerente |
| `RF-CUE-003` | Consultar una cuenta por id aunque ya esté cerrada | Gerente, Cajero | Pantalla Pedidos del gerente |

### Diferencias entre el ERS y lo implementado

| Tema | El ERS dice | En el código |
| --- | --- | --- |
| RF-USR-003 / RF-CLI-003 | El ERS pide **eliminar** | Los usuarios se **desactivan** (no se borran). Falta decidir qué pasa con clientes |
| Estados de mesa | El ERS dice «disponible u ocupada» | La BD usa `libre`, `ocupada` y `reservada` |
| Estados de pedido | El ERS: pendiente, en preparación, listo, entregado | La BD agrega `Registrado`, `Cancelado` y `Pagado`; `Pendiente` se usa como «enviado a cocina» |
| RNF-011 | Expiración a los 15 min de inactividad | El JWT dura 8 horas |
| RNF-025 | Actualización en < 2 s | Consulta periódica cada 10 s |
| Hostess | — | Las rutas de Salón, Reservaciones, clientes y asignación están implementadas; solo falta `PATCH /api/lista-espera/:id` |

### Requisitos no funcionales

Aplican a todos los módulos del sistema.

<details>
<summary><strong>Ver los 29 requisitos no funcionales con su estado</strong></summary>

#### Rendimiento

| Código | Requisito | Estado | Nota |
| --- | --- | --- | --- |
| `RNF-001` | Responder en ≤ 2 s en operaciones transaccionales, ≤ 3 s en consultas comunes y ≤ 5 s en históricos o reportes | 🔎 Por medir |  |
| `RNF-002` | Permitir múltiples operaciones simultáneas sin degradación significativa | 🔎 Por medir |  |
| `RNF-003` | Soportar múltiples consultas concurrentes | 🔎 Por medir |  |
| `RNF-004` | Manejar grandes volúmenes de datos de manera eficiente | 🔎 Por medir |  |

#### Disponibilidad

| Código | Requisito | Estado | Nota |
| --- | --- | --- | --- |
| `RNF-005` | Estar disponible durante el horario operativo del restaurante | 🔎 Por medir |  |
| `RNF-006` | Garantizar alta disponibilidad para evitar interrupciones | 🔎 Por medir |  |

#### Seguridad

| Código | Requisito | Estado | Nota |
| --- | --- | --- | --- |
| `RNF-007` | Requerir usuario y contraseña para cualquier funcionalidad | ✅ | Login con JWT; el resto de la API exige `Authorization: Bearer` |
| `RNF-008` | Validar las credenciales contra la base de datos | ✅ |  |
| `RNF-009` | Bloquear temporalmente la cuenta tras 5 intentos fallidos de inicio de sesión | 🚧 | No se encontró en el código |
| `RNF-010` | Almacenar las contraseñas con un hash seguro | ✅ | `bcryptjs` |
| `RNF-011` | Sesiones con expiración por inactividad (por ejemplo, 15 minutos) | 🟡 | El token JWT dura 8 horas fijas, sin control por inactividad |
| `RNF-012` | Cierre de sesión seguro que invalide la sesión activa | 🟡 | El cliente borra el token; el servidor no lo invalida (JWT sin estado) |
| `RNF-013` | Control de acceso basado en roles (RBAC) | ✅ | `requiereAuth(...roles)` en el backend y guardas por rol en el router |
| `RNF-014` | Restringir las funcionalidades según el rol | ✅ |  |
| `RNF-015` | Validar los permisos antes de ejecutar cualquier operación | ✅ |  |
| `RNF-016` | Impedir el acceso a recursos no autorizados, incluso por URL o manipulando solicitudes | ✅ | La validación de rol está en el backend, no solo en el frontend |
| `RNF-017` | Registrar los intentos de acceso no autorizado para auditoría | 🚧 | No se encontró en el código |
| `RNF-018` | Restringir la información y funcionalidades a usuarios autorizados | ✅ |  |

#### Usabilidad

| Código | Requisito | Estado | Nota |
| --- | --- | --- | --- |
| `RNF-019` | Interfaz intuitiva y fácil de usar | ✅ |  |
| `RNF-020` | Mostrar la información de forma clara y ordenada | ✅ |  |
| `RNF-021` | Permitir múltiples criterios de búsqueda | 🟡 | Hay búsqueda en usuarios, productos y reservaciones; no en todos los módulos |

#### Confiabilidad e integridad

| Código | Requisito | Estado | Nota |
| --- | --- | --- | --- |
| `RNF-022` | Garantizar la integridad de los datos almacenados | ✅ | Llaves foráneas, `CHECK` y transacciones con `mysql2` |
| `RNF-023` | Mantener la consistencia de la información en todo momento | ✅ |  |
| `RNF-024` | Garantizar el envío correcto de pedidos a cocina sin errores | ✅ | Envío en transacción y con `Idempotency-Key` para no duplicar |
| `RNF-025` | Reflejar las actualizaciones en tiempo real (< 2 s) | 🟡 | El frontend actualiza por consulta periódica (cada 10 s, configurable con `VITE_POLL_MS`) |

#### Auditoría

| Código | Requisito | Estado | Nota |
| --- | --- | --- | --- |
| `RNF-026` | Registrar eventos importantes: cancelaciones, confirmaciones y modificaciones | 🚧 | No se encontró una bitácora de eventos |
| `RNF-027` | Conservar en auditoría el motivo de las cancelaciones | 🟡 | Se guarda el motivo en `motivo_cancelacion` al cancelar un pedido |

#### Cumplimiento legal

| Código | Requisito | Estado | Nota |
| --- | --- | --- | --- |
| `RNF-028` | Cumplir la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) | 🔎 Por revisar |  |
| `RNF-029` | Cumplir la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados (LGPDPPSO) | 🔎 Por revisar |  |

</details>

### Reglas del dominio (reglas del negocio)

<details>
<summary><strong>Ver las 22 reglas del restaurante</strong></summary>

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

</details>

### Restricciones, supuestos y requisitos futuros

<details>
<summary><strong>Restricciones</strong></summary>

| Tipo | Restricción |
| --- | --- |
| Tecnológica | El sistema debe funcionar en equipos disponibles del restaurante |
| Operativa | Debe operar en tiempo real |
| Interfaz | Debe ser intuitiva y fácil de usar |
| Seguridad | Protección de datos y transacciones |

</details>

<details>
<summary><strong>Supuestos y dependencias</strong></summary>

**Supuestos**

- El personal (meseros, cocina y caja) tiene conocimientos básicos de cómputo.
- Existe buena comunicación operativa entre las áreas del restaurante.
- El flujo de trabajo se mantiene: toma de pedidos, validación, preparación, entrega y pago.
- Los usuarios siguen los procedimientos establecidos para registrar y gestionar pedidos.

**Dependencias**

- Equipos de cómputo funcionales para meseros, cocina y caja.
- Una base de datos centralizada, confiable y bien configurada.
- Red interna que permita la comunicación en tiempo real entre áreas.
- Suministro eléctrico continuo.
- Soporte técnico para actualizaciones y corrección de errores.

</details>

<details>
<summary><strong>Requisitos futuros (fuera del alcance actual)</strong></summary>

- Integración con sistemas de pago electrónico (tarjetas, transferencias o billeteras digitales)
- Reportes avanzados de ventas, desempeño y análisis de datos
- Aplicación móvil para el personal
- Integración con servicios de entrega a domicilio
- Notificaciones automáticas a clientes (recordatorios y otros avisos)
- Sistema de fidelización (puntos, promociones o descuentos)
- Facturación electrónica
- Control de inventario de ingredientes o insumos
- Integración con impresoras de tickets y pantallas de cocina
- Soporte para múltiples sucursales
- Dashboards en tiempo real para monitoreo de operaciones

</details>

### Cómo agregar un requerimiento nuevo

Cuando aparezca algo que no está en el ERS:

1. Ponle un código con el patrón `RF-XXX-NNN` o `RNF-NNN` (el siguiente número libre del módulo).
2. Agrégalo a la tabla **Requisitos que construimos y no estaban en el ERS** con su actor y dónde se implementó.
3. Si cambia algo que el ERS ya decía, anótalo en **Diferencias entre el ERS y lo implementado**.
4. Haz lo mismo en [`CONTEXTO_IA.md`](CONTEXTO_IA.md), para que la IA tenga el contexto al día.

---

## Stack tecnológico

**Frontend** (`frontend/`)

- [Vue 3](https://vuejs.org) + [Vite](https://vitejs.dev) + TypeScript
- [Pinia](https://pinia.vuejs.org) para el estado y [Vue Router](https://router.vuejs.org)
- [Vitest](https://vitest.dev) para las pruebas
- Modo **mock**: corre sin backend, con datos simulados en memoria

**Backend** (`backend/`)

- [Node.js](https://nodejs.org) + [Express 5](https://expressjs.com) + TypeScript
- [mysql2](https://github.com/sidorares/node-mysql2) con transacciones
- [zod](https://zod.dev) para validar las peticiones
- JWT (`jsonwebtoken`) y `bcryptjs` para la autenticación

**Base de datos** (`database/`)

- MySQL 8.0 (esquema, datos de prueba y migraciones numeradas)

---

## Estructura del proyecto

Esta es la estructura **acordada** del repositorio (la carpeta raíz del repositorio se llama `SIGR`):

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
│   │   ├── services/          # DB, idempotencia y correos de reservación
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

### Cómo quedó en SIGR

El árbol de arriba es el modelo; las carpetas ya existen y contienen lo siguiente. Los nombres de ejemplo del modelo (`clientes`, `productos`, `001_create_clientes.sql`) se reemplazaron por los reales del restaurante.

| Carpeta | Qué contiene en SIGR |
| --- | --- |
| `frontend/public/`, `src/assets/` | `favicon.svg`; `assets/` está vacía por ahora (tiene un `.gitkeep`). |
| `frontend/src/components/` | Diálogos, formularios, insignias y los componentes de cada rol (`hostess/` aparte). |
| `frontend/src/views/` | Pantallas por rol: `mesero/`, `hostess/` y `gerente/`, más `LoginView`. |
| `frontend/src/router/` | Rutas y guardas por rol. |
| `frontend/src/services/` | `api/` (backend real), `mock/` (datos simulados), `hostess/` e `interfaces.ts`. |
| `frontend/src/stores/` | Pinia: sesión, mesas, pedidos, cuenta, reservaciones, espera, salón y anuncios. |
| `frontend/src/mocks/` | `clientes.json` y `productos.json` (el menú agrupado por categoría); los lee `services/mock/baseDatos.ts`. |
| `frontend/main.ts` | Arranque de Vue. Está en la raíz del frontend, como en el modelo (`index.html` lo carga con `/main.ts`). |
| `backend/src/routes/` | **Endpoints**: `auth`, `catalogo`, `clientes`, `cuentas`, `listaEspera`, `menu`, `mesas`, `pedidos`, `productos`, `reservaciones` y `usuarios`. Cada archivo solo enlaza ruta, permiso y controlador. |
| `backend/src/controllers/` | **Lógica de negocio**, un archivo por área. `hostess.ts` atiende las rutas de clientes, reservaciones y lista de espera porque comparten funciones de apoyo. |
| `backend/src/models/` | `dominio.ts`: DTOs, consultas compartidas, estados del pedido y reglas de existencia. |
| `backend/src/services/` | `db.ts` (pool de MySQL y transacciones), `idempotencia.ts`, `correo.ts` (transporte Resend o SMTP), `plantillasCorreo.ts` (diseño HTML y texto de los avisos) y `notificacionesReservacion.ts` (cola común de confirmaciones, recordatorios, vencimientos y cancelaciones). |
| `backend/src/mocks/` | `clientes.mock.ts` y `productos.mock.ts`: datos falsos tipados para probar la API. |
| `backend/src/utils/` | `config.ts`, `errores.ts`, `auth.ts` (JWT y permisos por rol) y `seed.ts` (usuarios de prueba). |
| `backend/tests/` | Pruebas unitarias con Vitest: dominio, mocks, caja, transporte, plantillas de correo y cola de notificaciones. |
| `database/` | `docker-compose.yml`, `init.sql` (tablas, catálogos y datos base) y `migrations/` (`001` a `012`). |
| `docs/` | `arquitectura.md` y el resto de la documentación (contratos de API, equivalencias, pendientes, guía de código y [actualización de la base](docs/actualizar-base-datos.md)). |

### Archivos y carpetas adicionales

Además de lo del modelo, el proyecto necesita estos elementos:

| Dónde | Qué es | Por qué |
| --- | --- | --- |
| `frontend/src/types/`, `layouts/`, `composables/`, `styles/` | Modelos y estados, estructura de cada rol, lógica reutilizable de Vue y estilos base | El modelo no las nombra, pero las vistas y los componentes dependen de ellas. |
| `frontend/src/services/hostess/` | Servicios de clientes, reservaciones y lista de espera | Forman parte de la capa de servicios. |
| `frontend/scripts/`, `tsconfig*.json`, `.env.example`, `.env.api` | Informe de contraste, configuración de TypeScript y variables de entorno | Apoyo de desarrollo. |
| `database/seed_demo.sql` | Datos de demostración opcionales | No forman parte del script inicial. |
| `backend/.env.example` | Variables de entorno del backend | El archivo `.env` real no se sube a Git. |

> **Nota:** `docker-compose.yml` está escrito pero no se probó en este entorno de trabajo. El backend, el frontend y sus pruebas sí se compilaron y ejecutaron tras la reorganización.

---

## Instalación local

### Prerrequisitos

- Node.js 22 (mínimo 20.19)
- MySQL 8.0

### Pasos

```bash
# 1. Clonar
git clone https://github.com/sikilow/SIGR.git
cd SIGR

# 2. Base de datos (elige una opción)
#    a) Con Docker, sin instalar MySQL (la contraseña de root es sigr1234):
docker compose -f database/docker-compose.yml up -d
#    b) Con MySQL ya instalado:
mysql -u root -p -e "source database/init.sql"

# 3. Backend
cd backend
npm install
cp .env.example .env        # edita DB_PASSWORD (con Docker: sigr1234) y JWT_SECRET
npx tsx src/utils/seed.ts         # crea los usuarios de prueba
npm run dev                 # http://localhost:3000
# (opcional, base recién creada) datos de demostración, ver el encabezado de database/seed_demo.sql:
# mysql --default-character-set=utf8mb4 -u root -p SIGR < ../database/seed_demo.sql   (crea además a mesero2)

# 4. Frontend (otra terminal)
cd frontend
npm install
cp .env.example .env.local  # pon VITE_USE_MOCK=false para usar el backend real
npm run dev                 # http://localhost:5173
```

> **Base de datos ya existente:** no la recrees ni ejecutes todas las migraciones a ciegas. Revisa cuáles están pendientes y sigue [`docs/actualizar-base-datos.md`](docs/actualizar-base-datos.md), con pasos de respaldo, comandos y verificación del esquema.

### Variables de entorno

**`backend/.env`**

```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=SIGR
JWT_SECRET=cambia_esto_por_algo_largo
# CORS_ORIGIN=http://localhost:5173
RESEND_API_KEY=
CORREO_PROVEEDOR=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
CORREO_REMITENTE=
```

Configura las variables solo en `backend/.env`; el backend elige Resend cuando existe `RESEND_API_KEY`, SMTP cuando existen `SMTP_USER` y `SMTP_PASS`, y deja el correo desactivado si no hay configuración. También se puede seleccionar `CORREO_PROVEEDOR=resend` o `smtp`. Para Gmail usa `smtp.gmail.com`, puerto `465`, una contraseña de aplicación (no la contraseña normal; se aceptan espacios) y el mismo correo en `SMTP_USER` y `CORREO_REMITENTE`. Gmail personal limita el envío aproximadamente a 500 mensajes diarios y 100 destinatarios por mensaje; `550 5.4.5` se reintenta tras seis horas. `CORREO_REMITENTE` es el único remitente en ambos transportes. No guardes claves ni contraseñas en Git ni en variables `VITE_*`. Guía completa: [`docs/resend-reservaciones.md`](docs/resend-reservaciones.md).

**`frontend/.env.local`**

```
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:3000/api
```

Con `VITE_USE_MOCK=true` el frontend funciona **sin backend ni base de datos**, ideal para trabajar solo en las pantallas. En ese modo el login lista los usuarios demo: `mesero`, `cocinero`, `hostess`, `cajero` y `gerente` (contraseña `1234`).

### Comandos útiles

| Dónde | Comando | Qué hace |
| --- | --- | --- |
| `backend/` | `npm run dev` | API con recarga automática |
| `backend/` | `npm run build` | Revisa tipos y compila a `dist/` |
| `backend/` | `npm test` | Pruebas unitarias del backend |
| raíz | `docker compose -f database/docker-compose.yml up -d` | Levanta MySQL 8 con `init.sql` |
| `frontend/` | `npm run dev` | Servidor de desarrollo |
| `frontend/` | `npm run build` | Revisa tipos y genera el build |
| `frontend/` | `npx vitest run` | Corre las pruebas |
| `frontend/` | `npm run check` | Tipos + pruebas + build (debe pasar antes de entregar) |
| `frontend/` | `npm run contraste` | Informe de contraste WCAG de los pares de color de la hostess |

---

## Roles y usuarios de prueba

`npx tsx src/utils/seed.ts` crea estos usuarios. **Solo para desarrollo**: cambia las contraseñas en cualquier entorno real.

| Rol | Usuario | Contraseña | Acceso |
| --- | --- | --- | --- |
| Gerente | `gerente` | `1234` | Usuarios, productos e inventario y mesas |
| Mesero | `mesero` | `1234` | Mesas, pedidos y cuentas |
| Mesero 2 | `mesero2` | `1234` | Igual que el mesero (solo con `seed_demo.sql`) |
| Cocinero | `cocinero` | `1234` | Cola de cocina: pedidos enviados y en preparación |
| Cajero | `cajero` | `1234` | Caja |
| Hostess | `hostess` | `1234` | Salón, Reservaciones y Lista de espera |

---

## Documentación (`docs/`)

| Documento | Para qué sirve |
| --- | --- |
| [`arquitectura.md`](docs/arquitectura.md) | Capas, responsabilidad de cada carpeta, flujo de una petición y decisiones de diseño |
| [`guia-codigo/`](docs/guia-codigo/00_INDICE_Y_RECURSOS.md) | Guía de estudio: el código explicado por bloques de líneas, con recursos |
| [`CONTEXTO_IA.md`](CONTEXTO_IA.md) | Resumen completo del proyecto (requisitos, base de datos, API, convenciones) para dárselo a una IA como contexto |
| [`PENDIENTES_Y_FALTANTES.md`](docs/PENDIENTES_Y_FALTANTES.md) | Lo que falta, qué se afectaría y qué hay que decidir (mesas del gerente, auditoría, cuentas, seguridad) |
| [`contrato-api-mesero.md`](docs/contrato-api-mesero.md) | Contrato de la API que usa el mesero (implementada en `backend/`) y diferencias con la BD |
| [`contrato-api-hostess.md`](docs/contrato-api-hostess.md) | Endpoints reales de Salón, Reservaciones, Lista de espera, clientes y configuración de reservaciones; señala lo que aún falta |
| [`contrato-api-gerente.md`](docs/contrato-api-gerente.md) | Contrato de pedidos del gerente y cambios propuestos para ampliar el historial |
| [`equivalencias-bd.md`](docs/equivalencias-bd.md) | Tabla columna ↔ JSON ↔ TypeScript, equivalencias de catálogo, secciones, hostess y estados |
| [`integracion-api.md`](docs/integracion-api.md) | Lista de comprobación para conectar el frontend con la API real |
| [`incrementos.md`](docs/incrementos.md) | Observaciones de la maestra, cambios implementados y alcance por incremento |
| [`actualizar-base-datos.md`](docs/actualizar-base-datos.md) | Respaldo, aplicación ordenada de migraciones 007–012 y verificación de una base existente |
| [`resend-reservaciones.md`](docs/resend-reservaciones.md) | Configuración segura, operación y diseño HTML del correo de reservaciones con Resend o Gmail SMTP |
| [`pantallas-gerente.md`](docs/pantallas-gerente.md) | Pantallas de gerencia, incluidas reservas, secciones y pedidos |
| [`pantallas-mesero.md`](docs/pantallas-mesero.md) | Pantallas del mesero con su ruta, caso de uso y captura |
| [`pantallas-hostess.md`](docs/pantallas-hostess.md) | Pantallas de la hostess con su ruta y captura, y cómo funciona cada una |
| [`capturas/`](docs/capturas/) | Capturas de las pantallas (1024×768 y 768×1024) |

### Incrementos recientes

- **Catálogo e inventario:** la descripción es obligatoria; presentación/variante solo se solicita para Bebidas y Postres. Un alta duplicada no altera existencias: se debe editar el producto existente para cambiar su stock.
- **Secciones de mesas:** Gerencia puede crear, renombrar, inhabilitar, habilitar y borrar secciones; cada mesa debe pertenecer a una sección activa.
- **Reservaciones:** correo opcional para nuevas reservas, preferencias de accesibilidad y sugerencias de mesa; tolerancia y recordatorio configurables por Gerencia; vencimiento, liberación de mesa y confirmaciones, recordatorios, avisos de vencimiento y cancelaciones en una cola común con reintentos. Los avisos usan una tarjeta editorial en HTML de hasta 600 px y conservan una versión de texto plano como alternativa.
- **Acceso de Gerencia:** Reservas está en `/gerente/reservaciones`, protegida para el rol gerente. La prueba de ruta y compilación del frontend pasan.

---

## Flujo de trabajo con Git

- `main` es la rama estable: siempre compila y pasa las pruebas.
- Cada cambio va en su propia rama (`feature/cocina`, `fix/login`…) y entra a `main` por **Pull Request**.
- Antes de abrir un PR, se corre `npm run build` en `backend/` y en `frontend/`, y `npx vitest run` en `frontend/`.
- Si cambias la base de datos, agrega una migración `database/migrations/00N_*.sql` y actualiza `database/init.sql` en el mismo PR.
- Nunca se suben `.env`, `.env.local` ni `node_modules`.

---

## Equipo de desarrollo

Proyecto desarrollado en el **Instituto Tecnológico de Tepic** — Ingeniería de Software.

- **Jonathan Alexis Bernal Machuca**
- **Hannia Elizabeth González Tapia**
- **Cesar Ruben Ramos Gameros** — [@RubenRamosG](https://github.com/RubenRamosG)
- **Axel Yael Meza Luna** — [@axyameza](https://github.com/axyameza)
- **Carlos David Cortés Hidalgo** — [@Crudecraft9](https://github.com/Crudecraft9)

---

**SIGR** · Instituto Tecnológico de Tepic · Ingeniería de Software · 2026
