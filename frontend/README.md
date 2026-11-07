# SIGR · Frontend

Interfaz del Sistema Integral de Gestión de Restaurante (restaurante "La Madalena"), TecNM Tepic.
Vue 3 + TypeScript + Vite, con Vue Router y Pinia. CSS propio, sin librerías de UI.

Existen los roles **mesero** (Panel de mesas, Pedido de mesa, Cuenta de mesa y Mis pedidos),
**hostess** (Salón, Reservaciones y Lista de espera), **gerente** (Usuarios, Productos, Mesas, Reservas y Pedidos),
**cocinero** (Cocina) y **cajero** (Caja). Las rutas de hostess y gerente están conectadas a la API real; para los
detalles por endpoint consulta los contratos en `../docs/`. La aplicación mantiene una capa de servicios con mock
intercambiable por la API real.

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # desarrollo conectado a la API local (http://localhost:5173 -> backend :3000)
npm run dev:demo   # servidor de desarrollo con datos simulados
npm run build      # tipos (vue-tsc) + build; usa el mock salvo que VITE_USE_MOCK=false
npm run build:api  # igual, pero con la API real (VITE_USE_MOCK=false, ver .env.api): sin mock ni franja demo
npm test           # pruebas automáticas (Vitest)
npm run check      # tipos + pruebas + build: debe pasar antes de entregar cambios
npm run contraste  # informe de contraste WCAG de los pares de color de la hostess (sale con error si alguno no llega)
npm run preview    # servir el build
```

**`build` vs `build:api`:** `npm run build` genera el paquete para demostraciones con datos simulados
(incluye el mock y muestra la franja "Modo demo"). `npm run build:api` es el que se entrega junto con la
API real: el mock y sus usuarios de prueba **no viajan** en el paquete.

Para usar la API mientras desarrollas, inicia el backend (`cd backend && npm run dev`) y el frontend
en otra terminal con `npm run dev`. Ese comando carga `.env.api`, desactiva el mock y configura el proxy
de Vite hacia `http://localhost:3000`. Los usuarios que crees se guardan en MySQL y no se pierden al
recargar. Para volver a los datos simulados, usa `npm run dev:demo`. Si el backend usa otro puerto,
ajusta `API_PROXY_TARGET` en `.env.api.local`.

## Modo demo

Con `VITE_USE_MOCK=true` (el valor por defecto) la aplicación usa datos simulados en memoria. Para que no
se confunda con datos reales, todas las pantallas (login incluido) muestran la franja
**"Modo demo · datos simulados"** (ícono + texto) y el login lista los usuarios de prueba
(`mesero`, `hostess`, `cajero`, `gerente`; contraseña `1234`). Con `VITE_USE_MOCK=false` ninguna de las dos cosas
aparece.

## Pruebas

`npm test` ejecuta Vitest sobre la lógica sin navegador: reglas de negocio (`utils/reglas.ts`: acciones por
estado de pedido y cuándo se puede registrar un pedido; `pendiente` se trata como `enviado`), carrito, claves de
idempotencia, la conversión de datos de la API (`conversion.ts`: números, booleanos y fechas MySQL que llegan como
texto, normalización de estados y roles), los mappers (columnas de la BD en snake_case ↔ camelCase) y las reglas del
mock (cancelar, entregar, solicitar cuenta, `Idempotency-Key`).
Los archivos son `src/**/*.test.ts`.

## Configuración

Copia `.env.example` a `.env.local`:

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `VITE_USE_MOCK` | `true` | `true` = datos simulados; `false` = API real |
| `VITE_API_URL` | `/api` | URL base de la API (relativa o absoluta) |
| `VITE_POLL_MS` | `10000` | Intervalo (ms) de actualización automática del Panel de mesas, Cuenta de mesa y Mis pedidos (mínimo 1000) |
| `API_PROXY_TARGET` | _(vacía)_ | Si se define, Vite hace proxy de `VITE_API_URL` hacia ese destino (evita CORS en desarrollo) |

