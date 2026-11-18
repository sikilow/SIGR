import { describe, expect, it } from "vitest";
import { diasEnRango, MAX_DIAS_REPORTE } from "../src/controllers/reporteVentas";

describe("reporte de ventas: rango de fechas", () => {
  it("cuenta ambos extremos", () => {
    expect(diasEnRango("2026-11-01", "2026-11-30")).toBe(30);
    expect(diasEnRango("2026-11-17", "2026-11-17")).toBe(1);
    expect(diasEnRango("2026-01-01", "2026-12-31")).toBe(365);
  });

  it("dos años completos caben en el límite", () => {
    expect(diasEnRango("2025-01-01", "2026-12-31")).toBeLessThanOrEqual(MAX_DIAS_REPORTE);
    expect(diasEnRango("2024-01-01", "2026-12-31")).toBeGreaterThan(MAX_DIAS_REPORTE);
  });
});
