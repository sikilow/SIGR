# SIGR · Pendientes y faltantes por revisar

Documento de seguimiento para que el equipo **verifique y decida**. Registra tanto las funciones ya implementadas que surgieron de las revisiones como los asuntos que siguen pendientes; no sustituye el código ni el ERS.

- **Última revisión:** octubre de 2026, sobre el código del repositorio y el ERS.
- **Cómo leer la columna «Verificación»:** *Verificado* = lo comprobé leyendo el código o el esquema. *Por validar* = es una suposición o una idea que el equipo debe confirmar.
- **Códigos de requisito:** son **propuestos**. Cuando el equipo los apruebe se agregan al ERS (ver `README.md`, sección «Cómo agregar un requerimiento nuevo»).

---

## 1. Lo que pidió el equipo

### 1.1 Mesas: administración por el gerente y catálogo de secciones (HECHO)

Antes las mesas solo se creaban con scripts SQL. Ahora el gerente tiene la pantalla **Mesas** (`/gerente/mesas`) y la API `/api/catalogo/mesas`.

| Código | Requerimiento | Estado |
| --- | --- | --- |
| RF-MES-002 | **Registrar mesa**: número, capacidad, sección obligatoria y disponibilidad | Hecho: `POST /api/catalogo/mesas`; botón «Nueva mesa» |
| RF-MES-003 | **Actualizar mesa** (número, cantidad de personas, sección) | Hecho: `PATCH /api/catalogo/mesas/:id`; botón «Editar» |
| RF-MES-004 | **Marcar como disponible o no disponible** (no se borra) | Hecho: una mesa no disponible no aparece para la hostess ni para el mesero y no se puede sentar, reservar ni cambiar de estado (`409 mesa_no_disponible`) |
| RF-MES-005 | **Consultar mesas** como gerente, incluidas las no disponibles | Hecho: `GET /api/catalogo/mesas`, con filtros por disponibilidad, sección y búsqueda |
| RF-MES-006 | **Administrar secciones** | Hecho: crear, renombrar, inhabilitar/habilitar y borrar desde Gerente → Mesas → Secciones; `mesa.zona` referencia una sección activa |
| RF-MES-007 *(propuesto)* | Mostrar o agrupar por sección en el Salón de la hostess y en el Panel del mesero | Implementado (2026-10-21): grupos por sección, filtro «Sección» en la URL (`?seccion=`) y la sección en la tarjeta y la hoja de acciones. Ver `docs/pantallas-mesero.md` |

**Decisiones que se tomaron** (cámbienlas si no les parecen):

| Id | Decisión |
| --- | --- |
| D-1 | Las secciones tienen un catálogo administrable en la tabla `seccion`; `mesa.zona` debe corresponder a una sección activa. |
| D-2 | Gerencia puede crear, renombrar, inhabilitar/habilitar y borrar secciones. Una sección solo se borra cuando no tiene mesas asociadas; renombrar actualiza las mesas. |
| D-3 | **No se puede marcar como no disponible** una mesa ocupada, reservada, con cuenta abierta o con reservaciones vigentes: primero hay que liberarla o cancelar esas reservaciones. |
| D-4 | El número de mesa sigue siendo **único** y no se reutiliza, aunque la mesa esté no disponible. |
| D-5 | Cambiar la capacidad **no revisa** las reservaciones ya hechas. |

**Qué se verificó:** 54 pruebas de la API contra MySQL 8 real (incluyen las mesas), la migración `005` sobre una base con el esquema anterior, y 26 pruebas nuevas del frontend (453 en total). Se comprobó en la interfaz que la mesa 1, marcada como no disponible, desapareció del Salón de la hostess.

**Lo que aún falta alrededor de esto:**

- ~~Mostrar o agrupar por sección en el Salón y el Panel (RF-MES-007).~~ Implementado; la validación automatizada y el build están cubiertos, falta la prueba operativa contra una base compartida del restaurante.
- Una mesa con cuenta activa sigue sin poder desactivarse; tras el cobro se cierra la cuenta y se libera la mesa (ver D-3 y P-01).
- La bitácora de mesa está implementada en la migración 013; falta aplicarla en cada base y probarla con MySQL.
- Las bases existentes deben aplicar, en orden, las migraciones que les falten; los cambios recientes de catálogo, secciones y reservaciones están en 007–010. Ver `docs/actualizar-base-datos.md`.