Con `VITE_USE_MOCK=true`, usuarios de demo (contraseña `1234`): `mesero`, `gerente`, `cajero`.
El gerente y el cajero sirven para probar que la guardia redirige a `/login` cuando el rol no coincide.

La pantalla de configuración de Reservas para gerente es `/gerente/reservaciones`; la prueba
`src/router/index.test.ts` verifica que pertenezca al rol correcto.

## Estructura

```
src/
├── assets/        recursos estáticos
├── components/    componentes reutilizables (InsigniaEstado, DialogoModal, CancelarPedidoDialog…)
├── layouts/       MeseroLayout: barra superior, contenido, navegación inferior
├── router/        rutas y guardia de sesión/rol
├── services/
│   ├── interfaces.ts   contratos: Auth, Mesas, Menu, Pedidos, Cuentas
│   ├── index.ts        elige mock o API según VITE_USE_MOCK
│   ├── mock/           datos en memoria, retraso de 300 ms
│   └── api/            cliente fetch + mappers.ts (único mapeo JSON de la API ↔ tipos) + conversion.ts (PDO/MySQL)
├── stores/        Pinia (sesión, mesas, pedidos, cuenta, borrador, anuncios)
├── styles/        tokens.css (variables) y base.css
├── types/         tipos del dominio con los nombres de la BD; estados.ts = fuente de verdad de los estados
├── utils/         reglas de negocio de la interfaz, formato e idempotencia
└── views/         LoginView y views/mesero/*
```

Las vistas y stores importan **solo** `services` (`servicios.mesas.listar()`, etc.), nunca
`mock/` ni `api/`; por eso cambiar `VITE_USE_MOCK` no requiere tocar ninguna vista.

## Panel de mesas (`/mesero/mesas`)

Pantalla de inicio del mesero y punto de partida hacia Pedido de mesa, Cuenta de mesa y Mis pedidos.

- **Tarjetas de mesa** (`MesaCard`): número, capacidad y estado con ícono + texto. Las ocupadas
  muestran pedidos activos, total acumulado y los avisos "Pedido listo" y "Cuenta solicitada".
  Libres y reservadas se ven atenuadas. Toda la tarjeta es un botón.
- **Resumen y filtros:** contadores por estado y chips Todas / Libres / Ocupadas / Reservadas /
  Pedido listo (`aria-pressed`). El filtro vive en la URL: `?estado=libre|ocupada|reservada|listo`
  (`?estado=disponible`, el nombre anterior, se sigue aceptando como alias de `libre`).
- **Hoja de acciones** (`HojaAccionesMesa`, `<dialog>` modal): una mesa **ocupada** ofrece Nuevo
  pedido, Ver cuenta y Pedidos de la mesa (Nuevo pedido se bloquea si la cuenta está `por_pagar`).
  Una mesa libre o reservada solo se puede cerrar: la hostess la asigna. Foco atrapado, Escape
  cierra y el foco regresa a la tarjeta.
- **Actualización automática** (`usePolling`, store `stores/mesas.ts`): cada `VITE_POLL_MS` ms, en
  pausa con la pestaña oculta, sin peticiones encimadas y con botón de actualizar manual. Si falla
  una actualización se conservan los datos anteriores y se ofrece "Reintentar". Cuando una mesa
  pasa a "Pedido listo" se anuncia en una región `aria-live="polite"` y se resalta (la animación se
  desactiva con `prefers-reduced-motion`).
- **Mock:** a los ~30 s la mesa 5 pasa a "Pedido listo"; la mesa 11 pasa por preparación y queda
  lista a los ~60 s (ver `services/mock/simulacion.ts`).
- **API:** el panel necesita en `GET /mesas` los campos calculados `estado_cuenta`, `pedidos_activos`, `total_cuenta` y
  `pedidos_listos` (no son columnas); ver el contrato.

## Pedido de mesa (`/mesero/mesas/:idMesa/pedido`)

