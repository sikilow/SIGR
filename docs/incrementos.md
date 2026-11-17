# Incrementos del SIGR

Este documento organiza los comentarios de la maestra durante la presentación del sistema. El **Incremento 1** recoge las observaciones sobre la demostración; el **Incremento 2** resume los objetivos que se mencionaron para la siguiente entrega; el **Incremento 3** recoge la revisión del 15 de noviembre, con el portal de clientes, Caja y las correcciones que pidió la maestra antes de la presentación final.

> Las observaciones originales se conservan como requisitos de la revisión. La sección «Estado verificado» compara esos requisitos con el código actual; no implica que se haya probado el sistema conectado a una API/base compartida.

Para ubicar los contratos, guías por rol y documentación técnica relacionada, consulta el [índice de documentación](README.md).

## Estado verificado de los requisitos

Revisión del código y la documentación del proyecto realizada el 7 de noviembre de 2026. Las transcripciones del [Incremento 1](incrementos_audios_transcritos/incremento-1-2026-10-31.md), del [Incremento 2](incrementos_audios_transcritos/incremento-2-2026-11-03.md) y del [Incremento 3](incrementos_audios_transcritos/incremento-3-2026-11-15.md) se generaron automáticamente y pueden contener errores de reconocimiento; las frases dudosas no se interpretan como reglas definitivas.

| Área | Estado | Qué hace el proyecto y qué falta |
|---|---|---|
| Categorías y descripción de productos | ✅ Hecho | El catálogo admite categorías y exige una descripción para los productos. |
| Evitar productos duplicados | ✅ Hecho | El alta y la edición comprueban categoría, nombre y presentación para evitar duplicados. |
| Variantes en todo el catálogo | ✅ Hecho en código | El campo de presentación/variante se ofrece para todas las categorías; se puede distinguir sabor, porción, tamaño o número de personas y la identidad del producto incluye la presentación. |
| Inventario y reposición | 🟡 Parcial | Hay filtros e indicadores de Disponible, Stock bajo y Agotado; stock bajo es mayor que cero y menor o igual al mínimo, y agotado es cero. La identidad adicional de la variante sigue limitada a las categorías que permiten presentación. |
| Correo de usuarios | ✅ Hecho | El formulario y la API validan el formato; la base de datos impone unicidad. |
| Teléfono de usuarios de Gerencia | ✅ Hecho | Opcional; si se captura debe tener 10 dígitos (acepta espacios o guiones y se guarda solo con dígitos) y no puede repetirse entre usuarios. Validado en formulario, API y base de datos (migración 018). No confundirlo con el teléfono de cliente de Hostess, que ya requería 10 dígitos.
| Vencimiento de reservaciones | ✅ Hecho | La tolerancia se configura en Gerencia, con 15 minutos por defecto y un rango de 5 a 180 minutos. |
| Características de mesas para reservaciones | 🟡 Parcial | En la reservación se pueden indicar sección, planta baja, espacio para carriola y acceso sin escaleras; al asignar se muestran características y se prioriza la capacidad. Una mesa insuficiente aún puede seleccionarse con advertencia. |
| Características de mesas para lista de espera | ✅ Hecho en código | Al asignar mesa a un grupo de la lista, cada mesa muestra su sección y características (planta baja, carriola, sin escaleras). La hostess puede indicar qué necesita el grupo: las mesas que coinciden se sugieren primero y se marcan «Cumple lo que pidió». |
| Editar o quitar un grupo de la lista de espera | ✅ Hecho en código | `PATCH /api/lista-espera/:id` permite quitar al grupo (se fue) o cambiar cuántas personas son sin perder su lugar. Antes la pantalla ya ofrecía «Quitar de la lista», pero con la API real fallaba porque la ruta no existía. |
| Características de mesa en el portal de clientes | ✅ Hecho en código | Al reservar, el cliente ve las secciones del salón con sus características y puede pedir sección, planta baja, carriola o sin escaleras (migración 021). La hostess lo ve en la tarjeta («Pidió: …»), al editar y al registrar la llegada, donde esas mesas se sugieren primero. No aparta mesa. |
| Estados y orden de pedidos | ✅ Hecho en código | La interfaz maneja el avance del pedido y distingue «listo» de «entregado»; los listos aparecen primero y, dentro de cada grupo, los más recientes arriba. Falta validar en el entorno real el problema de cancelación desde teléfono descrito en la demostración. |
| Deshabilitar mesas/secciones | ✅ Hecho en código | Gerencia puede inhabilitar secciones o marcar mesas como no disponibles; no se ofrecen para asignación en los flujos de Hostess/Mesero. La API compartida y la actualización entre dispositivos requieren prueba operativa. |
| Caja y API compartida (Incremento 2) | 🟡 Parcial | Implementados fondo inicial, conciliación de efectivo separado de tarjeta/transferencia, cortes parciales/finales por cajero, ticket/Excel por corte, validación Mesero-Cajero y administración de métodos desde Gerencia. La API conectada a la base compartida y la sincronización entre dispositivos siguen sin prueba operativa. |
| Reportes de ventas | 🟡 Parcial | El cajero puede imprimir/exportar a Excel cada corte con cuentas por usuario, fecha/hora y método; falta una consulta histórica y reportes generales por periodo. |
| División de cuenta por comensal o producto | 🟡 Por decidir | El cobro admite varios métodos de pago para una cuenta; no divide consumos o importes entre personas/productos. La maestra pidió revisar esa posibilidad, pero no quedó como regla aprobada. |
| Reservaciones futuras y capacidad | 🟡 Parcial | La anticipación mínima ya es configurable por Gerencia (predeterminado 1 hora, migración 018) y se aplica a la hostess y al portal de clientes. Falta proteger la capacidad disponible por horario y evitar traslapes de mesa (holgura de la mesa, p. ej. 1 h 30 min).
| Detalle de productos y alérgenos | ✅ Resuelto | Decisión: no hay campo aparte. La descripción del producto indica ingredientes y alérgenos, y el mesero escribe una indicación **por producto** de cada pedido (`detalle_pedido.indicaciones`, hasta 120 caracteres en pantalla), que cocina ve en cada línea.