### 1.2 Auditoría y cambio de contraseña

**Estado actual:** solo Gerencia puede iniciar el cambio con `POST /api/usuarios/:id/contrasena`. La persona afectada debe proporcionar su contraseña anterior, incluso si se cambia la del propio gerente. La migración `013_auditoria_seguridad.sql` instala triggers transaccionales que registran actor, usuario afectado y fecha; nunca guardan la contraseña ni su hash. Debe aplicarse una vez en cada base después de preparar el esquema y los usuarios iniciales.

| Código propuesto | Requerimiento | Verificación |
| --- | --- | --- |
| RF-AUD-001 | Registrar quién, a quién y cuándo se cambia una contraseña, sin guardar la contraseña ni su hash | Implementado por la auditoría de `credenciales`; el campo `password_hash` solo aparece en `campos_modificados` |
| RF-USR-008 | Que Gerencia cambie la contraseña de un usuario validando la contraseña anterior de este | Implementado en API, frontend y mock; aplica también al gerente que cambia la propia |
| RF-AUD-002 | Bitácora de INSERT/UPDATE/DELETE de las tablas de negocio | Implementado por triggers de la migración 013; pendiente aplicar la migración en cada base |

El actor autenticado se establece en la sesión MySQL que ejecuta la transacción. Se eligió guardar la bitácora en la misma base para que el cambio y su registro sean atómicos; los scripts externos sin actor autenticado quedan con `actor_id = NULL`. La migración protege además al primer gerente contra desactivación, cambio de rol o borrado. Para el diseño, los datos sensibles excluidos y los límites operativos, consulta [`auditoria-seguridad.md`](auditoria-seguridad.md).

---

## 2. Hallazgos adicionales (revisé el proyecto completo)

### 2.1 Importantes: afectan el uso real o el cumplimiento del ERS

| Id | Hallazgo | Detalle | Verificación |
| --- | --- | --- | --- |
| P-01 | **Resuelto: cierre de cuenta al cobrar** | `POST /api/caja/cuentas/:id/cobrar` registra la venta y los pagos y, en la misma transacción, marca pedidos pagados, llena `cerrada_en`, cierra la cuenta y libera la mesa. No permite cobrar cuentas no solicitadas ni pedidos sin entregar. | Resuelto |
| P-02 | **Auditoría de cancelaciones** | La migración 013 audita quién y cuándo modificó el pedido, incluidos estado y valores anterior/nuevo. No hay campos dedicados `pedido.id_cancelado_por` ni `pedido.cancelado_en`; la auditoría no se expone en la respuesta del pedido. | Implementado en migración; falta aplicarla en cada base y probar MySQL |
| P-03 | **Seguridad del ERS sin cubrir** | RNF-009 (bloqueo tras 5 intentos), RNF-011 (expiración por inactividad: hoy el token dura 8 horas fijas), RNF-012 (invalidar la sesión al salir) y registro de accesos fallidos/no autorizados. La auditoría 013 cubre cambios exitosos en datos, no intentos de acceso fallidos. | Parcial |
| P-04 | **Sin protecciones básicas de la API** | El backend no usa límite de peticiones (contra fuerza bruta) ni cabeceras de seguridad. No hay HTTPS configurado en el proyecto. | Verificado en `package.json`; el HTTPS es por validar |
| P-05 | **Las pruebas del backend son mínimas** | `backend/tests/` cubre dominio, mocks, importes, transporte, plantillas y cola de correo (64 pruebas en 9 archivos), pero no las rutas ni las reglas que requieren base de datos. El frontend sí tiene pruebas unitarias y de rutas, pero falta una prueba integral contra MySQL. | Verificado |
| P-06 | **Pantallas pendientes** | Caja ya está disponible en `/cajero/caja`; facturación fiscal aún no tiene proveedor, API ni pantalla. | Parcial |
| P-07 | **Falta `PATCH /api/lista-espera/:id`** | Quitar o editar un grupo de la lista de espera. | Verificado |

### 2.2 Reglas del dominio que el servidor no aplica o que chocan con el diseño

