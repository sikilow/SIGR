// Reglas de qué caracteres acepta cada tipo de campo. Es la MISMA regla que usa el frontend
// (frontend/src/utils/campos.ts): si cambias una, cambia la otra. Aquí se aplica de verdad, porque el navegador
// se puede saltar (por ejemplo, con una petición directa a la API).
import { z } from "zod";

/** Nombre de persona: letras (con acentos y ñ), espacios y . ' - (como en «Ma. Luisa», «O'Brien», «Ana-Luisa»). */
export const REGEX_NOMBRE_PERSONA = /^\p{L}[\p{L}\p{M} .'-]*$/u;
/** Nombre de producto, sección, categoría, canal…: letras, números, espacios y . , - ' / & ( ) % */
export const REGEX_TEXTO_CATALOGO = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} .,'\-/&()%]*$/u;
/** Notas, descripciones, indicaciones: letras, números, espacios, saltos de línea y puntuación común. */
export const REGEX_NOTA = /^[\p{L}\p{N}\p{M} \n\r.,;:!¡?¿()'"\-/%&#+]*$/u;
/** Usuario para iniciar sesión: letras sin acento, números, punto, guion y guion bajo. */
export const REGEX_USUARIO = /^[A-Za-z0-9._-]+$/;
/** Correo: caracteres normales de una dirección, sin espacios ni símbolos raros. */
export const REGEX_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export const MENSAJE_NOMBRE_PERSONA = "solo letras y espacios (también . ' -)";
export const MENSAJE_TEXTO_CATALOGO = "solo letras, números y espacios (también . , - ' / & ( ) %)";
export const MENSAJE_NOTA = "solo letras, números, espacios y puntuación común";

export const nombrePersona = (max: number) =>
  z.string().trim().min(1, "es obligatorio").max(max, `máximo ${max} caracteres`).regex(REGEX_NOMBRE_PERSONA, MENSAJE_NOMBRE_PERSONA);

export const textoCatalogo = (max: number) =>
  z.string().trim().min(1, "es obligatorio").max(max, `máximo ${max} caracteres`).regex(REGEX_TEXTO_CATALOGO, MENSAJE_TEXTO_CATALOGO);

/** Igual que `textoCatalogo` pero puede ir vacío (por ejemplo la presentación de un producto). */
export const textoCatalogoOpcional = (max: number) =>
  z.string().trim().max(max, `máximo ${max} caracteres`).refine((t) => t === "" || REGEX_TEXTO_CATALOGO.test(t), MENSAJE_TEXTO_CATALOGO);

export const nota = (max: number) =>
  z.string().trim().max(max, `máximo ${max} caracteres`).regex(REGEX_NOTA, MENSAJE_NOTA);

/**
 * Deja un nombre que viene de fuera (por ejemplo, de la cuenta de Google) con solo los caracteres permitidos en un
 * nombre de persona. Si no queda nada útil, usa la parte del correo antes de la @ o «Cliente».
 */
export function limpiarNombrePersona(texto: string, correoRespaldo = ""): string {
  const limpiar = (t: string) =>
    t
      .replace(/[^\p{L}\p{M} .'-]/gu, " ")
      .replace(/\s+/g, " ")
      .replace(/^[^\p{L}]+/u, "")
      .trim()
      .slice(0, 100);
  const nombre = limpiar(texto);
  if (nombre.length >= 2) return nombre;
  const deCorreo = limpiar(correoRespaldo.split("@")[0] ?? "");
  return deCorreo.length >= 2 ? deCorreo : "Cliente";
}

/** Importe en pesos: no negativo, con a lo más 2 decimales. */
const dosDecimales = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export const importe = (max: number) =>
  z.number().finite("debe ser un número").min(0, "no puede ser negativo").max(max, "es demasiado grande").refine(dosDecimales, "máximo 2 decimales");

/** Importe mayor a cero (un pago). */
export const importePositivo = (max: number) =>
  z.number().finite("debe ser un número").positive("debe ser mayor a 0").max(max, "es demasiado grande").refine(dosDecimales, "máximo 2 decimales");

/** Lada = código de país del teléfono, solo dígitos y sin «+» («52», «1»…). Si no se manda, es México. */
export const LADA_MEXICO = "52";
export const lada = z.string().trim().regex(/^\d{1,4}$/, "lada no válida: solo dígitos, de 1 a 4");

/** Solo dígitos; cuántos, depende de la lada (ver `refinarTelefonoConLada`). */
export const telefono = z.string().trim().regex(/^\d{6,15}$/, "el teléfono solo lleva dígitos (de 6 a 15)");

/**
 * Países que ofrece el selector de lada y cuántos dígitos tiene su número nacional (sin el código de país).
 * Es la MISMA tabla que usa el frontend (frontend/src/utils/lada.ts): si cambias una, cambia la otra.
 */
export interface PaisLada {
  /** Solo dígitos, sin «+». */
  codigo: string;
  pais: string;
  min: number;
  max: number;
}

export const PAISES_LADA: readonly PaisLada[] = [
  { codigo: "52", pais: "México", min: 10, max: 10 },
  { codigo: "1", pais: "EE. UU. y Canadá", min: 10, max: 10 },
  { codigo: "54", pais: "Argentina", min: 10, max: 11 },
  { codigo: "591", pais: "Bolivia", min: 8, max: 8 },
  { codigo: "55", pais: "Brasil", min: 10, max: 11 },
  { codigo: "56", pais: "Chile", min: 9, max: 9 },
  { codigo: "86", pais: "China", min: 11, max: 11 },
  { codigo: "57", pais: "Colombia", min: 10, max: 10 },
  { codigo: "506", pais: "Costa Rica", min: 8, max: 8 },
  { codigo: "593", pais: "Ecuador", min: 9, max: 9 },
  { codigo: "503", pais: "El Salvador", min: 8, max: 8 },
  { codigo: "34", pais: "España", min: 9, max: 9 },
  { codigo: "33", pais: "Francia", min: 9, max: 9 },
  { codigo: "49", pais: "Alemania", min: 10, max: 13 },
  { codigo: "502", pais: "Guatemala", min: 8, max: 8 },
  { codigo: "504", pais: "Honduras", min: 8, max: 8 },
  { codigo: "507", pais: "Panamá", min: 8, max: 8 },
  { codigo: "51", pais: "Perú", min: 8, max: 9 },
  { codigo: "44", pais: "Reino Unido", min: 10, max: 10 },
  { codigo: "598", pais: "Uruguay", min: 8, max: 8 },
  { codigo: "58", pais: "Venezuela", min: 10, max: 10 },
];

/** Rango de dígitos de una lada; si no está en la tabla (otro país ya guardado), un rango amplio. */
export function rangoTelefono(lada: string): { min: number; max: number } {
  const pais = PAISES_LADA.find((p) => p.codigo === lada);
  return pais ? { min: pais.min, max: pais.max } : { min: 6, max: 14 };
}

/** Mensaje de error si el teléfono no tiene los dígitos que pide esa lada; `null` si está bien. */
export function errorTelefonoLada(lada: string, telefono: string): string | null {
  if (!/^\d+$/.test(telefono)) return "el teléfono solo lleva dígitos";
  const { min, max } = rangoTelefono(lada);
  if (telefono.length >= min && telefono.length <= max) return null;
  return `el teléfono de +${lada} debe tener ${min === max ? `${min} dígitos` : `de ${min} a ${max} dígitos`}`;
}

/** Para `.superRefine` de un objeto con `telefono` y (opcional) `lada`: valida uno contra la otra. */
export function refinarTelefonoConLada(d: { telefono?: string | null | undefined; lada?: string | undefined }, ctx: z.RefinementCtx): void {
  if (!d.telefono) return;
  const mensaje = errorTelefonoLada(d.lada ?? LADA_MEXICO, d.telefono);
  if (mensaje) ctx.addIssue({ code: "custom", path: ["telefono"], message: mensaje });
}



export const correo = z.string().trim().max(120, "máximo 120 caracteres").regex(REGEX_CORREO, "no es un correo válido");
