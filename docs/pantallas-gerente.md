# Pantallas del rol gerente

Interfaz de "La Madalena" para tablet (base 1024×768 horizontal; también 768×1024). El gerente tiene cinco pantallas,
cada una en una pestaña de la barra inferior: **Usuarios**, **Productos**, **Mesas**, **Reservas** y **Pedidos**. Las capturas están
en [`capturas/`](capturas/) y se tomaron con el servidor de desarrollo en modo mock (`npm run dev:demo`, usuario
`gerente` / `1234`). Los contratos de API (lo que existe y lo que se propone) están en
[`contrato-api-gerente.md`](contrato-api-gerente.md).

| Pantalla | Ruta | Requisitos | Estado de este documento |
|---|---|---|---|
| Usuarios | `/gerente/usuarios` | RF-USR-001 a 007 | Funcional; documentación visual pendiente |
| Clientes | `/gerente/clientes` | RF-CLI-002 y RF-CLI-003 | Consultar, corregir, eliminar (lógico) y restaurar clientes; ver [`eliminado-logico.md`](eliminado-logico.md) |
| Productos e inventario | `/gerente/productos` | RF-PRO-001 a 006 | Funcional; incluye descripción obligatoria, variantes y filtros de inventario |
| Mesas, secciones y características | `/gerente/mesas` | RF-MES-002 a 007 | Funcional; administración de mesas, catálogo de secciones y catálogo de **características** (botón «Características»: crear, renombrar, desactivar, eliminar y restaurar; se marcan en cada mesa al editarla). Mesas, secciones, características, canales y métodos de pago se eliminan de forma lógica y se restauran desde «Eliminadas»; ver [`eliminado-logico.md`](eliminado-logico.md) |
| Canales de pedido | `/gerente/canales` | Canales de los pedidos para llevar: agregar y activar o desactivar (migración 019) | Funcional |
| Reservas | `/gerente/reservaciones` | Horario de reservaciones: primera y última hora, intervalo y días abiertos, con vista previa de las horas del portal (migración 022); duración de cada reservación (023); anticipación mínima (018), tolerancia y recordatorio (010) | Funcional; ruta protegida para gerente |
| Pedidos | `/gerente/pedidos` y `/gerente/pedidos/:idPedido` | RF-PED-002 (gerente), RF-PED-003, RF-PED-005 (parcial) | Documentada abajo |
| Cortes y ventas → Cortes de caja | `/gerente/cortes` | Cierres de turno por cajero, cuadre de efectivo | Funcional |
| Cortes y ventas → Reporte de ventas | `/gerente/ventas` | RF-VEN-003 (historial) y RF-VEN-004 (reporte con exportación) | Documentada abajo |

## Productos, inventario y mesas

- **Productos:** la descripción es obligatoria. El campo «Presentación o variante» solo aparece para las categorías Bebidas y Postres. La categoría, el nombre y la presentación identifican una variante; intentar crear una ya existente no cambia el inventario. Para ajustar existencias se edita el producto. La lista permite distinguir Disponible, Stock bajo y Agotado.
- **Mesas:** se administra número, capacidad, sección y disponibilidad, además de las características de planta baja, espacio para carriola y acceso sin escaleras.
- **Secciones:** desde Gerente → Mesas → Secciones se pueden crear, renombrar, inhabilitar/habilitar y eliminar (lógico, se restaura desde «Eliminadas»). Renombrar actualiza las mesas asociadas; eliminar requiere que no haya mesas vigentes asignadas. Las mesas deben pertenecer a una sección activa.

## Usuarios y seguridad

- **Gerente inicial:** se identifica como «Gerente inicial protegido». No se puede desactivar ni cambiar de rol; la API y MySQL aplican la misma protección. Requiere la migración 013.
- **Cambio de contraseña:** solo Gerencia puede iniciarlo y se solicita la contraseña anterior de la cuenta afectada antes de guardar la nueva; también aplica cuando Gerencia modifica su propia cuenta.
- **Olvidó su contraseña (migración 024):** el botón **Restablecer** de cada usuario activo manda a su correo un enlace para que él mismo cree una contraseña nueva. Gerencia nunca ve ni escribe la contraseña; el aviso confirma a qué correo (enmascarado) se mandó. El enlace sirve una sola vez, caduca en 1 hora y, mientras no se use, la contraseña anterior sigue funcionando. Máximo 3 enlaces por usuario por hora.
- **Desde el inicio de sesión:** el propio empleado puede usar «¿Olvidaste tu contraseña?» (`/recuperar`) escribiendo su usuario o su correo; la respuesta es la misma exista o no la cuenta, para no revelar qué usuarios hay. El enlace abre `/restablecer`.
- Los cambios de datos se registran en la auditoría de MySQL; consulta [Protección de usuarios y auditoría](auditoria-seguridad.md).

## Reservas

La pantalla `/gerente/reservaciones` permite configurar:

