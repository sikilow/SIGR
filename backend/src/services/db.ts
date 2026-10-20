import "dotenv/config";
import mysql from "mysql2/promise";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

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

/** SELECT: devuelve las filas. */
export async function filas<T extends RowDataPacket = RowDataPacket>(
  ex: Ejecutor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await (ex as Pool).query<T[]>(sql, params);
  return rows;
}

/** INSERT / UPDATE / DELETE: devuelve insertId, affectedRows, etc. */
export async function ejecutar(ex: Ejecutor, sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [res] = await (ex as Pool).query<ResultSetHeader>(sql, params);
  return res;
}

/** Corre `fn` dentro de una transacción: si lanza un error, se deshace todo (ROLLBACK). */
export async function transaccion<T>(fn: (cx: PoolConnection) => Promise<T>): Promise<T> {
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    const resultado = await fn(cx);
    await cx.commit();
    return resultado;
  } catch (error) {
    await cx.rollback();
    throw error;
  } finally {
    cx.release();
  }
}