## Avances existentes relacionados

Estos puntos también deben quedar registrados, pero no son hallazgos pendientes de la maestra:

- **Pedidos del gerente (`feature/gerente-pedidos`):** pantalla para consultar los pedidos del salón y filtrarlos por día, estado, mesa, mesero o número. El gerente puede cancelar mientras el pedido está registrado, enviado o en preparación; no después de que esté listo para entregar. Reutiliza `PedidoDetalle` y `CancelarPedidoDialog`; la lógica de permisos está en `utils/reglasGerente.ts` y tiene pruebas. El alcance de esa rama fue solo frontend: no modificó backend ni base de datos.
- **Mesas por sección (`feature/zona-mesas`, RF-MES-007):** agrupa las mesas por sección en el panel del mesero y el salón de la hostess. El filtro «Sección» se combina con el estado y se conserva en la URL (`?seccion=`). Utiliza `utils/secciones.ts`, `GruposMesas` y `FiltroSeccion`. Con una sola sección, la interfaz se mantiene como antes.
- **Administración de secciones (RF-MES-006):** en Gerente → Mesas se puede crear, renombrar, inhabilitar/habilitar y borrar secciones. Toda mesa debe pertenecer a una sección activa; borrar solo se permite cuando no hay mesas asignadas. Una sección inhabilitada oculta sus mesas a meseros y hostess y no admite nuevas asignaciones. La migración `009_secciones_mesas.sql` registra los valores existentes y asigna «General» a las mesas que no tenían sección.
- **Correo de reservaciones (RF-COR-001):** confirmaciones, recordatorios, vencimientos y cancelaciones comparten cola y transporte Resend o SMTP. Cada aviso se envía en HTML con una tarjeta editorial de hasta 600 px y conserva una versión de texto plano; el diseño no cambia la lógica de negocio ni los asuntos.

## Incremento 1: observaciones de la revisión

### 1. Catálogo, categorías e inventario de productos

