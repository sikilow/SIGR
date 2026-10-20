import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config";
import { ErrorApi } from "./errores";

export type Rol = "gerente" | "mesero" | "cocinero" | "cajero" | "hostess";

export interface UsuarioSesion {
  id: number;
  rol: Rol;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioSesion;
    }
  }
}

/**
 * Exige un token válido (Authorization: Bearer <token>).
 * Si se pasan roles, además exige que el usuario tenga uno de ellos.
 */
export function requiereAuth(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    const cabecera = req.headers.authorization;
    if (!cabecera?.startsWith("Bearer ")) {
      throw new ErrorApi(401, "no_autenticado", "Debes iniciar sesión.");
    }

    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(cabecera.slice(7), JWT_SECRET);
    } catch {
      throw new ErrorApi(401, "no_autenticado", "La sesión no es válida o ya venció.");
    }
    if (typeof payload === "string" || typeof payload.id !== "number" || typeof payload.rol !== "string") {
      throw new ErrorApi(401, "no_autenticado", "La sesión no es válida.");
    }

    const rol = payload.rol as Rol;
    if (roles.length > 0 && !roles.includes(rol)) {
      throw new ErrorApi(403, "sin_permiso", "Tu rol no tiene permiso para esta acción.");
    }
    req.usuario = { id: payload.id, rol };
    next();
  };
}