Se llega desde la hoja de acciones del panel ("Nuevo pedido"). Arma un pedido, lo revisa, lo
registra y lo envía a cocina; con `?editar=:idPedido` edita un pedido `registrado`.

- **Guardia:** al entrar carga la mesa. Si no existe, no está ocupada o su cuenta está `por_pagar`,
  vuelve al panel con un aviso (banner + región `aria-live` del layout). Los parámetros se validan
  (`idMesa` numérico en la ruta; `editar` entero positivo).
- **Menú** (`MenuProductos`, `ProductoCard`): chips de categoría (`aria-pressed`, la primera
  seleccionada), búsqueda por nombre en todas las categorías (sin importar acentos) y tarjetas con
  precio. **El menú no maneja cantidades en existencia:** un producto disponible no lleva
  insignia y uno agotado muestra "Agotado"; un agotado queda `aria-disabled` con el motivo escrito y no se puede agregar.
- **Pedido actual** (`PedidoActual`): líneas con cantidad (− / +, mínimo 1), observaciones (`indicaciones` en la BD; máx. 120
  caracteres, con atajos "Sin cebolla", "Extra queso" y "Sin picante" que solo rellenan el texto),
  "Quitar" con confirmación breve y total **estimado**. Los cambios y el total se anuncian en una
  región `aria-live`. En 768 px la columna pasa a una barra inferior con "Ver pedido" (diálogo modal).
- **Revisión** (`RevisionPedido`): al abrirse llama a `POST /productos/disponibilidad`; si algún
  producto está agotado lo lista y bloquea "Registrar" y "Enviar a cocina". "Enviar a cocina" hace
  `POST /pedidos` y luego `POST /pedidos/{id}/enviar`; si el envío falla, el pedido ya quedó
  registrado y "Reintentar envío" repite **solo** el envío (no se duplica).
- **Confirmación** (`ConfirmacionPedido`): número, estado y total reales del servidor, y los
  caminos "Volver al panel", "Nuevo pedido en esta mesa" y "Ver cuenta".
- **Borrador por mesa** (`stores/pedidoBorrador.ts`, en `sessionStorage`, clave `sigr.borradores.v2`; la clave
  anterior se elimina): al salir con productos sin registrar se pide confirmación; se limpia al registrar.
- **Edición:** solo pedidos `registrado` de esa mesa; "Guardar cambios" usa `PATCH /pedidos/{id}`
  (propuesto en el contrato). Ojo: el catálogo de la BD no tiene `Registrado` (ver el contrato).

### Probar fallos con el mock

El mock puede fallar a propósito. Desde la consola del navegador:

```js
sessionStorage.setItem('sigr.mock.fallarEnvio', '1')      // el próximo "enviar" falla 1 vez, SIN aplicarse
sessionStorage.setItem('sigr.mock.perderRespuesta', '1')  // la próxima acción SÍ se aplica, pero responde "red"
```

`perderRespuesta` sirve para comprobar la idempotencia: al reintentar, la misma `Idempotency-Key` hace
que el mock devuelva el resultado anterior en vez de repetir la acción (si se repitiera, daría
`estado_invalido`). Afecta a registrar, enviar, cancelar, entregar y solicitar cuenta.

Para ver el bloqueo por producto agotado: el "Ceviche de pescado" ya viene agotado; para agotar otro
mientras se arma un pedido, en la consola de desarrollo (`npm run dev`):

```js
const m = await import('/src/services/mock/baseDatos.ts')
m.baseDatos.categorias.flatMap((c) => c.productos).find((p) => p.nombre.startsWith('Tacos')).disponible = false
```

## Cuenta de mesa (`/mesero/mesas/:idMesa/cuenta`)

Se llega desde "Ver cuenta" de la hoja de acciones del panel y desde la confirmación de un pedido.

- **Guardia:** la mesa debe existir y estar ocupada; si no, vuelve al panel con un aviso (banner +
  región `aria-live`).
