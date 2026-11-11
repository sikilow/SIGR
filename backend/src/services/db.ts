import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";
import { actorAuditoriaActual } from "./contextoAuditoria";

/**
 * Acceso a PostgreSQL (Supabase). Conserva la forma de trabajo que tenía con mysql2 para que los
 * controladores no cambien: parámetros con `?`, `filas` / `ejecutar` / `transaccion`, y los mismos
 * formatos de salida (fechas como texto local, decimales como número, booleanos como 1/0).
 */

/** Fila devuelta por un SELECT (antes RowDataPacket de mysql2). */
export type Fila = { [columna: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ResultadoEjecucion {
  /** Primera columna de la primera fila devuelta (usar `RETURNING id_...`); 0 si no hay. */
  insertId: number;
  affectedRows: number;
  filas: Fila[];
}

// ---------- Formatos de salida, iguales a los de mysql2 con decimalNumbers + dateStrings ----------
const { types } = pg;
/** NUMERIC (precios, totales): número, no texto ("95.00"), o el front mostraría NaN. */
types.setTypeParser(types.builtins.NUMERIC, (valor) => Number(valor));
/** BIGINT (COUNT, SUM de enteros): número. Los conteos del sistema nunca rebasan 2^53. */
types.setTypeParser(types.builtins.INT8, (valor) => Number(valor));
/**
 * TIMESTAMP y TIMESTAMPTZ: texto "AAAA-MM-DD HH:MM:SS" en la hora local del restaurante (la sesión usa
 * DB_ZONA_HORARIA). El frontend los interpreta como hora local; con Date + toISOString() se correrían.
 */
const fechaLocal = (valor: string): string => valor.slice(0, 19);
types.setTypeParser(types.builtins.TIMESTAMP, fechaLocal);
types.setTypeParser(types.builtins.TIMESTAMPTZ, fechaLocal);
types.setTypeParser(types.builtins.DATE, (valor) => valor);
/** BOOLEAN: 1/0, como TINYINT(1) de MySQL; el contrato de la API ya los maneja así. */
types.setTypeParser(types.builtins.BOOL, (valor) => (valor === "t" ? 1 : 0));

// ---------- Conexión ----------
const ZONA_HORARIA = process.env.DB_ZONA_HORARIA?.trim() || "America/Mazatlan";
if (!/^[A-Za-z0-9_+\-/]+$/.test(ZONA_HORARIA)) {
  throw new Error(`DB_ZONA_HORARIA no es una zona horaria válida: ${ZONA_HORARIA}`);
}

const URL_BASE = process.env.DATABASE_URL?.trim() ?? "";

/** Se valida al primer uso, no al importar: las pruebas unitarias cargan este módulo sin base de datos. */
function exigirUrl(): void {
  if (!URL_BASE) {
    throw new Error("Falta DATABASE_URL en backend/.env (cadena de conexión de Supabase). Consulta docs/actualizar-base-datos.md.");
  }
}

function configuracionConexion(): pg.PoolConfig {
  if (!URL_BASE) return { max: Number(process.env.DB_CONEXIONES ?? 10) };
  const destino = new URL(URL_BASE);
  // El cifrado se controla aquí: si la URL trae sslmode, pg lo antepondría a esta configuración.
  destino.searchParams.delete("sslmode");
  const local = ["localhost", "127.0.0.1", "::1"].includes(destino.hostname);
  const certificado = process.env.DB_SSL_CA?.trim();
  return {
    connectionString: destino.toString(),
    max: Number(process.env.DB_CONEXIONES ?? 10),
    // Supabase y la red cortan las conexiones inactivas: se cierran antes y se abren de nuevo al necesitarse.
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    // Sin red (o si el DNS falla), la petición responde en segundos en lugar de quedarse colgada.
    connectionTimeoutMillis: 15_000,
    ssl: local
      ? false
      : certificado
        ? { ca: readFileSync(certificado, "utf8") }
        // Sin el certificado de Supabase (DB_SSL_CA) la conexión va cifrada pero sin verificar el servidor.
        : { rejectUnauthorized: false },
  };
}

export const pool = new pg.Pool(configuracionConexion());

/**
 * Sin este manejador, una conexión inactiva que se cae (Supabase la cierra, se pierde internet o falla el DNS)
 * termina el proceso de Node. El pool descarta esa conexión y abre otra en la siguiente consulta.
 */
const avisarConexionPerdida = (error: Error): void => {
  console.error(`Se perdió una conexión con la base de datos; se abrirá otra al necesitarla. (${error.message})`);
};
pool.on("error", avisarConexionPerdida);

const preparadas = new WeakSet<pg.PoolClient>();

/** Aparta una conexión; la primera vez la deja en el esquema sigr y con la hora del restaurante (NOW, CURRENT_DATE…). */
async function apartar(): Promise<pg.PoolClient> {
  exigirUrl();
  const cliente = await pool.connect();
  if (!preparadas.has(cliente)) {
    // Mientras la conexión está apartada, el error ya le llega a la consulta en curso; sin este oyente, Node
    // terminaría el proceso. Si está inactiva, el aviso lo da el manejador del pool.
    cliente.on("error", () => undefined);
    try {
      await cliente.query(`SET search_path TO sigr, public; SET TIME ZONE '${ZONA_HORARIA}'`);
    } catch (error) {
      cliente.release(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    preparadas.add(cliente);
  }
  return cliente;
}

/** Conexión apartada del pool: dentro de una transacción o para un candado de sesión. */
export class Conexion {
  constructor(readonly cliente: pg.PoolClient) {}
}

/** Algo con lo que se puede consultar: el pool, o una conexión apartada. */
export type Ejecutor = pg.Pool | Conexion;

// ---------- Parámetros: de `?` (estilo MySQL) a $1, $2… ----------

/**
 * Traduce los `?` a $n fuera de cadenas y comentarios. Como mysql2:
 *  - un arreglo se expande a una lista (`IN (?)` con [1, 2] → `IN ($1, $2)`);
 *  - un arreglo de arreglos, a filas (`VALUES ?` con [[1, 2], [3, 4]] → `VALUES ($1, $2), ($3, $4)`).
 */
export function traducirConsulta(sql: string, params: readonly unknown[] = []): { texto: string; valores: unknown[] } {
  const valores: unknown[] = [];
  const marcar = (valor: unknown): string => {
    valores.push(valor === undefined ? null : valor);
    return `$${valores.length}`;
  };
  const expandir = (valor: unknown): string => {
    if (!Array.isArray(valor)) return marcar(valor);
    if (valor.length === 0) return "NULL";
    if (valor.every(Array.isArray)) return valor.map((fila: unknown[]) => `(${fila.map(marcar).join(", ")})`).join(", ");
    return valor.map(marcar).join(", ");
  };

  let texto = "";
  let usados = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i]!;
    if (c === "'" || c === '"') {
      const fin = buscarCierre(sql, i, c);
      texto += sql.slice(i, fin + 1);
      i = fin;
    } else if (c === "-" && sql[i + 1] === "-") {
      const fin = sql.indexOf("\n", i);
      const hasta = fin === -1 ? sql.length : fin;
      texto += sql.slice(i, hasta);
      i = hasta - 1;
    } else if (c === "?") {
      if (usados >= params.length) throw new Error("La consulta tiene más `?` que parámetros.");
      texto += expandir(params[usados]);
      usados += 1;
    } else {
      texto += c;
    }
  }
  if (usados !== params.length) throw new Error(`La consulta usa ${usados} parámetros y recibió ${params.length}.`);
  return { texto, valores };
}

function buscarCierre(sql: string, inicio: number, comilla: string): number {
  for (let i = inicio + 1; i < sql.length; i += 1) {
    if (sql[i] === comilla) {
      if (sql[i + 1] === comilla) i += 1; // comilla escapada ('')
      else return i;
    }
  }
  return sql.length - 1;
}

// ---------- Actor de auditoría ----------

/** Texto literal del actor (entero o vacío): seguro de incrustar porque no viene de la petición. */
function actorLiteral(): string {
  const actor = actorAuditoriaActual();
  return Number.isInteger(actor) ? String(actor) : "";
}

const esLectura = (sql: string): boolean => /^\s*(SELECT|WITH|SHOW|SET|RESET)\b/i.test(sql);

async function consultar(ex: Ejecutor, sql: string, params: readonly unknown[]): Promise<pg.QueryResult<Fila>> {
  const { texto, valores } = traducirConsulta(sql, params);
  if (ex instanceof Conexion) return ex.cliente.query<Fila>(texto, valores);
  const cliente = await apartar();
  try {
    // Escritura suelta (sin transacción): los triggers de auditoría leen el actor de la sesión.
    if (!esLectura(sql)) await cliente.query(`SELECT set_config('sigr.actor_id', '${actorLiteral()}', false)`);
    return await cliente.query<Fila>(texto, valores);
  } finally {
    cliente.release();
  }
}

// ---------- API usada por controladores y servicios ----------

/** SELECT: devuelve las filas. */
export async function filas<T extends Fila = Fila>(ex: Ejecutor, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await consultar(ex, sql, params)).rows as T[];
}

/** INSERT / UPDATE / DELETE: devuelve insertId (con `RETURNING id_...`), affectedRows y las filas devueltas. */
export async function ejecutar(ex: Ejecutor, sql: string, params: unknown[] = []): Promise<ResultadoEjecucion> {
  const resultado = await consultar(ex, sql, params);
  const primera = resultado.rows[0];
  return {
    insertId: primera ? Number(Object.values(primera)[0]) : 0,
    affectedRows: resultado.rowCount ?? 0,
    filas: resultado.rows,
  };
}

/** Corre `fn` dentro de una transacción: si lanza un error, se deshace todo (ROLLBACK). */
export async function transaccion<T>(fn: (cx: Conexion) => Promise<T>): Promise<T> {
  const cliente = await apartar();
  let conexionRota: Error | undefined;
  try {
    // set_config(..., true) solo vale dentro de esta transacción: no se filtra a otra petición.
    await cliente.query(`BEGIN; SELECT set_config('sigr.actor_id', '${actorLiteral()}', true)`);
    const resultado = await fn(new Conexion(cliente));
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch (errorRollback) {
      conexionRota = errorRollback instanceof Error ? errorRollback : new Error(String(errorRollback));
    }
    throw error;
  } finally {
    cliente.release(conexionRota);
  }
}

/** Aparta una conexión fuera de transacción (p. ej. para un candado de sesión) y la devuelve al terminar. */
export async function conConexion<T>(fn: (cx: Conexion) => Promise<T>): Promise<T> {
  const cliente = await apartar();
  try {
    await cliente.query(`SELECT set_config('sigr.actor_id', '${actorLiteral()}', false)`);
    return await fn(new Conexion(cliente));
  } finally {
    cliente.release();
  }
}

// ---------- Errores de PostgreSQL ----------

function codigoError(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

/** Valor repetido en una llave única (antes ER_DUP_ENTRY de MySQL). */
export function esDuplicado(error: unknown): boolean {
  return codigoError(error) === "23505";
}

/** Nombre de la restricción que falló (p. ej. "uq_cliente_correo", "usuario_correo_key"). */
export function restriccionDe(error: unknown): string {
  return typeof error === "object" && error !== null && "constraint" in error ? String(error.constraint ?? "") : "";
}

const SIN_CONEXION = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "57P01", "57P03", "08006", "08001"]);

/** No se pudo hablar con la base de datos (sin internet, DNS caído, Supabase pausado o reiniciándose). */
export function esSinConexion(error: unknown): boolean {
  const codigo = codigoError(error);
  if (codigo && SIN_CONEXION.has(codigo)) return true;
  const mensaje = error instanceof Error ? error.message : "";
  return /Connection terminated|timeout exceeded when trying to connect|Connection ended unexpectedly/i.test(mensaje);
}

/** La tabla o columna no existe: falta aplicar una migración. */
export function esEsquemaIncompleto(error: unknown): boolean {
  const codigo = codigoError(error);
  return codigo === "42P01" || codigo === "42703" || codigo === "3F000";
}