| Configuración | Predeterminado | Rango |
|---|---:|---:|
| Tolerancia de llegada antes de marcar la reserva como vencida | 15 minutos | 5–180 minutos |
| Anticipación del recordatorio al cliente | 5 minutos | 1–30 minutos |

La pantalla está registrada bajo el grupo de rutas `/gerente` y requiere el rol `gerente`. Si la ruta se coloca dentro de otro grupo de rol, la guarda de Vue Router la rechazará; `frontend/src/router/index.test.ts` protege esta asignación.

Las notificaciones usan el transporte común configurado en `backend/.env`: Resend con dominio emisor verificado o SMTP. Gmail requiere contraseña de aplicación y que `SMTP_USER` coincida con `CORREO_REMITENTE`. Las cuatro plantillas de `backend/src/services/plantillasCorreo.ts` generan un correo HTML de hasta 600 px y conservan una versión de texto plano. Ver [resend-reservaciones.md](resend-reservaciones.md) para instalación, operación y diagnóstico.

## Pedidos (G4)

**Caso de uso:** el gerente supervisa todos los pedidos del salón (de todos los meseros), consulta el historial y
cancela un pedido como excepción, **incluso si ya está en preparación**, que es lo único que el mesero no puede hacer
(regla del ERS). No edita, no envía ni entrega pedidos: esas son acciones del mesero.

| # | Pantalla | Ruta | Qué cubre | Captura |
|---|---|---|---|---|
| 1 | Pedidos (1024×768) | `/gerente/pedidos` | Barra de filtros: periodo (**Por día**, hoy por defecto, con selector de día, o **Todos los días**), número de pedido, estado (cada opción con su cantidad), mesa y mesero. «Mostrando N de M pedidos» cuando la lista está recortada. Cada pedido: número, mesa, mesero, estado (ícono + texto), hora, productos y total. Más recientes primero | [g4-01-pedidos-1024x768](capturas/g4-01-pedidos-1024x768.png) |
| 2 | Detalle de un pedido en preparación | `/gerente/pedidos/9` | Avance, productos con sus observaciones, total, cuenta de la mesa (estado y total) y «Cancelar pedido» habilitado con el aviso «Cocina ya lo está preparando…» | [g4-02-detalle-en-preparacion-1024x768](capturas/g4-02-detalle-en-preparacion-1024x768.png) |
| 3 | Cancelar pedido | _(diálogo del detalle)_ | El mismo diálogo del mesero: motivo obligatorio de 5 a 200 caracteres con atajos, «Esta acción no se puede deshacer». `Idempotency-Key` por intención | [g4-03-cancelar-en-preparacion-1024x768](capturas/g4-03-cancelar-en-preparacion-1024x768.png) |
| 4 | Pedido cancelado | `/gerente/pedidos/9` | Resultado: insignia «Cancelado» en el detalle y en la lista, motivo visible, aviso «Pedido #9 cancelado» (aria-live) y el foco vuelve al botón, que queda con `aria-disabled` y su motivo | [g4-04-cancelado-1024x768](capturas/g4-04-cancelado-1024x768.png) |
| 5 | Pedido que no se puede cancelar | `/gerente/pedidos/2` | Pedido listo: el botón **no se oculta**; queda con `aria-disabled` y el motivo «Ya está listo para entregar: no se puede cancelar.» | [g4-05-no-cancelable-1024x768](capturas/g4-05-no-cancelable-1024x768.png) |
| 6 | Historial de una mesera | `/gerente/pedidos/12` | «Todos los días» + mesero «Rosa Mesera»: pedidos de días anteriores con fecha («20 oct · 20:54»). La cuenta ya cobrada se explica en lugar de mostrar otra | [g4-06-historial-mesera-1024x768](capturas/g4-06-historial-mesera-1024x768.png) |
| 7 | Pedidos (768×1024) | `/gerente/pedidos` | Una sola columna; los filtros se acomodan en dos filas | [g4-07-pedidos-768x1024](capturas/g4-07-pedidos-768x1024.png) |
| 8 | Detalle (768×1024) | `/gerente/pedidos/3` | El detalle es otra pantalla con «Volver a pedidos»; al volver, el foco regresa a la fila del pedido | [g4-08-detalle-768x1024](capturas/g4-08-detalle-768x1024.png) |

### Qué puede hacer el gerente con cada estado

Fuente: `frontend/src/utils/reglasGerente.ts` (con pruebas en `reglasGerente.test.ts`). La API valida lo mismo en
`backend/src/controllers/pedidos.ts` → `cancelarPedido`.

| Estado del pedido | Cancelar | Texto junto al botón |
|---|---|---|
| Registrado | Sí | — |
| Enviado a cocina (`Pendiente` en la BD) | Sí | — |
| En preparación | **Sí (solo el gerente)** | «Cocina ya lo está preparando. Al cancelarlo, la existencia de los productos vuelve al inventario.» |
| Listo para entregar | No | «Ya está listo para entregar: no se puede cancelar.» |
| Entregado | No | «Ya se entregó en la mesa: no se puede cancelar.» |
| Pagado | No | «Ya se cobró: no se puede cancelar.» |
| Cancelado | No | «Este pedido ya está cancelado.» |
| Cualquiera, con la cuenta **por pagar** | No | «La cuenta ya fue solicitada: no se pueden cancelar pedidos.» (la API responde 409) |

