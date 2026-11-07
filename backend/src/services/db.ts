import "dotenv/config";
import mysql from "mysql2/promise";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { actorAuditoriaActual } from "./contextoAuditoria";

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "SIGR",
  waitForConnections: true,
  connectionLimit: 10,
  // Sin esto, mysql2 devuelve los DECIMAL (precios, totales) como texto ("95.00") y el front mostraría NaN.
  decimalNumbers: true,
  // Los DATETIME salen como texto "2026-10-15 16:34:00" (sin zona horaria), tal como los guarda MySQL.
  // El frontend los interpreta como hora local; con Date + toISOString() se corrían por la zona horaria.
  dateStrings: true,
});

/** Algo con lo que se puede consultar: el pool, o una conexión dentro de una transacción. */
export type Ejecutor = Pool | PoolConnection;

async function conConexion<T>(ex: Ejecutor, ejecutarConsulta: (cx: PoolConnection) => Promise<T>): Promise<T> {
  const esPool = ex === pool;
  const cx = esPool ? await pool.getConnection() : (ex as PoolConnection);
  try {
    await cx.query("SET @sigr_actor_id = ?", [actorAuditoriaActual()]);
    return await ejecutarConsulta(cx);
  } finally {
    if (esPool) cx.release();
  }
}

/** SELECT: devuelve las filas. */
export async function filas<T extends RowDataPacket = RowDataPacket>(
  ex: Ejecutor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return conConexion(ex, async (cx) => {
    const [rows] = await cx.query<T[]>(sql, params);
    return rows;
  });
}

/** INSERT / UPDATE / DELETE: devuelve insertId, affectedRows, etc. */
export async function ejecutar(ex: Ejecutor, sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  return conConexion(ex, async (cx) => {
    const [res] = await cx.query<ResultSetHeader>(sql, params);
    return res;
  });
}

/** Corre `fn` dentro de una transacción: si lanza un error, se deshace todo (ROLLBACK). */
export async function transaccion<T>(fn: (cx: PoolConnection) => Promise<T>): Promise<T> {
  const cx = await pool.getConnection();
  let actorRestablecido = false;
  try {
    await cx.beginTransaction();
    await cx.query("SET @sigr_actor_id = ?", [actorAuditoriaActual()]);
    const resultado = await fn(cx);
    await cx.query("SET @sigr_actor_id = NULL");
    actorRestablecido = true;
    await cx.commit();
    return resultado;
  } catch (error) {
    await cx.rollback();
    throw error;
  } finally {
    if (!actorRestablecido) {
      try {
        await cx.query("SET @sigr_actor_id = NULL");
      } catch (error) {
        cx.destroy();
        throw error;
      }
    }
    cx.release();
  }
}
