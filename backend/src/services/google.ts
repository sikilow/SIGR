import { OAuth2Client } from "google-auth-library";
import { GOOGLE_CLIENT_ID } from "../utils/config";
import { ErrorApi } from "../utils/errores";

/** Lo que Google asegura de la persona que eligió su cuenta (ya verificado con la firma de Google). */
export interface IdentidadGoogle {
  /** Identificador fijo de la cuenta de Google (no cambia aunque cambie el correo). */
  sub: string;
  correo: string;
  nombre: string;
  correoVerificado: boolean;
}

/** `true` cuando hay un ID de cliente de Google configurado en backend/.env (GOOGLE_CLIENT_ID). */
export function googleHabilitado(): boolean {
  return GOOGLE_CLIENT_ID !== "";
}

let cliente: OAuth2Client | null = null;

/**
 * Verifica el token de identidad que entrega «Iniciar sesión con Google»: la firma (certificados públicos de Google),
 * que no esté vencido y que sea para esta aplicación (`audience` = nuestro ID de cliente).
 */
export async function verificarTokenGoogle(credential: string): Promise<IdentidadGoogle> {
  if (!googleHabilitado()) {
    throw new ErrorApi(503, "desconocido", "El acceso con Google no está configurado.");
  }
  try {
    cliente ??= new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await cliente.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const datos = ticket.getPayload();
    if (!datos?.sub || !datos.email) throw new Error("El token no trae identificador o correo.");
    return {
      sub: datos.sub,
      correo: datos.email.toLowerCase(),
      nombre: (datos.name ?? datos.email).slice(0, 100),
      correoVerificado: datos.email_verified === true,
    };
  } catch {
    throw new ErrorApi(401, "credenciales_invalidas", "No se pudo verificar tu cuenta de Google. Inténtalo de nuevo.");
  }
}