Si el servidor rechaza la cancelación con `estado_invalido` (por ejemplo, cocina lo marcó como listo mientras el
gerente escribía el motivo), el diálogo vuelve a consultar el pedido, explica su estado actual y recarga la lista.

### Cómo funciona

- **Datos:** `GET /api/pedidos` (sin filtros) trae todos los pedidos del salón. La API **no pagina ni filtra por fecha**
  (hallazgo P-11), así que el día, el estado, la mesa, el mesero y el número se filtran en el navegador. Se pintan 50
  filas a la vez («Mostrar N más»). La propuesta para el historial está en el contrato.
- **Actualización:** cada 10 s (`VITE_POLL_MS`), con pausa cuando la pestaña está oculta, y en cuanto se cancela un pedido.
- **Cuenta:** `GET /api/mesas/:id/cuenta` solo devuelve la cuenta **activa** de la mesa. Si el pedido es de una cuenta
  ya cobrada, la pantalla lo dice («La cuenta de este pedido ya no está activa…») en vez de mostrar la cuenta nueva
  de esa mesa.
- **Mesero:** las rutas `/gerente/*` exigen el rol gerente (`meta.roles` en el router; un mesero que escribe la URL
  vuelve a `/login?motivo=rol`). El mesero sigue sin poder cancelar en preparación: su detalle muestra «Requiere
  autorización del gerente» y la API responde `403 requiere_gerente`.

### Accesibilidad verificada

Con Chrome sin interfaz (protocolo DevTools) sobre el modo mock:

- Sin scroll horizontal ni contenido cortado a 1024×768, 768×1024 y zoom 200 % (1024×768 a escala 2).
- Todos los botones, enlaces, campos y pestañas miden 48 px o más.
- Teclado: filtros, filas (enlaces), detalle y diálogo se recorren con Tab; Enter abre el diálogo; el foco va al
  motivo y, al cerrar, vuelve al botón «Cancelar pedido». Anillo de foco de 3 px.
- Avisos en regiones `aria-live` («Mostrando N de M pedidos», «Pedido #9 cancelado»).
- Estados con ícono + texto (nunca solo color); el pedido seleccionado se marca con borde, fondo y negrita.
- `prefers-reduced-motion: reduce`: sin transición en las filas.
- Limitación: en el campo de fecha nativo, el ícono del calendario recibe el foco con el recuadro propio de Chrome
  (más delgado que el de la app); el CSS de la página no puede alcanzarlo. Mismo componente que en Reservaciones.

## Reporte de ventas (RF-VEN-003 y RF-VEN-004)

Menú **Cortes y ventas** → pestaña **Reporte de ventas** (`/gerente/ventas`). La otra pestaña es **Cortes de caja**.

- **Periodo con botones:** Día, Semana, Mes, Trimestre, Semestre, Año o Personalizado (dos fechas, hasta dos años). Las
  flechas ◀ ▶ van al periodo anterior o siguiente del mismo tipo (no se avanza a uno que todavía no empieza) y el botón
  «Este mes / Este año…» regresa al actual. Al abrir la pantalla se ve el mes en curso.
- **Resumen:** total vendido, cuentas cobradas, ticket promedio y el producto que más vendió.
- **Ventas en el tiempo:** gráfica de barras por día, semana o mes (se elige; la pantalla sugiere la que conviene según el
  largo del periodo). Al pasar el puntero o enfocar una barra con el teclado se ve el total y las cuentas. «Ver como tabla»
  muestra los mismos datos en una tabla.
- **Desgloses:** métodos de pago, meseros, productos más vendidos (los 10 primeros y «Ver todas»), categorías, secciones
  y horas con más venta, cada uno con su importe y su porcentaje del total.
- **Historial de ventas:** cada cobro con venta, cuenta, fecha y hora, cajero, mesa y sección (o canal si es para llevar),
  meseros, forma de pago y total. Se filtra por número de venta, cuenta o mesa, por método de pago y por mesero, y se
  muestran 50 a la vez («Mostrar más»).
- **Descargar Excel:** genera `ventas-AAAA-MM-DD-a-AAAA-MM-DD.xlsx` con una hoja **Resumen** y, según lo que se marque en
  «Elegir qué incluye el Excel», las hojas Ventas en el tiempo (con la misma agrupación de la gráfica), Métodos de pago,
  Meseros, Productos, Categorías, Secciones, Horas e Historial de ventas (una columna por método de pago). Cada hoja trae
  encabezados fijos, filtros y formato de moneda.

En modo demo (`npm run dev:demo`) el reporte usa ventas de ejemplo generadas para cada día hasta hoy (siempre las mismas
para el mismo día). Código: `frontend/src/views/gerente/VentasView.vue`, `utils/periodos.ts` y `utils/ventasExcel.ts`.
