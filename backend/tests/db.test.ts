import { describe, expect, it } from "vitest";
import { esDuplicado, esSinConexion, restriccionDe, traducirConsulta } from "../src/services/db";
import { manejarErrores } from "../src/utils/errores";

describe("traducirConsulta", () => {
  it("numera los ? en orden", () => {
    expect(traducirConsulta("SELECT * FROM mesa WHERE id_mesa = ? AND estado = ?", [3, "libre"])).toEqual({
      texto: "SELECT * FROM mesa WHERE id_mesa = $1 AND estado = $2",
      valores: [3, "libre"],
    });
  });

  it("expande un arreglo dentro de IN (?), como mysql2", () => {
    expect(traducirConsulta("SELECT 1 FROM producto WHERE id_producto IN (?) AND activo = ?", [[4, 7, 9], true])).toEqual({
      texto: "SELECT 1 FROM producto WHERE id_producto IN ($1, $2, $3) AND activo = $4",
      valores: [4, 7, 9, true],
    });
  });

  it("un arreglo vacío no deja la consulta inválida", () => {
    expect(traducirConsulta("SELECT 1 FROM producto WHERE id_producto IN (?)", [[]]).texto).toBe(
      "SELECT 1 FROM producto WHERE id_producto IN (NULL)",
    );
  });

  it("convierte un arreglo de filas en VALUES múltiples", () => {
    expect(traducirConsulta("INSERT INTO pago (id_venta, monto) VALUES ?", [[[1, 10], [1, 20.5]]])).toEqual({
      texto: "INSERT INTO pago (id_venta, monto) VALUES ($1, $2), ($3, $4)",
      valores: [1, 10, 1, 20.5],
    });
  });

  it("no toca los ? dentro de cadenas ni comentarios", () => {
    const { texto, valores } = traducirConsulta(
      "SELECT '¿hay mesa?' AS pregunta, 'it''s ?' AS otra -- ¿comentario?\nFROM mesa WHERE id_mesa = ?",
      [5],
    );
    expect(texto).toBe("SELECT '¿hay mesa?' AS pregunta, 'it''s ?' AS otra -- ¿comentario?\nFROM mesa WHERE id_mesa = $1");
    expect(valores).toEqual([5]);
  });

  it("respeta los casts de PostgreSQL junto al parámetro", () => {
    expect(traducirConsulta("SELECT ?::date = CURRENT_DATE AS es_hoy", ["2026-11-10 19:00:00"]).texto).toBe(
      "SELECT $1::date = CURRENT_DATE AS es_hoy",
    );
  });

  it("undefined se envía como NULL", () => {
    expect(traducirConsulta("UPDATE mesa SET zona = ? WHERE id_mesa = ?", [undefined, 1]).valores).toEqual([null, 1]);
  });

  it("falla si faltan o sobran parámetros", () => {
    expect(() => traducirConsulta("SELECT ? , ?", [1])).toThrow();
    expect(() => traducirConsulta("SELECT ?", [1, 2])).toThrow();
  });
});

describe("errores de PostgreSQL", () => {
  it("reconoce un valor duplicado y la restricción que lo causó", () => {
    const error = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "uq_cliente_correo" });
    expect(esDuplicado(error)).toBe(true);
    expect(restriccionDe(error)).toBe("uq_cliente_correo");
    expect(esDuplicado(Object.assign(new Error("otro"), { code: "23503" }))).toBe(false);
  });

  it("reconoce la falta de conexión con la base de datos", () => {
    expect(esSinConexion(Object.assign(new Error("getaddrinfo ENOTFOUND aws-0-us-west-2.pooler.supabase.com"), { code: "ENOTFOUND" }))).toBe(true);
    expect(esSinConexion(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(esSinConexion(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(esSinConexion(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(false);
  });

  it("sin conexión, la API responde 503 con un mensaje claro en lugar de 500", () => {
    let estado = 0;
    let cuerpo: unknown;
    const res = { status: (s: number) => ((estado = s), res), json: (c: unknown) => ((cuerpo = c), res) };
    const silencio = console.error;
    console.error = () => undefined;
    try {
      manejarErrores(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }), {} as never, res as never, () => undefined);
    } finally {
      console.error = silencio;
    }
    expect(estado).toBe(503);
    expect(cuerpo).toMatchObject({ mensaje: expect.stringContaining("No hay conexión con la base de datos") });
  });
});
