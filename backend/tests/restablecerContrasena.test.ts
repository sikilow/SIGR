import { describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/config", () => ({
  ORIGENES_PERMITIDOS: [/^http:\/\/(localhost|127\.0\.0\.1):\d+$/],
  CORREO_PROVEEDOR: null,
  CORREO_REMITENTE: "",
  RESEND_API_KEY: "",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: 465,
  SMTP_USER: "",
  SMTP_PASS: "",
}));
vi.mock("../src/services/db", () => ({ ejecutar: vi.fn(), filas: vi.fn(), pool: {} }));

import { plantillaRestablecerContrasena } from "../src/services/plantillasCorreo";
import { huellaToken, origenApp } from "../src/services/restablecerContrasena";
import type { Request } from "express";

const peticion = (origin?: string) => ({ get: (h: string) => (h.toLowerCase() === "origin" ? origin : undefined) }) as unknown as Request;

describe("recuperación de contraseña", () => {
  it("el correo lleva el enlace y el usuario, nunca una contraseña, y su pie no habla de reservaciones", () => {
    const correo = plantillaRestablecerContrasena({
      nombre: "Ana",
      usuario: "ana.m",
      enlace: "http://localhost:5173/restablecer?token=abc<script>",
      minutos: 60,
      porGerente: true,
    });
    expect(correo.asunto).toBe("Crea una nueva contraseña para SIGR");
    expect(correo.texto).toContain("http://localhost:5173/restablecer?token=abc<script>");
    expect(correo.texto).toContain("el gerente pidió");
    expect(correo.html).toContain("ana.m");
    expect(correo.html).toContain("Crear nueva contraseña");
    expect(correo.html).toContain("token=abc&lt;script&gt;");
    expect(correo.html).not.toContain("<script>");
    expect(correo.html).toContain("cuenta del personal en SIGR");
    expect(correo.html).not.toContain("hiciste una reservación");
  });

  it("guarda solo la huella SHA-256 del enlace", () => {
    expect(huellaToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(huellaToken("abc")).toHaveLength(64);
  });

  it("arma el enlace con el origen del front solo si es uno permitido", () => {
    expect(origenApp(peticion("http://localhost:5174"))).toBe("http://localhost:5174");
    expect(origenApp(peticion("https://malicioso.example"))).toBe("http://localhost:5173");
    expect(origenApp(peticion())).toBe("http://localhost:5173");
  });
});
