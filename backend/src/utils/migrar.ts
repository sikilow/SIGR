import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../services/db";

/**
 * Aplica el esquema de database/supabase a la base de DATABASE_URL.
 *   npm run db:migrar   → aplica, en orden, los archivos NNN_*.sql que falten.
 *   npm run db:demo     → carga datos_demo.sql una sola vez (después de `npm run seed`).
 * Cada archivo corre en su propia transacción y queda anotado en sigr.migracion: si falla, no se aplica nada de él.
 */

const CARPETA = path.resolve(__dirname, "../../../database/supabase");
const ARCHIVO_DEMO = "datos_demo.sql";
const ZONA_HORARIA = process.env.DB_ZONA_HORARIA?.trim() || "America/Mazatlan";

async function aplicados(): Promise<Set<string>> {
  await pool.query("CREATE SCHEMA IF NOT EXISTS sigr");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS sigr.migracion (
       archivo VARCHAR(120) PRIMARY KEY,
       aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  const { rows } = await pool.query<{ archivo: string }>("SELECT archivo FROM sigr.migracion");
  return new Set(rows.map((fila) => fila.archivo));
}

async function aplicar(archivo: string): Promise<void> {
  const sql = readFileSync(path.join(CARPETA, archivo), "utf8");
  const cliente = await pool.connect();
  try {
    // El pooler de Supabase reutiliza conexiones abiertas antes de fijar la zona de la base: se fija también aquí.
    await cliente.query(`SET TIME ZONE '${ZONA_HORARIA}'`);
    await cliente.query("BEGIN");
    await cliente.query(sql); // varias sentencias: protocolo simple, sin parámetros
    await cliente.query("INSERT INTO sigr.migracion (archivo) VALUES ($1)", [archivo]);
    await cliente.query("COMMIT");
    console.log(`Aplicado: ${archivo}`);
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw new Error(`Falló ${archivo}; no se aplicó nada de ese archivo.`, { cause: error });
  } finally {
    cliente.release();
  }
}

/** Zona de la base: NOW(), CURRENT_DATE y los DEFAULT usan la hora del restaurante, incluso desde el panel de Supabase. */
async function fijarZonaHoraria(): Promise<void> {
  if (!/^[A-Za-z0-9_+\-/]+$/.test(ZONA_HORARIA)) throw new Error(`DB_ZONA_HORARIA no es válida: ${ZONA_HORARIA}`);
  await pool.query(
    `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), '${ZONA_HORARIA}'); END $$`,
  );
}

async function main(): Promise<void> {
  if (!/^[A-Za-z0-9_+\-/]+$/.test(ZONA_HORARIA)) throw new Error(`DB_ZONA_HORARIA no es válida: ${ZONA_HORARIA}`);
  const demo = process.argv.includes("--demo");
  const hechos = await aplicados();

  if (demo) {
    if (hechos.has(ARCHIVO_DEMO)) {
      console.log("Los datos de demostración ya estaban cargados.");
      return;
    }
    const [usuarios] = (await pool.query<{ total: number }>("SELECT COUNT(*) AS total FROM sigr.credenciales")).rows;
    if (!usuarios || usuarios.total === 0) throw new Error("Primero crea los usuarios con `npm run seed`.");
    await aplicar(ARCHIVO_DEMO);
    return;
  }

  await fijarZonaHoraria();
  const pendientes = readdirSync(CARPETA)
    .filter((archivo) => /^\d{3}_.+\.sql$/.test(archivo) && !hechos.has(archivo))
    .sort();
  if (pendientes.length === 0) console.log("El esquema ya está al día.");
  for (const archivo of pendientes) await aplicar(archivo);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
