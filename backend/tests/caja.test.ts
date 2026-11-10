import { describe, expect, it } from "vitest";
import { cuadrarCorte, validarImportes, validarMetodoSolicitado, type PagoEntrada } from "../src/models/caja";
import { ErrorApi } from "../src/utils/errores";

function errorDe(fn: () => unknown): ErrorApi {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorApi);
    return error as ErrorApi;
  }
  throw new Error("Se esperaba que lanzara un ErrorApi");
}

describe("validarImportes", () => {
  it("valida un pago en efectivo y calcula el cambio en centavos", () => {
    const pagos: PagoEntrada[] = [{ id_metodo: 1, monto: 123.45, monto_recibido: 150 }];
    expect(validarImportes(123.45, pagos)).toEqual({ cambio: 26.55, recibidos: [150] });
  });

  it("acepta pagos divididos que cubren el total exacto", () => {
    const pagos: PagoEntrada[] = [
      { id_metodo: 1, monto: 40, monto_recibido: 50 },
      { id_metodo: 2, monto: 60 },
    ];
    expect(validarImportes(100, pagos)).toEqual({ cambio: 10, recibidos: [50, 60] });
  });

  it("rechaza un total aplicado diferente al de la cuenta", () => {
    const error = errorDe(() => validarImportes(100, [{ id_metodo: 1, monto: 99 }]));
    expect(error.estado).toBe(422);
  });

  it("rechaza importes recibidos inferiores al pago", () => {
    const error = errorDe(() => validarImportes(100, [{ id_metodo: 1, monto: 100, monto_recibido: 90 }]));
    expect(error.estado).toBe(422);
  });

  it("rechaza repetir el mismo método en pagos divididos", () => {
    const error = errorDe(() =>
      validarImportes(100, [
        { id_metodo: 1, monto: 50 },
        { id_metodo: 1, monto: 50 },
      ]),
    );
    expect(error.estado).toBe(422);
  });
});

describe("validarMetodoSolicitado", () => {
  const metodos = [
    { id_metodo: 1, tipo: "fisico" as const, es_efectivo: true },
    { id_metodo: 2, tipo: "fisico" as const, es_efectivo: false },
    { id_metodo: 3, tipo: "digital" as const, es_efectivo: false },
  ];

  it("reconoce cualquier método de la categoría seleccionada", () => {
    expect(() => validarMetodoSolicitado("fisico", [{ id_metodo: 2, monto: 20 }], metodos, false)).not.toThrow();
    expect(() => validarMetodoSolicitado("digital", [{ id_metodo: 3, monto: 20 }], metodos, false)).not.toThrow();
  });

  it("requiere confirmación si se cobra otra categoría", () => {
    const error = errorDe(() => validarMetodoSolicitado("digital", [{ id_metodo: 1, monto: 20 }], metodos, false));
    expect(error.estado).toBe(422);
    expect(() => validarMetodoSolicitado("digital", [{ id_metodo: 1, monto: 20 }], metodos, true)).not.toThrow();
  });
});

describe("cuadrarCorte", () => {
  const desglose = [
    { metodo: "Monedas y billetes", es_efectivo: true, cobros: 3, monto: 1200 },
    { metodo: "Tarjeta", es_efectivo: false, cobros: 2, monto: 850.5 },
    { metodo: "Transferencia", es_efectivo: false, cobros: 0, monto: 0 },
  ];

  it("espera el fondo inicial más solo lo cobrado en efectivo", () => {
    expect(cuadrarCorte(500, desglose, 1700)).toEqual({ total_ventas: 2050.5, efectivo_esperado: 1700, diferencia: 0 });
  });

  it("reporta faltante como diferencia negativa y sobrante como positiva", () => {
    expect(cuadrarCorte(500, desglose, 1680).diferencia).toBe(-20);
    expect(cuadrarCorte(500, desglose, 1700.1).diferencia).toBe(0.1);
  });

  it("sin efectivo contado no calcula diferencia", () => {
    expect(cuadrarCorte(0, desglose, null)).toEqual({ total_ventas: 2050.5, efectivo_esperado: 1200, diferencia: null });
  });

  it("evita errores de punto flotante con centavos", () => {
    const pagos = [
      { metodo: "Monedas", es_efectivo: true, cobros: 2, monto: 0.1 },
      { metodo: "Billetes", es_efectivo: true, cobros: 1, monto: 0.2 },
    ];
    expect(cuadrarCorte(0.1, pagos, 0.4).diferencia).toBe(0);
  });
});
