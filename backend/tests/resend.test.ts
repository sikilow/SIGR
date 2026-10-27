import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ejecutarMock, filasMock, enviarCorreoMock, consumirErrorMock } = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
  filasMock: vi.fn(),
  enviarCorreoMock: vi.fn(),
  consumirErrorMock: vi.fn(),
}));

vi.mock("../src/services/db", () => ({
  pool: {},
  ejecutar: ejecutarMock,
  filas: filasMock,
  transaccion: vi.fn(),
}));
vi.mock("../src/services/correo", () => ({
  enviarCorreo: enviarCorreoMock,
  consumirErrorEnvioCorreo: consumirErrorMock,
}));

import { __pruebas } from "../src/services/notificacionesReservacion";

beforeEach(() => {
  vi.clearAllMocks();
  ejecutarMock.mockResolvedValue({});
  filasMock.mockResolvedValue([{
    id_notificacion: 71,
    tipo: "recordatorio",
    evento: "",
    destinatario: "cliente@ejemplo.com",
    fecha_hora: "2026-11-01 19:30:00",
    personas: 2,
    nombre: "Cliente de prueba",
    mesa_numero: null,
    tolerancia_minutos: 15,
  }]);
  enviarCorreoMock.mockResolvedValue(true);
  consumirErrorMock.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Resend en la cola unificada", () => {
  it("procesa el mensaje por enviarCorreo y no realiza fetch directo", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await __pruebas.procesarNotificaciones();

    expect(enviarCorreoMock).toHaveBeenCalledWith(expect.objectContaining({
      para: "cliente@ejemplo.com",
      asunto: "Recordatorio de tu reservación",
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ejecutarMock).toHaveBeenCalledWith(
      {},
      expect.stringContaining("SET estado = 'enviada'"),
      [71],
    );
  });

  it("deja pendiente el mensaje si Resend devuelve fallo a través del servicio común", async () => {
    enviarCorreoMock.mockResolvedValue(false);
    consumirErrorMock.mockReturnValue("Dominio emisor no verificado");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await __pruebas.procesarNotificaciones();

    expect(ejecutarMock).toHaveBeenCalledWith(
      {},
      expect.stringContaining("intentos = intentos + 1"),
      ["Dominio emisor no verificado", 0, 71],
    );
    expect(errorLog).toHaveBeenCalledWith(
      "No se pudo enviar la notificación 71: Dominio emisor no verificado",
    );
  });

  it("programa recordatorios con el correo guardado en el registro del cliente", async () => {
    await __pruebas.programarRecordatorios();

    expect(ejecutarMock).toHaveBeenCalledWith(
      {},
      expect.stringContaining("SELECT r.id_reservacion, 'recordatorio', c.correo"),
    );
    expect(ejecutarMock.mock.calls[0]?.[1]).toContain("TRIM(c.correo) <> ''");
  });
});