**Implementación aplicada:** el formulario del gerente mantiene la categoría, exige una descripción y muestra el campo de presentación o variante solo para las categorías «Bebidas» y «Postres» (por ejemplo, «lata de 355 ml», «botella de 1 litro» o «rebanada individual»). La identidad de una variante se determina por categoría, nombre y presentación, no por la descripción. Si se intenta crear una variante ya registrada, se muestra un error y no se modifica el inventario; hay que buscarla y usar **Editar** para establecer sus existencias. Al editar tampoco se permite convertirla en duplicado de otra variante. La presentación también se muestra en el menú del mesero. La lista del gerente distingue «Disponible», «Stock bajo» y «Agotado», con filtros separados. Los registros antiguos sin descripción se marcan «Detalle pendiente de completar» para que el gerente agregue la información real. **Pendiente:** permitir una presentación separada también en las demás categorías, cuando el producto tenga variantes que deban distinguirse. En bases existentes, aplicar las migraciones `007_catalogo_descripciones_obligatorias.sql` y `008_presentacion_producto.sql`.

- **Aplicar el detalle a todo el catálogo, no solo a las bebidas.** Las bebidas requieren distinguir presentación y contenido (por ejemplo, Coca-Cola de vidrio, lata o plástico, y su volumen). En platillos y otros productos también hay que identificar la variante cuando importe: porción o tamaño, presentación y características que permitan distinguir productos con el mismo nombre general. Ejemplos de la demostración: molletes y chile poblano. No hace falta inventar variantes para productos que realmente sean iguales.
- **Organizar con categorías.** Clasificar los productos para que el menú y las consultas sean fáciles de recorrer: por ejemplo, bebidas, entradas, platos fuertes y postres. Las categorías deben servir para cualquier tipo de producto del catálogo; sus nombres concretos deben corresponder al menú del restaurante.
- **Hacer obligatoria la descripción del producto.** Debe identificar claramente qué se registra y, cuando aplique, complementar la categoría, el nombre y la variante. No dejarla como campo opcional ni usarla como sustituto de una categoría o de la presentación específica.
- **Validar el registro previo para evitar duplicados.** Antes de crear, comprobar si ya existe la misma categoría, nombre y presentación. Si es el mismo artículo, rechazar el alta y pedir que se edite el registro existente para modificar precio o existencias; nunca sumar ni reemplazar automáticamente el stock desde «Nuevo producto». Si cambia la presentación, porción o variante, registrarlo como producto distinto.
- **Definir con claridad el estado del inventario.** Mostrar «Disponible», «Stock bajo» y «Agotado» según la existencia y el mínimo configurado: stock bajo cuando la existencia sea mayor que cero y esté en el mínimo o por debajo; agotado cuando sea cero. El producto agotado debe identificarse como agotado en el sistema y no confundirse con un producto inactivo.
- **Informar qué producto requiere reposición.** Hay filtros de stock bajo y agotado, además del nombre y descripción del producto; la identificación mediante una presentación específica queda limitada a Bebidas y Postres. Las variantes de otras categorías siguen pendientes cuando sean necesarias para identificar qué surtir.

### 2. Validación de datos de usuarios

- **Correo — hecho:** el formulario y la API validan el formato, y el correo es único. En la demostración se señaló un correo sin `@`.
- **Teléfono — pendiente:** el campo de usuarios de Gerencia es opcional, pero si se captura actualmente acepta cualquier carácter y longitud de hasta 20. Acordar la cantidad exacta de dígitos y si se exige unicidad, y validar la regla tanto en frontend como en API. La validación de 10 dígitos del cliente de Hostess corresponde a otro flujo.

### 3. Reservaciones, hostess y asignación de mesas

**Implementación aplicada:** la hora reservada inicia una tolerancia configurable desde **Gerente → Reservas** (15 minutos por defecto; 5–180). La anticipación del recordatorio también se configura allí (5 minutos por defecto; 1–30). La hostess pide el correo cuando está disponible (es opcional) para nuevas reservaciones y puede completar/corregir el correo de un cliente existente. El proceso del backend envía recordatorios con plantillas HTML y texto alternativo y, si no se registra la llegada a tiempo, cambia el estado a **Vencida**, libera la mesa y encola un correo explicativo mediante Resend o SMTP. Los errores se registran y reintentan. El transporte se configura en `backend/.env`, sin guardar API keys en el repositorio; consulta [`resend-reservaciones.md`](resend-reservaciones.md). Al hacer una reservación, la hostess puede preferir sección, planta baja, espacio para carriola y acceso sin escaleras; al registrar la llegada puede ver las características de las mesas disponibles. Las mesas compatibles con el número de personas se sugieren primero; si ninguna alcanza, aún se puede elegir con una advertencia. En bases existentes, aplicar `010_reservaciones_y_caracteristicas.sql`.

