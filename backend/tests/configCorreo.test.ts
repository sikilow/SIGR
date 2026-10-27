import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));

async function importarConfig() {
  vi.resetModules();
  return import("../src/utils/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuración de correo", () => {
  it("deja el correo desactivado y aplica los valores SMTP predeterminados cuando no hay credenciales", async () => {
    vi.stubEnv("JWT_SECRET", "clave-de-prueba");
    vi.stubEnv("CORREO_PROVEEDOR", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_PORT", "");

    const config = await importarConfig();

    expect(config.CORREO_PROVEEDOR).toBeNull();
    expect(config.SMTP_HOST).toBe("smtp.gmail.com");
    expect(config.SMTP_PORT).toBe(465);
    expect(config.SMTP_USER).toBe("");
    expect(config.SMTP_PASS).toBe("");
  });

  it("prefiere Resend automáticamente cuando existe RESEND_API_KEY", async () => {
    vi.stubEnv("JWT_SECRET", "clave-de-prueba");
    vi.stubEnv("CORREO_PROVEEDOR", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("SMTP_USER", "cuenta@gmail.com");
    vi.stubEnv("SMTP_PASS", "abcdefghijklmnop");

    const config = await importarConfig();

    expect(config.CORREO_PROVEEDOR).toBe("resend");
  });

  it("elige SMTP si no hay API key y elimina espacios de la contraseña antes de usarla", async () => {
    vi.stubEnv("JWT_SECRET", "clave-de-prueba");
    vi.stubEnv("CORREO_PROVEEDOR", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SMTP_USER", "cuenta@gmail.com");
    vi.stubEnv("SMTP_PASS", "abcd efgh ijkl mnop");

    const config = await importarConfig();

    expect(config.CORREO_PROVEEDOR).toBe("smtp");
    expect(config.SMTP_PASS).toBe("abcdefghijklmnop");
  });
});
