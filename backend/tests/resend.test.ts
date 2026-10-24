import { afterEach, describe, expect, it, vi } from "vitest";
import { enviarCorreoResend } from "../src/services/notificacionesReservacion";

const valorApiKeyAnterior = process.env.RESEND_API_KEY;
const valorFromAnterior = process.env.RESEND_FROM;

afterEach(() => {
  vi.unstubAllGlobals();
  if (valorApiKeyAnterior === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = valorApiKeyAnterior;
  if (valorFromAnterior === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = valorFromAnterior;
});

describe("enviarCorreoResend", () => {
  it("envía un correo transaccional a la API de Resend con Bearer auth", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "Restaurante <reservas@example.com>";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await enviarCorreoResend({ to: "cliente@example.com", subject: "Aviso", text: "Texto" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer re_test_key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Restaurante <reservas@example.com>",
        to: "cliente@example.com",
        subject: "Aviso",
        text: "Texto",
      }),
    });
  });

  it("informa cuando faltan variables de configuración sin llamar a la API", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(enviarCorreoResend({ to: "cliente@example.com", subject: "Aviso", text: "Texto" }))
      .rejects.toThrow("RESEND_API_KEY y RESEND_FROM");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propaga el error de Resend para guardar y reintentar la notificación", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "Restaurante <reservas@example.com>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("dominio no verificado", { status: 403 })));

    await expect(enviarCorreoResend({ to: "cliente@example.com", subject: "Aviso", text: "Texto" }))
      .rejects.toThrow("Resend rechazó el correo (HTTP 403)");
  });
});
