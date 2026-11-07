import type { Request, Response } from "express";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { cargarCuenta, idDeRuta, idEstadoPedido, validar } from "../models/dominio";
import { Pagos, validarImportes } from "../models/caja";
import { ejecutar, filas, pool, transaccion } from "../services/db";
import { conIdempotencia } from "../services/idempotencia";
import { ErrorApi } from "../utils/errores";

const AbrirCorte = z.object({}).strict();
const CerrarCorte = z.object({ total_reportado: z.number().finite().min(0) }).strict();

async function bloquearCajero(cx: PoolConnection, idCajero: number): Promise<void> {
  const [usuario] = await filas(cx, "SELECT id_usuario FROM usuario WHERE id_usuario = ? FOR UPDATE", [idCajero]);
  if (!usuario) throw new ErrorApi(401, "no_autenticado", "La sesión no corresponde a un usuario activo.");
}

async function corteAbierto(cx: PoolConnection, idCajero: number) {
  const [corte] = await filas(
    cx,
    "SELECT id_corte, inicio FROM corte_caja WHERE id_cajero = ? AND fin IS NULL ORDER BY id_corte DESC LIMIT 1 FOR UPDATE",
    [idCajero],
  );
  return corte ?? null;
}

/** GET /api/caja/estado: corte actual, cuentas solicitadas (incluidas las bloqueadas) y métodos disponibles. */
export const estadoCaja = async (req: Request, res: Response) => {
  const idCajero = req.usuario!.id;
  const [corte] = await filas(
    pool,
    `SELECT cc.id_corte, cc.inicio, COALESCE(SUM(v.total), 0) AS total_ventas
       FROM corte_caja cc LEFT JOIN venta v ON v.id_corte = cc.id_corte
      WHERE cc.id_cajero = ? AND cc.fin IS NULL
      GROUP BY cc.id_corte, cc.inicio
      ORDER BY cc.id_corte DESC LIMIT 1`,
    [idCajero],
  );
  const filasCuentas = await filas(
    pool,
    `SELECT c.id_cuenta, m.numero AS mesa_numero
       FROM cuenta c JOIN mesa m ON m.id_mesa = c.id_mesa
      WHERE c.estado = 'por_pagar'
      ORDER BY c.abierta_en, c.id_cuenta`,
  );
  const cuentas = await Promise.all(
    filasCuentas.map(async (fila) => {
      const cuenta = await cargarCuenta(pool, Number(fila.id_cuenta));
      if (!cuenta) throw new ErrorApi(500, "desconocido", `No se pudo cargar la cuenta ${fila.id_cuenta}.`);
      return {
        cuenta,
        mesa_numero: Number(fila.mesa_numero),
        mesero_nombre: [...new Set(cuenta.pedidos.map((pedido) => pedido.nombre_mesero))].join(" · "),
        pedidos_sin_entregar: cuenta.pedidos
          .filter((pedido) => !["Entregado", "Cancelado"].includes(pedido.estado))
          .map((pedido) => ({ id_pedido: pedido.id_pedido, estado: pedido.estado })),
      };
    }),
  );
  const metodos = await filas(pool, "SELECT id_metodo, nombre FROM metodo_pago ORDER BY id_metodo");

  res.json({
    corte: corte
      ? { id_corte: Number(corte.id_corte), inicio: corte.inicio, total_ventas: Number(corte.total_ventas) }
      : null,
    cuentas,
    metodos_pago: metodos.map((metodo) => ({ id_metodo: Number(metodo.id_metodo), nombre: metodo.nombre as string })),
  });
};

/** POST /api/caja/cortes: abre un corte para el cajero autenticado. */
export const abrirCorte = async (req: Request, res: Response) => {
  validar(AbrirCorte, req.body);
  const idCajero = req.usuario!.id;
  const corte = await transaccion(async (cx) => {
    await bloquearCajero(cx, idCajero);
    if (await corteAbierto(cx, idCajero)) {
      throw new ErrorApi(409, "estado_invalido", "Ya tienes un corte de caja abierto.");
    }
    const { insertId } = await ejecutar(cx, "INSERT INTO corte_caja (id_cajero, inicio) VALUES (?, NOW())", [idCajero]);
    const [nuevo] = await filas(cx, "SELECT id_corte, inicio FROM corte_caja WHERE id_corte = ?", [insertId]);
    if (!nuevo) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el corte recién abierto.");
    return { id_corte: Number(nuevo.id_corte), inicio: nuevo.inicio as string, total_ventas: 0 };
  });
  res.status(201).json(corte);
};

/** POST /api/caja/cortes/cerrar: guarda el total de ventas reportado y cierra el turno. */
export const cerrarCorte = async (req: Request, res: Response) => {
  const { total_reportado } = validar(CerrarCorte, req.body);
  const idCajero = req.usuario!.id;
  const corte = await transaccion(async (cx) => {
    await bloquearCajero(cx, idCajero);
    const abierto = await corteAbierto(cx, idCajero);
    if (!abierto) throw new ErrorApi(409, "estado_invalido", "No tienes un corte de caja abierto.");
    const [resumen] = await filas(
      cx,
      "SELECT COALESCE(SUM(total), 0) AS total_ventas FROM venta WHERE id_corte = ?",
      [abierto.id_corte],
    );
    if (!resumen) throw new ErrorApi(500, "desconocido", "No se pudo calcular el total del corte.");
    await ejecutar(
      cx,
      "UPDATE corte_caja SET fin = NOW(), total_reportado = ? WHERE id_corte = ? AND fin IS NULL",
      [total_reportado, abierto.id_corte],
    );
    const [corteCerrado] = await filas(cx, "SELECT fin FROM corte_caja WHERE id_corte = ?", [abierto.id_corte]);
    if (!corteCerrado) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el corte cerrado.");
    return {
      id_corte: Number(abierto.id_corte),
      inicio: abierto.inicio as string,
      fin: corteCerrado.fin as string,
      total_ventas: Number(resumen.total_ventas),
      total_reportado,
      diferencia: Math.round((total_reportado - Number(resumen.total_ventas)) * 100) / 100,
    };
  });
  res.json(corte);
};

