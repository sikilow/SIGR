# Equivalencias frontend ↔ base de datos (mesero, hostess y gerente)

> **Fuente de verdad:** el esquema MySQL del equipo de base de datos, [`database/init.sql`](../database/init.sql), que incluye el esquema actual y las migraciones. No hay tabla `estado_mesa`. El backend de `backend/` entrega y recibe los nombres de esta tabla para mesero, gerente y hostess; el estado por endpoint está en [`contrato-api-hostess.md`](contrato-api-hostess.md).

## Reglas de nombres

| Capa | Regla | Ejemplo |
|---|---|---|
| JSON de la API | nombre **exacto** de la columna (snake_case) | `id_mesa`, `fecha_hora`, `precio_unitario` |
| TypeScript (propiedades) | el mismo nombre en camelCase; los ids son `number` (columnas INT) | `idMesa`, `fechaHora`, `precioUnitario` |
| TypeScript (tipos) | nombre de la tabla en PascalCase | `Mesa`, `DetallePedido`, `MotivoCancelacion` |
| Campos **calculados** | se conservan, se documentan y la API los entrega | `estado_cuenta`, `total`, `mesa_numero` |

**Naturaleza** de cada campo: `columna` (existe en la BD) · `calculado` (la API lo calcula o lo trae con un JOIN; **no es columna**) ·
`fuera del alcance del mesero` (columna o tabla que solo usa el módulo del gerente) · `solo frontend` (no viaja a la API).

## Tablas del alcance del mesero

**Mesero:** `rol`, `usuario`, `credenciales`, `mesa`, `categoria_menu`, `producto`, `cuenta`, `estado_pedido`, `motivo_cancelacion`, `pedido`, `detalle_pedido`.
**Hostess:** `mesa`, `reservacion`, `lista_espera`, `cliente` (nunca pedidos ni cuentas). **Gerente:** `usuario`, `credenciales`, `perfil_usuario`, `categoria_menu`, `producto`, `disponibilidadProducto`, `seccion`, `configuracion_reservacion`.
**Caja:** `venta`, `pago`, `metodo_pago` y `corte_caja` se usan en `/cajero/caja`; `pago.monto_recibido` y `pago.cambio` conservan el efectivo recibido y el cambio. **Facturación aún sin interfaz/API:** `datos_fiscales` y `factura`. La tabla `idempotencia` es del backend.

## Mesas — tipo `Mesa` (tabla `mesa`)

| Concepto del frontend (antes) | Tabla.columna | Nombre en TypeScript | Nombre en JSON de la API | Naturaleza |
|---|---|---|---|---|
| `Mesa.id` | `mesa.id_mesa` | `idMesa` | `id_mesa` | columna |
| `Mesa.numero` | `mesa.numero` | `numero` | `numero` | columna |
| `Mesa.capacidad` | `mesa.capacidad` | `capacidad` | `capacidad` | columna |
| `Mesa.zona` | `mesa.zona` | `zona` | `zona` | columna obligatoria (nombre de `seccion.nombre`; migración `009_secciones_mesas.sql`) |
| `Mesa.plantaBaja` | `mesa.planta_baja` | `plantaBaja` | `planta_baja` | característica fija de acceso (migración `010_reservaciones_y_caracteristicas.sql`) |
| `Mesa.espacioCarriola` | `mesa.espacio_carriola` | `espacioCarriola` | `espacio_carriola` | característica fija de acceso |
| `Mesa.sinEscaleras` | `mesa.sin_escaleras` | `sinEscaleras` | `sin_escaleras` | característica fija de acceso |
| — (catálogo de secciones) | `seccion.nombre`, `seccion.activa` | `SeccionAdmin.nombre`, `activa` | `nombre`, `activa`, `total_mesas` | `total_mesas` se calcula contando `mesa.zona`; las secciones inhabilitadas no ofrecen mesas a mesero ni hostess |
| `Mesa.estado` | `mesa.estado` | `estado` (`libre` \| `ocupada` \| `reservada`) | `estado` (`libre` \| `ocupada` \| `reservada`) | columna con `CHECK` (default `libre`). Mismo código en BD, API y frontend; la interfaz muestra «Libre». `disponible` se sigue entendiendo como `libre` al leer |
| `Mesa.estadoCuenta` | — (de `cuenta.estado` de la cuenta activa) | `estadoCuenta` | `estado_cuenta` | calculado por la API |
| `Mesa.pedidosActivos` | — | `pedidosActivos` | `pedidos_activos` | calculado por la API |
| `Mesa.totalCuenta` | — | `totalCuenta` | `total_cuenta` | calculado por la API |
| `Mesa.pedidosListos` | — | `pedidosListos` | `pedidos_listos` | calculado por la API |
| `Mesa.tipoPagoSolicitado` | `cuenta.tipo_pago_solicitado` (de la cuenta activa) | `tipoPagoSolicitado` | `tipo_pago_solicitado` | columna de `cuenta`, no de `mesa` (la API la trae con un JOIN) |

