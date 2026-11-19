// Seguridad de acceso (migración 031): bloqueo tras intentos fallidos (RNF-009), registro de accesos (RNF-017) y
// sesiones del personal que se cierran al salir (RNF-012) o por inactividad (RNF-011).
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { ejecutar, filas, type Ejecutor, pool } from "./db";
import { ErrorApi } from "../utils/errores";
import type { Rol } from "../utils/auth";

export type AmbitoAcceso = "empleado" | "cliente";
export type ResultadoAcceso = "ok" | "fallido" | "bloqueado" | "no_autorizado" | "sesion_expirada" | "salida";

/** Intentos fallidos seguidos que bloquean el acceso. */
export const INTENTOS_PARA_BLOQUEAR = 5;
/** Los intentos fallidos solo cuentan si ocurrieron en los últimos N minutos. */
export const VENTANA_INTENTOS_MINUTOS = 15;
/** Cuánto dura el bloqueo, en minutos. */
export const BLOQUEO_MINUTOS = positivo(process.env.ACCESO_BLOQUEO_MINUTOS, 5);

function positivo(valor: string | undefined, porOmision: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porOmision;
}

/** Quita mayúsculas, espacios y exceso de largo para que «Ana», «ana » y «ANA» cuenten como lo mismo. */
export function normalizarIdentificador(valor: string): string {
  return valor.trim().toLowerCase().slice(0, 120);
}

/** IP de quien hace la petición (con `TRUST_PROXY` configurado detrás de un proxy, la real). */
export function ipDe(req: Request): string | null {
  return (req.ip ?? req.socket?.remoteAddress ?? "").slice(0, 45) || null;
}

/**
 * Minutos sin actividad que se permiten antes de cerrar la sesión del personal (0 = sin límite).
 * 15 por omisión (INACTIVIDAD_MINUTOS). La pantalla de Cocina queda fija sin que nadie la toque, así que su límite es el
 * de un turno completo (INACTIVIDAD_MINUTOS_COCINA, 480 por omisión).
 */
export function minutosInactividad(rol: Rol): number {
  const general = process.env.INACTIVIDAD_MINUTOS === undefined ? 15 : Number(process.env.INACTIVIDAD_MINUTOS);
  const cocina = process.env.INACTIVIDAD_MINUTOS_COCINA === undefined ? 480 : Number(process.env.INACTIVIDAD_MINUTOS_COCINA);
  const n = rol === "cocinero" ? cocina : general;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 15;
}

// ---------------------------------------------------------------------------------------------------------------
// Registro de accesos
// ---------------------------------------------------------------------------------------------------------------

export interface DatosRegistroAcceso {
  ambito: AmbitoAcceso;
  identificador: string;
  resultado: ResultadoAcceso;
  detalle?: string | null;
  ip?: string | null;
  ruta?: string | null;
}

