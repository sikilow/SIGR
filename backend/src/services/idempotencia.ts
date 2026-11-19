import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { ejecutar, filas, LIMITE_POOL, pool } from "./db";
import { ErrorApi } from "../utils/errores";

/**
 * Cuántas acciones con Idempotency-Key pueden correr a la vez. Cada una ocupa DOS conexiones del pool (la del candado y la
 * de su transacción); si todas las conexiones quedaran como «candado» esperando la segunda, la API se congelaría. Con este
 * tope siempre sobran conexiones: las que pasan del tope esperan su turno (en orden de llegada).
 */
const LIMITE_IDEMPOTENTES = Math.max(1, Math.floor(LIMITE_POOL / 2) - 2);
let idempotentesEnCurso = 0;
const turnos: Array<() => void> = [];

async function tomarTurno(): Promise<void> {
  if (idempotentesEnCurso < LIMITE_IDEMPOTENTES) {
    idempotentesEnCurso++;
    return;
  }
  // El turno se hereda: quien termina pasa su lugar al siguiente sin soltarlo (el contador no cambia).
  await new Promise<void>((resolver) => turnos.push(resolver));
}

function soltarTurno(): void {
  const siguiente = turnos.shift();
  if (siguiente) siguiente();
  else idempotentesEnCurso--;
}

/**
 * Soporte de la cabecera `Idempotency-Key` que manda el front en crear / enviar / cancelar /
 * entregar / solicitar-pago. Una clave = una intención del usuario:
 *  - Primera vez: se ejecuta la acción y se guarda su respuesta (solo los éxitos).
 *  - Reintento con la misma clave (p. ej. se perdió la respuesta): se devuelve la respuesta guardada
 *    SIN repetir la acción (no duplica pedidos).
 *  - Si no viene la cabecera, la acción se ejecuta normal.
 * Un candado de MySQL (GET_LOCK) evita que dos peticiones simultáneas con la misma clave se ejecuten a la vez.
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

  await tomarTurno();
  try {
    await ejecutarConClave(req, res, estadoOk, accion, clave);
  } finally {
    soltarTurno();
  }
}

async function ejecutarConClave<T>(
  req: Request,
  res: Response,
  estadoOk: number,
  accion: () => Promise<T>,
  clave: string,
): Promise<void> {
  const usuarioId = req.usuario!.id;
  const ruta = `${req.method} ${req.originalUrl.split("?")[0]}`;
  const candado = `idem_${createHash("sha1").update(`${usuarioId}:${clave}`).digest("hex")}`;

  const cx = await pool.getConnection();
  try {
    const [lock] = await filas(cx, "SELECT GET_LOCK(?, 10) AS ok", [candado]);
    if (!lock || Number(lock.ok) !== 1) {
      throw new ErrorApi(409, "estado_invalido", "Hay otra petición con la misma clave en curso. Reintenta en un momento.");
    }

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
    try {
      await filas(cx, "SELECT RELEASE_LOCK(?)", [candado]);
    } catch {
      // Si falla, el candado se libera solo al cerrar la conexión.
    }
    cx.release();
  }
}