- **Vencimiento configurable — hecho:** permitir que el restaurante defina cuánto tiempo conserva una reservación su mesa. Se mencionaron 15 minutos como ejemplo habitual, no como un valor fijo que deba imponerse a todos los restaurantes.
- **Mesas de reservación — parcial:** se pueden indicar preferencias de sección, planta baja, espacio para carriola y acceso sin escaleras, y se muestran características de las mesas. Las opciones con capacidad suficiente se sugieren primero; una mesa insuficiente todavía puede elegirse con advertencia.
- **Mesas para la lista de espera — hecho en código:** al asignar una mesa a un grupo se muestran la sección y las características de acceso de cada mesa libre, y la hostess puede indicar qué necesita el grupo para que las mesas adecuadas aparezcan primero. También se puede cambiar el número de personas del grupo o quitarlo de la lista (`PATCH /api/lista-espera/:id`).
- **Disponibilidad de mesas — hecho en código:** Gerencia puede inhabilitar una sección o marcar como no disponible una mesa; las mesas no disponibles no se ofrecen en los flujos de Hostess/Mesero. No se deshabilita una mesa ocupada, reservada o con cuenta abierta.

### 4. Pedidos del mesero y cambios de estado

- **Estados y avance — hecho en código:** la interfaz distingue los estados del pedido y muestra «listo» antes de «entregado»; se mantiene la mesa asociada y la vista se actualiza al recibir cambios. En la lista del mesero los pedidos listos se priorizan y los más recientes aparecen primero dentro de cada grupo de prioridad.
- **Cancelación desde teléfono — pendiente de verificación operativa:** en la demostración no respondió la acción. Revisar y validar ese flujo en el entorno conectado, incluidos los permisos del gerente y la confirmación del resultado; la revisión del código no demuestra que esa prueba real se haya completado.

## Incremento 2: objetivos y estado verificado al 3 de noviembre de 2026

La [transcripción íntegra del audio del 3 de noviembre](incrementos_audios_transcritos/incremento-2-2026-11-03.md) registra la demostración y los comentarios de revisión. La transcripción es automática; solo se tratan como requisitos los puntos claros y corroborables, y las propuestas o preguntas se conservan como decisiones por confirmar.

En la presentación, la maestra señaló como siguiente avance:

1. **Agregar Caja.** Completar el flujo de cobro que necesita el restaurante.
2. **Centralizar los datos y conectar el sistema con la API compartida.** La información no debe depender de una base local distinta por equipo o dispositivo. Los cambios deben llegar a la misma fuente de datos para que se reflejen al consultar desde otros dispositivos.
3. **Validar la comunicación de extremo a extremo.** Comprobar que las solicitudes del sistema lleguen a la API y que las operaciones de lectura y escritura se reflejen correctamente en la base de datos compartida. La revisión mencionó problemas en los que se enviaban peticiones GET y POST, pero la API no recibía la información.

### Hallazgos de revisión del Incremento 2