/** Guarda un evento de acceso. Un fallo al guardarlo nunca debe romper la petición: solo queda en el log. */
export async function registrarAcceso(d: DatosRegistroAcceso, ex: Ejecutor = pool): Promise<void> {
  try {
    await ejecutar(
      ex,
      "INSERT INTO registro_acceso (ambito, identificador, resultado, detalle, ip, ruta) VALUES (?, ?, ?, ?, ?, ?)",
      [d.ambito, normalizarIdentificador(d.identificador), d.resultado, d.detalle?.slice(0, 200) ?? null, d.ip ?? null, d.ruta?.slice(0, 120) ?? null],
    );
  } catch (error) {
    console.error("No se pudo guardar el registro de acceso:", error);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Bloqueo tras intentos fallidos
// ---------------------------------------------------------------------------------------------------------------

/**
 * Si el acceso de `identificador` está bloqueado, lanza `429 cuenta_bloqueada` con los segundos que faltan. El bloqueo
 * empieza al fallar el intento número 5 (queda una marca `bloqueado/inicio`) y no depende de si la cuenta existe: así no
 * se revela qué usuarios hay.
 */
export async function exigirAccesoNoBloqueado(ambito: AmbitoAcceso, identificador: string, ip: string | null): Promise<void> {
  const id = normalizarIdentificador(identificador);
  const [fila] = await filas(
    pool,
    `SELECT TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(MAX(creado_en), INTERVAL ? MINUTE)) AS faltan
       FROM registro_acceso
      WHERE ambito = ? AND identificador = ? AND resultado = 'bloqueado' AND detalle = 'inicio'
        AND creado_en > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [BLOQUEO_MINUTOS, ambito, id, BLOQUEO_MINUTOS],
  );
  const faltan = Number(fila?.faltan ?? 0);
  if (faltan > 0) {
    await registrarAcceso({ ambito, identificador: id, resultado: "bloqueado", detalle: "intento", ip });
    throw errorBloqueo(faltan);
  }
}

function errorBloqueo(segundos: number): ErrorApi {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return new ErrorApi(
    429,
    "cuenta_bloqueada",
    `Demasiados intentos fallidos. Espera ${minutos} ${minutos === 1 ? "minuto" : "minutos"} y vuelve a intentarlo.`,
    { reintentar_en_segundos: segundos },
  );
}

/**
 * Anota un intento fallido. Si con este se llega a `INTENTOS_PARA_BLOQUEAR` desde el último acceso correcto, el último
 * bloqueo o hace más de `VENTANA_INTENTOS_MINUTOS`, deja la marca de bloqueo y lanza `429 cuenta_bloqueada`.
 */
export async function registrarIntentoFallido(ambito: AmbitoAcceso, identificador: string, ip: string | null, detalle: string): Promise<void> {
  const id = normalizarIdentificador(identificador);
  await registrarAcceso({ ambito, identificador: id, resultado: "fallido", detalle, ip });
  const [fila] = await filas(
    pool,
    `SELECT COUNT(*) AS n
       FROM registro_acceso
      WHERE ambito = ? AND identificador = ? AND resultado = 'fallido'
        AND creado_en > GREATEST(
              DATE_SUB(NOW(), INTERVAL ? MINUTE),
              COALESCE((SELECT MAX(creado_en) FROM registro_acceso
                         WHERE ambito = ? AND identificador = ? AND (resultado = 'ok' OR (resultado = 'bloqueado' AND detalle = 'inicio'))),
                       '1970-01-01'))`,
    [ambito, id, VENTANA_INTENTOS_MINUTOS, ambito, id],
  );
  if (Number(fila?.n ?? 0) >= INTENTOS_PARA_BLOQUEAR) {
    await registrarAcceso({ ambito, identificador: id, resultado: "bloqueado", detalle: "inicio", ip });
    throw errorBloqueo(BLOQUEO_MINUTOS * 60);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Sesiones del personal
// ---------------------------------------------------------------------------------------------------------------

/** Crea la sesión de un inicio de sesión y devuelve su id (el `sid` del token). */
export async function crearSesionEmpleado(idUsuario: number, ip: string | null): Promise<string> {
  const idSesion = randomBytes(16).toString("hex");
  await ejecutar(pool, "INSERT INTO sesion_empleado (id_sesion, id_usuario, ip) VALUES (?, ?, ?)", [idSesion, idUsuario, ip]);
  return idSesion;
}

export async function cerrarSesionEmpleado(idSesion: string, motivo: "salio" | "inactividad"): Promise<void> {
  await ejecutar(pool, "UPDATE sesion_empleado SET cerrada_en = NOW(), motivo_cierre = ? WHERE id_sesion = ? AND cerrada_en IS NULL", [motivo, idSesion]);
}

/** Marca que la persona sigue ahí (la pantalla lo avisa mientras la toca; ver `POST /api/auth/actividad`). */
export async function registrarActividadSesion(idSesion: string): Promise<void> {
  await ejecutar(pool, "UPDATE sesion_empleado SET ultima_actividad = NOW() WHERE id_sesion = ? AND cerrada_en IS NULL", [idSesion]);
}

/** Borra lo viejo: registros de acceso de más de 180 días y sesiones cerradas (o abandonadas) de más de 30. */
export async function depurarSeguridadAcceso(): Promise<void> {
  try {
    await ejecutar(pool, "DELETE FROM registro_acceso WHERE creado_en < DATE_SUB(NOW(), INTERVAL 180 DAY)");
    await ejecutar(
      pool,
      "DELETE FROM sesion_empleado WHERE COALESCE(cerrada_en, ultima_actividad) < DATE_SUB(NOW(), INTERVAL 30 DAY)",
    );
  } catch (error) {
    console.error("No se pudo depurar el registro de accesos:", error);
  }
}
