// Política de contraseñas (personal y clientes). La misma regla vive en `frontend/src/utils/campos.ts` para avisar al
// escribir; aquí se aplica de verdad.
import { z } from "zod";

export const CONTRASENA_MIN = 8;
export const CONTRASENA_MAX = 72; // bcrypt solo usa los primeros 72 bytes

export const MENSAJE_CONTRASENA = "Mínimo 8 caracteres, con al menos una letra y un número.";

/** Contraseñas que se adivinan primero. Se compara sin mayúsculas ni espacios. */
const COMUNES = new Set([
  "12345678", "123456789", "1234567890", "11111111", "00000000", "87654321", "12341234", "1234abcd", "abcd1234", "a1234567",
  "password", "password1", "password123", "passw0rd", "contrasena", "contrasena1", "contraseña1", "contrasena123",
  "qwerty123", "qwertyui", "admin123", "admin1234", "administrador1", "bienvenido1", "restaurante1", "madalena123",
  "iloveyou1", "welcome1", "welcome123", "letmein123", "sigr1234", "sigr2026",
]);

/**
 * Devuelve el motivo por el que la contraseña no sirve, o `null` si cumple: de 8 a 72 caracteres, con letras y números,
 * que no sea de las más comunes y que no contenga el nombre de usuario (si se indica).
 */
export function errorContrasena(valor: string, usuario?: string): string | null {
  if (valor.length < CONTRASENA_MIN) return "La contraseña debe tener al menos 8 caracteres.";
  if (valor.length > CONTRASENA_MAX) return "La contraseña no puede pasar de 72 caracteres.";
  if (!/\p{L}/u.test(valor) || !/\d/.test(valor)) return "La contraseña debe tener al menos una letra y un número.";
  const plano = valor.toLowerCase().replace(/\s/g, "");
  if (COMUNES.has(plano)) return "Esa contraseña es muy común. Elige otra más difícil de adivinar.";
  const u = usuario?.trim().toLowerCase();
  if (u && u.length >= 3 && plano.includes(u)) return "La contraseña no puede contener el nombre de usuario.";
  return null;
}

/** Esquema zod: `Contrasena` sola, o `contrasenaSegura(() => usuario)` si hay que compararla con el nombre de usuario. */
export const Contrasena = z.string().superRefine((valor, ctx) => {
  const motivo = errorContrasena(valor);
  if (motivo) ctx.addIssue({ code: "custom", message: motivo });
});