| Área | Estado | Qué hace el proyecto y qué falta |
|---|---|---|
| Solicitar cuenta sin pedidos | ✅ Hecho en código | La pantalla y la API rechazan cuentas sin pedidos activos o con total cero. |
| Cobro, ticket y cierre de cuenta | ✅ Hecho en código | El cobro es transaccional, acepta pagos combinados por método, registra venta/pagos, cierra la cuenta y libera la mesa. La API bloquea el cobro mientras haya pedidos sin entregar. |
| Cuenta solicitada con pedidos sin entregar | ✅ Resuelto | Decisión: no se debe solicitar la cuenta si no se encargó nada, y tampoco con pedidos sin entregar. El mesero ve el aviso y la API rechaza la solicitud (`409`) si no hay pedidos activos o si queda alguno sin entregar.
| Forma de pago solicitada | ✅ Hecho en código | Efectivo se preselecciona para solicitud física; para digital Caja exige elegir el método real. Un cobro que no coincide requiere confirmación explícita del cajero y la API la valida. |
| Fondo inicial de caja | ✅ Hecho en código | Abrir corte registra el efectivo que recibe el cajero. La migración 014 agrega el campo a `corte_caja`. |
| Conciliación del corte por método | ✅ Hecho en código | Se muestran ventas por método y el efectivo esperado se calcula como fondo inicial más pagos en efectivo. Tarjeta y transferencia no se suman al cajón. El cajero registra el efectivo contado y ve faltante/sobrante. |
| Catálogo de métodos de pago | ✅ Hecho en código | Gerencia puede agregar y activar/desactivar métodos; Caja solo ofrece los activos y los pagos históricos se conservan. Se requiere aplicar la migración 014 en bases existentes. |
| Cortes parciales y cierre de turno/día | ✅ Hecho en código | Cada cajero puede registrar un corte parcial o un cierre final. Ambos guardan hora de inicio/cierre, conteo y ventas; el cierre entrega ticket imprimible y Excel por cajero. No hay cierre general a cargo de Gerencia. |
| Reporte e historial de ventas | 🟡 Parcial | El Excel de cada corte lista cuenta, mesa, fecha/hora, cajero, mesero y totales por método. Aún no hay consulta histórica ni reporte general por periodo; RF-VEN-003 y RF-VEN-004 siguen pendientes. |
| División entre comensales/productos | 🟡 Por decidir | Se permite dividir el pago entre métodos, no separar una cuenta por persona o por producto. La maestra sugirió revisar esa función; el alcance no quedó aprobado. |
| Propinas | 🟡 Por definir | No se registran. En el audio se advierte que no deben mezclarse con la venta y que su tratamiento fiscal requiere revisión; acordar si entran al sistema y cómo se separan. |
| API y base compartida | 🟡 Parcial | El frontend tiene modo API (`VITE_USE_MOCK=false`) y el modo `api` apunta al backend local mediante proxy. La demostración indica que los datos usados eran locales y distintos de la base remota. Falta configurar el servidor/base compartidos y validar operaciones de lectura/escritura desde varios dispositivos; no se comprobó aquí el entorno de entrega. |
| Reservaciones futuras y capacidad | 🟡 Parcial | Anticipación mínima configurable (migración 018). Al registrar una solicitud, al reservar desde el portal y al confirmar, el sistema comprueba que haya una mesa del salón con capacidad para ese grupo a esa hora, contando las reservaciones confirmadas que se traslapan (cada reservación ocupa su mesa 1 h 30 min, valor fijo por ahora). Falta que Gerencia configure esa duración y no considera todavía las mesas ocupadas en ese momento por clientes sin reservación. |
| Variantes y descripción del catálogo | 🟡 Parcial | El campo de presentación/variante se ofrece en todas las categorías y la descripción obligatoria ahora indica incluir ingredientes y alérgenos. Falta acordar si se requiere validación estructurada de alérgenos; el contenido libre no puede garantizar que se hayan capturado. |
| Correos y vencimiento de reservaciones | ✅ Hecho en código | La grabación muestra los avisos de registro/cancelación y el vencimiento; la tolerancia y el recordatorio son configurables. La hostess puede asignar mesa al registrar la llegada, por lo que vencer una reservación sin mesa asignada no libera una mesa ajena. |

La revisión del repositorio confirma que el backend tiene pruebas unitarias de importes de Caja, pero no pruebas de rutas contra MySQL ni una prueba integral del flujo en la base compartida. La guía de [integración de API](integracion-api.md) incluye pasos manuales para verificarlo.

La Caja y la integración con API ya cuentan con documentación en el repositorio: [contrato-api-caja.md](contrato-api-caja.md) e [integracion-api.md](integracion-api.md). Esta referencia no sustituye la verificación de que el flujo completo esté conectado y funcione en el entorno de entrega.

## Incremento 3: revisión del 15 de noviembre de 2026