- **Encabezado:** "Mesa N", estado de la cuenta con ícono + texto (Abierta, o "Por pagar · Pago físico")
  y cantidad de pedidos (y cuántos están cancelados).
- **Pedidos** (una tarjeta cada uno): número, hora, estado, líneas (cantidad × producto, observaciones,
  subtotal) y subtotal del pedido; "Ver detalle" lleva a `/mesero/pedidos/:idPedido`. Un pedido
  **cancelado** va atenuado y tachado, con la etiqueta "No suma al total" y su motivo. Los pedidos
  `registrado` y `enviado` (o `pendiente`) ofrecen "Cancelar pedido" (en preparación queda bloqueado con "Requiere
  autorización del gerente").
- **Total** grande en una barra fija ("$1,250.00 MXN"), **tomado de la respuesta del servidor**: el
  cliente no recalcula (solo calcula `cantidad × precio` por línea para mostrarla).
- **Estados:** esqueleto de carga, error con "Reintentar" que conserva los datos anteriores y vacío
  ("Aún no hay pedidos en esta mesa" + "Nuevo pedido").
- **Acciones:** "Agregar pedido" (bloqueado con su motivo si la cuenta está `por_pagar`) y
  "Solicitar cuenta".
- **Solicitar cuenta** (`SolicitarCuentaDialog`): resumen del total, elección **obligatoria** entre
  "Pago físico" y "Pago digital" (tarjetas táctiles de 64 px con radio nativo) y
  `POST /cuentas/{id}/solicitar-pago`. Si hay pedidos sin enviar o sin entregar muestra una advertencia
  lista ("Hay 2 pedidos sin entregar") **sin bloquear**; solo bloquea si no hay pedidos vigentes
  (total 0). Al terminar la pantalla muestra "Cuenta solicitada · Pago físico · Esperando al cajero",
  desaparece el botón y se recargan mesas, pedidos y cuenta (el panel muestra "Cuenta solicitada"). Si
  la cuenta ya no estaba abierta (`estado_invalido`) se explica y se recarga.
- **Actualización automática:** `usePolling` + `stores/cuenta.ts`, igual que el panel.

## Mis pedidos (`/mesero/pedidos` y `/mesero/pedidos/:idPedido`)

- **Lista:** número, mesa, hora, estado, cantidad de productos y total. Chips con `aria-pressed`
  reflejados en la URL: Activos (por defecto: todo menos cancelado y pagado), Registrado, Enviado, En
  preparación, Listo, Entregado y Cancelado (`?estado=listo`). Con `?mesa=:idMesa` aparece el chip
  "Mesa N ×" que lo quita. Orden: primero los listos, luego los más recientes. Estados de carga, error
  con "Reintentar" y vacío por filtro.
- **Diseño:** a 1024 px o más, lista a la izquierda y detalle a la derecha (la ruta con `:idPedido`
  selecciona el pedido sin perder la lista); por debajo de 1024 px el detalle es una pantalla aparte con
  "Volver a pedidos" (el foco pasa al detalle y, al volver, a la fila). El enlace "Pedidos" de la
  navegación inferior sigue activo en las pantallas hijas.
- **Detalle** (`PedidoDetalle`): número, mesa, estado, indicador de avance (Registrado → Enviado → En
  preparación → Listo → Entregado, con ícono + texto), el estado Cancelado aparte con su motivo, líneas
  con observaciones y total.
- **Acciones según el estado:**

  | Estado | Acciones |
  |---|---|
  | `registrado` | Editar (`/mesero/mesas/:idMesa/pedido?editar=:id`), Enviar a cocina (con confirmación breve), Cancelar pedido |
  | `enviado` o `pendiente` (BD) | Cancelar pedido |
  | `en_preparacion` | Cancelar pedido bloqueado (`aria-disabled`) con "Requiere autorización del gerente" visible |
  | `listo` | Marcar como entregado (con confirmación breve; `POST /pedidos/{id}/entregar`, propuesto) |
  | `entregado`, `pagado`, `cancelado` | solo lectura |

  Si una acción falla porque el estado cambió (`estado_invalido`), se explica el estado actual, se
  recarga y no se pierde el contexto.
- **Polling:** cuando un pedido pasa a `listo` se anuncia ("Pedido #8, mesa 5: listo") en la región
  `aria-live` del layout y se resalta con una animación breve (desactivada con `prefers-reduced-motion`).

## Cancelar pedido (`CancelarPedidoDialog`)

Diálogo modal reutilizado desde Mis pedidos y Cuenta de mesa: resumen del pedido, aviso "Esta acción no
se puede deshacer", **motivo obligatorio** (texto de 5 a 200 caracteres con contador, el largo de `motivo_cancelacion.descripcion`) y atajos que solo
rellenan el texto. Botones "No cancelar" y "Cancelar pedido" (destructivo: `--color-peligro`, siempre con
texto + ícono). Éxito: aviso "Pedido #N cancelado", recarga de pedidos, cuenta y mesas, y el foco vuelve
al botón de origen (o al encabezado si ese botón ya no existe). Errores: `requiere_gerente` y
`estado_invalido` se explican y recargan; un fallo de red conserva lo escrito y permite reintentar.

## Idempotencia

Cada intención del usuario (registrar pedido, enviar, cancelar, solicitar cuenta, marcar entregado)
genera un UUID que viaja en la cabecera `Idempotency-Key` (`utils/idempotencia.ts`). Los reintentos de la
**misma** intención reutilizan la clave; una intención nueva genera otra. Solo se reutiliza cuando el
resultado es desconocido (sin conexión o error inesperado); un rechazo claro del servidor cierra la
intención. El mock devuelve el resultado anterior si la clave ya se usó. Es una propuesta
que el servidor debe aceptar y permitir en CORS (ver contrato y pregunta abierta 12).

## Diseño

- Tablet horizontal (base 1024×768), uso táctil: objetivos de al menos 48 px.
- Paleta provisional en `src/styles/tokens.css`. Los colores de estado se usan en ícono y borde;
  el texto usa variantes oscuras (`--color-*-texto`) para cumplir contraste AA.
- Los estados siempre se muestran con texto + ícono (`InsigniaEstado`), nunca solo con color.
- Foco visible, enlace "Saltar al contenido" y respeto de `prefers-reduced-motion`.

## Documentación

| Documento | Para qué sirve |
|---|---|
| [`../docs/equivalencias-bd.md`](../docs/equivalencias-bd.md) | Cada identificador del frontend frente a su tabla y columna de la BD, su nombre en TypeScript y en el JSON, y si es columna, calculado por la API o sin columna |
| [`../docs/contrato-api-mesero.md`](../docs/contrato-api-mesero.md) | Contrato de API que espera el frontend (con los nombres de columna de la BD): endpoints, JSON de ejemplo, preguntas abiertas y diferencias con la BD |
| [`../docs/integracion-api.md`](../docs/integracion-api.md) | Guía para conectar la API real: `VITE_USE_MOCK`, proxy de Vite/CORS, orden de integración, pruebas manuales y tabla de diferencias |
| [`../docs/pantallas-mesero.md`](../docs/pantallas-mesero.md) | Pantallas, rutas y caso de uso de cada una, con capturas (`../docs/capturas/`, datos simulados) |

## Accesibilidad y diseño responsivo

- Verificado con teclado de punta a punta (login → panel → pedido → cuenta → Mis pedidos → cancelar →
  salir), con foco visible, diálogos que atrapan el foco y lo devuelven a su origen.
- `prefers-reduced-motion`: no se ejecuta ninguna animación ni transición.
- Sin scroll horizontal a 1024×768, 768×1024 y con zoom de 200% (la cabecera envuelve, las barras fijas
  dejan de ser fijas con poca altura y los diálogos se desplazan). Los puntos de corte usan `em`, así que
  también responden cuando el usuario agranda el texto base del navegador.
