import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { filasMock, ejecutarMock } = vi.hoisted(() => ({ filasMock: vi.fn(), ejecutarMock: vi.fn() }));

vi.hoisted(() => {
  process.env.JWT_SECRET = "clave-de-prueba";
});

vi.mock("../src/services/db", () => ({
  pool: {},
  filas: filasMock,
  ejecutar: ejecutarMock,
  transaccion: async (accion: (cx: object) => Promise<unknown>) => accion({}),
}));

import { requiereAuth } from "../src/utils/auth";

const SID = "a".repeat(32);
const token = (datos: object = { id: 7, rol: "mesero", sid: SID }) => jwt.sign(datos, "clave-de-prueba", { expiresIn: "8h" });

/** Fila que devuelve la consulta de sesión: usuario activo con sesión abierta y activa hace `inactivoSegundos`. */
const fila = (extra: Record<string, unknown> = {}) => ({
  activo: 1,
  eliminado_en: null,
  rol: "mesero",
  id_sesion: SID,
  cerrada_en: null,
  inactivo_segundos: 5,
  ...extra,
});

/** Ejecuta el middleware y devuelve el error (si lo hubo) o `null` si dejó pasar la petición. */
async function ejecutar(
  cabecera: string | undefined,
  ...roles: Parameters<typeof requiereAuth>
): Promise<{ error: unknown; req: Request }> {
  return ejecutarConMetodo("GET", cabecera, ...roles);
}

async function ejecutarConMetodo(
  metodo: string,
  cabecera: string | undefined,
  ...roles: Parameters<typeof requiereAuth>
): Promise<{ error: unknown; req: Request }> {
  const req = { headers: { authorization: cabecera }, method: metodo, baseUrl: "/api/x", path: "/", ip: "10.0.0.5" } as unknown as Request;
  let error: unknown = null;
  const siguiente: NextFunction = () => undefined;
  try {
    await requiereAuth(...roles)(req, {} as Response, siguiente);
  } catch (e) {
    error = e;
  }
  return { error, req };
}

/** Consultas SQL que se hicieron (las del registro de accesos y las de la sesión). */
const sqls = () => ejecutarMock.mock.calls.map((c) => String(c[1]));

beforeEach(() => {
  filasMock.mockReset();
  ejecutarMock.mockReset();
  delete process.env.INACTIVIDAD_MINUTOS;
  delete process.env.INACTIVIDAD_MINUTOS_COCINA;
});

describe("sesión de empleados: se vuelve a consultar la base en cada petición", () => {
  it("deja pasar a un usuario activo y toma su rol de la base", async () => {
    filasMock.mockResolvedValueOnce([fila()]);
    const { error, req } = await ejecutar(`Bearer ${token()}`);
    expect(error).toBeNull();
    expect(req.usuario).toEqual({ id: 7, rol: "mesero" });
    expect(req.sesionId).toBe(SID);
  });

  it("rechaza al instante a un usuario desactivado, aunque su token siga vigente", async () => {
    filasMock.mockResolvedValueOnce([fila({ activo: 0 })]);
    const { error } = await ejecutar(`Bearer ${token()}`);
    expect(error).toMatchObject({ estado: 401, codigo: "no_autenticado", extra: { motivo: "cuenta_inactiva" } });
  });

  it("rechaza a un usuario eliminado", async () => {
    filasMock.mockResolvedValueOnce([fila({ eliminado_en: "2026-11-18 10:00:00" })]);
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
    filasMock.mockResolvedValue([fila()]);
    const { error } = await ejecutar(`Bearer ${token({ id: 7, rol: "gerente", sid: SID })}`, "gerente");
    expect(error).toMatchObject({ estado: 403, codigo: "sin_permiso" });
  });

  it("al revés: un mesero ascendido a cajero entra con su mismo token", async () => {
    filasMock.mockResolvedValue([fila({ rol: "cajero" })]);
    const { error, req } = await ejecutar(`Bearer ${token({ id: 7, rol: "mesero", sid: SID })}`, "cajero");
    expect(error).toBeNull();
    expect(req.usuario?.rol).toBe("cajero");
  });

  it("sin token o con token falso no consulta la sesión del usuario", async () => {
    expect((await ejecutar(undefined)).error).toMatchObject({ estado: 401 });
    expect((await ejecutar("Bearer falso")).error).toMatchObject({ estado: 401 });
    expect(filasMock).not.toHaveBeenCalled();
  });

  it("un token de cliente nunca sirve como sesión de empleado", async () => {
    const { error } = await ejecutar(`Bearer ${token({ id: 7, rol: "mesero", tipo: "cliente", sid: SID })}`);
    expect(error).toMatchObject({ estado: 403 });
    expect(filasMock).not.toHaveBeenCalled();
  });
});

