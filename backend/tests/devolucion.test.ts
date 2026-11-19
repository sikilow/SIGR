import { describe, expect, it } from "vitest";
import { calcularLineasDevolucion, disponibleDeLinea, estadoDevolucionVenta, validarPagosDevolucion, type LineaVenta, type PagoVenta } from "../src/models/devolucion";

const lineas: LineaVenta[] = [
  { id_detalle: 1, producto: "Guacamole", cantidad: 2, precio_unitario: 95, devuelta: 0, pendiente: 0 },
  { id_detalle: 2, producto: "Mole poblano", cantidad: 1, precio_unitario: 190.5, devuelta: 0, pendiente: 0 },
  { id_detalle: 3, producto: "Limonada", cantidad: 3, precio_unitario: 45, devuelta: 1, pendiente: 1 },
];

describe("calcular las líneas de una devolución", () => {
  it("importe = cantidad × precio de la venta; el total es la suma", () => {
    const r = calcularLineasDevolucion(lineas, [{ id_detalle: 1, cantidad: 1 }, { id_detalle: 2, cantidad: 1 }]);
    expect(r.lineas).toEqual([
      { id_detalle: 1, cantidad: 1, importe: 95 },
      { id_detalle: 2, cantidad: 1, importe: 190.5 },
    ]);
    expect(r.total).toBe(285.5);
  });

  it("no hay errores de redondeo con centavos", () => {
    const r = calcularLineasDevolucion([{ id_detalle: 9, producto: "X", cantidad: 3, precio_unitario: 0.1, devuelta: 0, pendiente: 0 }], [{ id_detalle: 9, cantidad: 3 }]);
    expect(r.total).toBe(0.3);
  });

  it("no deja pedir más de lo que queda (descontando lo devuelto y lo pendiente)", () => {
    expect(disponibleDeLinea(lineas[2]!)).toBe(1);
    expect(() => calcularLineasDevolucion(lineas, [{ id_detalle: 1, cantidad: 3 }])).toThrow(/solo se pueden devolver 2/);
    expect(() => calcularLineasDevolucion(lineas, [{ id_detalle: 3, cantidad: 2 }])).toThrow(/solo se pueden devolver 1/);
    expect(calcularLineasDevolucion(lineas, [{ id_detalle: 3, cantidad: 1 }]).total).toBe(45);
  });

  it("una línea ya devuelta por completo, ajena a la venta o repetida se rechaza", () => {
    const agotada = [{ ...lineas[0]!, devuelta: 2 }];
    expect(() => calcularLineasDevolucion(agotada, [{ id_detalle: 1, cantidad: 1 }])).toThrow(/ya se devolvió por completo/);
    expect(() => calcularLineasDevolucion(lineas, [{ id_detalle: 99, cantidad: 1 }])).toThrow(/no pertenece a esta venta/);
    expect(() => calcularLineasDevolucion(lineas, [{ id_detalle: 1, cantidad: 1 }, { id_detalle: 1, cantidad: 1 }])).toThrow(/dos veces/);
  });
});

describe("cómo se devuelve el dinero", () => {
  const pagos: PagoVenta[] = [
    { id_metodo: 1, metodo: "Efectivo", monto: 300, devuelto: 0, pendiente: 0 },
    { id_metodo: 2, metodo: "Tarjeta", monto: 200, devuelto: 50, pendiente: 20 },
  ];

  it("acepta montos que suman el total y no pasan de lo cobrado con cada método", () => {
    expect(() => validarPagosDevolucion(130, [{ id_metodo: 1, monto: 100 }, { id_metodo: 2, monto: 30 }], pagos)).not.toThrow();
  });

  it("rechaza si no suma el total", () => {
    expect(() => validarPagosDevolucion(130, [{ id_metodo: 1, monto: 100 }], pagos)).toThrow(/deben sumar el total/);
  });

  it("rechaza pasarse de lo cobrado con un método (restando lo ya devuelto y lo pendiente)", () => {
    expect(() => validarPagosDevolucion(200, [{ id_metodo: 2, monto: 200 }], pagos)).toThrow(/solo se pueden devolver \$130\.00/);
    expect(() => validarPagosDevolucion(301, [{ id_metodo: 1, monto: 301 }], pagos)).toThrow(/\$300\.00/);
  });

  it("rechaza un método que no se usó en la venta o repetido", () => {
    expect(() => validarPagosDevolucion(10, [{ id_metodo: 7, monto: 10 }], pagos)).toThrow(/métodos de pago que se usaron/);
    expect(() => validarPagosDevolucion(20, [{ id_metodo: 1, monto: 10 }, { id_metodo: 1, monto: 10 }], pagos)).toThrow(/dos veces/);
  });
});

describe("estado de devolución de una venta", () => {
  it("ninguna, parcial o total", () => {
    expect(estadoDevolucionVenta(500, 0)).toBe("ninguna");
    expect(estadoDevolucionVenta(500, 120.5)).toBe("parcial");
    expect(estadoDevolucionVenta(500, 500)).toBe("total");
  });
});
