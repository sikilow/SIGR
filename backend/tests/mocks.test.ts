import { describe, expect, it } from "vitest";
import { clientesMock } from "../src/mocks/clientes.mock";
import { categoriasMock, productosMock } from "../src/mocks/productos.mock";

describe("mock de clientes", () => {
  it("cada teléfono tiene 10 dígitos y no se repite", () => {
    const telefonos = clientesMock.map((c) => c.telefono);
    for (const t of telefonos) expect(t).toMatch(/^\d{10}$/);
    expect(new Set(telefonos).size).toBe(telefonos.length);
  });

  it("los ids no se repiten y todos tienen nombre", () => {
    const ids = clientesMock.map((c) => c.id_cliente);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of clientesMock) expect(c.nombre.trim().length).toBeGreaterThan(0);
  });
});

describe("mock de productos", () => {
  it("cada producto pertenece a una categoría que existe", () => {
    const categorias = new Set(categoriasMock.map((c) => c.id_categoria));
    for (const p of productosMock) expect(categorias.has(p.id_categoria)).toBe(true);
  });

  it("respeta las reglas de la base de datos: precio y existencias no negativos", () => {
    for (const p of productosMock) {
      expect(p.precio).toBeGreaterThanOrEqual(0);
      expect(p.existencia).toBeGreaterThanOrEqual(0);
      expect(p.stock_minimo).toBeGreaterThanOrEqual(0);
    }
  });

  it("el precio tiene máximo 2 decimales", () => {
    for (const p of productosMock) expect(Math.abs(p.precio * 100 - Math.round(p.precio * 100))).toBeLessThan(1e-6);
  });

  it("hay productos que controlan existencia y otros que se preparan al momento", () => {
    expect(productosMock.some((p) => p.controla_existencia)).toBe(true);
    expect(productosMock.some((p) => !p.controla_existencia)).toBe(true);
  });
});
