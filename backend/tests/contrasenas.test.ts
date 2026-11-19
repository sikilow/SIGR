import { describe, expect, it } from "vitest";
import { errorContrasena } from "../src/utils/contrasenas";

describe("política de contraseñas", () => {
  it("acepta de 8 a 72 caracteres con letras y números", () => {
    expect(errorContrasena("Madalena2026")).toBeNull();
    expect(errorContrasena("cafe1234")).toBeNull();
    expect(errorContrasena("Contraseña-larga 9")).toBeNull();
    expect(errorContrasena("a1".repeat(36))).toBeNull(); // 72
  });

  it("rechaza las muy cortas o muy largas", () => {
    expect(errorContrasena("Ab1cdef")).toMatch(/8 caracteres/);
    expect(errorContrasena("a1".repeat(37))).toMatch(/72/);
  });

  it("exige al menos una letra y un número", () => {
    expect(errorContrasena("sololetrasaqui")).toMatch(/letra y un número/);
    expect(errorContrasena("1234567890123")).toMatch(/letra y un número/);
  });

  it("rechaza las comunes, sin importar mayúsculas ni espacios", () => {
    expect(errorContrasena("Password1")).toMatch(/común/);
    expect(errorContrasena("PASSWORD123")).toMatch(/común/);
    expect(errorContrasena("12345678")).toMatch(/letra y un número|común/);
    expect(errorContrasena("qwerty 123")).toMatch(/común/);
  });

  it("la contraseña de prueba 1234 ya no sirve", () => {
    expect(errorContrasena("1234")).not.toBeNull();
  });

  it("no puede contener el nombre de usuario", () => {
    expect(errorContrasena("Mesero2026x", "mesero")).toMatch(/nombre de usuario/);
    expect(errorContrasena("Luisa-9-Cafe", "luisa")).toMatch(/nombre de usuario/);
    expect(errorContrasena("Cafe2026ok", "luisa")).toBeNull();
    // Nombres muy cortos no se comparan (daría falsos positivos).
    expect(errorContrasena("Cafe2026ok", "ab")).toBeNull();
  });
});
