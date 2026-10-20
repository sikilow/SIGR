import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool } from "../services/db";
import { cargarCuenta, idDeRuta, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { conIdempotencia } from "../services/idempotencia";

// cuenta.tipo_pago_solicitado ('fisico' | 'digital'); se acepta `tipo` como alias para pruebas manuales.
const SolicitudPago = z
  .object({
    tipo_pago_solicitado: z.enum(["fisico", "digital"]).optional(),
    tipo: z.enum(["fisico", "digital"]).optional(),
  })
  .refine((d) => d.tipo_pago_solicitado ?? d.tipo, { message: "tipo_pago_solicitado es obligatorio" })
  .transform((d) => ({ tipo: (d.tipo_pago_solicitado ?? d.tipo)! }));

/** POST /api/cuentas/:id/solicitar-pago  { tipo_pago_solicitado }  →  cuenta en estado `por_pagar`. Acepta Idempotency-Key. */
export const solicitarPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { tipo } = validar(SolicitudPago, req.body);

  await conIdempotencia(req, res, 200, async () => {
    const [cuenta] = await filas(pool, "SELECT estado FROM cuenta WHERE id_cuenta = ?", [id]);
    if (!cuenta) throw new ErrorApi(404, "no_encontrado", `La cuenta ${id} no existe.`);
    if (cuenta.estado !== "abierta") throw new ErrorApi(409, "estado_invalido", "La cuenta no está abierta.");

    // Sin pedidos vigentes (todos cancelados o ninguno) no hay nada que cobrar.
    const actual = await cargarCuenta(pool, id);
    if (!actual || actual.total === 0) {
      throw new ErrorApi(409, "estado_invalido", "La cuenta no tiene pedidos activos.");
    }

    // `AND estado = 'abierta'` evita que dos peticiones simultáneas la soliciten dos veces.
    const r = await ejecutar(
      pool,
      "UPDATE cuenta SET estado = 'por_pagar', tipo_pago_solicitado = ? WHERE id_cuenta = ? AND estado = 'abierta'",
      [tipo, id],
    );
    if (r.affectedRows === 0) throw new ErrorApi(409, "estado_invalido", "La cuenta no está abierta.");

    return cargarCuenta(pool, id);
  });
};
