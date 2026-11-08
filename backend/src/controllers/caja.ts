import type { Request, Response } from "express";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { cargarCuenta, idDeRuta, idEstadoPedido, validar } from "../models/dominio";
import { calcularEfectivoEsperado, Pagos, validarImportes, validarMetodoSolicitado } from "../models/caja";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { conIdempotencia } from "../services/idempotencia";
import { ErrorApi } from "../utils/errores";

const AbrirCorte = z.object({ efectivo_inicial: z.number().finite().min(0).optional() }).strict();
const CerrarCorte = z
  .object({
    efectivo_contado: z.number().finite().min(0).optional(),
    tipo_cierre: z.enum(["parcial", "final"]).optional(),
    total_reportado: z.number().finite().min(0).optional(),
  })
  .strict()
  .refine((datos) => datos.efectivo_contado !== undefined || datos.total_reportado !== undefined, {
    message: "efectivo_contado es obligatorio",
  });

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

async function ventasDelCorte(ex: Ejecutor, idCorte: number) {
  const ventas = await filas(
    ex,
    `SELECT v.id_venta, v.id_cuenta, m.numero AS mesa_numero, v.fecha_hora, v.total,
            u.nombre AS cajero_nombre,
            (SELECT GROUP_CONCAT(DISTINCT um.nombre ORDER BY um.nombre SEPARATOR ' · ')
               FROM pedido p JOIN usuario um ON um.id_usuario = p.id_mesero
              WHERE p.id_cuenta = v.id_cuenta) AS mesero_nombre
       FROM venta v
       JOIN cuenta c ON c.id_cuenta = v.id_cuenta
       JOIN mesa m ON m.id_mesa = c.id_mesa
       JOIN usuario u ON u.id_usuario = v.id_cajero
      WHERE v.id_corte = ?
      ORDER BY v.fecha_hora, v.id_venta`,
    [idCorte],
  );
  const pagos = await filas(
    ex,
    `SELECT p.id_venta, mp.nombre AS metodo, p.monto, p.monto_recibido, p.cambio
       FROM pago p JOIN metodo_pago mp ON mp.id_metodo = p.id_metodo
       JOIN venta v ON v.id_venta = p.id_venta
      WHERE v.id_corte = ?
      ORDER BY p.id_venta, p.id_pago`,
    [idCorte],
  );
  const pagosPorVenta = new Map<number, typeof pagos>();
  for (const pago of pagos) {
    const idVenta = Number(pago.id_venta);
    const grupo = pagosPorVenta.get(idVenta) ?? [];
    grupo.push(pago);
    pagosPorVenta.set(idVenta, grupo);
  }

  return ventas.map((venta) => ({
    id_venta: Number(venta.id_venta),
    id_cuenta: Number(venta.id_cuenta),
    mesa_numero: Number(venta.mesa_numero),
    fecha_hora: venta.fecha_hora,
    total: Number(venta.total),
    cajero_nombre: String(venta.cajero_nombre),
    mesero_nombre: String(venta.mesero_nombre ?? ""),
    pagos: (pagosPorVenta.get(Number(venta.id_venta)) ?? []).map((pago) => ({
      metodo: String(pago.metodo),
      monto: Number(pago.monto),
      monto_recibido: Number(pago.monto_recibido),
      cambio: Number(pago.cambio),
    })),
  }));
}

async function resumenMetodosDelCorte(ex: Ejecutor, idCorte: number) {
  const metodos = await filas(ex, "SELECT id_metodo, nombre FROM metodo_pago ORDER BY id_metodo");
  const totales = await filas(
    ex,
    `SELECT p.id_metodo, COUNT(*) AS cantidad_pagos, COALESCE(SUM(p.monto), 0) AS monto
       FROM pago p JOIN venta v ON v.id_venta = p.id_venta
      WHERE v.id_corte = ?
      GROUP BY p.id_metodo`,
    [idCorte],
  );
  const porMetodo = new Map(totales.map((fila) => [Number(fila.id_metodo), fila]));
  return metodos.map((metodo) => {
    const total = porMetodo.get(Number(metodo.id_metodo));
    return {
      id_metodo: Number(metodo.id_metodo),
      nombre: String(metodo.nombre),
      cantidad_pagos: Number(total?.cantidad_pagos ?? 0),
      monto: Number(total?.monto ?? 0),
    };
  });
}

async function cargarCorte(ex: Ejecutor, idCorte: number) {
  const [corte] = await filas(
    ex,
    `SELECT cc.id_corte, cc.id_cajero, u.nombre AS cajero_nombre, cc.inicio, cc.fin,
            cc.efectivo_inicial, cc.efectivo_contado, cc.tipo_cierre, cc.total_reportado,
            COALESCE(SUM(v.total), 0) AS total_ventas
       FROM corte_caja cc JOIN usuario u ON u.id_usuario = cc.id_cajero
       LEFT JOIN venta v ON v.id_corte = cc.id_corte
      WHERE cc.id_corte = ?
      GROUP BY cc.id_corte, cc.id_cajero, u.nombre, cc.inicio, cc.fin, cc.efectivo_inicial,
               cc.efectivo_contado, cc.tipo_cierre, cc.total_reportado`,
    [idCorte],
  );
  if (!corte) throw new ErrorApi(500, "desconocido", `No se pudo recuperar el corte ${idCorte}.`);

  const metodos = await resumenMetodosDelCorte(ex, idCorte);
  const ventas = await ventasDelCorte(ex, idCorte);
  const efectivoEsperado = calcularEfectivoEsperado(Number(corte.efectivo_inicial), metodos);
  const efectivoContado = corte.efectivo_contado === null ? null : Number(corte.efectivo_contado);

  return {
    id_corte: Number(corte.id_corte),
    id_cajero: Number(corte.id_cajero),
    cajero_nombre: String(corte.cajero_nombre),
    inicio: corte.inicio,
    fin: corte.fin,
    efectivo_inicial: Number(corte.efectivo_inicial),
    total_ventas: Number(corte.total_ventas),
    efectivo_esperado: efectivoEsperado,
    efectivo_contado: efectivoContado,
    diferencia_efectivo: efectivoContado === null ? null : Math.round((efectivoContado - efectivoEsperado) * 100) / 100,
    tipo_cierre: (corte.tipo_cierre as "parcial" | "final" | null) ?? null,
    total_reportado: corte.total_reportado === null ? null : Number(corte.total_reportado),
    metodos_pago: metodos,
    ventas,
  };
}

