import { describe, expect, it } from "vitest";
import {
  correo,
  errorTelefonoLada,
  importe,
  importePositivo,
  limpiarNombrePersona,
  nombrePersona,
  nota,
  PAISES_LADA,
  telefono,
  textoCatalogo,
  textoCatalogoOpcional,
} from "../src/utils/campos";

const ok = (esquema: { safeParse: (v: unknown) => { success: boolean } }, valor: unknown) => esquema.safeParse(valor).success;

describe("reglas de campos del servidor", () => {
  it("nombre de persona: letras, espacios y . ' -", () => {
    expect(ok(nombrePersona(100), "María-José O'Brien Jr.")).toBe(true);
    expect(ok(nombrePersona(100), "Ñandú Pérez")).toBe(true);
    expect(ok(nombrePersona(100), "Ana2")).toBe(false);
    expect(ok(nombrePersona(100), "Ana <b>")).toBe(false);
    expect(ok(nombrePersona(100), "'Ana")).toBe(false);
    expect(ok(nombrePersona(5), "Fernando")).toBe(false);
  });

  it("texto de catálogo: letras, números y signos comunes", () => {
    expect(ok(textoCatalogo(40), "Coca-Cola 600 ml (lata)")).toBe(true);
    expect(ok(textoCatalogo(40), "Café 1/2 kg")).toBe(true);
    expect(ok(textoCatalogo(40), "Pizza @ $5")).toBe(false);
    expect(ok(textoCatalogo(40), "")).toBe(false);
    expect(ok(textoCatalogoOpcional(40), "")).toBe(true);
    expect(ok(textoCatalogoOpcional(40), "lata <355>")).toBe(false);
  });

  it("nota: puntuación común sí, símbolos peligrosos no", () => {
    expect(ok(nota(255), "Sin cebolla, por favor. ¡Gracias!")).toBe(true);
    expect(ok(nota(255), "")).toBe(true);
    expect(ok(nota(255), "<script>alert(1)</script>")).toBe(false);
    expect(ok(nota(255), "a {b} [c] | ~ ^ `")).toBe(false);
  });

  it("teléfono: solo dígitos y la cantidad que pide la lada", () => {
    expect(errorTelefonoLada("52", "3115550201")).toBeNull();
    expect(errorTelefonoLada("52", "311555020")).not.toBeNull();
    expect(errorTelefonoLada("52", "31155502011")).not.toBeNull();
    expect(errorTelefonoLada("52", "311-555-0201")).not.toBeNull();
    expect(errorTelefonoLada("52", "311555020a")).not.toBeNull();
    expect(ok(telefono, "311 555 0201")).toBe(false);
  });

  it("cada país exige su cantidad de dígitos", () => {
    expect(errorTelefonoLada("34", "612345678")).toBeNull(); // España: 9
    expect(errorTelefonoLada("34", "6123456789")).toMatch(/9 dígitos/);
    expect(errorTelefonoLada("506", "88887777")).toBeNull(); // Costa Rica: 8
    expect(errorTelefonoLada("506", "3115550201")).not.toBeNull();
    expect(errorTelefonoLada("86", "13812345678")).toBeNull(); // China: 11
    expect(errorTelefonoLada("49", "15123456789")).toBeNull(); // Alemania: 10 a 13
    expect(errorTelefonoLada("49", "123456789")).toMatch(/de 10 a 13 dígitos/);
    expect(errorTelefonoLada("1", "2125550123")).toBeNull();
    expect(errorTelefonoLada("999", "1234567")).toBeNull(); // lada fuera de la tabla: rango amplio
    expect(errorTelefonoLada("999", "123")).not.toBeNull();
  });

  it("la tabla de países no repite ladas y sus rangos son coherentes", () => {
    const codigos = PAISES_LADA.map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos[0]).toBe("52");
    for (const p of PAISES_LADA) {
      expect(p.min).toBeGreaterThan(0);
      expect(p.max).toBeGreaterThanOrEqual(p.min);
      expect(p.max).toBeLessThanOrEqual(13);
    }
  });

  it("correo", () => {
    expect(ok(correo, "ana.lopez+1@correo.com.mx")).toBe(true);
    expect(ok(correo, "ana@correo")).toBe(false);
    expect(ok(correo, "ana perez@correo.com")).toBe(false);
    expect(ok(correo, "ana@@correo.com")).toBe(false);
    expect(ok(correo, "ana!@correo.com")).toBe(false);
  });

  it("importes: no negativos y con 2 decimales como máximo", () => {
    expect(ok(importe(1000), 12.5)).toBe(true);
    expect(ok(importe(1000), 0)).toBe(true);
    expect(ok(importe(1000), -1)).toBe(false);
    expect(ok(importe(1000), 12.345)).toBe(false);
    expect(ok(importe(1000), 1001)).toBe(false);
    expect(ok(importePositivo(1000), 0)).toBe(false);
    expect(ok(importePositivo(1000), 0.01)).toBe(true);
  });

  it("limpiarNombrePersona deja un nombre válido aunque venga con emojis o números", () => {
    expect(limpiarNombrePersona("Ana 😀 López 2024")).toBe("Ana López");
    expect(limpiarNombrePersona("12345", "carlos.ruiz@correo.com")).toBe("carlos.ruiz");
    expect(limpiarNombrePersona("", "")).toBe("Cliente");
    expect(nombrePersona(100).safeParse(limpiarNombrePersona("J@ne_Doe!")).success).toBe(true);
  });
});

describe("lada del teléfono", () => {
  it("acepta de 1 a 4 dígitos, sin +", async () => {
    const { lada } = await import("../src/utils/campos");
    expect(lada.safeParse("52").success).toBe(true);
    expect(lada.safeParse("1").success).toBe(true);
    expect(lada.safeParse("+52").success).toBe(false);
    expect(lada.safeParse("12345").success).toBe(false);
    expect(lada.safeParse("").success).toBe(false);
  });
});
