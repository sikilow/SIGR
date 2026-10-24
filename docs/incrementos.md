# Incrementos del SIGR

Este documento organiza los comentarios de la maestra durante la presentación del sistema. El **Incremento 1** recoge las observaciones sobre la demostración; el **Incremento 2** resume los objetivos que se mencionaron para la siguiente entrega. En la grabación no se definió el alcance del Incremento 3.

> Estas notas registran lo solicitado en esa revisión, no confirman por sí solas qué puntos siguen pendientes en la versión actual del sistema.

## Avances existentes relacionados

Estos puntos también deben quedar registrados, pero no son hallazgos pendientes de la maestra:

- **Pedidos del gerente (`feature/gerente-pedidos`):** pantalla para consultar los pedidos del salón y filtrarlos por día, estado, mesa, mesero o número. El gerente puede cancelar mientras el pedido está registrado, enviado o en preparación; no después de que esté listo para entregar. Reutiliza `PedidoDetalle` y `CancelarPedidoDialog`; la lógica de permisos está en `utils/reglasGerente.ts` y tiene pruebas. El alcance de esa rama fue solo frontend: no modificó backend ni base de datos.
- **Mesas por sección (`feature/zona-mesas`, RF-MES-007):** agrupa las mesas por sección en el panel del mesero y el salón de la hostess. El filtro «Sección» se combina con el estado y se conserva en la URL (`?seccion=`). Utiliza `utils/secciones.ts`, `GruposMesas` y `FiltroSeccion`. Con una sola sección, la interfaz se mantiene como antes.
- **Administración de secciones (RF-MES-006):** en Gerente → Mesas se puede crear, renombrar, inhabilitar/habilitar y borrar secciones. Toda mesa debe pertenecer a una sección activa; borrar solo se permite cuando no hay mesas asignadas. Una sección inhabilitada oculta sus mesas a meseros y hostess y no admite nuevas asignaciones. La migración `009_secciones_mesas.sql` registra los valores existentes y asigna «General» a las mesas que no tenían sección.

## Incremento 1: observaciones de la revisión

### 1. Catálogo, categorías e inventario de productos

**Implementación aplicada:** el formulario del gerente mantiene la categoría, exige una descripción y muestra el campo de presentación o variante solo para las categorías «Bebidas» y «Postres» (por ejemplo, «lata de 355 ml», «botella de 1 litro» o «rebanada individual»). La identidad de una variante se determina por categoría, nombre y presentación, no por la descripción. Si se intenta crear una variante ya registrada, se muestra un error y no se modifica el inventario; hay que buscarla y usar **Editar** para establecer sus existencias. Al editar tampoco se permite convertirla en duplicado de otra variante. La presentación también se muestra en el menú del mesero. La lista del gerente distingue «Disponible», «Stock bajo» y «Agotado», con filtros separados. Los registros antiguos sin descripción se marcan «Detalle pendiente de completar» para que el gerente agregue la información real. En bases existentes, aplicar las migraciones `007_catalogo_descripciones_obligatorias.sql` y `008_presentacion_producto.sql`.

- **Aplicar el detalle a todo el catálogo, no solo a las bebidas.** Las bebidas requieren distinguir presentación y contenido (por ejemplo, Coca-Cola de vidrio, lata o plástico, y su volumen). En platillos y otros productos también hay que identificar la variante cuando importe: porción o tamaño, presentación y características que permitan distinguir productos con el mismo nombre general. Ejemplos de la demostración: molletes y chile poblano. No hace falta inventar variantes para productos que realmente sean iguales.
- **Organizar con categorías.** Clasificar los productos para que el menú y las consultas sean fáciles de recorrer: por ejemplo, bebidas, entradas, platos fuertes y postres. Las categorías deben servir para cualquier tipo de producto del catálogo; sus nombres concretos deben corresponder al menú del restaurante.
- **Hacer obligatoria la descripción del producto.** Debe identificar claramente qué se registra y, cuando aplique, complementar la categoría, el nombre y la variante. No dejarla como campo opcional ni usarla como sustituto de una categoría o de la presentación específica.
- **Validar el registro previo para evitar duplicados.** Antes de crear, comprobar si ya existe la misma categoría, nombre y presentación. Si es el mismo artículo, rechazar el alta y pedir que se edite el registro existente para modificar precio o existencias; nunca sumar ni reemplazar automáticamente el stock desde «Nuevo producto». Si cambia la presentación, porción o variante, registrarlo como producto distinto.
- **Definir con claridad el estado del inventario.** Mostrar «Disponible», «Stock bajo» y «Agotado» según la existencia y el mínimo configurado: stock bajo cuando la existencia sea mayor que cero y esté en el mínimo o por debajo; agotado cuando sea cero. El producto agotado debe identificarse como agotado en el sistema y no confundirse con un producto inactivo.
- **Informar qué producto requiere reposición.** Las alertas y consultas deben mostrar categoría, nombre y variante o descripción suficiente para identificar el artículo específico, no solo un nombre genérico como «Coca-Cola». Se sugirió facilitar al gerente una lista de productos por surtir.