La [transcripción íntegra del audio del 15 de noviembre](incrementos_audios_transcritos/incremento-3-2026-11-15.md) (46 min) registra la demostración del portal de clientes, del flujo de pedido y cobro, del corte de caja y de los métodos de pago, junto con las correcciones que pidió la maestra. La transcripción es automática; solo se tratan como requisitos los puntos claros. Lo que no se entiende bien se marca «por confirmar».

La columna «Estado» indica lo observado en la demostración y lo pedido; **no se ha verificado todavía contra el código** de la rama actual.

### Correcciones pedidas

La maestra cerró la sesión con esta lista de correcciones (0:43:45 a 0:44:45 en la transcripción):

1. Corregir la mesa virtual para los pedidos para llevar. — ✅ Hecho en código.
2. Corregir los métodos de pago, incluidos los adicionales. — ✅ Hecho en código.
3. Alertar a la hostess cuando entra una solicitud de reservación. — ✅ Hecho en código.
4. Cambiar los nombres de los estados de la reservación, con un estado «pendiente de solicitud». — ✅ Hecho en código («Solicitud pendiente»).
5. Corregir el correo. — ✅ Hecho en código.
6. Mostrar la reservación como próxima solo después de que se confirme. — ✅ Hecho en código.
7. Mostrar en el corte lo que falta o sobra. — ✅ Hecho en código («Faltante» y «Sobrante»).

### Hallazgos de revisión