describe("sesión de empleados: cierre de sesión e inactividad (migración 031)", () => {
  it("un token sin sesión (de antes de la migración) pide iniciar sesión otra vez", async () => {
    const { error } = await ejecutar(`Bearer ${token({ id: 7, rol: "mesero" })}`);
    expect(error).toMatchObject({ estado: 401, codigo: "sesion_expirada", extra: { motivo: "sesion_antigua" } });
    expect(filasMock).not.toHaveBeenCalled();
  });

  it("después de «Salir» el token ya no sirve, aunque no haya vencido", async () => {
    filasMock.mockResolvedValueOnce([fila({ cerrada_en: "2026-11-19 10:00:00" })]);
    const { error } = await ejecutar(`Bearer ${token()}`);
    expect(error).toMatchObject({ estado: 401, codigo: "sesion_expirada", extra: { motivo: "sesion_cerrada" } });
  });

  it("un token cuya sesión no existe (otro usuario o ya borrada) se rechaza", async () => {
    filasMock.mockResolvedValueOnce([fila({ id_sesion: null })]);
    const { error } = await ejecutar(`Bearer ${token()}`);
    expect(error).toMatchObject({ estado: 401, codigo: "sesion_expirada" });
  });

  it("pasados 15 minutos sin actividad se cierra la sesión y queda en el registro de accesos", async () => {
    filasMock.mockResolvedValueOnce([fila({ inactivo_segundos: 15 * 60 })]);
    const { error } = await ejecutar(`Bearer ${token()}`);
    expect(error).toMatchObject({ estado: 401, codigo: "sesion_expirada", extra: { motivo: "inactividad" } });
    expect(sqls().some((s) => s.includes("UPDATE sesion_empleado SET cerrada_en"))).toBe(true);
    expect(sqls().some((s) => s.includes("INSERT INTO registro_acceso"))).toBe(true);
  });

  it("14 minutos todavía sirven", async () => {
    filasMock.mockResolvedValueOnce([fila({ inactivo_segundos: 14 * 60 })]);
    expect((await ejecutar(`Bearer ${token()}`)).error).toBeNull();
  });

  it("el límite se configura con INACTIVIDAD_MINUTOS (0 = sin límite)", async () => {
    process.env.INACTIVIDAD_MINUTOS = "30";
    filasMock.mockResolvedValueOnce([fila({ inactivo_segundos: 20 * 60 })]);
    expect((await ejecutar(`Bearer ${token()}`)).error).toBeNull();
    process.env.INACTIVIDAD_MINUTOS = "0";
    filasMock.mockResolvedValueOnce([fila({ inactivo_segundos: 5 * 3600 })]);
    expect((await ejecutar(`Bearer ${token()}`)).error).toBeNull();
  });

  it("la pantalla de cocina, que queda fija, no se cierra a los 15 minutos", async () => {
    filasMock.mockResolvedValueOnce([fila({ rol: "cocinero", inactivo_segundos: 2 * 3600 })]);
    expect((await ejecutar(`Bearer ${token({ id: 9, rol: "cocinero", sid: SID })}`)).error).toBeNull();
    filasMock.mockResolvedValueOnce([fila({ rol: "cocinero", inactivo_segundos: 9 * 3600 })]);
    expect((await ejecutar(`Bearer ${token({ id: 9, rol: "cocinero", sid: SID })}`)).error).toMatchObject({ extra: { motivo: "inactividad" } });
  });

  it("solo lo que escribe cuenta como actividad: una consulta automática (GET) no renueva la sesión", async () => {
    filasMock.mockResolvedValue([fila()]);
    await ejecutarConMetodo("GET", `Bearer ${token()}`);
    expect(sqls().some((s) => s.includes("UPDATE sesion_empleado SET ultima_actividad"))).toBe(false);
    await ejecutarConMetodo("POST", `Bearer ${token()}`);
    expect(sqls().some((s) => s.includes("UPDATE sesion_empleado SET ultima_actividad"))).toBe(true);
  });
});

describe("registro de accesos no autorizados (RNF-017)", () => {
  it("un rol sin permiso queda registrado con su IP y la ruta", async () => {
    filasMock.mockResolvedValueOnce([fila()]);
    const { error } = await ejecutar(`Bearer ${token()}`, "gerente");
    expect(error).toMatchObject({ estado: 403 });
    const insertar = ejecutarMock.mock.calls.find((c) => String(c[1]).includes("INSERT INTO registro_acceso"));
    expect(insertar?.[2]).toEqual(["empleado", "id:7", "no_autorizado", "rol mesero sin permiso", "10.0.0.5", "GET /api/x/"]);
  });

  it("un token inválido también queda registrado", async () => {
    await ejecutar("Bearer falso");
    const insertar = ejecutarMock.mock.calls.find((c) => String(c[1]).includes("INSERT INTO registro_acceso"));
    expect(insertar?.[2]).toEqual(expect.arrayContaining(["empleado", "token_invalido", "no_autorizado"]));
  });

  it("si no se puede guardar el registro, la petición se rechaza igual (no se rompe)", async () => {
    ejecutarMock.mockRejectedValue(new Error("base caída"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    filasMock.mockResolvedValueOnce([fila()]);
    const { error } = await ejecutar(`Bearer ${token()}`, "gerente");
    expect(error).toMatchObject({ estado: 403 });
  });
});
