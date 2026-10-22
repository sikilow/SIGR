# SIGR · Pendientes y faltantes por revisar

Documento para que el equipo **verifique y decida**. **No contiene código ni cambios hechos**: solo lista lo que falta, qué se afectaría y qué hay que decidir.

- **Última revisión:** octubre de 2026, sobre el código del repositorio y el ERS.
- **Cómo leer la columna «Verificación»:** *Verificado* = lo comprobé leyendo el código o el esquema. *Por validar* = es una suposición o una idea que el equipo debe confirmar.
- **Códigos de requisito:** son **propuestos**. Cuando el equipo los apruebe se agregan al ERS (ver `README.md`, sección «Cómo agregar un requerimiento nuevo»).

---

## 1. Lo que pidió el equipo

### 1.1 Mesas: administración por el gerente (HECHO, con un detalle pendiente)

Antes las mesas solo se creaban con scripts SQL. Ahora el gerente tiene la pantalla **Mesas** (`/gerente/mesas`) y la API `/api/catalogo/mesas`.

| Código | Requerimiento | Estado |
| --- | --- | --- |
| RF-MES-002 | **Registrar mesa**: número, cantidad de personas, sección (opcional) y disponibilidad | Hecho: `POST /api/catalogo/mesas`; botón «Nueva mesa» |
| RF-MES-003 | **Actualizar mesa** (número, cantidad de personas, sección) | Hecho: `PATCH /api/catalogo/mesas/:id`; botón «Editar» |
| RF-MES-004 | **Marcar como disponible o no disponible** (no se borra) | Hecho: una mesa no disponible no aparece para la hostess ni para el mesero y no se puede sentar, reservar ni cambiar de estado (`409 mesa_no_disponible`) |
| RF-MES-005 | **Consultar mesas** como gerente, incluidas las no disponibles | Hecho: `GET /api/catalogo/mesas`, con filtros por disponibilidad, sección y búsqueda |
| RF-MES-006 | **Sección de la mesa** | **Parcial**: se guarda (`mesa.zona`), se edita y se filtra en la pantalla del gerente; el Salón y el Panel de mesas todavía no la muestran |
| RF-MES-007 *(propuesto)* | Mostrar o agrupar por sección en el Salón de la hostess y en el Panel del mesero | Pendiente: el backend ya envía `zona` en `GET /api/mesas`; falta la pantalla |

**Decisiones que se tomaron** (cámbienlas si no les parecen):

| Id | Decisión |
| --- | --- |
| D-1 | La sección es **texto libre con sugerencias** de las ya existentes (columna `mesa.zona`, hasta 40 caracteres). No hay catálogo de secciones; si se quiere uno, se migra después. |
| D-2 | Las secciones las define el gerente al escribirlas; no hay una lista fija. |
| D-3 | **No se puede marcar como no disponible** una mesa ocupada, reservada, con cuenta abierta o con reservaciones vigentes: primero hay que liberarla o cancelar esas reservaciones. |
| D-4 | El número de mesa sigue siendo **único** y no se reutiliza, aunque la mesa esté no disponible. |
| D-5 | Cambiar la capacidad **no revisa** las reservaciones ya hechas. |

**Qué se verificó:** 54 pruebas de la API contra MySQL 8 real (incluyen las mesas), la migración `005` sobre una base con el esquema anterior, y 26 pruebas nuevas del frontend (453 en total). Se comprobó en la interfaz que la mesa 1, marcada como no disponible, desapareció del Salón de la hostess.

**Lo que aún falta alrededor de esto:**

- Mostrar o agrupar por sección en el Salón y el Panel (RF-MES-007).
- Una mesa con cuenta activa sigue sin poder desactivarse; tras el cobro se cierra la cuenta y se libera la mesa (ver D-3 y P-01).
- No se registra quién creó, editó o desactivó una mesa (ver la bitácora, RF-AUD-002).
- Las bases de datos que ya existían necesitan correr `database/migrations/005_mesas_zona_activa.sql`.

### 1.2 Auditoría: quién cambia una contraseña

**Lo que hay hoy (verificado):** el gerente restablece la contraseña de otro usuario con `POST /api/usuarios/:id/contrasena`. La tabla `credenciales` solo guarda `password_hash` y `ultimo_acceso`. **No se registra quién cambió la contraseña ni cuándo.** Además un usuario **no puede cambiar su propia contraseña**: solo el gerente puede.

| Código propuesto | Requerimiento | Verificación |
| --- | --- | --- |
| RF-AUD-001 | Registrar en la base de datos **quién** (usuario que actúa), **a quién** (usuario afectado) y **cuándo** se cambia una contraseña, sin guardar nunca la contraseña ni su hash en el registro | Verificado: no existe |
| RF-USR-008 | Que cada usuario pueda **cambiar su propia contraseña** (pidiendo la actual) | Verificado: no existe |
| RF-AUD-002 | **Bitácora general de eventos** (ver 2.3): es la forma natural de cubrir RF-AUD-001 y completa RNF-017 y RNF-026 | Verificado: RNF-017 y RNF-026 no están implementados |

