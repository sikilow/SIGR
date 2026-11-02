# Pantalla de Cocina

La pantalla de Cocina está disponible en `/cocinero/cocina` y requiere el rol `cocinero`. Su objetivo es recibir los pedidos enviados por el salón, mostrar sus productos e indicaciones y mantener visible el avance de preparación.

## Recorrido del pedido

1. El mesero envía un pedido registrado a cocina.
2. El pedido aparece en **Nuevos**, ordenado del más antiguo al más reciente.
3. Cocina selecciona **Iniciar preparación**. El estado pasa a `en_preparacion` y el pedido aparece en esa columna.
4. Al terminar, Cocina selecciona **Marcar listo**. El estado pasa a `listo` y el pedido sale de la cola de Cocina; el mesero puede verlo y marcarlo entregado.
5. Caja solo permite cobrar la cuenta cuando sus pedidos están entregados o cancelados. El contrato de cobro se detalla en [API de Caja](contrato-api-caja.md).

La pantalla muestra el identificador de pedido, número de mesa, hora, antigüedad, productos, cantidades e indicaciones. Los pedidos de 10 a 19 minutos reciben una señal visual de atención y a partir de 20 minutos una de urgencia; la etiqueta de estado y el tiempo también se muestran en texto. Se emite un anuncio accesible cuando un pedido cambia a preparación o queda listo.

## Actualización y errores

La vista carga los pedidos nuevos y en preparación al abrirse y se actualiza periódicamente. El intervalo se configura con `VITE_POLL_MS` (10 segundos por defecto; mínimo 1 segundo). El polling se pausa cuando la pestaña está oculta y se reanuda al volver. También hay un control manual para actualizar.

Si una carga falla y ya había datos, la pantalla conserva la cola anterior y ofrece **Reintentar**. Si falla una acción de estado, muestra el error y vuelve a consultar los pedidos para reflejar el estado vigente del servidor.

## Rutas de API y permisos

La pantalla usa las operaciones de pedidos descritas en el [contrato de API del mesero](contrato-api-mesero.md):

- `GET /api/pedidos?estado=pendiente` para pedidos enviados a cocina.
- `GET /api/pedidos?estado=en_preparacion` para pedidos en curso.
- `PATCH /api/pedidos/:id/estado` con `{ "estado": "en_preparacion" }` o `{ "estado": "listo" }`.

El backend permite esta ruta a `cocinero` y `gerente`; la interfaz de cocina se asigna al rol `cocinero`. El servidor valida que la transición venga del estado anterior permitido. La guarda del router no sustituye esa autorización.

## Implementación relacionada

| Responsabilidad | Archivo |
|---|---|
| Ruta, layout y rol requerido | `frontend/src/router/index.ts`, `frontend/src/layouts/CocinaLayout.vue` |
| Cola, tiempos y acciones de la pantalla | `frontend/src/views/cocinero/CocinaView.vue` |
| Carga, orden, cambios e invalidación del estado | `frontend/src/stores/cocina.ts` |
| Polling compartido | `frontend/src/composables/usePolling.ts` |
| Adaptación de los servicios | `frontend/src/services/api/index.ts`, `frontend/src/services/interfaces.ts` |
| Permisos de endpoint | `backend/src/routes/pedidos.ts` |

Las pantallas de los demás roles están en [Pantallas del mesero](pantallas-mesero.md), [Pantallas de Hostess](pantallas-hostess.md), [Pantallas de Gerencia](pantallas-gerente.md) y el [recorrido de Caja](guia-codigo/caja_frontend_backend.md).