## Cuentas — tipo `Cuenta` (tabla `cuenta`)

| Concepto del frontend (antes) | Tabla.columna | Nombre en TypeScript | Nombre en JSON de la API | Naturaleza |
|---|---|---|---|---|
| `Cuenta.id` / `cuentaId` | `cuenta.id_cuenta` | `idCuenta` | `id_cuenta` | columna |
| `Cuenta.mesaId` / `mesaId` | `cuenta.id_mesa` | `idMesa` | `id_mesa` | columna |
| `Cuenta.estado` | `cuenta.estado` | `estado` (`abierta` \| `por_pagar` \| `cerrada`) | `estado` | columna con `CHECK` |
| `Cuenta.abiertaEn` | `cuenta.abierta_en` | `abiertaEn` (`Date`) | `abierta_en` | columna (DATETIME) |
| — (nuevo) | `cuenta.cerrada_en` | `cerradaEn` (`Date \| null`) | `cerrada_en` | columna (DATETIME, NULL) |
| `Cuenta.pedidos` | — (`pedido` con `id_cuenta`) | `pedidos` | `pedidos` | calculado (composición) |
| `Cuenta.total` | — | `total` | `total` | calculado por la API (suma de `cantidad × precio_unitario`, sin pedidos cancelados) |
| `Cuenta.tipoPagoSolicitado` | `cuenta.tipo_pago_solicitado` | `tipoPagoSolicitado` | `tipo_pago_solicitado` | columna (`fisico` \| `digital`, NULL mientras no se solicite; `CHECK`) |

## Pedidos — tipo `Pedido` (tabla `pedido`)

| Concepto del frontend (antes) | Tabla.columna | Nombre en TypeScript | Nombre en JSON de la API | Naturaleza |
|---|---|---|---|---|
| `Pedido.id` / `pedidoId` | `pedido.id_pedido` | `idPedido` | `id_pedido` | columna |
| `Pedido.cuentaId` / `cuentaId` | `pedido.id_cuenta` | `idCuenta` | `id_cuenta` | columna |
| `Pedido.meseroId` / `meseroId` | `pedido.id_mesero` | `idMesero` | `id_mesero` | columna (FK a `usuario.id_usuario`) |
| Mesero que creó el pedido | `usuario.nombre` (JOIN por `pedido.id_mesero`) | `nombreMesero` | `nombre_mesero` | calculado por la API |
| `Pedido.mesaId` | — (`pedido` **no tiene** `id_mesa`; sale de `cuenta.id_mesa`) | `idMesa` | `id_mesa` | calculado (JOIN con `cuenta`) |
| `Pedido.mesaNumero` | `mesa.numero` (JOIN) | `mesaNumero` | `mesa_numero` | calculado (JOIN) |
| `Pedido.estado` | `estado_pedido.nombre` vía `pedido.id_estado` | `estado` (código normalizado) | `estado` (nombre del catálogo, p. ej. `"En preparacion"`) | calculado (JOIN); la columna es `id_estado` |
| — (no lo usa el frontend) | `pedido.id_estado` | `idEstado` (solo si hiciera falta) | `id_estado` | columna (la API la envía; el frontend no la consume) |
| `Pedido.creadoEn` | `pedido.fecha_hora` | `fechaHora` (`Date`) | `fecha_hora` (`"2026-10-15 16:34:00"`) | columna (DATETIME sin zona horaria) |
| `Pedido.motivoCancelacion` (texto) | `pedido.id_motivo` | `idMotivo` (`number \| null`) | `id_motivo` | columna (NULL si no está cancelado) |
| `Pedido.motivoCancelacion` (texto) | `motivo_cancelacion.descripcion` (JOIN) | `motivoDescripcion` (`string \| null`) | `motivo_descripcion` | calculado (JOIN) |
| `Pedido.total` | — | `total` | `total` | calculado por la API (suma de `cantidad × precio_unitario`) |
| `Pedido.detalle` | — (`detalle_pedido` con `id_pedido`) | `detalle` | `detalle` | calculado (composición) |
| — (no lo usa el frontend) | `pedido.observaciones` | — | `observaciones` | columna (no se consume) |

