import type { NextFunction, Request, Response } from "express";

/**
 * Códigos que entiende el frontend (services/errores.ts → CodigoError).
 * Formato de respuesta de error: { codigo, mensaje, ...extra }
 */
export type CodigoError =
  | "no_autenticado"
  | "credenciales_invalidas"
  | "sin_permiso"
  | "requiere_gerente"
  | "no_encontrado"
  | "estado_invalido"
  | "producto_agotado"
  | "mesa_no_disponible"
  | "desconocido";

export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: CodigoError;
  readonly extra: Record<string, unknown>;

  constructor(estado: number, codigo: CodigoError, mensaje: string, extra: Record<string, unknown> = {}) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.extra = extra;
  }
}

/** Manejador global: cualquier error lanzado en una ruta (Express 5 captura las async) llega aquí. */
export function manejarErrores(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ErrorApi) {
    res.status(err.estado).json({ codigo: err.codigo, mensaje: err.message, ...err.extra });
    return;
  }
  // JSON mal formado en el cuerpo de la petición
  if (typeof err === "object" && err !== null && "status" in err && err.status === 400) {
    res.status(400).json({ codigo: "estado_invalido", mensaje: "El cuerpo de la petición no es un JSON válido." });
    return;
  }
  console.error(err);
  res.status(500).json({ codigo: "desconocido", mensaje: "Error interno del servidor." });
}
