# SIGR · Frontend

Interfaz del Sistema Integral de Gestión de Restaurante (restaurante "La Madalena"), TecNM Tepic.
Vue 3 + TypeScript + Vite, con Vue Router y Pinia. CSS propio, sin librerías de UI.

Por ahora solo existe la base del rol **mesero**: layout, router, tipos, tokens de diseño y
una capa de servicios con mock intercambiable por la API real. Los tipos y el contrato de la
API son **PROVISIONALES** hasta validarlos con el equipo de API.

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm run build      # verificación de tipos (vue-tsc) + build de producción
npm run preview    # servir el build
```

## Configuración

Copia `.env.example` a `.env.local`:

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `VITE_USE_MOCK` | `true` | `true` = datos simulados; `false` = API real |
| `VITE_API_URL` | `/api` | URL base de la API (relativa o absoluta) |
| `VITE_POLL_MS` | `10000` | Intervalo (ms) de actualización automática del Panel de mesas (mínimo 1000) |
| `API_PROXY_TARGET` | _(vacía)_ | Si se define, Vite hace proxy de `VITE_API_URL` hacia ese destino (evita CORS en desarrollo) |

Con `VITE_USE_MOCK=true`, usuarios de demo (contraseña `1234`): `mesero`, `gerente`, `cajero`.
El gerente y el cajero sirven para probar que la guardia redirige a `/login` cuando el rol no coincide.

## Estructura

```
src/
├── assets/        recursos estáticos
├── components/    componentes reutilizables (InsigniaEstado)
├── layouts/       MeseroLayout: barra superior, contenido, navegación inferior
├── router/        rutas y guardia de sesión/rol
├── services/
│   ├── interfaces.ts   contratos: Auth, Mesas, Menu, Pedidos, Cuentas
│   ├── index.ts        elige mock o API según VITE_USE_MOCK
│   ├── mock/           datos en memoria, retraso de 300 ms
│   └── api/            cliente fetch + mappers.ts (único mapeo snake_case ↔ camelCase)
├── stores/        Pinia (sesión)
├── styles/        tokens.css (variables) y base.css
├── types/         tipos del dominio (PROVISIONAL)
├── utils/         reglas de negocio de la interfaz (p. ej. cancelación)
└── views/         LoginView y views/mesero/*
```

Las vistas y stores importan **solo** `services` (`servicios.mesas.listar()`, etc.), nunca
`mock/` ni `api/`; por eso cambiar `VITE_USE_MOCK` no requiere tocar ninguna vista.

## Panel de mesas (`/mesero/mesas`)

Pantalla de inicio del mesero y punto de partida hacia Pedido de mesa, Cuenta de mesa y Mis pedidos
(esas pantallas aún son placeholders: `/mesero/mesas/:mesaId/pedido`, `/mesero/mesas/:mesaId/cuenta`
y `/mesero/pedidos`).

- **Tarjetas de mesa** (`MesaCard`): número, capacidad y estado con ícono + texto. Las ocupadas
  muestran pedidos activos, total acumulado y los avisos "Pedido listo" y "Cuenta solicitada".
  Libres y reservadas se ven atenuadas. Toda la tarjeta es un botón.
- **Resumen y filtros:** contadores por estado y chips Todas / Libres / Ocupadas / Reservadas /
  Pedido listo (`aria-pressed`). El filtro vive en la URL: `?estado=libre|ocupada|reservada|listo`.
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
- **API:** el panel necesita campos nuevos en `GET /mesas`; ver "CAMBIO PROPUESTO EN F3" en el contrato.

## Pedido de mesa (`/mesero/mesas/:mesaId/pedido`)

Se llega desde la hoja de acciones del panel ("Nuevo pedido"). Arma un pedido, lo revisa, lo
registra y lo envía a cocina; con `?editar=:pedidoId` edita un pedido `registrado`.

- **Guardia:** al entrar carga la mesa. Si no existe, no está ocupada o su cuenta está `por_pagar`,
  vuelve al panel con un aviso (banner + región `aria-live` del layout). Los parámetros se validan
  (`mesaId` numérico en la ruta; `editar` entero positivo).
- **Menú** (`MenuProductos`, `ProductoCard`): chips de categoría (`aria-pressed`, la primera
  seleccionada), búsqueda por nombre en todas las categorías (sin importar acentos) y tarjetas con
  precio. **El menú no maneja cantidades en existencia:** cada producto está "Disponible" o
  "Agotado"; un agotado queda `aria-disabled` con el motivo escrito y no se puede agregar.
- **Pedido actual** (`PedidoActual`): líneas con cantidad (− / +, mínimo 1), observaciones (máx. 120
  caracteres, con atajos "Sin cebolla", "Extra queso" y "Sin picante" que solo rellenan el texto),
  "Quitar" con confirmación breve y total **estimado**. Los cambios y el total se anuncian en una
  región `aria-live`. En 768 px la columna pasa a una barra inferior con "Ver pedido" (diálogo modal).
- **Revisión** (`RevisionPedido`): al abrirse llama a `POST /productos/disponibilidad`; si algún
  producto está agotado lo lista y bloquea "Registrar" y "Enviar a cocina". "Enviar a cocina" hace
  `POST /pedidos` y luego `POST /pedidos/{id}/enviar`; si el envío falla, el pedido ya quedó
  registrado y "Reintentar envío" repite **solo** el envío (no se duplica).
- **Confirmación** (`ConfirmacionPedido`): número, estado y total reales del servidor, y los
  caminos "Volver al panel", "Nuevo pedido en esta mesa" y "Ver cuenta" (placeholder).
- **Borrador por mesa** (`stores/pedidoBorrador.ts`, en `sessionStorage`): al salir con productos sin
  registrar se pide confirmación; se limpia al registrar.
- **Edición:** solo pedidos `registrado` de esa mesa; "Guardar cambios" usa `PATCH /pedidos/{id}`
  (propuesto en el contrato como CAMBIO PROPUESTO EN F4).

### Probar fallos con el mock

El mock puede fallar a propósito. Desde la consola del navegador:

```js
sessionStorage.setItem('sigr.mock.fallarEnvio', '1') // el próximo "enviar" falla 1 vez
```

Para ver el bloqueo por producto agotado: el "Ceviche de pescado" ya viene agotado; para agotar otro
mientras se arma un pedido, en la consola de desarrollo (`npm run dev`):

```js
const m = await import('/src/services/mock/baseDatos.ts')
m.baseDatos.categorias.flatMap((c) => c.productos).find((p) => p.nombre.startsWith('Tacos')).disponible = false
```

## Diseño

- Tablet horizontal (base 1024×768), uso táctil: objetivos de al menos 48 px.
- Paleta provisional en `src/styles/tokens.css`. Los colores de estado se usan en ícono y borde;
  el texto usa variantes oscuras (`--color-*-texto`) para cumplir contraste AA.
- Los estados siempre se muestran con texto + ícono (`InsigniaEstado`), nunca solo con color.
- Foco visible, enlace "Saltar al contenido" y respeto de `prefers-reduced-motion`.

## Contrato con la API

Ver [`../docs/contrato-api-mesero.md`](../docs/contrato-api-mesero.md).
