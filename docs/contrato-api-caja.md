# Contrato de API: Caja

Todas las rutas están bajo `/api/caja` y requieren JWT del rol `cajero`. La API determina el cajero desde el token; no se acepta un `id_cajero` del cliente. Los importes se expresan en MXN.

## `GET /api/caja/estado`

Devuelve el corte abierto del cajero autenticado, las cuentas en `por_pagar` de todo el restaurante y los métodos de pago disponibles. Las cuentas incluyen pedidos sin entregar para que la pantalla los identifique y bloquee el cobro.

```json
{
  "corte": {
    "id_corte": 4, "id_cajero": 12, "cajero_nombre": "Andrea",
    "inicio": "2026-10-21 19:00:00", "fin": null,
    "efectivo_inicial": 600, "total_ventas": 480, "efectivo_esperado": 900,
    "efectivo_contado": null, "diferencia_efectivo": null, "tipo_cierre": null,
    "metodos_pago": [
      { "id_metodo": 1, "nombre": "Efectivo", "cantidad_pagos": 1, "monto": 300 },
      { "id_metodo": 2, "nombre": "Tarjeta", "cantidad_pagos": 0, "monto": 0 },
      { "id_metodo": 3, "nombre": "Transferencia", "cantidad_pagos": 1, "monto": 180 }
    ],
    "ventas": []
  },
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

## Métodos de pago (Gerencia)

Las rutas viven en `/api/catalogo/metodos-pago` y requieren rol `gerente`:

- `GET` lista métodos activos e inactivos.
- `POST` `{ "nombre": "Aplicación bancaria" }` agrega uno; el nombre es único y admite hasta 40 caracteres.
- `PATCH /:id` `{ "activo": false }` lo oculta de nuevos cobros sin borrar el histórico. Debe quedar al menos un método activo.

`GET /api/caja/estado` solo devuelve métodos activos para nuevos pagos; los cierres siguen reportando también métodos usados en ventas históricas.

## `POST /api/caja/cortes`

Abre un tramo de caja para el usuario autenticado. Se debe registrar el efectivo que recibe al iniciar; los pagos electrónicos nunca se agregan al saldo físico.

```json
{ "efectivo_inicial": 600 }
```

Responde `201` con el corte, los totales por método y las cuentas del tramo. Solo puede existir un corte abierto por cajero.

## `POST /api/caja/cortes/cerrar`

Cierra el corte abierto del cajero como parcial (por ejemplo, para un cambio de turno) o final. El conteo introducido es solo el efectivo físico del cajón.

```json
{ "tipo_cierre": "parcial", "efectivo_contado": 900 }
```

La respuesta incluye apertura y cierre, cajero, `total_ventas`, `metodos_pago`, cuentas cobradas, `efectivo_esperado`, `efectivo_contado` y `diferencia_efectivo` (`contado - esperado`). El efectivo esperado se calcula como `efectivo_inicial + pagos aplicados en efectivo`; tarjeta y transferencia se reportan aparte y no alteran el efectivo esperado. `total_reportado` se acepta temporalmente para clientes anteriores. El corte debe estar abierto; los cobros y el cierre se serializan por cajero para evitar carreras.

## `POST /api/caja/cuentas/:id/cobrar`

Solo permite cuentas solicitadas por el mesero (`por_pagar`), con todos los pedidos en `Entregado` o `Cancelado`, un corte abierto y una suma aplicada que cubra exactamente el total calculado por el servidor. La operación es transaccional y acepta `Idempotency-Key`.

```json
{
  "pagos": [
    { "id_metodo": 1, "monto": 300, "monto_recibido": 320 },
    { "id_metodo": 2, "monto": 180, "monto_recibido": 180 }
  ],
  "confirmar_cambio_metodo": false
}
```

Se aceptan de uno a tres métodos distintos, sin dividir una misma forma en varias líneas. Al menos un método debe coincidir con `cuenta.tipo_pago_solicitado` (`fisico` requiere Efectivo; `digital`, Tarjeta/Transferencia u otro método no efectivo). Si el cliente cambia la forma indicada, el cajero debe confirmarlo con `confirmar_cambio_metodo: true`; de lo contrario la API responde `422`. Solo efectivo puede registrar un importe recibido superior al aplicado; la diferencia es el cambio. La respuesta `201` incluye la venta y el desglose imprimible del ticket.

El éxito de la transacción registra venta y pagos, marca como `Pagado` los pedidos no cancelados, cierra la cuenta con `cerrada_en` y libera la mesa. La restricción única de `venta.id_cuenta`, los bloqueos de filas y la idempotencia protegen contra cobros duplicados. El historial y los reportes por periodo aún no están disponibles; cada cierre sí devuelve el detalle exportable de ese corte.
