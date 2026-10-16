# Pantallas del rol mesero

Interfaz de "La Madalena" para tablet (base 1024×768 horizontal; también 768×1024). Cada pantalla
se relaciona con el caso de uso (CU) del sistema que cubre. Las capturas están en
[`capturas/`](capturas/) y se generan con Chrome headless contra el servidor de desarrollo.

| # | Pantalla | Ruta | Caso de uso que cubre | Captura |
|---|---|---|---|---|
| 1 | Inicio de sesión | `/login` | **CU1** Iniciar sesión | [01-login-1024x768](capturas/01-login-1024x768.png) |
| 2 | Panel de mesas | `/mesero/mesas` | **CU6** Consultar cuentas de mesa (estado, pedidos activos y total de la cuenta de cada mesa); avisa de pedidos listos | [02-panel-mesas-1024x768](capturas/02-panel-mesas-1024x768.png) · [02b (768×1024)](capturas/02b-panel-mesas-768x1024.png) |
| 3 | Panel de mesas con filtro | `/mesero/mesas?estado=ocupada` | **CU6** (filtros Todas, Disponibles, Ocupadas, Reservadas y Pedido listo) | [03-panel-mesas-filtro-ocupadas-1024x768](capturas/03-panel-mesas-filtro-ocupadas-1024x768.png) |
| 4 | Hoja de acciones de una mesa | _(diálogo del panel)_ | **CU6** (Ver cuenta) y acceso a **CU7** (Nuevo pedido) y **CU15** (Pedidos de la mesa) | [04-hoja-acciones-mesa-1024x768](capturas/04-hoja-acciones-mesa-1024x768.png) |
| 5 | Pedido de mesa (1024×768) | `/mesero/mesas/:idMesa/pedido` | **CU9** Consultar menú · **CU7** Registrar pedidos (también edita un pedido registrado: `?editar=:idPedido`) | [05-pedido-mesa-1024x768](capturas/05-pedido-mesa-1024x768.png) |
| 6 | Pedido de mesa (768×1024) | `/mesero/mesas/:idMesa/pedido` | **CU9** · **CU7** (el pedido pasa a una barra inferior con "Ver pedido") | [06-pedido-mesa-768x1024](capturas/06-pedido-mesa-768x1024.png) |
| 7 | Revisión del pedido | _(diálogo de Pedido de mesa)_ | **CU20** Verificar disponibilidad · **CU7** Registrar · **CU10** Enviar pedido a cocina | [07-revision-pedido-1024x768](capturas/07-revision-pedido-1024x768.png) |
| 8 | Cuenta de mesa | `/mesero/mesas/:idMesa/cuenta` | **CU6** Consultar cuentas de mesa (pedidos de la cuenta, cancelados que no suman y total) | [08-cuenta-mesa-1024x768](capturas/08-cuenta-mesa-1024x768.png) |
| 9 | Solicitar cuenta | _(diálogo de Cuenta de mesa)_ | **CU6** (el mesero solo solicita la cuenta y elige pago físico o digital; el cobro es de caja) | [09-solicitar-cuenta-1024x768](capturas/09-solicitar-cuenta-1024x768.png) |
| 10 | Mis pedidos: lista y detalle (1024×768) | `/mesero/pedidos` y `/mesero/pedidos/:idPedido` | **CU15** Consultar pedidos · **CU10** Enviar pedido a cocina (acción del detalle de un pedido registrado) | [10-mis-pedidos-lista-y-detalle-1024x768](capturas/10-mis-pedidos-lista-y-detalle-1024x768.png) |
| 11 | Mis pedidos: lista (768×1024) | `/mesero/pedidos` | **CU15** | [11-mis-pedidos-lista-768x1024](capturas/11-mis-pedidos-lista-768x1024.png) |
| 12 | Mis pedidos: detalle (768×1024) | `/mesero/pedidos/:idPedido` | **CU15** · **CU10** (pantalla aparte con "Volver a pedidos") | [12-mis-pedidos-detalle-768x1024](capturas/12-mis-pedidos-detalle-768x1024.png) |
| 13 | Cancelar pedido | _(diálogo de Mis pedidos y de Cuenta de mesa)_ | **CU8** Cancelar pedidos (motivo obligatorio; en preparación requiere al gerente) | [13-cancelar-pedido-1024x768](capturas/13-cancelar-pedido-1024x768.png) |

## Vista previa

| Login | Panel de mesas |
|---|---|
| ![Login](capturas/01-login-1024x768.png) | ![Panel de mesas](capturas/02-panel-mesas-1024x768.png) |

| Pedido de mesa | Cuenta de mesa |
|---|---|
| ![Pedido de mesa](capturas/05-pedido-mesa-1024x768.png) | ![Cuenta de mesa](capturas/08-cuenta-mesa-1024x768.png) |

| Mis pedidos | Cancelar pedido |
|---|---|
| ![Mis pedidos](capturas/10-mis-pedidos-lista-y-detalle-1024x768.png) | ![Cancelar pedido](capturas/13-cancelar-pedido-1024x768.png) |

## Notas

- La franja superior "Modo demo · datos simulados" aparece mientras se usa el mock
  (`VITE_USE_MOCK=true`) y desaparece con la API real (`npm run build:api`).
- Las pantallas de gerente, cocina, caja y hostess **no** forman parte de esta aplicación.
  Donde el mesero depende de ellas (autorizar una cancelación en preparación, cobrar la cuenta) la
  interfaz solo lo indica con texto.
- Las capturas se tomaron con Chrome headless (Playwright, fuera del proyecto: no es una dependencia)
  contra `npm run dev`, con el usuario `mesero`. Si cambia el diseño, hay que volver a tomarlas a mano
  (o con cualquier herramienta de capturas) a 1024×768 y 768×1024 y conservar los nombres.

> **Los datos de las capturas son simulados.** Proceden del mock del frontend (mesas, productos,
> pedidos, montos y horas de ejemplo); no hay ninguna conexión con la API ni con la base de datos reales.