| Área | Estado | Qué pidió la maestra o qué se observó |
|---|---|---|
| Estados de la reservación hecha por el cliente | ✅ Hecho en código | Lo que pide el cliente desde el portal es una **solicitud** y queda «Solicitud pendiente» hasta que la hostess la confirma. En el portal aparece en «Solicitudes en espera de confirmación» (con el aviso de que todavía no tiene mesa asegurada) y **no** como próxima reservación: «Próximas reservaciones» solo muestra las confirmadas. En el Salón de la hostess hay dos listas: «Solicitudes por confirmar» y «Próximas reservaciones» (solo confirmadas); el filtro «Solicitudes» de Reservaciones muestra las pendientes. El nombre del estado en la base sigue siendo `pendiente` (solo cambió lo que ve la gente). |
| Correo de una solicitud nueva | ✅ Hecho en código | El primer correo ya no promete mesa: «Recibimos tu solicitud de reservación», con el aviso de que todavía no está confirmada y no hay mesa asegurada. El correo «Reservación confirmada» solo sale cuando la hostess confirma, y antes se comprueba que haya una mesa disponible para ese grupo a esa hora. El recordatorio ya solo se manda a reservaciones confirmadas. Las solicitudes hechas desde el portal también reciben ahora el correo de «solicitud recibida». |
| Alerta a la hostess por solicitudes | ✅ Hecho en código | Al llegar una solicitud nueva (por ejemplo, desde el portal de clientes), la pantalla de la hostess muestra una alerta persistente con nombre, fecha, hora y personas, y los botones «Ver solicitud» (abre el día y filtra las pendientes) y «Descartar». El menú Reservaciones muestra la cantidad por confirmar. Se consulta cada 10 s, igual que el resto de las pantallas. Falta probarlo con la API y la base compartidas. Las dos listas (solicitudes y confirmadas) están en el Salón. |
| Portal de clientes | 🟡 Parcial | Se demostró el registro del cliente y el alta de la reservación, con consulta de su estado. En la demo el portal solo ofrece registrarse, reservar y consultar. Las horas se eligen en punto, sin media hora. La mesa la asigna la hostess, no el cliente. |
| WhatsApp u otro canal | 🟡 Por decidir | La maestra sugirió WhatsApp o Telegram para una versión 2. El equipo señaló que WhatsApp Business tiene costo y requisitos. Por ahora el canal es el correo y no se exigió migrar. |
| Pedidos para llevar y mesa virtual | ✅ Hecho en código | Sección «Para llevar» con mesas virtuales (101 a 110; Gerencia agrega más en Mesas) y un **canal** por pedido (Mostrador, Teléfono, Rappi, Uber Eats, DiDi Food, Mandadito…) que Gerencia administra en **Gerente → Canales de pedido**. El mesero usa «Pedido para llevar» en el panel: elige el canal y, si quiere, un nombre o folio; el sistema ocupa la primera mesa virtual libre y se piden los productos como en cualquier mesa. Cocina ve «Para llevar · canal», el mesero solicita la cuenta y el cajero cobra; al cobrar, la mesa virtual queda libre. La hostess no ve estas mesas. Una mesa abierta por error se libera desde su hoja de acciones. Falta probarlo con la API y la base compartidas y decidir si las plataformas liquidan con un método de pago propio (configurable en Métodos de pago). |
| «Para llevar» dentro de la misma cuenta | 🟡 Por decidir | Antes de cerrar la cuenta, lo que el cliente pide para llevar se agrega al mismo pedido con la observación «para llevar». Una vez pagada la cuenta, cualquier cosa nueva es otro pedido. Se sugirió que el mesero pregunte siempre si desean algo más o para llevar. |
| Método de pago del mesero y del cajero | ✅ Observado en la demo | El equipo mostró que ya se corrigió el error del incremento anterior: el método que elige el mesero llega a Caja. |
| Corte de caja y cuadre de efectivo | ✅ Hecho | Se demostraron apertura con fondo (500), dos cobros (uno en efectivo y uno por transferencia), conteo de efectivo, confirmar el cierre o volver a contar, y un sobrante de 30. El gerente ve efectivo contado, faltante o sobrante y desglose por método. Con tarjeta deben conservarse los vouchers. |
| «Iniciar caja» en lugar de «abrir corte» | ✅ Hecho en código | La maestra llamó «inicio de caja» a la apertura del turno con el efectivo inicial. La pantalla del cajero usa «Iniciar caja» (botón, estado «Caja iniciada» o «Sin iniciar» y mensajes). El cierre sigue llamándose «Cerrar corte», como lo nombró la maestra. |
| Etiqueta «diferencia» del corte | ✅ Hecho en código | La maestra pidió mostrar con claridad lo que falta y lo que sobra, y cambiar «diferencia» por «faltante». Las pantallas del cajero y del gerente muestran «Faltante», «Sobrante» o «Cuadra», y el texto de ayuda del cierre ya no dice «diferencia». |
| Nombre de «Cortes» en Gerencia | 🟡 Por confirmar | La maestra comentó que el nombre «Cortes» no era lo más adecuado en ese contexto. El audio no deja claro qué alternativa propone (¿«Cortes de caja»?), así que el nombre del menú no se cambió. |
| Categorías y métodos de pago nuevos | ⬜ Pendiente | El gerente creó la categoría «Vales de despensa». Al cobrar un pedido, el método nuevo **no apareció** en Caja, y tampoco funcionó el pago con tarjeta. La maestra indicó que es un error de ejecución del programa y que el modelo de datos no está mal. Hay que corregirlo y probar los métodos adicionales. |
| Presentación final | 🟡 Por definir | La maestra dijo que enviará por correo lo que hay que presentar. Se mencionó una presentación de unos 10 minutos y código de vestimenta. La fecha y el formato no quedaron claros en el audio. Se pidió cuidar la conexión de la base de datos y las pruebas antes de presentar. |

### Observaciones de la demostración

- La demostración del flujo completo (asignar mesa, pedir, cocina, entregar, solicitar cuenta, cobrar) funcionó con datos locales.
- Se confirmó que se puede seguir agregando pedidos a una mesa mientras la cuenta no se haya solicitado.
- Durante la presentación hubo fallos al probar métodos de pago nuevos. La maestra recomendó descubrirlos antes de la presentación final.
- El equipo pidió ver también la vista del gerente de cortes, que muestra efectivo contado, diferencia y desglose por método.

## Corrección posterior: acceso de Gerencia a Reservas

La pantalla de configuración de reservaciones se había registrado por error dentro del grupo de rutas de Mesero. Se movió a `/gerente/reservaciones`, bajo la protección del rol `gerente`, y se agregó una prueba de ruta para evitar que vuelva a quedar asociada al rol equivocado. La compilación del frontend y la prueba específica de ruta pasaron.

Para correr los cambios recientes de base de datos consulta [`actualizar-base-datos.md`](actualizar-base-datos.md). La configuración y operación del envío de correo se detalla en [`resend-reservaciones.md`](resend-reservaciones.md).
