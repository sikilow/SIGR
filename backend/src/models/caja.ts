import { z } from "zod";
import { ErrorApi } from "../utils/errores";

export const Pagos = z
  .object({
    pagos: z
      .array(
        z
          .object({
            id_metodo: z.number().int().positive(),
            monto: z.number().finite().positive(),
            monto_recibido: z.number().finite().positive().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();

export type PagoEntrada = z.infer<typeof Pagos>["pagos"][number];

const centavos = (monto: number): number => Math.round(monto * 100);

export function validarImportes(total: number, pagos: PagoEntrada[]): { cambio: number; recibidos: number[] } {
  const metodos = new Set(pagos.map((pago) => pago.id_metodo));
  if (metodos.size !== pagos.length) {
    throw new ErrorApi(422, "estado_invalido", "Cada método de pago solo puede agregarse una vez.");
  }

  if (pagos.reduce((suma, pago) => suma + centavos(pago.monto), 0) !== centavos(total)) {
    throw new ErrorApi(422, "estado_invalido", "La suma de los pagos debe cubrir exactamente el total de la cuenta.");
  }

  const recibidoPorPago = pagos.map((pago) => {
    const recibido = pago.monto_recibido ?? pago.monto;
    if (centavos(recibido) < centavos(pago.monto)) {
      throw new ErrorApi(422, "estado_invalido", "El importe recibido no puede ser menor al importe aplicado.");
    }
    return recibido;
  });

  return {
    cambio: Math.round(
      pagos.reduce((suma, pago, i) => suma + centavos(recibidoPorPago[i] ?? pago.monto) - centavos(pago.monto), 0),
    ) / 100,
    recibidos: recibidoPorPago,
  };
}