| Regla del ERS | Qué pasa hoy | Verificación |
| --- | --- | --- |
| 1 y 2: tiempo de tolerancia para clientes con reserva; liberar o cancelar si no llegan | **Implementada**: Gerencia configura 5–180 minutos (15 por defecto); el backend marca `vencida`, libera la mesa y encola un aviso por correo. Requiere migración 010 y configuración de Resend para entregar el correo. | Implementado; la configuración y las pruebas del proveedor están documentadas |
| 5: cada reserva se asocia a una mesa | La mesa es **opcional** (`id_mesa` puede ser nulo) y se asigna al sentar. Es una decisión de diseño por confirmar. | Verificado |
| 6: no dos reservas en la misma mesa y horario | Se evita de forma **indirecta** (para reservar, la mesa debe estar libre) y **solo para reservaciones de hoy**. No hay validación por franja horaria. | Verificado |
| 8 y 9: asignar mesas según el número de personas, con capacidad máxima | El frontend **solo avisa** («Puedes continuar si las acomodas») y el servidor acepta cualquier número de personas sin comparar con la capacidad. Puede ser intencional; hay que confirmarlo. | Verificado |
| 11: una mesa no puede tener más de un pedido activo | **Choca con el diseño actual**: una cuenta tiene varios pedidos a la vez (rondas de pedidos). Hay que decidir cuál vale y corregir el ERS o el código. | Verificado |
| 22: no registrar dos clientes con el mismo contacto | Solo lo valida el backend con una consulta; **la base de datos no tiene `UNIQUE`** en `cliente.telefono`, así que dos peticiones simultáneas podrían duplicarlo. | Verificado |

### 2.3 Auditoría y bitácora (amplía 1.2)

La migración 013 registra cambios de filas en las tablas de negocio. La bitácora no registra intentos de acceso fallidos ni eventos que no impliquen INSERT/UPDATE/DELETE:

| Evento | Qué guardar | Estado hoy |
| --- | --- | --- |
| Cambio de contraseña | Actor, afectado, fecha; el hash no se almacena | Migración 013 |
| Alta, edición o desactivación de usuario | Quién y qué cambió, excepto campos secretos | Migración 013 |
| Cambio de precio o de existencia de un producto | Quién, valor anterior y nuevo | Migración 013 |
| Cancelación de pedido | Quién, cuándo, motivo y cambio de estado | Migración 013; no se incluye en la respuesta del pedido |
| Cambio de estado de una mesa | Quién y cuándo | Migración 013 |
| Intentos de acceso fallidos o no autorizados | Usuario, hora | No capturado por la bitácora 013; pendiente RNF-017 |

La migración 013 debe aplicarse y probarse en cada base. También queda por definir el periodo de conservación y quién puede consultar la bitácora (probablemente solo el gerente). Es un dato personal y aplica RNF-028 y RNF-029.

### 2.4 Base de datos

| Id | Hallazgo | Verificación |
| --- | --- | --- |
| P-08 | `reservacion.estado` y `lista_espera.estado` son texto libre, **sin `CHECK` ni catálogo**. Los valores usados por la aplicación ya están documentados; `vencida` se asigna por el proceso de reservaciones. | Verificado |
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
| P-16 | Documentación de Gerencia (API de pedidos y pantallas de usuarios/productos) | Ya existen `docs/contrato-api-gerente.md` y `docs/pantallas-gerente.md`. | Resuelto |

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

1. Confirmar las decisiones D-3 a D-5 de las mesas; D-1 y D-2 ya se resolvieron con el catálogo de secciones.
2. Aplicar y probar la migración 013 en cada base; prueba operativa de secciones/mesas en el entorno compartido (RF-MES-007).
3. Implementar los controles de seguridad del ERS aún pendientes (P-03 y P-04); RF-USR-008 ya está implementado.
4. Facturación fiscal (RF-VEN-002), historial de ventas (RF-VEN-003) e informes (RF-VEN-004).
5. Pruebas de rutas del backend contra una base de datos (P-05).
6. Actualizar el ERS y documentación cuando se validen las reglas pendientes.

---

## 5. Lo que necesito que el equipo verifique

- Confirmar las reglas 5, 8, 9 y 11 de la sección 2.2: ¿son comportamientos intencionales o errores?
- Decidir si las ideas de la sección 3 interesan.