**Sobre usar un trigger (importante para decidir):**

- Un trigger de MySQL **no sabe qué usuario del sistema** hizo el cambio. La API se conecta a la base con **una sola cuenta de MySQL** y todos los usuarios del sistema pasan por ella. El trigger solo ve esa cuenta.
- Para que un trigger registre al usuario real, la API tendría que **avisarle quién es** antes de cada cambio (por ejemplo guardando el id en una variable de la sesión de MySQL, en la **misma conexión** y en la misma transacción que el `UPDATE`). Hoy la ruta de cambio de contraseña usa el pool directamente, sin transacción, así que eso exigiría reorganizarla.
- Un trigger sí garantiza que **ningún cambio se escape**, aunque alguien edite la tabla a mano. Por eso a veces se usa como red de seguridad.

| Opción | Cómo funcionaría | Ventajas | Desventajas |
| --- | --- | --- | --- |
| A | Dos columnas nuevas en `credenciales`: quién y cuándo fue el último cambio | Muy simple | Solo guarda **el último** cambio, no el historial |
| B | Una tabla de bitácora; la **API** escribe un registro en cada cambio | Historial completo, visible y fácil de probar | Si alguien cambia la tabla directo en SQL, no queda registro |
| C | Un trigger sobre `credenciales` que escribe en la bitácora cuando cambia `password_hash`, usando el id que la API le pasa | No se escapa ningún cambio | Lógica «escondida» en la base; depende de que la API pase siempre el id |
| B + C | La API escribe la bitácora y el trigger actúa como respaldo | Lo más robusto | Más trabajo |

**Recomendación (para validar):** la opción **B** como base, porque cubre también RNF-026, y evaluar **C** solo si el profesor o el cliente piden garantía a nivel de base de datos.

**Qué registrar en la bitácora de contraseñas:** usuario que actúa, usuario afectado, fecha y hora, tipo de acción (restablecida por gerente o cambiada por el propio usuario). **Nunca** la contraseña ni el hash. La dirección IP es opcional y, por ser un dato personal, conviene valorarla frente a RNF-028 y RNF-029 (protección de datos).

---

## 2. Hallazgos adicionales (revisé el proyecto completo)

### 2.1 Importantes: afectan el uso real o el cumplimiento del ERS

| Id | Hallazgo | Detalle | Verificación |
| --- | --- | --- | --- |
| P-01 | **Resuelto: cierre de cuenta al cobrar** | `POST /api/caja/cuentas/:id/cobrar` registra la venta y los pagos y, en la misma transacción, marca pedidos pagados, llena `cerrada_en`, cierra la cuenta y libera la mesa. No permite cobrar cuentas no solicitadas ni pedidos sin entregar. | Resuelto |
| P-02 | **No se guarda quién canceló un pedido** | Solo se guarda el motivo (`id_motivo`), no el usuario ni la fecha de cancelación. Código propuesto: RF-PED-006. Relacionado con RNF-026 y RNF-027. | Verificado |
| P-03 | **Seguridad del ERS sin cubrir** | RNF-009 (bloqueo tras 5 intentos), RNF-011 (expiración por inactividad: hoy el token dura 8 horas fijas), RNF-012 (invalidar la sesión al salir), RNF-017 (registro de accesos no autorizados). | Verificado |
| P-04 | **Sin protecciones básicas de la API** | El backend no usa límite de peticiones (contra fuerza bruta) ni cabeceras de seguridad. No hay HTTPS configurado en el proyecto. | Verificado en `package.json`; el HTTPS es por validar |
| P-05 | **Las pruebas del backend son mínimas** | `backend/tests/` cubre funciones puras, mocks y validación de importes (31 pruebas), pero no las rutas ni las reglas que requieren base de datos. El frontend tiene 22 archivos de pruebas. | Verificado |
| P-06 | **Pantallas pendientes** | Caja ya está disponible en `/cajero/caja`; facturación fiscal aún no tiene proveedor, API ni pantalla. | Parcial |
| P-07 | **Falta `PATCH /api/lista-espera/:id`** | Quitar o editar un grupo de la lista de espera. | Verificado |

### 2.2 Reglas del dominio que el servidor no aplica o que chocan con el diseño