### 2. Validación de datos de usuarios

- Validar que el teléfono tenga una cantidad y formato de dígitos válidos; no aceptar letras ni una longitud incorrecta 'Agregar usuario no lo tiene (Gerente), y que sea unico solo gerente'.
- Validar el formato del correo electrónico; durante la demostración se señaló un correo sin `@` 'Agregar usuario si lo tiene (Gerente) (hostess)'.

### 3. Reservaciones, hostess y asignación de mesas

**Implementación aplicada:** la hora reservada inicia una tolerancia configurable desde **Gerente → Reservas** (15 minutos por defecto; 5–180). La anticipación del recordatorio también se configura allí (5 minutos por defecto; 1–30). La hostess solicita correo para nuevas reservaciones y puede completar/corregir el correo de un cliente existente. El proceso del backend envía recordatorios y, si no se registra la llegada a tiempo, cambia el estado a **Vencida**, libera la mesa y encola un correo explicativo mediante Resend. Los errores se registran y reintentan. Resend se configura en `backend/.env`, sin guardar API keys en el repositorio; consulta [`resend-reservaciones.md`](resend-reservaciones.md). Al hacer una reservación, la hostess puede preferir sección, planta baja, espacio para carriola y acceso sin escaleras; al registrar la llegada puede ver las características de las mesas disponibles. Las mesas compatibles con el número de personas se sugieren primero; si ninguna alcanza, aún se puede elegir con una advertencia. En bases existentes, aplicar `010_reservaciones_y_caracteristicas.sql`.

- **Vencimiento configurable:** permitir que el restaurante defina cuánto tiempo conserva una reservación su mesa. Se mencionaron 15 minutos como ejemplo habitual, no como un valor fijo que deba imponerse a todos los restaurantes.
- **Mesas disponibles y adecuadas:** ofrecer mesas libres compatibles con el número de personas y mostrar sus características. Se mencionaron necesidades como planta baja o evitar escaleras para personas mayores o clientes con carriola, esto al momento de hacer la reserva (ver seccion al hacer reserva).

### 4. Pedidos del mesero y cambios de estado

- Revisar los errores observados al cambiar o consultar estados de pedidos y asegurar que los estados se muestren de forma consistente para los roles que participan.
- Hacer visible el avance del pedido —por ejemplo, pendiente, en preparación y entregado— sin confundir un pedido listo con uno entregado.
- Mantener clara la relación entre pedido, mesa y estado, y actualizar la vista del mesero cuando haya cambios.
- Durante la prueba desde un teléfono no respondió la acción para cancelar un pedido. Revisar y validar ese flujo, incluidos los permisos del gerente y la confirmación del resultado.

## Incremento 2: objetivos mencionados para la siguiente entrega "no hecho, hasta el 2 de noviembre"

En la presentación, la maestra señaló como siguiente avance:

1. **Agregar Caja.** Completar el flujo de cobro que necesita el restaurante.
2. **Centralizar los datos y conectar el sistema con la API compartida.** La información no debe depender de una base local distinta por equipo o dispositivo. Los cambios deben llegar a la misma fuente de datos para que se reflejen al consultar desde otros dispositivos.
3. **Validar la comunicación de extremo a extremo.** Comprobar que las solicitudes del sistema lleguen a la API y que las operaciones de lectura y escritura se reflejen correctamente en la base de datos compartida. La revisión mencionó problemas en los que se enviaban peticiones GET y POST, pero la API no recibía la información.

La Caja y la integración con API ya cuentan con documentación en el repositorio: [contrato-api-caja.md](contrato-api-caja.md) e [integracion-api.md](integracion-api.md). Esta referencia no sustituye la verificación de que el flujo completo esté conectado y funcione en el entorno de entrega.

## Incremento 3: por definir

La grabación no especifica funcionalidades ni criterios de aceptación para este incremento. Su alcance debe acordarse en una revisión posterior; no se asignan aquí requisitos por suposición.

## Corrección posterior: acceso de Gerencia a Reservas

La pantalla de configuración de reservaciones se había registrado por error dentro del grupo de rutas de Mesero. Se movió a `/gerente/reservaciones`, bajo la protección del rol `gerente`, y se agregó una prueba de ruta para evitar que vuelva a quedar asociada al rol equivocado. La compilación del frontend y la prueba específica de ruta pasaron.

Para correr los cambios recientes de base de datos consulta [`actualizar-base-datos.md`](actualizar-base-datos.md). La configuración y operación del envío de correo se detalla en [`resend-reservaciones.md`](resend-reservaciones.md).
