import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import {
  describirMinutos,
  ESTADO_PEDIDO_DB,
  ESTADOS_PEDIDO,
  exigirAnticipacionMinima,
  idDeRuta,
  nombreEstadoDeFiltro,
  normalizarCodigo,
  pedidosSinEntregar,
  validar,
} from "../src/models/dominio";
import { ErrorApi } from "../src/utils/errores";

/** Ejecuta `fn`, espera que lance un ErrorApi y lo devuelve para revisar su estado y código. */
function errorDe(fn: () => unknown): ErrorApi {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorApi);
    return e as ErrorApi;
  }
  throw new Error("Se esperaba que lanzara un ErrorApi");
}

describe("normalizarCodigo", () => {
  it("quita acentos, pasa a minúsculas y usa guion bajo", () => {
    expect(normalizarCodigo("En preparación")).toBe("en_preparacion");
    expect(normalizarCodigo("EN PREPARACION")).toBe("en_preparacion");
    expect(normalizarCodigo("en-preparacion")).toBe("en_preparacion");
  });

  it("recorta los espacios de los extremos", () => {
    expect(normalizarCodigo("  Listo  ")).toBe("listo");
  });
});

describe("estados del pedido", () => {
  it("tiene los 7 estados del catálogo", () => {
    expect(ESTADOS_PEDIDO).toHaveLength(7);
    expect(ESTADOS_PEDIDO).toContain("registrado");
    expect(ESTADOS_PEDIDO).toContain("pagado");
  });

  it("«enviado» se guarda como «Pendiente» en la base de datos", () => {
    expect(ESTADO_PEDIDO_DB.enviado).toBe("Pendiente");
  });

  it("solo considera entregados o cancelados como listos para cobrar, sin depender de mayúsculas o acentos", () => {
    const pedidos = [
      { id: 1, estado: "Listo" },
      { id: 2, estado: "Entregado" },
      { id: 3, estado: "Cancelado" },
      { id: 4, estado: "En preparación" },
    ];
    expect(pedidosSinEntregar(pedidos).map((pedido) => pedido.id)).toEqual([1, 4]);
  });
});

describe("nombreEstadoDeFiltro", () => {
  it("acepta el código interno", () => {
    expect(nombreEstadoDeFiltro("enviado")).toBe("Pendiente");
    expect(nombreEstadoDeFiltro("en_preparacion")).toBe("En preparacion");
  });

  it("acepta el nombre del catálogo, con o sin acento y en cualquier caso", () => {
    expect(nombreEstadoDeFiltro("En preparacion")).toBe("En preparacion");
    expect(nombreEstadoDeFiltro("EN PREPARACIÓN")).toBe("En preparacion");
    expect(nombreEstadoDeFiltro("pendiente")).toBe("Pendiente");
    expect(nombreEstadoDeFiltro("Listo")).toBe("Listo");
  });

  it("devuelve null si el estado no existe", () => {
    expect(nombreEstadoDeFiltro("volando")).toBeNull();
    expect(nombreEstadoDeFiltro("")).toBeNull();
  });
});

describe("idDeRuta", () => {
  it("convierte un entero positivo", () => {
    expect(idDeRuta("7")).toBe(7);
    expect(idDeRuta("120")).toBe(120);
  });

  it("si llega un arreglo usa el primer elemento", () => {
    expect(idDeRuta(["5", "9"])).toBe(5);
  });

  it.each(["abc", "0", "-1", "1.5", "007", "", "1e3"])("responde 404 con «%s»", (valor) => {
    const e = errorDe(() => idDeRuta(valor));
    expect(e.estado).toBe(404);
    expect(e.codigo).toBe("no_encontrado");
  });

  it("responde 404 si no llega nada", () => {
    expect(errorDe(() => idDeRuta(undefined)).estado).toBe(404);
  });
});

describe("validar", () => {
  const Esquema = z.object({ nombre: z.string().min(2), edad: z.number().int().min(0) });

  it("devuelve los datos cuando son válidos", () => {
    expect(validar(Esquema, { nombre: "Ana", edad: 20 })).toEqual({ nombre: "Ana", edad: 20 });
  });

  it("responde 422 y nombra el campo que falló", () => {
    const e = errorDe(() => validar(Esquema, { nombre: "A", edad: 20 }));
    expect(e.estado).toBe(422);
    expect(e.codigo).toBe("estado_invalido");
    expect(e.message).toContain("nombre");
  });

  it("responde 422 si falta el cuerpo completo", () => {
    expect(errorDe(() => validar(Esquema, undefined)).estado).toBe(422);
  });
});

describe("anticipación mínima de reservación", () => {
  it("describe los minutos en horas y minutos", () => {
    expect(describirMinutos(0)).toBe("sin anticipación");
    expect(describirMinutos(45)).toBe("45 minutos");
    expect(describirMinutos(60)).toBe("1 hora");
    expect(describirMinutos(90)).toBe("1 hora 30 minutos");
    expect(describirMinutos(180)).toBe("3 horas");
  });

  /** Conexión falsa: responde lo que diría MySQL a la consulta de anticipación. */
  const conexion = (fila: { minutos: number; temprano: number }) =>
    ({ query: async (sql: string) => (sql.startsWith("SET") ? [[], []] : [[fila], []]) }) as unknown as PoolConnection;

  it("rechaza una reservación demasiado cercana y dice cuánta anticipación se exige", async () => {
    const e = await exigirAnticipacionMinima(conexion({ minutos: 90, temprano: 1 }), "2026-11-15 14:00:00").catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect((e as ErrorApi).codigo).toBe("estado_invalido");
    expect((e as ErrorApi).message).toContain("1 hora 30 minutos");
  });

  it("acepta una reservación con tiempo suficiente", async () => {
    await expect(exigirAnticipacionMinima(conexion({ minutos: 60, temprano: 0 }), "2026-11-15 18:00:00")).resolves.toBeUndefined();
  });
});