| Regla del ERS | Qué pasa hoy | Verificación |
| --- | --- | --- |
| 1 y 2: tiempo de tolerancia para clientes con reserva; liberar o cancelar si no llegan | **No está implementada**. Ninguna parte del código maneja una tolerancia. | Verificado |
| 5: cada reserva se asocia a una mesa | La mesa es **opcional** (`id_mesa` puede ser nulo) y se asigna al sentar. Es una decisión de diseño por confirmar. | Verificado |
| 6: no dos reservas en la misma mesa y horario | Se evita de forma **indirecta** (para reservar, la mesa debe estar libre) y **solo para reservaciones de hoy**. No hay validación por franja horaria. | Verificado |
| 8 y 9: asignar mesas según el número de personas, con capacidad máxima | El frontend **solo avisa** («Puedes continuar si las acomodas») y el servidor acepta cualquier número de personas sin comparar con la capacidad. Puede ser intencional; hay que confirmarlo. | Verificado |
| 11: una mesa no puede tener más de un pedido activo | **Choca con el diseño actual**: una cuenta tiene varios pedidos a la vez (rondas de pedidos). Hay que decidir cuál vale y corregir el ERS o el código. | Verificado |
| 22: no registrar dos clientes con el mismo contacto | Solo lo valida el backend con una consulta; **la base de datos no tiene `UNIQUE`** en `cliente.telefono`, así que dos peticiones simultáneas podrían duplicarlo. | Verificado |

### 2.3 Auditoría y bitácora (amplía 1.2)

El ERS pide registrar cancelaciones, confirmaciones y modificaciones (RNF-026). Hoy no existe una bitácora. Eventos candidatos a registrar:

| Evento | Qué guardar | Estado hoy |
| --- | --- | --- |
| Cambio de contraseña | Actor, afectado, fecha | No se guarda |
| Alta, edición o desactivación de usuario | Quién y qué cambió | No se guarda |
| Cambio de precio o de existencia de un producto | Quién, valor anterior y nuevo | No se guarda |
| Cancelación de pedido | Quién, cuándo, motivo | Solo el motivo |
| Cambio de estado de una mesa | Quién y cuándo | No se guarda |
| Intentos de acceso fallidos o no autorizados | Usuario, hora | No se guarda |

Por validar: cuánto tiempo se conserva la bitácora y quién puede consultarla (probablemente solo el gerente). Es un dato personal y aplica RNF-028 y RNF-029.

### 2.4 Base de datos

| Id | Hallazgo | Verificación |
| --- | --- | --- |
| P-08 | `reservacion.estado` y `lista_espera.estado` son texto libre, **sin `CHECK` ni catálogo** (ya hay una nota `[PENDIENTE-BD]` en `seed_demo.sql`). | Verificado |
| P-09 | El estado de pedido `Pagado` existe pero **nada lo usa**. | Verificado |
| P-10 | Las tablas fiscales (`datos_fiscales`, `factura`) existen pero **ninguna ruta las usa**. Las tablas de venta, pago y corte ya están conectadas a la API de caja. | Parcial |
| P-11 | `GET /api/pedidos` devuelve **todos** los pedidos visibles sin paginación; con el tiempo el historial crecerá. | Verificado |
| P-12 | Las fechas dependen de la zona horaria de MySQL (`NOW()`); si el servidor y la base difieren, las reservaciones pueden correrse. Ya hay una advertencia en `seed_demo.sql`. | Verificado |

### 2.5 Antes de producción

| Id | Pendiente | Verificación |
| --- | --- | --- |
| P-13 | Todos los usuarios de prueba usan la contraseña `1234`; hay que eliminarlos o cambiarlas. No se obliga a cambiar la contraseña inicial. | Verificado |
| P-14 | Política de contraseñas: hoy solo se exige de 6 a 72 caracteres, sin complejidad. | Verificado |
| P-15 | No hay integración continua (carpeta `.github`) ni respaldos de la base documentados. | Verificado |
| P-16 | Falta documentación del gerente: existen contratos y pantallas del mesero y de la hostess, pero **no hay contrato de API ni documento de pantallas del gerente** (usuarios y productos). | Verificado |

---

## 3. Ideas que no están en el ERS (por validar con el restaurante)

Son sugerencias mías, **no requisitos**. Solo valen si el restaurante las necesita.

- Cambiar una cuenta de mesa o unir mesas (grupos que se juntan).
- Dividir la cuenta por comensal o por producto.
- Propinas y descuentos.
- Impresión de tickets o comandas para cocina.
- Alerta al gerente cuando un producto baje de su stock mínimo (hoy hay un filtro, no un aviso).
- Reporte de ventas y productos más vendidos (ya es RF-VEN-004).
- Historial de cambios de precio del menú.

---

## 4. Orden sugerido de trabajo (para discutir)

1. Confirmar las decisiones D-1 a D-5 de las mesas y elegir la opción de auditoría (A, B o C).
2. Bitácora (RF-AUD-001 y 002) y mostrar la sección de la mesa en el Salón y el Panel (RF-MES-007).
3. Cambio de contraseña propio (RF-USR-008) y seguridad del ERS (P-03 y P-04).
4. Facturación fiscal (RF-VEN-002), historial de ventas (RF-VEN-003) e informes (RF-VEN-004).
5. Pruebas de rutas del backend contra una base de datos (P-05).
6. Actualizar el ERS y documentación cuando se validen las reglas pendientes.

---

## 5. Lo que necesito que el equipo verifique

- Confirmar las reglas 5, 8, 9 y 11 de la sección 2.2: ¿son comportamientos intencionales o errores?
- Decidir si las ideas de la sección 3 interesan.
