import { beforeEach, describe, expect, it, vi } from "vitest";

// Si MySQL cancela una transacción por un interbloqueo (error 1213) con otra que toca lo mismo, la API la repite sola; los
// demás errores no se repiten.

const cx = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  query: vi.fn(async () => [[], []]),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: { createPool: () => ({ getConnection: async () => cx }) },
}));

const interbloqueo = () => Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transaccion: interbloqueos", () => {
  it("repite la transacción cuando MySQL la cancela por un interbloqueo", async () => {
    const { transaccion } = await import("../src/services/db");
    let intentos = 0;
    const r = await transaccion(async () => {
      intentos++;
      if (intentos === 1) throw interbloqueo();
      return "listo";
    });
    expect(r).toBe("listo");
    expect(intentos).toBe(2);
    expect(cx.rollback).toHaveBeenCalledTimes(1);
    expect(cx.commit).toHaveBeenCalledTimes(1);
    expect(cx.release).toHaveBeenCalledTimes(2); // la conexión siempre se devuelve al pool
  });

  it("se rinde después de 3 intentos y devuelve el error", async () => {
    const { transaccion } = await import("../src/services/db");
    let intentos = 0;
    await expect(
      transaccion(async () => {
        intentos++;
        throw interbloqueo();
      }),
    ).rejects.toThrow(/Deadlock/);
    expect(intentos).toBe(3);
    expect(cx.commit).not.toHaveBeenCalled();
  });

  it("no repite otros errores (por ejemplo una regla de negocio)", async () => {
    const { transaccion } = await import("../src/services/db");
    let intentos = 0;
    await expect(
      transaccion(async () => {
        intentos++;
        throw new Error("No hay mesa disponible");
      }),
    ).rejects.toThrow(/No hay mesa/);
    expect(intentos).toBe(1);
    expect(cx.rollback).toHaveBeenCalledTimes(1);
  });
});