## Detalle del pedido — tipo `DetallePedido` (tabla `detalle_pedido`)

| Concepto del frontend (antes) | Tabla.columna | Nombre en TypeScript | Nombre en JSON de la API | Naturaleza |
|---|---|---|---|---|
| `productoId` | `detalle_pedido.id_producto` | `idProducto` | `id_producto` | columna |
| `nombreProducto` | `producto.nombre` (JOIN) | `nombreProducto` | `nombre_producto` | calculado (JOIN) |
| `cantidad` | `detalle_pedido.cantidad` (CHECK `> 0`) | `cantidad` | `cantidad` | columna |
| `observaciones` | `detalle_pedido.indicaciones` | `indicaciones` | `indicaciones` | columna (VARCHAR(255), NULL). La etiqueta visible sigue siendo «Observaciones» |
| `precioUnitario` / `precio` | `detalle_pedido.precio_unitario` | `precioUnitario` | `precio_unitario` | columna (DECIMAL(10,2); lo fija la API) |
| `detalleId` (no existía en el frontend) | `detalle_pedido.id_detalle` | `idDetalle` (solo si hiciera falta) | `id_detalle` | columna (la API la envía; el frontend no la consume) |
| — | `detalle_pedido.id_pedido` | — | — | columna (no se consume; el detalle viaja anidado) |

**Cuerpos de petición** (el frontend **nunca** envía precios):
`POST /pedidos` → `{ id_mesa, detalle: [{ id_producto, cantidad, indicaciones }] }` · `PATCH /pedidos/{id}` → `{ detalle: [...] }`.

## Productos y categorías — tipos `Producto`, `CategoriaMenu`

| Concepto del frontend (antes) | Tabla.columna | Nombre en TypeScript | Nombre en JSON de la API | Naturaleza |
|---|---|---|---|---|
| `Producto.id` / `productoId` | `producto.id_producto` | `idProducto` | `id_producto` | columna |
| `Producto.categoriaId` / `categoriaId` | `producto.id_categoria` | `idCategoria` | `id_categoria` | columna |
| `Producto.nombre` | `producto.nombre` | `nombre` | `nombre` | columna |
| `Producto.presentacion` | `producto.presentacion` | `presentacion` | `presentacion` | columna (variante opcional; migración `008_presentacion_producto.sql`) |
| `Producto.descripcion` | `producto.descripcion` | `descripcion` | `descripcion` | columna |
| `Producto.precio` | `producto.precio` | `precio` | `precio` | columna (DECIMAL(10,2), llega como texto) |
| `Producto.disponible` | `producto.disponible` | `disponible` | `disponible` | columna (BOOLEAN; llega como `0`/`1`) |
| — (solo gerente) | `producto.controla_existencia` | `controla` | `controla_existencia` | columna (BOOLEAN, default `TRUE`; `FALSE` = se prepara al momento, sin existencia que contar) |
| `CategoriaMenu.id` | `categoria_menu.id_categoria` | `idCategoria` | `id_categoria` | columna |
| `CategoriaMenu.nombre` | `categoria_menu.nombre` | `nombre` | `nombre` | columna |
| `CategoriaMenu.productos` | — | `productos` | `productos` | calculado (composición) |
| `DisponibilidadProducto.productoId` | `producto.id_producto` | `idProducto` | `id_producto` | columna (el resultado de `producto.disponible`) |

