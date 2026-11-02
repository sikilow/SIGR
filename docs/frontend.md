# Guía del frontend

El frontend es una aplicación Vue 3 con TypeScript, Vite, Vue Router y Pinia. Las pantallas usan una interfaz común de servicios, por lo que pueden trabajar con datos simulados o con la API sin cambiar los componentes.

## Arranque y composición

1. `frontend/main.ts` crea la aplicación Vue, instala Pinia y Vue Router, carga los tokens y estilos base, y monta `App.vue`.
2. `frontend/src/App.vue` contiene el punto de entrada de las vistas.
3. `frontend/src/router/index.ts` define las rutas, layouts, redirecciones iniciales y guardas por rol.
4. Cada ruta carga la vista del rol correspondiente y esta consume stores y servicios tipados.

## Rutas y roles

| Ruta | Rol | Vista |
|---|---|---|
| `/login` | Público | Inicio de sesión |
| `/mesero/mesas` | `mesero` | Panel de mesas |
| `/mesero/mesas/:idMesa/pedido` | `mesero` | Captura y revisión de pedido |
| `/mesero/mesas/:idMesa/cuenta` | `mesero` | Cuenta y solicitud de pago |
| `/mesero/pedidos` y `/mesero/pedidos/:idPedido` | `mesero` | Mis pedidos |
| `/cocinero/cocina` | `cocinero` | Cola de preparación |
| `/cajero/caja` | `cajero` | Cortes y cobro |
| `/hostess/salon` | `hostess` | Salón y asignación |
| `/hostess/reservaciones` | `hostess` | Reservaciones |
| `/hostess/espera` | `hostess` | Lista de espera |
| `/gerente/usuarios` | `gerente` | Usuarios |
| `/gerente/productos` | `gerente` | Catálogo e inventario |
| `/gerente/mesas` | `gerente` | Mesas y secciones |
| `/gerente/reservaciones` | `gerente` | Configuración de reservaciones |
| `/gerente/pedidos` y `/gerente/pedidos/:idPedido` | `gerente` | Consulta y acciones permitidas sobre pedidos |
| `/gerente/sistema` | `gerente` | Información del sistema |

La ruta `/` redirige a la pantalla inicial del rol recuperado. Sin sesión, las rutas protegidas llevan a `/login`; un rol distinto también se rechaza en el frontend. Estas guardas son una ayuda de navegación, no una frontera de seguridad: la API debe verificar el JWT y los permisos en cada operación.

Los layouts `src/layouts/` comparten la estructura de cada área, navegación, identidad del usuario y salida. Las vistas viven en `src/views/`; los componentes reutilizables, en `src/components/` y `src/components/hostess/`.

## Servicios: mock o API real

`src/services/index.ts` es el punto único de selección:

- `VITE_USE_MOCK=true` (valor predeterminado si está ausente): crea los servicios simulados en memoria, muestra la franja de demo y no requiere backend ni base de datos.
- `VITE_USE_MOCK=false`: usa los adaptadores HTTP de `src/services/api/` y `src/services/hostess/api.ts`.
- `src/services/interfaces.ts` declara los contratos consumidos por vistas y stores. Ambas implementaciones exponen la misma forma pública.
- `src/services/mock/` implementa la demo; los datos iniciales compartidos están en `src/mocks/`.
- `src/services/api/` contiene el cliente HTTP, token, convertidores y adaptadores. Los DTO de la API se convierten a los tipos del frontend mediante `mappers.ts` y `conversion.ts`.
- `src/services/hostess/` reúne interfaces, adaptadores y conversiones de Salón, clientes, reservaciones y lista de espera.

Para desarrollo conectado, `frontend/.env.api` configura `VITE_USE_MOCK=false`, `VITE_API_URL=/api` y el proxy hacia `http://localhost:3000`. `npm run dev` usa el modo `api`; `npm run dev:demo` arranca el modo demo. Si el proxy apunta a otro servidor, configura `API_PROXY_TARGET` en un archivo local ignorado por Git. En producción, el frontend debe apuntar a la API desplegada y el backend debe permitir el origen web correspondiente.

`VITE_API_URL` puede ser una ruta relativa (`/api`) o una URL absoluta. `VITE_POLL_MS` configura el intervalo de actualización automática: el valor predeterminado es 10 000 ms y se rechazan valores menores de 1 000 ms, que vuelven al predeterminado. Las variables `VITE_*` se incorporan al bundle del navegador: no guardes secretos en ellas.

Los comandos de instalación, variables completas y builds están en [Instalación local](../README.md#instalación-local), [Variables de entorno](../README.md#variables-de-entorno) e [Integración con la API real](integracion-api.md).

## Sesión y errores

- `src/stores/sesion.ts` conserva usuario y rol en Pinia y restaura la sesión al iniciar.
- La implementación API guarda el JWT bajo `sigr.token` en `sessionStorage`. Sobrevive a una recarga de la página en la pestaña actual, pero no es almacenamiento persistente entre sesiones del navegador.
- Al restaurar una sesión, el adaptador consulta `GET /api/auth/me`. La API sigue siendo quien autentica y autoriza cada solicitud.
- `src/services/errores.ts` define `ErrorServicio`, con código y estado HTTP comunes para que vistas y stores reaccionen al error sin depender de una implementación concreta.
- Los errores operativos se muestran en las pantallas con opciones para reintentar cuando corresponde; los adaptadores no deben convertir un fallo de API en datos exitosos simulados.

El token es un JWT sin estado en el servidor; cerrar sesión lo elimina del navegador. La duración y validación del token están en el backend. Las limitaciones pendientes de autenticación están registradas en [Pendientes y faltantes](PENDIENTES_Y_FALTANTES.md).

## Estado de interfaz y actualización

- `src/stores/` mantiene estado compartido por flujo: sesión, mesas, pedidos, cuenta, reservaciones, espera, salón, cocina, pedidos de Gerencia e información/anuncios.
- `src/types/` reúne los contratos de dominio consumidos por componentes y servicios. Mantén estos tipos separados de los DTO de red y convierte entre ambos en la capa API.
- Caja administra su estado operativo en la vista `src/views/cajero/CajaView.vue`; su contrato de servicio sigue en `src/services/interfaces.ts`.
- `src/composables/usePolling.ts` inicia la tarea inmediatamente y después la repite, no solapa ejecuciones, pausa con la pestaña oculta y se limpia al salir del componente. La pantalla conserva la responsabilidad de mostrar los errores de cada carga.
- `src/styles/tokens.css` centraliza tokens visuales y `src/styles/base.css` define estilos compartidos. Las vistas y componentes añaden sus estilos locales.

No uses el cliente como fuente de verdad para permisos, existencia, precios o totales: son reglas que el backend debe recalcular y validar.

## Pruebas y verificación

La configuración de Vite/Vitest incluye `src/**/*.test.ts` en entorno Node; las pruebas cubren principalmente lógica, servicios, conversión, stores y guardas de rutas, no un navegador real ni todo el sistema contra MySQL.

Desde `frontend/`:

```powershell
npm test
npm run build
npm run check
```

`npm run check` ejecuta la comprobación de tipos, las pruebas y el build. Para verificar integración completa, sigue además la [lista de comprobación de la API](integracion-api.md) con una base de desarrollo.
