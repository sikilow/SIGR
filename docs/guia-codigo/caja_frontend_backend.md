# Caja: recorrido de backend y frontend

La implementación cubre el flujo de cobro y el corte para el rol `cajero`. Facturación fiscal, historial completo de ventas e informes siguen fuera de este alcance. Los contratos de solicitud y respuesta están en [`../contrato-api-caja.md`](../contrato-api-caja.md).

## Reglas confirmadas

- Solo se cobran cuentas en `por_pagar`, es decir, solicitadas por el mesero.
- Caja muestra las cuentas solicitadas, pero bloquea el cobro mientras quede algún pedido distinto de `Entregado` o `Cancelado`.
- El importe aplicado de uno a tres métodos distintos debe sumar exactamente el total calculado en el backend.
- El efectivo puede recibirse por encima del importe aplicado; se registra cuánto se recibió y cuánto cambio se devolvió. Tarjeta y transferencia se aplican por el importe exacto.
- El cajero debe tener su propio corte abierto para cobrar. Al cierre se guarda el total reportado y se calcula la diferencia respecto a las ventas asociadas.
- Una venta exitosa marca los pedidos vigentes como `Pagado`, cierra cuenta y libera la mesa en la misma transacción.

## Backend

- `backend/src/routes/caja.ts` protege todas las rutas con `requiereAuth("cajero")`.
- `backend/src/controllers/caja.ts` implementa estado, cortes y cobros. El id del cajero siempre proviene del JWT, no del cuerpo.
- `backend/src/models/caja.ts` valida el formato y los importes, trabajando en centavos para comparar totales sin errores de redondeo.
- `backend/src/services/db.ts` aporta la transacción. Apertura, cierre y cobro bloquean la fila del usuario cajero para serializar operaciones; el cobro también bloquea la cuenta.
- El cobro se envuelve en `conIdempotencia`, y `venta.id_cuenta` es además único. Si falla cualquier inserción/actualización, la transacción revierte venta, pagos, estados y liberación de mesa.
- `database/migrations/006_caja.sql` agrega `pago.monto_recibido` y `pago.cambio` a una base previa; `database/init.sql` los incluye en bases nuevas.

## Frontend

- `frontend/src/router/index.ts` redirige al cajero a `/cajero/caja` y restringe la ruta al rol `cajero`.
- `frontend/src/layouts/CajaLayout.vue` ofrece el marco, navegación y salida de sesión.
- `frontend/src/views/cajero/CajaView.vue` permite abrir/cerrar el corte, consultar la cola de cuentas solicitadas, revisar pedidos y líneas, dividir el pago, calcular cambio y mostrar/imprimir un ticket básico desde el navegador.
- `frontend/src/services/interfaces.ts` define el contrato independiente del modo; `services/api/caja.ts` integra los endpoints y `services/mock/cajaMock.ts` simula el flujo para la demo.
- El frontend no completa cobros parciales ni calcula el total de la cuenta como fuente de verdad: la API vuelve a validar ambos antes de registrar la venta.

## Probar manualmente

1. Inicia sesión como cajero y abre el corte.
2. Selecciona una cuenta solicitada por el mesero. Las cuentas con pedidos no entregados aparecen bloqueadas.
3. Captura uno o varios métodos cuya suma aplicada sea el total. En efectivo, captura además el importe recibido para mostrar y guardar el cambio.
4. Cobra, verifica el ticket y usa **Imprimir ticket** para abrir la impresión del navegador.
5. Cierra el corte e introduce el total de ventas reportado; revisa la diferencia calculada.

Con una base de datos existente, aplica `database/migrations/006_caja.sql` antes de usar cobros. La demo en memoria no requiere migración.
