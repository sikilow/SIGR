import type { Request, Response } from "express";
import { conConexion, ejecutar, filas } from "./db";
import { ErrorApi } from "../utils/errores";

/**
 * Soporte de la cabecera `Idempotency-Key` que manda el front en crear / enviar / cancelar /
 * entregar / solicitar-pago. Una clave = una intención del usuario:
 *  - Primera vez: se ejecuta la acción y se guarda su respuesta (solo los éxitos).
 *  - Reintento con la misma clave (p. ej. se perdió la respuesta): se devuelve la respuesta guardada
 *    SIN repetir la acción (no duplica pedidos).
 *  - Si no viene la cabecera, la acción se ejecuta normal.
 * Un candado consultivo de PostgreSQL (pg_advisory_lock) evita que dos peticiones simultáneas con la
 * misma clave se ejecuten a la vez; se espera hasta 10 s, como hacía GET_LOCK en MySQL.
 */
export async function conIdempotencia<T>(
  req: Request,
  res: Response,
  estadoOk: number,
  accion: () => Promise<T>,
): Promise<void> {
  const clave = req.header("Idempotency-Key")?.trim();
  if (!clave) {
    res.status(estadoOk).json(await accion());
    return;
  }
  if (clave.length > 100) {
    throw new ErrorApi(422, "estado_invalido", "La clave de idempotencia es demasiado larga (máximo 100).");
  }

  const usuarioId = req.usuario!.id;
  const ruta = `${req.method} ${req.originalUrl.split("?")[0]}`;
  const candado = `idem:${usuarioId}:${clave}`;

  await conConexion(async (cx) => {
    try {
      await filas(cx, "SET lock_timeout = '10s'");
      await filas(cx, "SELECT pg_advisory_lock(hashtextextended(?, 0))", [candado]);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "55P03") {
        throw new ErrorApi(409, "estado_invalido", "Hay otra petición con la misma clave en curso. Reintenta en un momento.");
      }
      throw error;
    } finally {
      await filas(cx, "RESET lock_timeout").catch(() => undefined);
    }

    try {
      const [previa] = await filas(
        cx,
        "SELECT ruta, estado_http, respuesta FROM idempotencia WHERE clave = ? AND id_usuario = ?",
        [clave, usuarioId],
      );
      if (previa) {
        if (previa.ruta !== ruta) {
          throw new ErrorApi(422, "estado_invalido", "Esa clave de idempotencia ya se usó en otra operación.");
        }
        const cuerpo = typeof previa.respuesta === "string" ? JSON.parse(previa.respuesta) : previa.respuesta;
        res.status(previa.estado_http as number).json(cuerpo);
        return;
      }

      const resultado = await accion();
      await ejecutar(
        cx,
        "INSERT INTO idempotencia (clave, id_usuario, ruta, estado_http, respuesta) VALUES (?, ?, ?, ?, ?)",
        [clave, usuarioId, ruta, estadoOk, JSON.stringify(resultado)],
      );
      res.status(estadoOk).json(resultado);
    } finally {
      // Si falla, el candado se libera solo al cerrar la conexión.
      await filas(cx, "SELECT pg_advisory_unlock(hashtextextended(?, 0))", [candado]).catch(() => undefined);
    }
  });
}
