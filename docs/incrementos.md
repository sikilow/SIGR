# Incrementos del SIGR

Este documento organiza los comentarios de la maestra durante la presentación del sistema. El **Incremento 1** recoge las observaciones sobre la demostración; el **Incremento 2** resume los objetivos que se mencionaron para la siguiente entrega. En la grabación no se definió el alcance del Incremento 3.

> Las observaciones originales se conservan como requisitos de la revisión. La sección «Estado verificado» compara esos requisitos con el código actual; no implica que se haya probado el sistema conectado a una API/base compartida.

Para ubicar los contratos, guías por rol y documentación técnica relacionada, consulta el [índice de documentación](README.md).

## Estado verificado de los requisitos

Revisión del código y la documentación del proyecto realizada el 7 de noviembre de 2026. Las transcripciones del [Incremento 1](incrementos_audios_transcritos/incremento-1-2026-10-31.md) y del [Incremento 2](incrementos_audios_transcritos/incremento-2-2026-11-03.md) se generaron automáticamente y pueden contener errores de reconocimiento; las frases dudosas no se interpretan como reglas definitivas.

| Área | Estado | Qué hace el proyecto y qué falta |
|---|---|---|
| Categorías y descripción de productos | ✅ Hecho | El catálogo admite categorías y exige una descripción para los productos. |
| Evitar productos duplicados | ✅ Hecho | El alta y la edición comprueban categoría, nombre y presentación para evitar duplicados. |
| Variantes en todo el catálogo | ✅ Hecho en código | El campo de presentación/variante se ofrece para todas las categorías; se puede distinguir sabor, porción, tamaño o número de personas y la identidad del producto incluye la presentación. |
| Inventario y reposición | 🟡 Parcial | Hay filtros e indicadores de Disponible, Stock bajo y Agotado; stock bajo es mayor que cero y menor o igual al mínimo, y agotado es cero. La identidad adicional de la variante sigue limitada a las categorías que permiten presentación. |
| Correo de usuarios | ✅ Hecho | El formulario y la API validan el formato; la base de datos impone unicidad. |
| Teléfono de usuarios de Gerencia | ⬜ Pendiente | Es opcional y solo se limita a 20 caracteres. No se validan dígitos, longitud específica ni unicidad. El audio confirma que es opcional, pero no permite determinar con confianza la longitud requerida; acordar también si debe ser único. No confundirlo con el teléfono de cliente de Hostess, que sí requiere 10 dígitos. |
| Vencimiento de reservaciones | ✅ Hecho | La tolerancia se configura en Gerencia, con 15 minutos por defecto y un rango de 5 a 180 minutos. |
| Características de mesas para reservaciones | 🟡 Parcial | En la reservación se pueden indicar sección, planta baja, espacio para carriola y acceso sin escaleras; al asignar se muestran características y se prioriza la capacidad. Una mesa insuficiente aún puede seleccionarse con advertencia. |
| Características de mesas para lista de espera | ⬜ Pendiente | La asignación sugiere mesas libres por capacidad, pero solo muestra número y capacidad; faltan la sección y características de acceso para elegir una mesa adecuada al grupo. |
| Estados y orden de pedidos | ✅ Hecho en código | La interfaz maneja el avance del pedido y distingue «listo» de «entregado»; los listos aparecen primero y, dentro de cada grupo, los más recientes arriba. Falta validar en el entorno real el problema de cancelación desde teléfono descrito en la demostración. |
| Deshabilitar mesas/secciones | ✅ Hecho en código | Gerencia puede inhabilitar secciones o marcar mesas como no disponibles; no se ofrecen para asignación en los flujos de Hostess/Mesero. La API compartida y la actualización entre dispositivos requieren prueba operativa. |
| Caja y API compartida (Incremento 2) | 🟡 Parcial | Implementados fondo inicial, conciliación de efectivo separado de tarjeta/transferencia, cortes parciales/finales por cajero, ticket/Excel por corte, validación Mesero-Cajero y administración de métodos desde Gerencia. La API conectada a la base compartida y la sincronización entre dispositivos siguen sin prueba operativa. |
| Reportes de ventas | 🟡 Parcial | El cajero puede imprimir/exportar a Excel cada corte con cuentas por usuario, fecha/hora y método; falta una consulta histórica y reportes generales por periodo. |
| División de cuenta por comensal o producto | 🟡 Por decidir | El cobro admite varios métodos de pago para una cuenta; no divide consumos o importes entre personas/productos. La maestra pidió revisar esa posibilidad, pero no quedó como regla aprobada. |
| Reservaciones futuras y capacidad | 🟡 Parcial | Se registran reservaciones futuras y se asigna mesa al llegar; falta verificar y proteger la capacidad disponible por horario, evitar traslapes y acordar la anticipación mínima para reservar. |
| Detalle de productos y alérgenos | 🟡 Parcial | La descripción es obligatoria, pero no se estructura ni valida que incluya ingredientes o información de alérgenos; acordar qué detalle necesita el restaurante. |

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
- **Mesas para la lista de espera — pendiente:** al asignar una mesa a un grupo, la lista actual muestra las libres y sus capacidades, pero no la sección ni las características de acceso. Añadir esa información para que Hostess pueda escoger según las necesidades del grupo.
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
| Cuenta solicitada con pedidos sin entregar | 🟡 Decisión pendiente | Se puede solicitar, pero no cobrar hasta entregar o cancelar todos los pedidos. Con la cuenta `por_pagar` no se permite cancelar pedidos. Acordar si se impide solicitarla antes de la entrega o si se habilita una cancelación autorizada posterior; hoy no existe esta última opción. |
| Forma de pago solicitada | ✅ Hecho en código | Efectivo se preselecciona para solicitud física; para digital Caja exige elegir el método real. Un cobro que no coincide requiere confirmación explícita del cajero y la API la valida. |
| Fondo inicial de caja | ✅ Hecho en código | Abrir corte registra el efectivo que recibe el cajero. La migración 014 agrega el campo a `corte_caja`. |
| Conciliación del corte por método | ✅ Hecho en código | Se muestran ventas por método y el efectivo esperado se calcula como fondo inicial más pagos en efectivo. Tarjeta y transferencia no se suman al cajón. El cajero registra el efectivo contado y ve faltante/sobrante. |
| Catálogo de métodos de pago | ✅ Hecho en código | Gerencia puede agregar y activar/desactivar métodos; Caja solo ofrece los activos y los pagos históricos se conservan. Se requiere aplicar la migración 014 en bases existentes. |
| Cortes parciales y cierre de turno/día | ✅ Hecho en código | Cada cajero puede registrar un corte parcial o un cierre final. Ambos guardan hora de inicio/cierre, conteo y ventas; el cierre entrega ticket imprimible y Excel por cajero. No hay cierre general a cargo de Gerencia. |
| Reporte e historial de ventas | 🟡 Parcial | El Excel de cada corte lista cuenta, mesa, fecha/hora, cajero, mesero y totales por método. Aún no hay consulta histórica ni reporte general por periodo; RF-VEN-003 y RF-VEN-004 siguen pendientes. |
| División entre comensales/productos | 🟡 Por decidir | Se permite dividir el pago entre métodos, no separar una cuenta por persona o por producto. La maestra sugirió revisar esa función; el alcance no quedó aprobado. |
| Propinas | 🟡 Por definir | No se registran. En el audio se advierte que no deben mezclarse con la venta y que su tratamiento fiscal requiere revisión; acordar si entran al sistema y cómo se separan. |
| API y base compartida | 🟡 Parcial | El frontend tiene modo API (`VITE_USE_MOCK=false`) y el modo `api` apunta al backend local mediante proxy. La demostración indica que los datos usados eran locales y distintos de la base remota. Falta configurar el servidor/base compartidos y validar operaciones de lectura/escritura desde varios dispositivos; no se comprobó aquí el entorno de entrega. |
| Reservaciones futuras y capacidad | 🟡 Parcial | Se puede registrar una fecha futura y asignar mesa al llegar, pero la API no comprueba disponibilidad por franja horaria ni evita traslapes de capacidad. Acordar también la anticipación mínima de reserva y el intervalo durante el que una mesa debe protegerse. La tolerancia de llegada y los recordatorios configurables sí están implementados. |
| Variantes y descripción del catálogo | 🟡 Parcial | El campo de presentación/variante se ofrece en todas las categorías y la descripción obligatoria ahora indica incluir ingredientes y alérgenos. Falta acordar si se requiere validación estructurada de alérgenos; el contenido libre no puede garantizar que se hayan capturado. |
| Correos y vencimiento de reservaciones | ✅ Hecho en código | La grabación muestra los avisos de registro/cancelación y el vencimiento; la tolerancia y el recordatorio son configurables. La hostess puede asignar mesa al registrar la llegada, por lo que vencer una reservación sin mesa asignada no libera una mesa ajena. |

