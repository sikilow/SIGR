import { Router } from "express";
import { z } from "zod";
import { ejecutar, filas, pool } from "../db";
import { cargarCuenta, idDeRuta, validar } from "../dominio";
import { ErrorApi } from "../errores";
import { requiereAuth } from "../middlewares/auth";

export const cuentasRouter = Router();

const SolicitudPago = z.object({ tipo: z.enum(["fisico", "digital"]) });

/** POST /api/cuentas/:id/solicitar-pago  { tipo }  →  cuenta en estado `por_pagar` */
cuentasRouter.post("/:id/solicitar-pago", requiereAuth("mesero", "gerente"), async (req, res) => {
  const id = idDeRuta(req.params.id);
  const { tipo } = validar(SolicitudPago, req.body);

  const [cuenta] = await filas(pool, "SELECT estado FROM cuenta WHERE id_cuenta = ?", [id]);
  if (!cuenta) throw new ErrorApi(404, "no_encontrado", `La cuenta ${id} no existe.`);
  if (cuenta.estado !== "abierta") throw new ErrorApi(409, "estado_invalido", "La cuenta no está abierta.");

  // `AND estado = 'abierta'` evita que dos peticiones simultáneas la soliciten dos veces.
  const r = await ejecutar(
    pool,
    "UPDATE cuenta SET estado = 'por_pagar', tipo_pago_solicitado = ? WHERE id_cuenta = ? AND estado = 'abierta'",
    [tipo, id],
  );
  if (r.affectedRows === 0) throw new ErrorApi(409, "estado_invalido", "La cuenta no está abierta.");

  res.json(await cargarCuenta(pool, id));
});