Para el mesero, `disponible` es **calculado por la API**: `producto.disponible` (activo en el menú) **y** (`controla_existencia = 0` **o** existencia mayor a 0 en la tabla `disponibilidadProducto`). La interfaz solo ve disponible/agotado, sin cantidades; las existencias las administra el gerente.

## Motivo de cancelación — tipo `MotivoCancelacion` (tabla `motivo_cancelacion`)

| Concepto del frontend (antes) | Tabla.columna | Nombre en TypeScript | Nombre en JSON de la API | Naturaleza |
|---|---|---|---|---|
| — | `motivo_cancelacion.id_motivo` | `idMotivo` | `id_motivo` | columna |
| `motivo` (cuerpo de `POST /pedidos/{id}/cancelar`) | `motivo_cancelacion.descripcion` (VARCHAR(**200**)) | `descripcion` | `descripcion` | columna. Texto de **5 a 200** caracteres |
| `MOTIVO_MIN` / `MOTIVO_MAX` | — | `DESCRIPCION_MOTIVO_MIN` / `DESCRIPCION_MOTIVO_MAX` | — | solo frontend |
| `MOTIVOS_RAPIDOS` | — | `MOTIVOS_RAPIDOS` | — | solo frontend (atajos que rellenan el texto) |

## Usuario y rol — tipos `Usuario`, `Rol` (tablas `usuario`, `rol`, `credenciales`)

| Concepto del frontend (antes) | Tabla.columna | Nombre en TypeScript | Nombre en JSON de la API | Naturaleza |
|---|---|---|---|---|
| `Usuario.id` / `usuarioId` | `usuario.id_usuario` | `idUsuario` | `id_usuario` | columna |
| — | `usuario.id_rol` | `idRol` | `id_rol` | columna |
| `Usuario.nombre` | `usuario.nombre` | `nombre` | `nombre` | columna |
| — | `usuario.correo` | `correo` | `correo` | columna |
| — | `usuario.activo` | `activo` | `activo` | columna (BOOLEAN) |
| `Usuario.rol` (`'mesero'`) | `rol.nombre` (JOIN; `'Mesero'`) | `rol` (código normalizado; `null` si no se reconoce) | `rol` | calculado (JOIN) |
| `Credenciales.usuario` | `credenciales.nombre_usuario` | `nombreUsuario` | `nombre_usuario` | columna |
| `Credenciales.contrasena` | `credenciales.password_hash` (la API compara el hash) | `contrasena` | `contrasena` | solo frontend (se envía en texto por HTTPS; **nunca** se guarda) |

## Hostess — tipos `MesaSalon`, `Reservacion`, `ListaEspera`, `Cliente` (tablas `mesa`, `reservacion`, `lista_espera`, `cliente`)

Las rutas de Salón, reservaciones, clientes y asignación descritas en esta sección están implementadas en `backend/`; el contrato de cada endpoint está en [`contrato-api-hostess.md`](contrato-api-hostess.md). La hostess **no ve** pedidos, cuentas ni totales:
`MesaSalon` solo toma las columnas de `mesa`.

