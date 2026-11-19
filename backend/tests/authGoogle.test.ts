import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ejecutarMock, filasMock, verificarMock, habilitadoMock } = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
  filasMock: vi.fn(),
  verificarMock: vi.fn(),
  habilitadoMock: vi.fn(),
}));

// Las variables deben existir ANTES de importar el controlador (utils/config las lee al cargarse).
vi.hoisted(() => {
  process.env.JWT_SECRET = "clave-de-prueba";
  process.env.GOOGLE_CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com";
});

vi.mock("../src/services/db", () => ({
  pool: {},
  ejecutar: ejecutarMock,
  filas: filasMock,
  transaccion: async (accion: (cx: object) => Promise<unknown>) => accion({}),
}));
vi.mock("../src/services/google", () => ({
  googleHabilitado: habilitadoMock,
  verificarTokenGoogle: verificarMock,
}));

import {
  completarRegistroGoogle,
  configuracionGoogle,
  iniciarSesionConGoogle,
  iniciarSesionCliente,
} from "../src/controllers/authClientes";

const CREDENCIAL = "x".repeat(40);

function req(body: unknown): Request {
  return { body } as Request;
}

function res() {
  const salida = { estado: 200, cuerpo: undefined as unknown };
  const r = {
    status(codigo: number) {
      salida.estado = codigo;
      return r;
    },
    json(cuerpo: unknown) {
      salida.cuerpo = cuerpo;
      return r;
    },
  };
  return { r: r as unknown as Response, salida };
}

async function errorDe(promesa: Promise<unknown>): Promise<{ estado: number; message: string }> {
  try {
    await promesa;
  } catch (e) {
    return e as { estado: number; message: string };
  }
  throw new Error("Se esperaba un error");
}

const identidad = { sub: "g-123", correo: "ana@gmail.com", nombre: "Ana Gómez", correoVerificado: true };

beforeEach(() => {
  ejecutarMock.mockReset().mockResolvedValue({ insertId: 9, affectedRows: 1 });
  filasMock.mockReset().mockResolvedValue([]);
  verificarMock.mockReset().mockResolvedValue(identidad);
  habilitadoMock.mockReset().mockReturnValue(true);
});

describe("acceso de clientes con Google", () => {
  it("la configuración solo publica el ID de cliente si Google está habilitado", () => {
    const { r, salida } = res();
    configuracionGoogle({} as Request, r);
    expect(salida.cuerpo).toEqual({ habilitado: true, client_id: "cliente-de-prueba.apps.googleusercontent.com" });

    habilitadoMock.mockReturnValue(false);
    const otra = res();
    configuracionGoogle({} as Request, otra.r);
    expect(otra.salida.cuerpo).toEqual({ habilitado: false, client_id: null });
  });

  it("inicia sesión cuando esa cuenta de Google ya está ligada a un cliente", async () => {
    filasMock.mockResolvedValueOnce([{ id_cliente: 4, nombre: "Ana Gómez", correo: "ana@gmail.com" }]);
    const { r, salida } = res();
    await iniciarSesionConGoogle(req({ credential: CREDENCIAL }), r);
    const cuerpo = salida.cuerpo as { token: string; cliente: { id_cliente: number } };
    expect(cuerpo.cliente.id_cliente).toBe(4);
    expect(jwt.verify(cuerpo.token, "clave-de-prueba")).toMatchObject({ id: 4, tipo: "cliente" });
  });

  it("liga Google a la cuenta de contraseña que ya existe con ese correo y no pide teléfono", async () => {
    filasMock
      .mockResolvedValueOnce([]) // no hay cuenta ligada a ese google_sub
      .mockResolvedValueOnce([{ id_cliente: 5, nombre: "Ana", correo: "ana@gmail.com", id_credencial: 11, google_sub: null }]);
    const { r, salida } = res();
    await iniciarSesionConGoogle(req({ credential: CREDENCIAL }), r);
    expect(ejecutarMock).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("UPDATE cliente_credencial SET google_sub"), ["g-123", 11]);
    expect((salida.cuerpo as { token?: string }).token).toBeTruthy();
  });

  it("una cuenta nueva responde que falta el teléfono y entrega un token de registro de 15 minutos", async () => {
    const { r, salida } = res();
    await iniciarSesionConGoogle(req({ credential: CREDENCIAL }), r);
    const cuerpo = salida.cuerpo as { requiere_telefono: boolean; token_registro: string; nombre: string; correo: string };
    expect(cuerpo).toMatchObject({ requiere_telefono: true, nombre: "Ana Gómez", correo: "ana@gmail.com" });
    expect(jwt.verify(cuerpo.token_registro, "clave-de-prueba")).toMatchObject({ tipo: "registro_google", sub: "g-123" });
    expect(ejecutarMock).not.toHaveBeenCalled();
  });

  it("rechaza una cuenta de Google con el correo sin verificar", async () => {
    verificarMock.mockResolvedValue({ ...identidad, correoVerificado: false });
    const e = await errorDe(iniciarSesionConGoogle(req({ credential: CREDENCIAL }), res().r));
    expect(e.estado).toBe(401);
  });

  it("completar crea el cliente y su acceso con Google, sin contraseña, y devuelve la sesión", async () => {
    const token = jwt.sign({ tipo: "registro_google", sub: "g-123", correo: "ana@gmail.com", nombre: "Ana Gómez" }, "clave-de-prueba", { expiresIn: "15m" });
    const { r, salida } = res();
    await completarRegistroGoogle(req({ token_registro: token, telefono: "3115550100" }), r);

    expect(salida.estado).toBe(201);
    const sqls = ejecutarMock.mock.calls.map((c) => String(c[1]));
    expect(sqls.some((q) => q.includes("INSERT INTO cliente (nombre, correo, telefono, lada)"))).toBe(true);
    expect(sqls.some((q) => q.includes("INSERT INTO cliente_credencial (id_cliente, google_sub)"))).toBe(true);
    expect((salida.cuerpo as { cliente: { correo: string } }).cliente.correo).toBe("ana@gmail.com");
  });

  it("completar exige que el teléfono sea el que el cliente dio en el restaurante", async () => {
    const token = jwt.sign({ tipo: "registro_google", sub: "g-123", correo: "ana@gmail.com", nombre: "Ana" }, "clave-de-prueba", { expiresIn: "15m" });
    filasMock.mockResolvedValueOnce([{ id_cliente: 3, nombre: "Ana", telefono: "3111111111", id_credencial: null }]);
    const e = await errorDe(completarRegistroGoogle(req({ token_registro: token, telefono: "3115550100" }), res().r));
    expect(e.estado).toBe(409);
    expect(e.message).toContain("teléfono que diste");
  });

  it("completar rechaza un token que no es de registro con Google (por ejemplo, el de una sesión)", async () => {
    const sesion = jwt.sign({ id: 1, tipo: "cliente" }, "clave-de-prueba", { expiresIn: "8h" });
    const e = await errorDe(completarRegistroGoogle(req({ token_registro: sesion, telefono: "3115550100" }), res().r));
    expect(e.estado).toBe(401);
  });

  it("el inicio de sesión con contraseña explica que la cuenta se creó con Google", async () => {
    filasMock.mockResolvedValueOnce([{ id_cliente: 7, nombre: "Ana", correo: "ana@gmail.com", password_hash: null }]);
    const e = await errorDe(iniciarSesionCliente(req({ correo: "ana@gmail.com", contrasena: "cualquiera1" }), res().r));
    expect(e.estado).toBe(401);
    expect(e.message).toContain("Google");
  });
});