/** GET /api/caja/estado: corte actual, cuentas solicitadas (incluidas las bloqueadas) y métodos disponibles. */
export const estadoCaja = async (req: Request, res: Response) => {
  const idCajero = req.usuario!.id;
  const [corteAbiertoFila] = await filas(
    pool,
    `SELECT cc.id_corte
       FROM corte_caja cc
      WHERE cc.id_cajero = ? AND cc.fin IS NULL
      ORDER BY cc.id_corte DESC LIMIT 1`,
    [idCajero],
  );
  const corte = corteAbiertoFila ? await cargarCorte(pool, Number(corteAbiertoFila.id_corte)) : null;
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
  const metodos = await filas(pool, "SELECT id_metodo, nombre FROM metodo_pago WHERE activo = 1 ORDER BY id_metodo");

  res.json({
    corte,
    cuentas,
    metodos_pago: metodos.map((metodo) => ({ id_metodo: Number(metodo.id_metodo), nombre: metodo.nombre as string })),
  });
};

/** POST /api/caja/cortes: abre un corte para el cajero autenticado. */
export const abrirCorte = async (req: Request, res: Response) => {
  const { efectivo_inicial = 0 } = validar(AbrirCorte, req.body);
  const idCajero = req.usuario!.id;
  const corte = await transaccion(async (cx) => {
    await bloquearCajero(cx, idCajero);
    if (await corteAbierto(cx, idCajero)) {
      throw new ErrorApi(409, "estado_invalido", "Ya tienes un corte de caja abierto.");
    }
    const { insertId } = await ejecutar(
      cx,
      "INSERT INTO corte_caja (id_cajero, inicio, efectivo_inicial) VALUES (?, NOW(), ?)",
      [idCajero, efectivo_inicial],
    );
    const [nuevo] = await filas(cx, "SELECT id_corte, inicio FROM corte_caja WHERE id_corte = ?", [insertId]);
    if (!nuevo) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el corte recién abierto.");
    return cargarCorte(cx, Number(nuevo.id_corte));
  });
  res.status(201).json(corte);
};

/** POST /api/caja/cortes/cerrar: guarda el total de ventas reportado y cierra el turno. */
export const cerrarCorte = async (req: Request, res: Response) => {
  const { efectivo_contado, tipo_cierre = "final", total_reportado } = validar(CerrarCorte, req.body);
  const efectivoFinal = efectivo_contado ?? total_reportado;
  if (efectivoFinal === undefined) throw new ErrorApi(422, "estado_invalido", "Indica el efectivo contado al cerrar.");
  const idCajero = req.usuario!.id;
  const corte = await transaccion(async (cx) => {
    await bloquearCajero(cx, idCajero);
    const abierto = await corteAbierto(cx, idCajero);
    if (!abierto) throw new ErrorApi(409, "estado_invalido", "No tienes un corte de caja abierto.");
    await ejecutar(
      cx,
      `UPDATE corte_caja
          SET fin = NOW(), efectivo_contado = ?, tipo_cierre = ?, total_reportado = ?
        WHERE id_corte = ? AND fin IS NULL`,
      [efectivoFinal, tipo_cierre, total_reportado ?? null, abierto.id_corte],
    );
    return cargarCorte(cx, Number(abierto.id_corte));
  });
  res.json(corte);
};

/** POST /api/caja/cuentas/:id/cobrar: cobra y cierra la cuenta atómicamente. */
export const cobrarCuenta = async (req: Request, res: Response) => {
  const idCuenta = idDeRuta(req.params.id);
  const { pagos, confirmar_cambio_metodo: confirmarCambioMetodo } = validar(Pagos, req.body);
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
      const metodos = await filas(cx, "SELECT id_metodo, nombre FROM metodo_pago WHERE id_metodo IN (?) AND activo = 1", [
        pagos.map((pago) => pago.id_metodo),
      ]);
      if (metodos.length !== pagos.length) throw new ErrorApi(422, "estado_invalido", "Hay un método de pago que no existe.");
      validarMetodoSolicitado(
        cuenta.tipo_pago_solicitado === "fisico" || cuenta.tipo_pago_solicitado === "digital"
          ? cuenta.tipo_pago_solicitado
          : null,
        pagos,
        metodos.map((metodo) => ({ id_metodo: Number(metodo.id_metodo), nombre: String(metodo.nombre) })),
        confirmarCambioMetodo,
      );
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