| Tipo en TypeScript | Tabla.columna | Nombre en TypeScript | Nombre en JSON | Naturaleza |
|---|---|---|---|---|
| `MesaSalon` | `mesa.id_mesa`, `numero`, `capacidad`, `estado` | `idMesa`, `numero`, `capacidad`, `estado` | `id_mesa`, `numero`, `capacidad`, `estado` | columnas (el resumen de cuenta de `GET /mesas` se ignora) |
| `Cliente` | `cliente.id_cliente`, `nombre` | `idCliente`, `nombre` | `id_cliente`, `nombre` | columnas |
| `Cliente` | `cliente.telefono`, `cliente.correo` | `telefono`, `correo` (`string \| null`) | `telefono`, `correo` | columnas (VARCHAR 20 / 120, **admiten NULL**) |
| `Reservacion` | `reservacion.id_reservacion`, `id_cliente`, `personas` | `idReservacion`, `idCliente`, `personas` | igual en snake_case | columnas. **No existe folio** |
| `Reservacion` | `reservacion.id_mesa` | `idMesa` (`number \| null`) | `id_mesa` | columna (NULL = aún sin mesa) |
| `Reservacion` | `reservacion.fecha_hora`, `llegada_en` | `fechaHora` (`Date`), `llegadaEn` (`Date \| null`) | `fecha_hora`, `llegada_en` | columnas DATETIME (`llegada_en` NULL hasta que llega) |
| `Reservacion` | `reservacion.estado` | `estado` (`pendiente` \| `confirmada` \| `llego` \| `cancelada` \| `vencida`) | `estado` | columna `VARCHAR`; el proceso del backend escribe `vencida` tras cumplirse la tolerancia |
| `Reservacion` | `cliente.nombre`, `cliente.telefono`, `mesa.numero` (JOIN) | `clienteNombre`, `clienteTelefono`, `mesaNumero` | `cliente_nombre`, `cliente_telefono`, `mesa_numero` | **calculados** (JOIN) |
| `Reservacion` | `cliente.correo` (JOIN) | `clienteCorreo` | `cliente_correo` | calculado (JOIN); obligatorio y válido para crear una reservación, aunque `cliente.correo` admita `NULL` |
| Preferencias de reservación | — | selección de sección y características de acceso | no se persisten como columnas de `reservacion` | criterios del frontend para ayudar a elegir mesa; las características físicas se guardan en `mesa` |
| `ListaEspera` | `lista_espera.id_espera`, `id_cliente`, `personas`, `registrado_en` | `idEspera`, `idCliente`, `personas`, `registradoEn` (`Date`) | snake_case | columnas (`registrado_en` DATETIME, default ahora) |
| `ListaEspera` | `lista_espera.estado` | `estado` (`esperando` \| `asignada` \| `cancelada`) | `estado` | columna **de texto libre, sin `CHECK`** (default `esperando`); `cancelada` es un **supuesto del frontend** |
| `ListaEspera` | `cliente.nombre`, `cliente.telefono` (JOIN) | `clienteNombre`, `clienteTelefono` | `cliente_nombre`, `cliente_telefono` | **calculados** (JOIN) |
| `GrupoAsignacion`, `NuevaReservacion`, `NuevaEspera`, `NuevoCliente`, `CambioReservacion`, `CambioEspera` | — | — | cuerpos de petición con nombres de columna | solo frontend (ver el contrato de la hostess) |

### Configuración y notificaciones de reservaciones (migración 010)

| Concepto | Tabla.columna | Nombre JSON | Naturaleza |
|---|---|---|---|
| Configuración del restaurante | `configuracion_reservacion.tolerancia_minutos`, `recordatorio_minutos` | `tolerancia_minutos`, `recordatorio_minutos` | persistido; valores predeterminados: 15 y 5 minutos |
| Notificación de correo | `notificacion_reservacion.id_reservacion`, `tipo`, `destinatario`, `estado`, `intentos`, `ultimo_error`, `creada_en`, `enviada_en` | la cola no se expone al frontend | outbox del backend para recordatorios y vencimientos; Resend procesa los envíos y los fallos se reintentan |

La configuración se consulta y actualiza mediante `GET/PATCH /api/catalogo/configuracion-reservacion` (solo gerente). Consulta [`resend-reservaciones.md`](resend-reservaciones.md) para configurar el proveedor sin exponer su API key.

## Módulo del gerente

