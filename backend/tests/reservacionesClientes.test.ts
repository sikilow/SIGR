import { beforeEach, describe, expect, it, vi } from "vitest";

const { ejecutarMock, filasMock, transaccionMock, solicitarProcesamientoMock } = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
  filasMock: vi.fn(),
  transaccionMock: vi.fn(),
  solicitarProcesamientoMock: vi.fn(),
}));

vi.mock("../src/services/db", () => ({
  pool: {},
  ejecutar: ejecutarMock,
  filas: filasMock,
  transaccion: transaccionMock,
}));
vi.mock("../src/services/correo", () => ({
  esCorreoValido: (correo: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()),
}));
vi.mock("../src/services/notificacionesReservacion", () => ({
  solicitarProcesamientoReservaciones: solicitarProcesamientoMock,
}));

import { crearReservacionCliente } from "../src/controllers/reservacionesClientes";

const cx = { id: "transaccion-portal" };
let correoCliente: string | null;

function respuesta() {
  const res = { estado: 0, cuerpo: undefined as unknown, status: vi.fn(), json: vi.fn() };
  res.status.mockImplementation((estado: number) => ((res.estado = estado), res));
  res.json.mockImplementation((cuerpo: unknown) => ((res.cuerpo = cuerpo), res));
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  correoCliente = "ana@correo.com";
  transaccionMock.mockImplementation(async (fn: (cx: unknown) => Promise<unknown>) => fn(cx));
  filasMock.mockImplementation(async (_ex: unknown, sql: string) => {
    if (sql.includes("AS pasada")) return [{ pasada: 0, lejana: 0 }];
    if (sql.includes("estado IN ('pendiente', 'confirmada')")) return [];
    if (sql.includes("FROM reservacion")) return [{ id_reservacion: 77, estado: "pendiente" }];
    if (sql.includes("SELECT correo FROM cliente")) return [{ correo: correoCliente }];
    return [];
  });
  ejecutarMock.mockImplementation(async (_ex: unknown, sql: string) =>
    sql.includes("INSERT INTO reservacion") ? { insertId: 77 } : { affectedRows: 1 },
  );
});

const peticion = { clienteId: 5, body: { fecha_hora: "2030-01-15 19:30:00", personas: 2 } };

describe("reservación desde el portal de clientes", () => {
  it("encola el correo de reservación recibida dentro de la transacción y dispara el envío", async () => {
    const res = respuesta();
    await crearReservacionCliente(peticion as never, res as never);

    expect(res.estado).toBe(201);
    const aviso = ejecutarMock.mock.calls.find(([, sql]) => String(sql).includes("INSERT INTO notificacion_reservacion"));
    expect(aviso?.[0]).toBe(cx);
    expect(aviso?.[1]).toContain("'confirmacion'");
    expect(aviso?.[2]).toEqual(["creada", 77]);
    expect(solicitarProcesamientoMock).toHaveBeenCalledTimes(1);
  });

  it("si el cliente no tiene un correo válido, guarda la reservación sin encolar aviso", async () => {
    correoCliente = null;
    const res = respuesta();
    await crearReservacionCliente(peticion as never, res as never);

    expect(res.estado).toBe(201);
    expect(ejecutarMock.mock.calls.some(([, sql]) => String(sql).includes("notificacion_reservacion"))).toBe(false);
  });
});
