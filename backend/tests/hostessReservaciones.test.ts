import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ejecutarMock,
  filasMock,
  transaccionMock,
  conIdempotenciaMock,
  solicitarProcesamientoMock,
} = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
  filasMock: vi.fn(),
  transaccionMock: vi.fn(),
  conIdempotenciaMock: vi.fn(),
  solicitarProcesamientoMock: vi.fn(),
}));

vi.mock("../src/services/db", () => ({
  pool: {},
  ejecutar: ejecutarMock,
  filas: filasMock,
  transaccion: transaccionMock,
}));
vi.mock("../src/services/idempotencia", () => ({
  conIdempotencia: conIdempotenciaMock,
}));
vi.mock("../src/services/correo", () => ({
  esCorreoValido: (correo: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()),
}));
vi.mock("../src/services/notificacionesReservacion", () => ({
  solicitarProcesamientoReservaciones: solicitarProcesamientoMock,
}));

import { crearReservacion, editarReservacion } from "../src/controllers/hostess";

const cxPrueba = { id: "transaccion-reservacion", avisos: [] as unknown[] };
let avisosConfirmados: unknown[];
let fallaAlConfirmarTransaccion: boolean;
let errorAlEncolarAviso: Error | null;
let clienteCorreo: string | null;
let estadoReservacion: "pendiente" | "confirmada";

function req(body: unknown, id?: string): Request {
  return {
    body,
    params: id ? { id } : {},
    query: {},
  } as Request;
}

function res(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  avisosConfirmados = [];
  fallaAlConfirmarTransaccion = false;
  errorAlEncolarAviso = null;
  clienteCorreo = "ana@gmail.com";
  estadoReservacion = "pendiente";
  cxPrueba.avisos = [];

  conIdempotenciaMock.mockImplementation(async (
    _request: Request,
    response: Response,
    status: number,
    accion: () => Promise<unknown>,
  ) => {
    const resultado = await accion();
    response.status(status).json(resultado);
  });
  transaccionMock.mockImplementation(async (accion: (cx: typeof cxPrueba) => Promise<unknown>) => {
    cxPrueba.avisos = [];
    const resultado = await accion(cxPrueba);
    if (fallaAlConfirmarTransaccion) throw new Error("falló el commit de prueba");
    avisosConfirmados.push(...cxPrueba.avisos);
    return resultado;
  });
  filasMock.mockImplementation(async (_ex: unknown, sql: string) => {
    if (sql.includes("AS pasada")) return [{ pasada: 0, lejana: 0, es_hoy: 0 }];
    if (sql.includes("SELECT id_cliente, correo FROM cliente")) {
      return [{ id_cliente: 7, correo: clienteCorreo }];
    }
    if (sql.includes("FROM reservacion r")) {
      return [{
        id_reservacion: 123,
        id_cliente: 7,
        id_mesa: null,
        fecha_hora: "2026-11-01 19:30:00",
        personas: 3,
        estado: estadoReservacion,
        llegada_en: null,
        cliente_nombre: "Ana",
        cliente_telefono: "3111234567",
        cliente_correo: clienteCorreo,
        mesa_numero: null,
      }];
    }
    if (sql.includes("FROM reservacion WHERE id_reservacion")) {
      return [{
        id_reservacion: 123,
        id_mesa: null,
        fecha_hora: "2026-11-01 19:30:00",
        personas: 3,
        estado: estadoReservacion,
      }];
    }
    return [];
  });
  ejecutarMock.mockImplementation(async (ex: typeof cxPrueba, sql: string, parametros: unknown[]) => {
    if (sql.includes("INSERT INTO reservacion")) return { insertId: 123 };
    if (sql.includes("INSERT INTO notificacion_reservacion")) {
      if (errorAlEncolarAviso) throw errorAlEncolarAviso;
      ex.avisos.push({ sql, parametros });
      return { affectedRows: 1 };
    }
    return { affectedRows: 1 };
  });
  solicitarProcesamientoMock.mockImplementation(() => {});
});

describe("confirmaciones encoladas por la hostess", () => {
  it("encola solamente el evento creada dentro de la transacción al registrar", async () => {
    await crearReservacion(
      req({ id_cliente: 7, fecha_hora: "2026-11-01 19:30:00", personas: 3 }),
      res(),
    );

    expect(ejecutarMock).toHaveBeenCalledWith(
      cxPrueba,
      expect.stringContaining("ON DUPLICATE KEY UPDATE id_notificacion = id_notificacion"),
      ["creada", 123],
    );
    expect(
      ejecutarMock.mock.calls.find((llamada) => String(llamada[1]).includes("notificacion_reservacion"))?.[1],
    ).toContain("c.correo");
    expect(avisosConfirmados).toHaveLength(1);
    expect(solicitarProcesamientoMock).toHaveBeenCalledOnce();
  });

  it("encola solamente el evento confirmada al confirmar una reservación pendiente", async () => {
    await editarReservacion(req({ estado: "confirmada" }, "123"), res());

    expect(ejecutarMock).toHaveBeenCalledWith(
      cxPrueba,
      expect.stringContaining("ON DUPLICATE KEY UPDATE id_notificacion = id_notificacion"),
      ["confirmada", 123],
    );
    expect(avisosConfirmados).toHaveLength(1);
    expect(solicitarProcesamientoMock).toHaveBeenCalledOnce();
  });

  it("guarda una reservación sin correo y no encola notificación", async () => {
    clienteCorreo = null;

    await crearReservacion(
      req({ id_cliente: 7, fecha_hora: "2026-11-01 19:30:00", personas: 3 }),
      res(),
    );

    expect(ejecutarMock).toHaveBeenCalledWith(
      cxPrueba,
      expect.stringContaining("INSERT INTO reservacion"),
      [7, null, "2026-11-01 19:30:00", 3],
    );
    expect(ejecutarMock.mock.calls.some((llamada) => String(llamada[1]).includes("notificacion_reservacion"))).toBe(false);
    expect(avisosConfirmados).toHaveLength(0);
  });

  it("no deja persistido el aviso si falla el commit de la transacción", async () => {
    fallaAlConfirmarTransaccion = true;

    await expect(crearReservacion(
      req({ id_cliente: 7, fecha_hora: "2026-11-01 19:30:00", personas: 3 }),
      res(),
    )).rejects.toThrow("falló el commit de prueba");

    expect(ejecutarMock).toHaveBeenCalledWith(
      cxPrueba,
      expect.stringContaining("ON DUPLICATE KEY UPDATE id_notificacion = id_notificacion"),
      ["creada", 123],
    );
    expect(avisosConfirmados).toHaveLength(0);
    expect(solicitarProcesamientoMock).not.toHaveBeenCalled();
  });

  it("propaga errores de base de datos distintos de un duplicado al encolar", async () => {
    const error = new Error("violación de CHECK");
    errorAlEncolarAviso = error;

    await expect(crearReservacion(
      req({ id_cliente: 7, fecha_hora: "2026-11-01 19:30:00", personas: 3 }),
      res(),
    )).rejects.toBe(error);

    expect(ejecutarMock).toHaveBeenCalledWith(
      cxPrueba,
      expect.stringContaining("ON DUPLICATE KEY UPDATE id_notificacion = id_notificacion"),
      ["creada", 123],
    );
    expect(solicitarProcesamientoMock).not.toHaveBeenCalled();
  });
});
