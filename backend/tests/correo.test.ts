import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enviarMock, resendMock, crearTransporteMock, enviarSmtpMock } = vi.hoisted(() => ({
  enviarMock: vi.fn(),
  resendMock: vi.fn(function () {
    return { emails: { send: enviarMock } };
  }),
  crearTransporteMock: vi.fn(),
  enviarSmtpMock: vi.fn(),
}));

vi.mock("resend", () => ({ Resend: resendMock }));
vi.mock("nodemailer", () => ({
  default: { createTransport: crearTransporteMock },
}));
vi.mock("../src/utils/config", () => ({
  get CORREO_PROVEEDOR() {
    const seleccionado = process.env.CORREO_PROVEEDOR?.trim();
    if (seleccionado === "resend" || seleccionado === "smtp") return seleccionado;
    if (process.env.RESEND_API_KEY) return "resend";
    if (process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.replace(/\s/g, "")) return "smtp";
    return null;
  },
  get CORREO_REMITENTE() {
    return process.env.CORREO_REMITENTE ?? "";
  },
  get RESEND_API_KEY() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get SMTP_HOST() {
    return process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  },
  get SMTP_PORT() {
    return Number(process.env.SMTP_PORT?.trim() || 465);
  },
  get SMTP_USER() {
    return process.env.SMTP_USER?.trim() ?? "";
  },
  get SMTP_PASS() {
    return (process.env.SMTP_PASS ?? "").replace(/\s/g, "");
  },
}));

async function importarServicio() {
  vi.resetModules();
  return import("../src/services/correo");
}

beforeEach(() => {
  vi.stubEnv("CORREO_PROVEEDOR", "smtp");
  vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_USER", "sigr-test@gmail.com");
  vi.stubEnv("SMTP_PASS", "abcd efgh ijkl mnop");
  vi.stubEnv("CORREO_REMITENTE", "La Madalena <sigr-test@gmail.com>");
  vi.stubEnv("RESEND_API_KEY", "");
  enviarMock.mockReset().mockResolvedValue({
    data: { id: "email_test_id" },
    error: null,
    headers: null,
  });
  resendMock.mockClear();
  enviarSmtpMock.mockReset().mockResolvedValue({ messageId: "email_test_id" });
  crearTransporteMock.mockReset().mockReturnValue({ sendMail: enviarSmtpMock });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("enviarCorreo", () => {
  it("devuelve false y no llama a Nodemailer si falta SMTP_USER o SMTP_PASS", async () => {
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    const advertencia = vi.spyOn(console, "error").mockImplementation(() => {});
    const { enviarCorreo } = await importarServicio();

    await expect(enviarCorreo({ para: "cliente@gmail.com", asunto: "Aviso", texto: "Hola" })).resolves.toBe(false);
    expect(crearTransporteMock).not.toHaveBeenCalled();
    expect(enviarSmtpMock).not.toHaveBeenCalled();
    expect(advertencia).toHaveBeenCalledOnce();
  });

  it("crea un transporte SMTP perezoso y envía los campos configurados", async () => {
    const { enviarCorreo } = await importarServicio();

    await expect(enviarCorreo({
      para: "cliente.uno@gmail.com",
      asunto: "Reservación registrada",
      texto: "Hola, tu reservación quedó registrada.",
    })).resolves.toBe(true);

    expect(crearTransporteMock).toHaveBeenCalledOnce();
    expect(crearTransporteMock).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "sigr-test@gmail.com", pass: "abcdefghijklmnop" },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    expect(enviarSmtpMock).toHaveBeenCalledWith({
      from: "La Madalena <sigr-test@gmail.com>",
      to: "cliente.uno@gmail.com",
      subject: "Reservación registrada",
      text: "Hola, tu reservación quedó registrada.",
    });
  });

  it("enmascara el destinatario y devuelve false cuando Nodemailer falla", async () => {
    enviarSmtpMock.mockRejectedValue(new Error("550 5.4.5 cuota de cliente.dos@gmail.com"));
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { enviarCorreo, consumirErrorEnvioCorreo } = await importarServicio();

    await expect(enviarCorreo({
      para: "cliente.dos@gmail.com",
      asunto: "Aviso",
      texto: "Hola",
      idempotencyKey: "notificacion-reservacion/42",
    })).resolves.toBe(false);

    expect(registro).toHaveBeenCalledWith(
      "No se pudo enviar correo a c***@gmail.com: 550 5.4.5 cuota de c***@gmail.com",
    );
    expect(consumirErrorEnvioCorreo("notificacion-reservacion/42")).toContain("550 5.4.5");
  });

  it("devuelve false si SMTP resuelve la operación pero reporta el destinatario como rechazado", async () => {
    enviarSmtpMock.mockResolvedValue({
      rejected: ["cliente@gmail.com"],
      response: "550 5.4.5 Daily user sending quota exceeded",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { enviarCorreo, consumirErrorEnvioCorreo } = await importarServicio();

    await expect(enviarCorreo({
      para: "cliente@gmail.com",
      asunto: "Aviso",
      texto: "Hola",
      idempotencyKey: "notificacion-reservacion/43",
    })).resolves.toBe(false);
    expect(consumirErrorEnvioCorreo("notificacion-reservacion/43")).toContain("550 5.4.5");
  });

  it("con CORREO_PROVEEDOR=resend sigue usando el SDK de Resend", async () => {
    vi.stubEnv("CORREO_PROVEEDOR", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const { enviarCorreo } = await importarServicio();

    await expect(enviarCorreo({
      para: "cliente@gmail.com",
      asunto: "Aviso",
      texto: "Texto",
    })).resolves.toBe(true);

    expect(resendMock).toHaveBeenCalledOnce();
    expect(enviarMock).toHaveBeenCalledWith({
      from: "La Madalena <sigr-test@gmail.com>",
      to: "cliente@gmail.com",
      subject: "Aviso",
      text: "Texto",
    });
    expect(crearTransporteMock).not.toHaveBeenCalled();
  });

  it("rechaza un destinatario inválido antes de llamar a cualquier transporte", async () => {
    const { enviarCorreo } = await importarServicio();

    await expect(enviarCorreo({ para: "no-es-correo", asunto: "Aviso", texto: "Hola" })).resolves.toBe(false);
    expect(crearTransporteMock).not.toHaveBeenCalled();
    expect(resendMock).not.toHaveBeenCalled();
  });
});