/** POST /api/caja/cuentas/:id/cobrar: cobra y cierra la cuenta atómicamente. */
export const cobrarCuenta = async (req: Request, res: Response) => {
  const idCuenta = idDeRuta(req.params.id);
  const { pagos } = validar(Pagos, req.body);
  const idCajero = req.usuario!.id;

  await conIdempotencia(req, res, 201, () =>
    transaccion(async (cx) => {
      await bloquearCajero(cx, idCajero);
      const corte = await corteAbierto(cx, idCajero);
      if (!corte) throw new ErrorApi(409, "estado_invalido", "Abre un corte de caja antes de cobrar.");

      const [fila] = await filas(
        cx,
        `SELECT c.id_cuenta, c.id_mesa, c.estado, m.numero AS mesa_numero
           FROM cuenta c JOIN mesa m ON m.id_mesa = c.id_mesa
          WHERE c.id_cuenta = ? FOR UPDATE`,
        [idCuenta],
      );
      if (!fila) throw new ErrorApi(404, "no_encontrado", `La cuenta ${idCuenta} no existe.`);
      if (fila.estado !== "por_pagar") {
        throw new ErrorApi(409, "estado_invalido", "Solo se pueden cobrar cuentas solicitadas por el mesero.");
      }

      const cuenta = await cargarCuenta(cx, idCuenta);
      if (!cuenta || cuenta.total <= 0) throw new ErrorApi(409, "estado_invalido", "La cuenta no tiene pedidos activos.");
      const pedidosSinEntregar = cuenta.pedidos.filter((pedido) => !["Entregado", "Cancelado"].includes(pedido.estado));
      if (pedidosSinEntregar.length) {
        throw new ErrorApi(409, "estado_invalido", "No se puede cobrar: hay pedidos que aún no se han entregado.", {
          pedidos: pedidosSinEntregar.map(({ id_pedido, estado }) => ({ id_pedido, estado })),
        });
      }

      const totales = validarImportes(cuenta.total, pagos);
      const metodos = await filas(cx, "SELECT id_metodo, nombre FROM metodo_pago WHERE id_metodo IN (?)", [
        pagos.map((pago) => pago.id_metodo),
      ]);
      if (metodos.length !== pagos.length) throw new ErrorApi(422, "estado_invalido", "Hay un método de pago que no existe.");
      const nombreMetodo = new Map(metodos.map((metodo) => [Number(metodo.id_metodo), String(metodo.nombre)]));
      for (const [i, pago] of pagos.entries()) {
        const recibido = totales.recibidos[i];
        if (recibido === undefined) throw new ErrorApi(500, "desconocido", "No se pudo validar el importe recibido.");
        if (recibido > pago.monto && nombreMetodo.get(pago.id_metodo)?.toLowerCase() !== "efectivo") {
          throw new ErrorApi(422, "estado_invalido", "Solo se puede recibir un importe mayor al aplicado en pagos en efectivo.");
        }
      }

      const { insertId: idVenta } = await ejecutar(
        cx,
        "INSERT INTO venta (id_cuenta, id_corte, id_cajero, total) VALUES (?, ?, ?, ?)",
        [idCuenta, corte.id_corte, idCajero, cuenta.total],
      );
      const valores = pagos.map((pago, i) => {
        const recibido = totales.recibidos[i];
        if (recibido === undefined) throw new ErrorApi(500, "desconocido", "No se pudo guardar el importe recibido.");
        return [idVenta, pago.id_metodo, pago.monto, recibido, Math.round((recibido - pago.monto) * 100) / 100];
      });
      await cx.query(
        "INSERT INTO pago (id_venta, id_metodo, monto, monto_recibido, cambio) VALUES ?",
        [valores],
      );

      const estadoPagado = await idEstadoPedido(cx, "pagado");
      await ejecutar(
        cx,
        `UPDATE pedido SET id_estado = ?
          WHERE id_cuenta = ? AND id_estado <> (SELECT id_estado FROM estado_pedido WHERE nombre = 'Cancelado')`,
        [estadoPagado, idCuenta],
      );
      await ejecutar(cx, "UPDATE cuenta SET estado = 'cerrada', cerrada_en = NOW() WHERE id_cuenta = ?", [idCuenta]);
      await ejecutar(cx, "UPDATE mesa SET estado = 'libre' WHERE id_mesa = ?", [fila.id_mesa]);

      return {
        venta: {
          id_venta: Number(idVenta),
          fecha_hora: new Date().toISOString(),
          total: cuenta.total,
          id_cuenta: idCuenta,
          mesa_numero: Number(fila.mesa_numero),
          pagos: pagos.map((pago, i) => {
            const recibido = totales.recibidos[i];
            const metodo = nombreMetodo.get(pago.id_metodo);
            if (recibido === undefined || !metodo) {
              throw new ErrorApi(500, "desconocido", "No se pudo armar el comprobante del cobro.");
            }
            return {
              metodo,
              monto: pago.monto,
              monto_recibido: recibido,
              cambio: Math.round((recibido - pago.monto) * 100) / 100,
            };
          }),
          cambio: totales.cambio,
        },
      };
    }),
  );
};