| Concepto del frontend | Tabla.columna | Nombre en TypeScript | Nombre en JSON | Naturaleza |
|---|---|---|---|---|
| `UsuarioAdmin.idUsuario` | `usuario.id_usuario` | `idUsuario` | `id_usuario` | columna |
| `UsuarioAdmin.nombreUsuario` | `credenciales.nombre_usuario` | `nombreUsuario` | `nombre_usuario` | columna |
| `UsuarioAdmin.telefono` | `perfil_usuario.telefono` | `telefono` | `telefono` | columna de una tabla fuera del alcance del mesero |
| `UsuarioAdmin.creadoEn` | `usuario.creado_en` | `creadoEn` (`Date`) | `creado_en` | columna |
| `UsuarioAdmin.ultimoAcceso` | `credenciales.ultimo_acceso` | `ultimoAcceso` (`Date \| null`) | `ultimo_acceso` | columna |
| `CategoriaAdmin.idCategoria`, `totalProductos` | `categoria_menu.id_categoria`; conteo de `producto` | `idCategoria`, `totalProductos` | `id_categoria`, `total_productos` | columna / calculado |
| `ProductoAdmin.activo` | `producto.disponible` | `activo` | `activo` | columna (el gerente lo tiene activo en el menú) |
| `ProductoAdmin.existencia`, `stockMinimo` | `disponibilidadProducto.existencia`, `stock_minimo` | `existencia`, `stockMinimo` | `existencia`, `stock_minimo` | columna de `disponibilidadProducto` |
| `ProductoAdmin.disponible` | `producto.disponible` Y `existencia > 0` | `disponible` | `disponible` | calculado por la API |

## Estados

Un único archivo, `frontend/src/types/estados.ts`, define los códigos. Normalización de nombres de la BD → código: minúsculas, sin acentos, espacios a guion bajo.

| Dominio | Valor en la BD | Código en el frontend | Naturaleza |
|---|---|---|---|
| Mesa | `libre` | `libre` (la interfaz dice «Libre»; la URL `?estado=disponible` del nombre anterior sigue aceptándose) | columna `mesa.estado` (`CHECK`: `libre`, `ocupada`, `reservada`) |
| Mesa | `ocupada` | `ocupada` | columna `mesa.estado` |
| Mesa | `reservada` | `reservada` | columna `mesa.estado` |
| Cuenta | `abierta` | `abierta` | columna `cuenta.estado` (`CHECK`; default) |
| Cuenta | `por_pagar`, `cerrada` | `por_pagar`, `cerrada` | columna `cuenta.estado` (`CHECK`) |
| Reservación | `pendiente` (default), `confirmada`, `llego`, `cancelada`, `vencida` | igual | columna `reservacion.estado`, texto libre sin `CHECK`; el servicio asigna `vencida` cuando excede la tolerancia |
| Lista de espera | `esperando` (default), `asignada`, `cancelada` | igual | columna `lista_espera.estado`, **texto libre sin `CHECK`**; `cancelada` es un supuesto del frontend |
| Pedido | `Registrado` | `registrado` | `estado_pedido.nombre` (pedido capturado, todavía editable) |
| Pedido | `Pendiente` | `pendiente` | `estado_pedido.nombre`; **se usa como «enviado a cocina»** y se trata igual que `enviado` |
| Pedido | `En preparacion` | `en_preparacion` | `estado_pedido.nombre` |
| Pedido | `Listo` | `listo` | `estado_pedido.nombre` |
| Pedido | `Entregado` | `entregado` | `estado_pedido.nombre` |
| Pedido | `Cancelado` | `cancelado` | `estado_pedido.nombre` |
| Pedido | `Pagado` | `pagado` | `estado_pedido.nombre` |
| Pedido | — | `enviado` | **sin equivalente en la BD** (constante `ESTADOS_SIN_EQUIVALENTE_EN_BD`): la BD usa `Pendiente` |
| Todos | cualquier otro valor | `desconocido` | solo frontend: insignia neutra «Estado desconocido» y advertencia en consola |
| Rol | `Gerente`, `Mesero`, `Cocinero`, `Cajero`, `Hostess` | `gerente`, `mesero`, `cocinero`, `cajero`, `hostess` | `rol.nombre` normalizado |

## Renombrados internos (sin columna asociada)

| Antes | Ahora | Dónde |
|---|---|---|
| `:mesaId` / `:pedidoId` (parámetros de ruta) | `:idMesa` / `:idPedido` | router; las URLs visibles no cambian |
| `mesa_id` (consulta `GET /pedidos`) | `id_mesa` | API |
| `MAX_OBSERVACIONES` / `establecerObservaciones` | `MAX_INDICACIONES` / `establecerIndicaciones` | carrito |
| `seleccionadoId` | `idPedidoSeleccionado` | store de pedidos |
| `sigr.borradores` (sessionStorage) | `sigr.borradores.v2` (la clave anterior se elimina) | borrador del pedido |
