import { beforeEach, describe, expect, it, vi } from "vitest";

const { ejecutarMock, filasMock, transaccionMock, enviarCorreoMock, consumirErrorMock } = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
  filasMock: vi.fn(),
  transaccionMock: vi.fn(),
  enviarCorreoMock: vi.fn(),
  consumirErrorMock: vi.fn(),
}));

vi.mock("../src/services/db", () => ({
  pool: {},
  ejecutar: ejecutarMock,
  filas: filasMock,
  transaccion: transaccionMock,
}));
vi.mock("../src/services/correo", () => ({
  enviarCorreo: enviarCorreoMock,
  consumirErrorEnvioCorreo: consumirErrorMock,
}));

import { __pruebas } from "../src/services/notificacionesReservacion";

const avisoBase = {
  id_notificacion: 4,
  tipo: "recordatorio" as const,
  evento: "" as const,
  destinatario: "cliente@gmail.com",
  fecha_hora: "2026-11-01 19:30:00",
  personas: 3,
  nombre: "Ana",
  mesa_numero: 12,
  tolerancia_minutos: 15,
};

beforeEach(() => {
  vi.clearAllMocks();
  ejecutarMock.mockResolvedValue({});
  filasMock.mockResolvedValue([]);
  transaccionMock.mockImplementation(async (accion: (cx: object) => Promise<unknown>) => accion({ id: "tx" }));
  enviarCorreoMock.mockResolvedValue(true);
  consumirErrorMock.mockReturnValue(null);
});

describe("procesador de la cola de reservaciones", () => {
  it("envía a cada destinatario guardado desde el correo de su cliente y marca cada aviso como enviado", async () => {
    filasMock.mockResolvedValue([
      { ...avisoBase, id_notificacion: 4, destinatario: "ana@gmail.com" },
      { ...avisoBase, id_notificacion: 5, nombre: "Luis", destinatario: "luis@outlook.com" },
    ]);

    await __pruebas.procesarNotificaciones();

    expect(enviarCorreoMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      para: "ana@gmail.com",
      texto: expect.stringContaining("Hola Ana"),
    }));
    expect(enviarCorreoMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      para: "luis@outlook.com",
      texto: expect.stringContaining("Hola Luis"),
    }));
    expect(ejecutarMock).toHaveBeenCalledTimes(2);
    expect(ejecutarMock).toHaveBeenCalledWith(
      {},
      expect.stringContaining("SET estado = 'enviada'"),
      [4],
    );
  });

  it("incluye la mesa y el contenido requerido en la confirmación", async () => {
    filasMock.mockResolvedValue([{
      ...avisoBase,
      tipo: "confirmacion",
      evento: "creada",
    }]);

    await __pruebas.procesarNotificaciones();

    expect(enviarCorreoMock).toHaveBeenCalledWith(expect.objectContaining({
      para: "cliente@gmail.com",
      asunto: "Reservación registrada",
      texto: expect.stringContaining("Hola Ana, tu reservación en La Madalena quedó registrada para el 2026-11-01 a las 19:30, para 3 persona(s). La mesa asignada es la 12."),
    }));
  });

  it("envía el aviso de vencida con el tiempo de tolerancia del gerente", async () => {
    filasMock.mockResolvedValue([{
      ...avisoBase,
      tipo: "vencida",
      mesa_numero: null,
      tolerancia_minutos: 25,
    }]);

    await __pruebas.procesarNotificaciones();

    expect(enviarCorreoMock).toHaveBeenCalledWith(expect.objectContaining({
      asunto: "Tu reservación venció",
      texto: expect.stringContaining("no registramos tu llegada a La Madalena dentro de los 25 minutos de tolerancia"),
    }));
    expect(enviarCorreoMock).toHaveBeenCalledWith(expect.objectContaining({
      texto: expect.stringContaining("contacta al restaurante"),
    }));
  });

  it("en un error 550 5.4.5 guarda el fallo e incrementa el intento con espera de seis horas", async () => {
    filasMock.mockResolvedValue([avisoBase]);
    enviarCorreoMock.mockResolvedValue(false);
    consumirErrorMock.mockReturnValue("550 5.4.5 Daily user sending quota exceeded");

    await __pruebas.procesarNotificaciones();

    expect(ejecutarMock).toHaveBeenCalledWith(
      {},
      expect.stringContaining("intentos = intentos + 1"),
      ["550 5.4.5 Daily user sending quota exceeded", 1, 4],
    );
    expect(ejecutarMock).toHaveBeenCalledWith(
      {},
      expect.stringContaining("21600"),
      expect.any(Array),
    );
  });

  it("mantiene la fórmula de backoff progresivo para los fallos ordinarios", async () => {
    await __pruebas.registrarFallo(8, "fallo temporal");

    expect(ejecutarMock).toHaveBeenCalledWith(
      {},
      expect.stringContaining("LEAST(POWER(2, LEAST(intentos, 7)) * 30, 3600)"),
      ["fallo temporal", 0, 8],
    );
  });

  it("vence únicamente después de la tolerancia configurada y revalida el estado bajo bloqueo", async () => {
    filasMock
      .mockResolvedValueOnce([{ id_reservacion: 9 }])
      .mockResolvedValueOnce([{
        id_reservacion: 9,
        id_mesa: null,
        fecha_hora: "2026-11-01 19:30:00",
        personas: 2,
        correo: "cliente@gmail.com",
      }]);

    await __pruebas.vencerReservaciones();

    expect(filasMock.mock.calls[0]?.[1]).toContain("DATE_ADD(r.fecha_hora, INTERVAL cr.tolerancia_minutos MINUTE) <= NOW()");
    expect(filasMock.mock.calls[1]?.[1]).toContain("FOR UPDATE");
    expect(filasMock.mock.calls[1]?.[1]).toContain("r.estado IN ('pendiente', 'confirmada')");
    expect(ejecutarMock).toHaveBeenCalledWith(
      { id: "tx" },
      expect.stringContaining("ON DUPLICATE KEY UPDATE id_notificacion = id_notificacion"),
      [9, "cliente@gmail.com"],
    );
  });

  it.each(["llego", "cancelada"])("no encola una vencida si la revalidación encuentra el estado %s", async () => {
    filasMock
      .mockResolvedValueOnce([{ id_reservacion: 9 }])
      .mockResolvedValueOnce([]);

    await __pruebas.vencerReservaciones();

    expect(filasMock.mock.calls[1]?.[1]).toContain("r.estado IN ('pendiente', 'confirmada')");
    expect(ejecutarMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("'vencida'"),
      expect.anything(),
    );
  });
});
