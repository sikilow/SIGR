// Revisiones de seguridad al arrancar la API: avisan (o, en producción, impiden arrancar) cuando la configuración o los datos
// dejan una puerta abierta. Todo se escribe en el log del servidor.
import bcrypt from "bcryptjs";
import { JWT_SECRET } from "../utils/config";
import { filas, pool } from "./db";

/** Contraseñas de prueba que no deben llegar a producción. */
const CONTRASENAS_DE_PRUEBA = ["1234", "12345678", "admin", "password"];

const enProduccion = () => process.env.NODE_ENV === "production";

/** Falla si la configuración es insegura y `NODE_ENV=production`; en desarrollo solo avisa. */
export function revisarConfiguracionSegura(): void {
  const problemas: string[] = [];
  if (JWT_SECRET.length < 32) problemas.push("JWT_SECRET es corto: usa al menos 32 caracteres aleatorios.");
  if (/^(cambia_esto|secret|clave|changeme)/i.test(JWT_SECRET)) problemas.push("JWT_SECRET es el valor de ejemplo: genera uno propio.");
  if (enProduccion() && !process.env.CORS_ORIGIN?.trim()) problemas.push("Define CORS_ORIGIN con la dirección del front.");
  if (enProduccion() && !process.env.TRUST_PROXY?.trim()) {
    problemas.push("Si la API está detrás de un proxy (Nginx, etc.) define TRUST_PROXY=1 para que los bloqueos y límites usen la IP real.");
  }
  if (problemas.length === 0) return;
  const texto = problemas.map((p) => ` - ${p}`).join("\n");
  if (enProduccion() && problemas.some((p) => p.startsWith("JWT_SECRET"))) {
    throw new Error(`Configuración insegura para producción:\n${texto}`);
  }
  console.warn(`⚠ Seguridad: revisa la configuración:\n${texto}`);
}

/** Avisa cuántos usuarios y clientes siguen con una contraseña de prueba (se compara contra el hash; no se guarda nada). */
export async function avisarContrasenasDePrueba(): Promise<void> {
  try {
    const cuentas = await filas(
      pool,
      `SELECT c.nombre_usuario AS cuenta, c.password_hash AS hash
         FROM credenciales c JOIN usuario u ON u.id_usuario = c.id_usuario
        WHERE u.activo = TRUE AND u.eliminado_en IS NULL`,
    );
    const debiles: string[] = [];
    for (const { cuenta, hash } of cuentas) {
      for (const clave of CONTRASENAS_DE_PRUEBA) {
        if (await bcrypt.compare(clave, String(hash))) {
          debiles.push(String(cuenta));
          break;
        }
      }
    }
    if (debiles.length === 0) return;
    const aviso = `⚠ Seguridad: ${debiles.length} usuario(s) activo(s) usan una contraseña de prueba (${debiles.join(", ")}). Cámbiala(s) desde Gerente → Usuarios antes de entregar el sistema.`;
    if (enProduccion()) console.error(aviso);
    else console.warn(aviso);
  } catch (error) {
    console.error("No se pudo revisar las contraseñas de prueba:", error);
  }
}
