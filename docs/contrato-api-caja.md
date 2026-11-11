# Contrato de API: Caja

Todas las rutas están bajo `/api/caja`. La operación del turno (estado, abrir y cerrar corte, cobrar) requiere JWT del rol `cajero`; la consulta de cortes cerrados acepta `cajero` (solo los suyos) y `gerente` (todos). La API determina el cajero desde el token; no se acepta un `id_cajero` del cliente. Los importes se expresan en MXN.

## `GET /api/caja/estado`

Devuelve el corte abierto del cajero autenticado, las cuentas en `por_pagar` de todo el restaurante y los métodos de pago disponibles. Las cuentas incluyen pedidos sin entregar para que la pantalla los identifique y bloquee el cobro.

El corte abierto no incluye totales de venta ni el efectivo esperado: el cajero cuenta el efectivo al cerrar sin conocer la cifra del sistema.
Las cuentas incluyen `id_metodo_pago_solicitado` cuando el mesero registró un método; caja precarga ese método en el formulario de cobro. Los métodos están asociados a una categoría física o digital.

```json
{
  "corte": { "id_corte": 4, "inicio": "2026-10-21 19:00:00", "fondo_inicial": 500, "cobros": 3 },
  "cuentas": [{
    "cuenta": { "id_cuenta": 3, "id_mesa": 8, "estado": "por_pagar", "pedidos": [], "total": 480 },
    "mesa_numero": 8,
    "pedidos_sin_entregar": []
  }],
  "metodos_pago": [
    { "id_metodo": 1, "nombre": "Efectivo", "id_categoria_metodo_pago": 1, "categoria": "Físico", "tipo": "fisico", "es_efectivo": true },
    { "id_metodo": 2, "nombre": "Tarjeta", "id_categoria_metodo_pago": 2, "categoria": "Digital", "tipo": "digital", "es_efectivo": false }
  ]
}
```

`GET /api/catalogo/metodos-pago/disponibles` requiere autenticación de empleado y devuelve solo métodos cuya categoría y método estén activos. Gerencia administra categorías y métodos con `GET/POST /api/catalogo/metodos-pago`, `POST/PATCH /api/catalogo/metodos-pago/categorias` y `PATCH /api/catalogo/metodos-pago/:id`.

## `POST /api/caja/cortes`

Abre un corte para el usuario autenticado con el efectivo con el que inicia la caja. Solo puede existir un corte abierto por cajero.

```json
{ "fondo_inicial": 500 }
```

Responde `201` con `id_corte`, `inicio`, `fondo_inicial` y `cobros: 0`.

## `POST /api/caja/cortes/cerrar`

Cierra el corte abierto del cajero con el efectivo que contó en la caja (incluido el fondo inicial).

```json
{ "efectivo_contado": 1680 }
```

El servidor calcula `efectivo_esperado = fondo_inicial + pagos aplicados a métodos marcados como efectivo`. Cada pago guarda en `monto` lo aplicado a la cuenta, sin el cambio entregado, así que el cambio ya no cuenta como efectivo en caja. La respuesta es el detalle del corte (ver `GET /api/caja/cortes/:id`); `diferencia = contado - esperado` (negativa: faltante; positiva: sobrante). Los cobros y el cierre se serializan por cajero para evitar carreras.

## `GET /api/caja/cortes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`

Cortes cerrados cuyo `inicio` cae en el rango (ambas fechas incluidas). Sin fechas, devuelve los últimos 30 días; como máximo 200 cortes, del más reciente al más antiguo.

```json
[{
  "id_corte": 4,
  "cajero_nombre": "Marta Caja",
  "inicio": "2026-10-21 19:00:00",
  "fin": "2026-10-21 23:10:00",
  "fondo_inicial": 500,
  "cobros": 5,
  "total_ventas": 2050.5,
  "efectivo_esperado": 1700,
  "efectivo_contado": 1680,
  "diferencia": -20,
  "total_reportado": null
}]
```

Los cortes cerrados antes de la migración 015 no contaron efectivo: tienen `efectivo_contado`, `efectivo_esperado` y `diferencia` en `null`, y conservan en `total_reportado` el total de ventas que reportó el cajero.

## `GET /api/caja/cortes/:id`

Detalle de un corte cerrado: los mismos campos del historial más `desglose`, con todos los métodos de pago aunque no tengan cobros. Para cortes anteriores a la 015, `efectivo_esperado` se calcula con sus pagos. Un corte abierto, inexistente o de otro cajero responde `404`.

```json
{
  "desglose": [
    { "metodo": "Efectivo", "es_efectivo": true, "cobros": 3, "monto": 1200 },
    { "metodo": "Tarjeta", "es_efectivo": false, "cobros": 2, "monto": 850.5 },
    { "metodo": "Transferencia", "es_efectivo": false, "cobros": 0, "monto": 0 }
  ]
}
```

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

Se aceptan de uno a tres métodos distintos, sin dividir una misma forma en varias líneas. El método que eligió el mesero debe incluirse en el cobro. No se puede cobrar mientras haya pedidos activos sin entregar (incluidos los que ya están listos en cocina). Solo un método marcado como efectivo puede registrar un importe recibido superior al aplicado; la diferencia es el cambio. La respuesta `201` incluye la venta y el desglose imprimible del ticket.

El éxito de la transacción registra venta y pagos, marca como `Pagado` los pedidos no cancelados, cierra la cuenta con `cerrada_en` y libera la mesa. La restricción única de `venta.id_cuenta`, los bloqueos de filas y la idempotencia protegen contra cobros duplicados. Facturación fiscal y el reporte de ventas no forman parte de estas rutas.
