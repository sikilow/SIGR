# Contrato de API: Caja

Todas las rutas están bajo `/api/caja` y requieren JWT del rol `cajero`. La API determina el cajero desde el token; no se acepta un `id_cajero` del cliente. Los importes se expresan en MXN.

## `GET /api/caja/estado`

Devuelve el corte abierto del cajero autenticado, las cuentas en `por_pagar` de todo el restaurante y los métodos de pago disponibles. Las cuentas incluyen pedidos sin entregar para que la pantalla los identifique y bloquee el cobro.

```json
{
  "corte": { "id_corte": 4, "inicio": "2026-10-21 19:00:00", "total_ventas": 480 },
  "cuentas": [{
    "cuenta": { "id_cuenta": 3, "id_mesa": 8, "estado": "por_pagar", "pedidos": [], "total": 480 },
    "mesa_numero": 8,
    "pedidos_sin_entregar": []
  }],
  "metodos_pago": [
    { "id_metodo": 1, "nombre": "Efectivo" },
    { "id_metodo": 2, "nombre": "Tarjeta" },
    { "id_metodo": 3, "nombre": "Transferencia" }
  ]
}
```

## `POST /api/caja/cortes`

Abre un corte para el usuario autenticado. El cuerpo es `{}`. Responde `201` con `id_corte`, `inicio` y `total_ventas: 0`. Solo puede existir un corte abierto por cajero.

## `POST /api/caja/cortes/cerrar`

Cierra el corte abierto del cajero y compara el total de ventas registrado con el total reportado por el usuario.

```json
{ "total_reportado": 480 }
```

La respuesta incluye `total_ventas`, `total_reportado` y `diferencia` (`reportado - ventas`). El corte debe estar abierto; los cobros y el cierre se serializan por cajero para evitar carreras.

## `POST /api/caja/cuentas/:id/cobrar`

Solo permite cuentas solicitadas por el mesero (`por_pagar`), con todos los pedidos en `Entregado` o `Cancelado`, un corte abierto y una suma aplicada que cubra exactamente el total calculado por el servidor. La operación es transaccional y acepta `Idempotency-Key`.

```json
{
  "pagos": [
    { "id_metodo": 1, "monto": 300, "monto_recibido": 320 },
    { "id_metodo": 2, "monto": 180, "monto_recibido": 180 }
  ]
}
```

Se aceptan de uno a tres métodos distintos, sin dividir una misma forma en varias líneas. Solo efectivo puede registrar un importe recibido superior al aplicado; la diferencia es el cambio. La respuesta `201` incluye la venta y el desglose imprimible del ticket.

El éxito de la transacción registra venta y pagos, marca como `Pagado` los pedidos no cancelados, cierra la cuenta con `cerrada_en` y libera la mesa. La restricción única de `venta.id_cuenta`, los bloqueos de filas y la idempotencia protegen contra cobros duplicados. Facturación fiscal, historial de ventas y reportes no forman parte de estas rutas.
