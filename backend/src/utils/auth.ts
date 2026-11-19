import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config";
import { ErrorApi } from "./errores";
import { conActorAuditoria } from "../services/contextoAuditoria";
import { filas, pool } from "../services/db";
import {
  cerrarSesionEmpleado,
  ipDe,
  minutosInactividad,
  registrarAcceso,
  registrarActividadSesion,
} from "../services/seguridadAcceso";

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
      /** Id de la sesión del personal (el `sid` del token); migración 031. */
      sesionId?: string;
    }
  }
}

/**
 * Exige un token válido (Authorization: Bearer <token>).
 * Si se pasan roles, además exige que el usuario tenga uno de ellos.
 *
 * Además de la firma del token, en CADA petición se consulta la base: si el usuario ya no existe, está desactivado o
 * eliminado, la sesión se rechaza de inmediato (el token dura 8 h, pero no debe seguir sirviendo). El rol que cuenta es
 * el de la base, así que un cambio de rol también se aplica al instante.
 *
 * El token lleva el id de su sesión (`sid`, tabla `sesion_empleado`): si la persona salió (`POST /api/auth/logout`) o pasó
 * demasiado tiempo sin actividad, el token deja de servir (`401 sesion_expirada`). Cuenta como actividad lo que la
 * pantalla avisa mientras la tocan (`POST /api/auth/actividad`) y cualquier petición que no sea de solo lectura; las
 * consultas automáticas que se repiten solas NO la mantienen viva. Los accesos rechazados quedan en `registro_acceso`.
 */
export function requiereAuth(...roles: Rol[]): RequestHandler {
  return async (req, _res, next) => {
    const ruta = `${req.method} ${req.baseUrl ?? ""}${req.path ?? ""}`;
    const ip = ipDe(req);
    const cabecera = req.headers.authorization;
    if (!cabecera?.startsWith("Bearer ")) {
      throw new ErrorApi(401, "no_autenticado", "Debes iniciar sesión.");
    }

    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(cabecera.slice(7), JWT_SECRET);
    } catch {
      void registrarAcceso({ ambito: "empleado", identificador: "token_invalido", resultado: "no_autorizado", detalle: "token inválido o vencido", ip, ruta });
      throw new ErrorApi(401, "no_autenticado", "La sesión no es válida o ya venció.");
    }
    if (typeof payload === "string" || typeof payload.id !== "number" || typeof payload.rol !== "string") {
      throw new ErrorApi(401, "no_autenticado", "La sesión no es válida.");
    }
    if (typeof payload.sid !== "string") {
      // Token de antes de la migración 031 (sin sesión en el servidor): hay que iniciar sesión otra vez.
      throw new ErrorApi(401, "sesion_expirada", "Tu sesión es de una versión anterior. Inicia sesión de nuevo.", { motivo: "sesion_antigua" });
    }
    const sid = payload.sid;
    const identificador = `id:${payload.id}`;
    // Solo se permiten roles de empleados.
    // Un cliente nunca puede autenticarse como empleado.
    const rolesEmpleados: Rol[] = [
      "gerente",
      "mesero",
      "cocinero",
      "cajero",
      "hostess",
    ];

    if (!rolesEmpleados.includes(payload.rol as Rol)) {
      throw new ErrorApi(
        403,
        "sin_permiso",
        "Esta ruta es exclusiva para empleados."
      );
    }

    // Los tokens de clientes tendrán tipo "cliente".
    // Nunca deben funcionar como sesiones de empleados.
    if (payload.tipo === "cliente") {
      throw new ErrorApi(
        403,
        "sin_permiso",
        "Esta ruta es exclusiva para empleados."
      );
    }

    // Estado actual del usuario en la base (no el del momento en que se emitió el token).
    const [actual] = await filas(
      pool,
      `SELECT u.activo, u.eliminado_en, LOWER(r.nombre) AS rol,
              s.id_sesion, s.cerrada_en, TIMESTAMPDIFF(SECOND, s.ultima_actividad, NOW()) AS inactivo_segundos
         FROM usuario u
         JOIN rol r ON r.id_rol = u.id_rol
         LEFT JOIN sesion_empleado s ON s.id_sesion = ? AND s.id_usuario = u.id_usuario
        WHERE u.id_usuario = ?`,
      [sid, payload.id],
    );
    if (!actual || !actual.activo || actual.eliminado_en) {
      throw new ErrorApi(
        401,
        "no_autenticado",
        "Tu cuenta ya no está activa. Si crees que es un error, consulta con el gerente.",
        { motivo: "cuenta_inactiva" },
      );
    }
    const rol = String(actual.rol) as Rol;
    if (!rolesEmpleados.includes(rol)) {
      throw new ErrorApi(403, "sin_permiso", "Esta ruta es exclusiva para empleados.");
    }

    // Sesión del servidor: existe, no la cerraron y no pasó demasiado tiempo sin actividad.
    if (!actual.id_sesion || actual.cerrada_en) {
      throw new ErrorApi(401, "sesion_expirada", "Tu sesión se cerró. Inicia sesión de nuevo.", { motivo: "sesion_cerrada" });
    }
    const limiteSegundos = minutosInactividad(rol) * 60;
    if (limiteSegundos > 0 && Number(actual.inactivo_segundos) >= limiteSegundos) {
      await cerrarSesionEmpleado(sid, "inactividad");
      void registrarAcceso({ ambito: "empleado", identificador, resultado: "sesion_expirada", detalle: "inactividad", ip, ruta });
      throw new ErrorApi(401, "sesion_expirada", "Tu sesión se cerró por inactividad. Inicia sesión de nuevo.", { motivo: "inactividad" });
    }
    // Lo que escribe o cambia algo cuenta como actividad; las consultas de solo lectura (las automáticas) no.
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      await registrarActividadSesion(sid);
    }

    if (roles.length > 0 && !roles.includes(rol)) {
      void registrarAcceso({ ambito: "empleado", identificador, resultado: "no_autorizado", detalle: `rol ${rol} sin permiso`, ip, ruta });
      throw new ErrorApi(
        403,
        "sin_permiso",
        "Tu rol no tiene permiso para esta acción."
      );
    }

    req.usuario = { id: payload.id, rol };
    req.sesionId = sid;
    conActorAuditoria(payload.id, next);

  };
}
