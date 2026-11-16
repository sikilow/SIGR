// Verifica que database/init.sql deja una base idéntica a la que ya funciona.
//
//   node database/verificar_init.mjs            compara init.sql contra la base de backend/.env (DB_NAME, por defecto SIGR)
//   node database/verificar_init.mjs --solo-init  solo comprueba que init.sql se ejecuta sin errores en una base temporal
//
// Qué hace:
//   1. Crea una base TEMPORAL (<DB_NAME>_verif_init) ejecutando init.sql en ella.
//   2. Compara tablas, columnas, índices, llaves foráneas, restricciones CHECK, triggers, rutinas y vistas
//      contra la base real. La base real SOLO se lee: nunca se modifica.
//   3. Borra la base temporal, pase lo que pase.
//
// Sale con código 0 si no hay diferencias y 1 si las hay (o si init.sql falla).
// Requiere el cliente `mysql` en el PATH y las credenciales de backend/.env (DB_HOST, DB_USER, DB_PASSWORD).
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const soloInit = process.argv.includes('--solo-init')

// --- Configuración (backend/.env) ---
function leerEnv() {
  const ruta = join(raiz, 'backend', '.env')
  const env = {}
  if (!existsSync(ruta)) return env
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && !linea.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}
const env = { ...leerEnv(), ...process.env }
const HOST = env.DB_HOST || 'localhost'
const USUARIO = env.DB_USER || 'root'
const PASSWORD = env.DB_PASSWORD ?? ''
const BD_REAL = env.DB_NAME || 'SIGR'
const BD_TEMP = `${BD_REAL}_verif_init`

function mysql(args, entrada) {
  const r = spawnSync('mysql', ['-h', HOST, '-u', USUARIO, '--default-character-set=utf8mb4', ...args], {
    input: entrada,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, MYSQL_PWD: PASSWORD },
  })
  if (r.error) throw new Error(`No se pudo ejecutar «mysql»: ${r.error.message}. ¿Está en el PATH?`)
  return r
}

// Consultas de comparación. Los nombres de columna salen del esquema; el orden de columnas no se compara.
const CONSULTAS = (bd) => [
  `SELECT 'TABLA', table_name, engine, table_collation FROM information_schema.tables WHERE table_schema='${bd}' AND table_type='BASE TABLE'`,
  `SELECT 'COLUMNA', table_name, column_name, column_type, is_nullable, IFNULL(column_default,'NULL'), extra, IFNULL(collation_name,'') FROM information_schema.columns WHERE table_schema='${bd}'`,
  `SELECT 'INDICE', table_name, index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema='${bd}' GROUP BY table_name, index_name, non_unique`,
  `SELECT 'FK', k.table_name, k.constraint_name, GROUP_CONCAT(k.column_name ORDER BY k.ordinal_position), k.referenced_table_name, r.update_rule, r.delete_rule FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.constraint_schema=k.constraint_schema AND r.constraint_name=k.constraint_name WHERE k.table_schema='${bd}' GROUP BY k.table_name, k.constraint_name, k.referenced_table_name, r.update_rule, r.delete_rule`,
  `SELECT 'CHECK', t.table_name, c.constraint_name, c.check_clause FROM information_schema.check_constraints c JOIN information_schema.table_constraints t ON t.constraint_schema=c.constraint_schema AND t.constraint_name=c.constraint_name WHERE c.constraint_schema='${bd}'`,
  `SELECT 'TRIGGER', trigger_name, event_object_table, action_timing, event_manipulation, MD5(action_statement) FROM information_schema.triggers WHERE trigger_schema='${bd}'`,
  `SELECT 'RUTINA', routine_name, routine_type, MD5(routine_definition) FROM information_schema.routines WHERE routine_schema='${bd}'`,
  `SELECT 'VISTA', table_name, view_definition FROM information_schema.views WHERE table_schema='${bd}'`,
]

function instantanea(bd) {
  const lineas = []
  for (const sql of CONSULTAS(bd)) {
    const r = mysql(['-N', '-B'], sql + ';')
    if (r.status !== 0) throw new Error(`Falló la consulta de esquema en ${bd}:\n${r.stderr}`)
    lineas.push(...r.stdout.split(/\r?\n/).filter(Boolean))
  }
  return lineas
    // Solo el prefijo de esquema (`sigr`.`venta` en las vistas); no el texto «sigr» de tablas como sigr_auditoria.
    .map((l) => l.replace(new RegExp('`' + bd + '`\\.', 'gi'), '`<BD>`.'))
    // Los nombres CHECK generados por MySQL (tabla_chk_1, _chk_2…) dependen del orden de creación: no son comparables.
    .map((l) => l.replace(/\b(\w+_chk_)\d+\b/g, '$1N'))
    .sort()
}

let codigo = 0
try {
  // 1) init.sql en una base temporal
  const sql = readFileSync(join(raiz, 'database', 'init.sql'), 'utf8')
    .replace(/CREATE DATABASE IF NOT EXISTS \w+/g, `CREATE DATABASE IF NOT EXISTS ${BD_TEMP}`)
    .replace(/^USE \w+;/gm, `USE ${BD_TEMP};`)
  mysql(['-e', `DROP DATABASE IF EXISTS ${BD_TEMP}`])
  const alta = mysql([], sql)
  if (alta.status !== 0) {
    console.error('✗ init.sql falla en una base nueva:\n' + alta.stderr.trim())
    codigo = 1
  } else {
    console.log(`✓ init.sql se ejecuta sin errores en una base nueva (${BD_TEMP}).`)
    if (!soloInit) {
      // 2) comparación
      const real = instantanea(BD_REAL)
      const nueva = instantanea(BD_TEMP)
      const soloReal = real.filter((l) => !nueva.includes(l))
      const soloNueva = nueva.filter((l) => !real.includes(l))
      if (soloReal.length === 0 && soloNueva.length === 0) {
        console.log(`✓ El esquema creado por init.sql es idéntico al de «${BD_REAL}» (${real.length} elementos comparados).`)
      } else {
        codigo = 1
        console.error(`✗ Hay diferencias entre init.sql y «${BD_REAL}»:`)
        if (soloReal.length) console.error(`\nSolo en «${BD_REAL}» (falta en init.sql):\n  ` + soloReal.join('\n  '))
        if (soloNueva.length) console.error(`\nSolo en init.sql (no está en «${BD_REAL}»):\n  ` + soloNueva.join('\n  '))
        console.error('\nSi el cambio es nuevo y ya lo tiene la base real, agrégalo a database/init.sql. Si init.sql tiene algo de más, quítalo o crea la migración.')
      }
    }
  }
} catch (e) {
  console.error('✗ ' + (e instanceof Error ? e.message : String(e)))
  codigo = 1
} finally {
  mysql(['-e', `DROP DATABASE IF EXISTS ${BD_TEMP}`])
}
process.exit(codigo)
