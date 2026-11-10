import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { cargarCuenta, idDeRuta, pedidosSinEntregar, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { conIdempotencia } from "../services/idempotencia";

// La modalidad y el método concreto permiten a caja precargar el medio elegido por el cliente.
const SolicitudPago = z
  .object({
    tipo_pago_solicitado: z.enum(["fisico", "digital"]).optional(),
    tipo: z.enum(["fisico", "digital"]).optional(),
    id_metodo_pago_solicitado: z.number().int().positive().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    const tipo = d.tipo_pago_solicitado ?? d.tipo;
    if (!tipo) ctx.addIssue({ code: "custom", message: "tipo_pago_solicitado es obligatorio" });
    if (tipo === "digital" && !d.id_metodo_pago_solicitado) {
      ctx.addIssue({ code: "custom", path: ["id_metodo_pago_solicitado"], message: "El método digital es obligatorio" });
    }
  })
  .transform((d) => ({
    tipo: (d.tipo_pago_solicitado ?? d.tipo)!,
    idMetodo: d.id_metodo_pago_solicitado ?? null,
  }));

/** POST /api/cuentas/:id/solicitar-pago → cuenta `por_pagar` cuando todos los pedidos activos fueron entregados. */
export const solicitarPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { tipo, idMetodo } = validar(SolicitudPago, req.body);

  await conIdempotencia(req, res, 200, async () => {
    return transaccion(async (cx) => {
      const [cuenta] = await filas(cx, "SELECT estado FROM cuenta WHERE id_cuenta = ? FOR UPDATE", [id]);
      if (!cuenta) throw new ErrorApi(404, "no_encontrado", `La cuenta ${id} no existe.`);
      if (cuenta.estado !== "abierta") throw new ErrorApi(409, "estado_invalido", "La cuenta no está abierta.");

      // Sin pedidos vigentes (todos cancelados o ninguno) no hay nada que cobrar.
      const actual = await cargarCuenta(cx, id);
      if (!actual || actual.total === 0) {
        throw new ErrorApi(409, "estado_invalido", "La cuenta no tiene pedidos activos.");
      }
      if (pedidosSinEntregar(actual.pedidos).length > 0) {
        throw new ErrorApi(409, "estado_invalido", "Entrega todos los pedidos antes de solicitar la cuenta.");
      }
      if (idMetodo !== null) {
        const [metodo] = await filas(
          cx,
          `SELECT mp.activo, mp.es_efectivo, cmp.tipo, cmp.activo AS categoria_activa
             FROM metodo_pago mp JOIN categoria_metodo_pago cmp USING (id_categoria_metodo_pago)
            WHERE mp.id_metodo = ? FOR UPDATE`,
          [idMetodo],
        );
        if (
          !metodo ||
          !Boolean(metodo.activo) ||
          !Boolean(metodo.categoria_activa) ||
          metodo.tipo !== tipo ||
          (tipo === "digital" && Boolean(metodo.es_efectivo))
        ) {
          throw new ErrorApi(422, "estado_invalido", "Elige un método activo de la categoría seleccionada.");
        }
      }

      await ejecutar(
        cx,
        "UPDATE cuenta SET estado = 'por_pagar', tipo_pago_solicitado = ?, id_metodo_pago_solicitado = ? WHERE id_cuenta = ? AND estado = 'abierta'",
        [tipo, idMetodo, id],
      );
      return cargarCuenta(cx, id);
    });
  });
};
