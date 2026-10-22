# Pantallas del rol gerente

Interfaz de "La Madalena" para tablet (base 1024×768 horizontal; también 768×1024). El gerente tiene cuatro pantallas,
cada una en una pestaña de la barra inferior: **Usuarios**, **Productos**, **Mesas** y **Pedidos**. Las capturas están
en [`capturas/`](capturas/) y se tomaron con el servidor de desarrollo en modo mock (`npm run dev:demo`, usuario
`gerente` / `1234`). El contrato de API (lo que existe y lo que se propone) está en
[`contrato-api-gerente.md`](contrato-api-gerente.md).

| Pantalla | Ruta | Requisitos | Estado de este documento |
|---|---|---|---|
| Usuarios | `/gerente/usuarios` | RF-USR-001 a 007 | **Por documentar** |
| Productos e inventario | `/gerente/productos` | RF-PRO-001 a 006 | **Por documentar** |
| Mesas | `/gerente/mesas` | RF-MES-002 a 006 | **Por documentar** |
| Pedidos | `/gerente/pedidos` y `/gerente/pedidos/:idPedido` | RF-PED-002 (gerente), RF-PED-003, RF-PED-005 (parcial) | Documentada abajo |

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
