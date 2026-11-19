import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { filasMock } = vi.hoisted(() => ({ filasMock: vi.fn() }));

vi.hoisted(() => {
  process.env.JWT_SECRET = "clave-de-prueba";
});

vi.mock("../src/services/db", () => ({
  pool: {},
  filas: filasMock,
  ejecutar: vi.fn(),
  transaccion: async (accion: (cx: object) => Promise<unknown>) => accion({}),
}));

import { requiereAuth } from "../src/utils/auth";

const token = (datos: object = { id: 7, rol: "mesero" }) => jwt.sign(datos, "clave-de-prueba", { expiresIn: "8h" });

/** Ejecuta el middleware y devuelve el error (si lo hubo) o `null` si dejó pasar la petición. */
async function ejecutar(cabecera: string | undefined, ...roles: Parameters<typeof requiereAuth>): Promise<{ error: unknown; req: Request }> {
  const req = { headers: { authorization: cabecera } } as unknown as Request;
  let error: unknown = null;
  const siguiente: NextFunction = () => undefined;
  try {
    await requiereAuth(...roles)(req, {} as Response, siguiente);
  } catch (e) {
    error = e;
  }
  return { error, req };
}

beforeEach(() => filasMock.mockReset());

describe("sesión de empleados: se vuelve a consultar la base en cada petición", () => {
  it("deja pasar a un usuario activo y toma su rol de la base", async () => {
    filasMock.mockResolvedValueOnce([{ activo: 1, eliminado_en: null, rol: "mesero" }]);
    const { error, req } = await ejecutar(`Bearer ${token()}`);
    expect(error).toBeNull();
    expect(req.usuario).toEqual({ id: 7, rol: "mesero" });
  });

  it("rechaza al instante a un usuario desactivado, aunque su token siga vigente", async () => {
    filasMock.mockResolvedValueOnce([{ activo: 0, eliminado_en: null, rol: "mesero" }]);
    const { error } = await ejecutar(`Bearer ${token()}`);
    expect(error).toMatchObject({ estado: 401, codigo: "no_autenticado", extra: { motivo: "cuenta_inactiva" } });
  });

  it("rechaza a un usuario eliminado", async () => {
    filasMock.mockResolvedValueOnce([{ activo: 1, eliminado_en: "2026-11-18 10:00:00", rol: "mesero" }]);
    const { error } = await ejecutar(`Bearer ${token()}`);
    expect(error).toMatchObject({ estado: 401, extra: { motivo: "cuenta_inactiva" } });
  });

  it("rechaza a un usuario que ya no existe", async () => {
    filasMock.mockResolvedValueOnce([]);
    const { error } = await ejecutar(`Bearer ${token()}`);
    expect(error).toMatchObject({ estado: 401 });
  });

  it("el rol que cuenta es el de la base: un cambio de rol se aplica al instante", async () => {
    // El token dice «gerente», pero en la base ya es mesero.
    filasMock.mockResolvedValue([{ activo: 1, eliminado_en: null, rol: "mesero" }]);
    const { error } = await ejecutar(`Bearer ${token({ id: 7, rol: "gerente" })}`, "gerente");
    expect(error).toMatchObject({ estado: 403, codigo: "sin_permiso" });
  });

  it("al revés: un mesero ascendido a cajero entra con su mismo token", async () => {
    filasMock.mockResolvedValue([{ activo: 1, eliminado_en: null, rol: "cajero" }]);
    const { error, req } = await ejecutar(`Bearer ${token({ id: 7, rol: "mesero" })}`, "cajero");
    expect(error).toBeNull();
    expect(req.usuario?.rol).toBe("cajero");
  });

  it("sin token o con token falso ni siquiera consulta la base", async () => {
    expect((await ejecutar(undefined)).error).toMatchObject({ estado: 401 });
    expect((await ejecutar("Bearer falso")).error).toMatchObject({ estado: 401 });
    expect(filasMock).not.toHaveBeenCalled();
  });

  it("un token de cliente nunca sirve como sesión de empleado", async () => {
    const { error } = await ejecutar(`Bearer ${token({ id: 7, rol: "mesero", tipo: "cliente" })}`);
    expect(error).toMatchObject({ estado: 403 });
    expect(filasMock).not.toHaveBeenCalled();
  });
});
