import { z } from "zod";
import { ErrorApi } from "../utils/errores";

export const Pagos = z
  .object({
    confirmar_cambio_metodo: z.boolean().optional().default(false),
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

export function validarMetodoSolicitado(
  solicitado: "fisico" | "digital" | null,
  pagos: PagoEntrada[],
  metodos: Array<{ id_metodo: number; nombre: string }>,
  confirmarCambio: boolean,
): void {
  if (!solicitado) return;

  const nombres = new Map(metodos.map((metodo) => [metodo.id_metodo, metodo.nombre.toLocaleLowerCase()]));
  const tieneEfectivo = pagos.some((pago) => nombres.get(pago.id_metodo) === "efectivo");
  const tieneDigital = pagos.some((pago) => {
    const nombre = nombres.get(pago.id_metodo);
    return nombre !== undefined && nombre !== "efectivo";
  });
  const coincide = solicitado === "fisico" ? tieneEfectivo : tieneDigital;

  if (!coincide && !confirmarCambio) {
    throw new ErrorApi(
      422,
      "estado_invalido",
      "El método cobrado no coincide con el solicitado por el mesero. Confirma el cambio antes de continuar.",
    );
  }
}

export function calcularEfectivoEsperado(
  efectivoInicial: number,
  metodos: Array<{ nombre: string; monto: number }>,
): number {
  const efectivoCobrado = metodos
    .filter((metodo) => metodo.nombre.toLocaleLowerCase() === "efectivo")
    .reduce((total, metodo) => total + metodo.monto, 0);
  return Math.round((efectivoInicial + efectivoCobrado) * 100) / 100;
}

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

export interface CobroPorMetodo {
  metodo: string;
  cobros: number;
  monto: number;
}

export interface CuadreCorte {
  total_ventas: number;
  efectivo_esperado: number;
  diferencia: number | null;
}

/**
 * Cuadre del corte: solo el efectivo se cuenta en caja. `monto` de cada pago ya excluye el cambio entregado,
 * así que el efectivo esperado es el fondo inicial más lo cobrado en efectivo. Diferencia = contado - esperado.
 */
export function cuadrarCorte(fondoInicial: number, desglose: CobroPorMetodo[], efectivoContado: number | null): CuadreCorte {
  const totalVentas = desglose.reduce((suma, fila) => suma + centavos(fila.monto), 0);
  const efectivo = desglose
    .filter((fila) => fila.metodo.toLowerCase() === "efectivo")
    .reduce((suma, fila) => suma + centavos(fila.monto), 0);
  const esperado = centavos(fondoInicial) + efectivo;
  return {
    total_ventas: totalVentas / 100,
    efectivo_esperado: esperado / 100,
    diferencia: efectivoContado === null ? null : (centavos(efectivoContado) - esperado) / 100,
  };
}
