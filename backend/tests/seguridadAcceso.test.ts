import { beforeEach, describe, expect, it, vi } from "vitest";

const { filasMock, ejecutarMock } = vi.hoisted(() => ({ filasMock: vi.fn(), ejecutarMock: vi.fn() }));

vi.mock("../src/services/db", () => ({ pool: {}, filas: filasMock, ejecutar: ejecutarMock }));

import {
  exigirAccesoNoBloqueado,
  INTENTOS_PARA_BLOQUEAR,
  minutosInactividad,
  normalizarIdentificador,
  registrarIntentoFallido,
} from "../src/services/seguridadAcceso";

beforeEach(() => {
  filasMock.mockReset();
  ejecutarMock.mockReset();
  delete process.env.INACTIVIDAD_MINUTOS;
  delete process.env.INACTIVIDAD_MINUTOS_COCINA;
});

const insertados = () => ejecutarMock.mock.calls.filter((c) => String(c[1]).includes("INSERT INTO registro_acceso")).map((c) => c[2] as unknown[]);

describe("bloqueo tras intentos fallidos (RNF-009)", () => {
  it("el intento número 5 bloquea: deja la marca de inicio y responde 429 con los segundos", async () => {
    filasMock.mockResolvedValueOnce([{ n: INTENTOS_PARA_BLOQUEAR }]);
    await expect(registrarIntentoFallido("empleado", "Mesero", "10.0.0.1", "contraseña incorrecta")).rejects.toMatchObject({
      estado: 429,
      codigo: "cuenta_bloqueada",
      extra: { reintentar_en_segundos: 300 },
    });
    expect(insertados().map((i) => [i[2], i[3]])).toEqual([
      ["fallido", "contraseña incorrecta"],
      ["bloqueado", "inicio"],
    ]);
  });

  it("antes del intento 5 solo anota el fallo", async () => {
    filasMock.mockResolvedValueOnce([{ n: INTENTOS_PARA_BLOQUEAR - 1 }]);
    await expect(registrarIntentoFallido("empleado", "mesero", null, "usuario desconocido")).resolves.toBeUndefined();
    expect(insertados()).toHaveLength(1);
  });

  it("con el acceso bloqueado, ni la contraseña correcta pasa: responde 429 y registra el intento", async () => {
    filasMock.mockResolvedValueOnce([{ faltan: 130 }]);
    await expect(exigirAccesoNoBloqueado("empleado", "mesero", "10.0.0.1")).rejects.toMatchObject({
      estado: 429,
      codigo: "cuenta_bloqueada",
      extra: { reintentar_en_segundos: 130 },
      message: expect.stringContaining("3 minutos"),
    });
    expect(insertados().map((i) => [i[2], i[3]])).toEqual([["bloqueado", "intento"]]);
  });

  it("sin bloqueo vigente deja pasar", async () => {
    filasMock.mockResolvedValueOnce([{ faltan: null }]);
    await expect(exigirAccesoNoBloqueado("cliente", "ana@correo.com", null)).resolves.toBeUndefined();
    expect(ejecutarMock).not.toHaveBeenCalled();
  });

  it("el bloqueo no depende de que el usuario exista y no distingue mayúsculas", () => {
    expect(normalizarIdentificador("  MeSero ")).toBe("mesero");
    expect(normalizarIdentificador("x".repeat(300))).toHaveLength(120);
  });
});

describe("inactividad por rol", () => {
  it("15 minutos para el personal; la pantalla de cocina, un turno completo", () => {
    expect(minutosInactividad("mesero")).toBe(15);
    expect(minutosInactividad("gerente")).toBe(15);
    expect(minutosInactividad("cocinero")).toBe(480);
  });

  it("se puede cambiar o desactivar con variables de entorno", () => {
    process.env.INACTIVIDAD_MINUTOS = "30";
    process.env.INACTIVIDAD_MINUTOS_COCINA = "0";
    expect(minutosInactividad("cajero")).toBe(30);
    expect(minutosInactividad("cocinero")).toBe(0);
    process.env.INACTIVIDAD_MINUTOS = "basura";
    expect(minutosInactividad("cajero")).toBe(15);
  });
});
