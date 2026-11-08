import { describe, expect, it } from "vitest";
import { calcularEfectivoEsperado, validarImportes, validarMetodoSolicitado, type PagoEntrada } from "../src/models/caja";
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
    { id_metodo: 1, nombre: "Efectivo" },
    { id_metodo: 2, nombre: "Tarjeta" },
    { id_metodo: 3, nombre: "Transferencia" },
  ];

  it("acepta métodos que coinciden con la solicitud y pagos combinados que la incluyen", () => {
    expect(() => validarMetodoSolicitado("digital", [{ id_metodo: 3, monto: 100 }], metodos, false)).not.toThrow();
    expect(() => validarMetodoSolicitado("fisico", [
      { id_metodo: 1, monto: 50 },
      { id_metodo: 2, monto: 50 },
    ], metodos, false)).not.toThrow();
  });

  it("requiere confirmar cuando el cobro no incluye la forma solicitada", () => {
    const error = errorDe(() => validarMetodoSolicitado("digital", [{ id_metodo: 1, monto: 100 }], metodos, false));
    expect(error.estado).toBe(422);
    expect(() => validarMetodoSolicitado("digital", [{ id_metodo: 1, monto: 100 }], metodos, true)).not.toThrow();
  });
});

describe("calcularEfectivoEsperado", () => {
  it("suma el fondo y los pagos en efectivo sin agregar tarjeta ni transferencias", () => {
    expect(calcularEfectivoEsperado(600, [
      { nombre: "Efectivo", monto: 300 },
      { nombre: "Tarjeta", monto: 80 },
      { nombre: "Transferencia", monto: 100 },
    ])).toBe(900);
  });
});