La revisión del repositorio confirma que el backend tiene pruebas unitarias de importes de Caja, pero no pruebas de rutas contra MySQL ni una prueba integral del flujo en la base compartida. La guía de [integración de API](integracion-api.md) incluye pasos manuales para verificarlo.

La Caja y la integración con API ya cuentan con documentación en el repositorio: [contrato-api-caja.md](contrato-api-caja.md) e [integracion-api.md](integracion-api.md). Esta referencia no sustituye la verificación de que el flujo completo esté conectado y funcione en el entorno de entrega.

## Incremento 3: por definir

La grabación no especifica funcionalidades ni criterios de aceptación para este incremento. Su alcance debe acordarse en una revisión posterior; no se asignan aquí requisitos por suposición.

## Corrección posterior: acceso de Gerencia a Reservas

La pantalla de configuración de reservaciones se había registrado por error dentro del grupo de rutas de Mesero. Se movió a `/gerente/reservaciones`, bajo la protección del rol `gerente`, y se agregó una prueba de ruta para evitar que vuelva a quedar asociada al rol equivocado. La compilación del frontend y la prueba específica de ruta pasaron.

Para correr los cambios recientes de base de datos consulta [`actualizar-base-datos.md`](actualizar-base-datos.md). La configuración y operación del envío de correo se detalla en [`resend-reservaciones.md`](resend-reservaciones.md).
