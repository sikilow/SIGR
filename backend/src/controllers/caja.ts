import type { Request, Response } from "express";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { cargarCuenta, idDeRuta, idEstadoPedido, validar } from "../models/dominio";
import { cuadrarCorte, Pagos, validarImportes, type CobroPorMetodo } from "../models/caja";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { conIdempotencia } from "../services/idempotencia";
import { ErrorApi } from "../utils/errores";

const Importe = z.number().finite().min(0).max(9_999_999_999.99);
const AbrirCorte = z.object({ fondo_inicial: Importe }).strict();
const CerrarCorte = z.object({ efectivo_contado: Importe }).strict();

function esFechaISOValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaUTC = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isFinite(fechaUTC.getTime()) && fechaUTC.toISOString().slice(0, 10) === fecha;
}

const FechaISO = z.string().refine(esFechaISOValida, "la fecha debe tener formato AAAA-MM-DD");
const FiltroCortes = z.object({ desde: FechaISO.optional(), hasta: FechaISO.optional() });

const redondear = (monto: number): number => Math.round(monto * 100) / 100;

/** Columnas comunes del historial y del detalle de un corte (con ventas agregadas). */
const SELECT_CORTE = `
  SELECT cc.id_corte, cc.id_cajero, u.nombre AS cajero_nombre, cc.inicio, cc.fin,
         cc.fondo_inicial, cc.efectivo_esperado, cc.efectivo_contado, cc.total_reportado,
         COUNT(v.id_venta) AS cobros, COALESCE(SUM(v.total), 0) AS total_ventas
    FROM corte_caja cc
    JOIN usuario u ON u.id_usuario = cc.id_cajero
    LEFT JOIN venta v ON v.id_corte = cc.id_corte`;

type FilaCorte = Awaited<ReturnType<typeof filas>>[number];

function aCorteResumen(fila: FilaCorte) {
  const contado = fila.efectivo_contado === null ? null : Number(fila.efectivo_contado);
  const esperado = fila.efectivo_esperado === null ? null : Number(fila.efectivo_esperado);
  return {
    id_corte: Number(fila.id_corte),
    cajero_nombre: String(fila.cajero_nombre),
    inicio: fila.inicio as string,
    fin: fila.fin as string | null,
    fondo_inicial: Number(fila.fondo_inicial),
    cobros: Number(fila.cobros),
    total_ventas: Number(fila.total_ventas),
    efectivo_esperado: esperado,
    efectivo_contado: contado,
    diferencia: contado === null || esperado === null ? null : redondear(contado - esperado),
    // Solo cortes anteriores a la migración 015: total de ventas que se reportaba sin contar efectivo.
    total_reportado: fila.total_reportado === null ? null : Number(fila.total_reportado),
  };
}

/** Cobros del corte por método de pago; incluye los métodos sin cobros para que el corte impreso sea completo. */
async function desgloseCorte(ex: Ejecutor, idCorte: number): Promise<CobroPorMetodo[]> {
  const filasDesglose = await filas(
    ex,
    `SELECT mp.nombre AS metodo, COUNT(p.id_pago) AS cobros, COALESCE(SUM(p.monto), 0) AS monto
       FROM metodo_pago mp
       LEFT JOIN (pago p JOIN venta v ON v.id_venta = p.id_venta AND v.id_corte = ?) ON p.id_metodo = mp.id_metodo
      GROUP BY mp.id_metodo, mp.nombre
      ORDER BY mp.id_metodo`,
    [idCorte],
  );
  return filasDesglose.map((fila) => ({ metodo: String(fila.metodo), cobros: Number(fila.cobros), monto: Number(fila.monto) }));
}

async function cargarDetalleCorte(ex: Ejecutor, idCorte: number) {
  const [fila] = await filas(ex, `${SELECT_CORTE} WHERE cc.id_corte = ? GROUP BY cc.id_corte`, [idCorte]);
  if (!fila) return null;
  const resumen = aCorteResumen(fila);
  const desglose = await desgloseCorte(ex, idCorte);
  // Cortes anteriores a la 015 no guardaron el esperado: se calcula con sus pagos.
  const cuadre = cuadrarCorte(resumen.fondo_inicial, desglose, resumen.efectivo_contado);
  return {
    ...resumen,
    id_cajero: Number(fila.id_cajero),
    efectivo_esperado: resumen.efectivo_esperado ?? cuadre.efectivo_esperado,
    diferencia: resumen.diferencia ?? cuadre.diferencia,
    desglose,
  };
}

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
  // Sin totales de venta: el cajero cuenta el efectivo al cerrar sin conocer lo esperado.
  const [corte] = await filas(
    pool,
    `SELECT cc.id_corte, cc.inicio, cc.fondo_inicial, COUNT(v.id_venta) AS cobros
       FROM corte_caja cc LEFT JOIN venta v ON v.id_corte = cc.id_corte
      WHERE cc.id_cajero = ? AND cc.fin IS NULL
      GROUP BY cc.id_corte, cc.inicio, cc.fondo_inicial
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
      ? {
          id_corte: Number(corte.id_corte),
          inicio: corte.inicio,
          fondo_inicial: Number(corte.fondo_inicial),
          cobros: Number(corte.cobros),
        }
      : null,
    cuentas,
    metodos_pago: metodos.map((metodo) => ({ id_metodo: Number(metodo.id_metodo), nombre: metodo.nombre as string })),
  });
};

/** POST /api/caja/cortes: abre un corte para el cajero autenticado con el efectivo inicial de la caja. */
export const abrirCorte = async (req: Request, res: Response) => {
  const { fondo_inicial } = validar(AbrirCorte, req.body);
  const idCajero = req.usuario!.id;
  const corte = await transaccion(async (cx) => {
    await bloquearCajero(cx, idCajero);
    if (await corteAbierto(cx, idCajero)) {
      throw new ErrorApi(409, "estado_invalido", "Ya tienes un corte de caja abierto.");
    }
    const { insertId } = await ejecutar(
      cx,
      "INSERT INTO corte_caja (id_cajero, inicio, fondo_inicial) VALUES (?, NOW(), ?)",
      [idCajero, fondo_inicial],
    );
    const [nuevo] = await filas(cx, "SELECT id_corte, inicio, fondo_inicial FROM corte_caja WHERE id_corte = ?", [insertId]);
    if (!nuevo) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el corte recién abierto.");
    return {
      id_corte: Number(nuevo.id_corte),
      inicio: nuevo.inicio as string,
      fondo_inicial: Number(nuevo.fondo_inicial),
      cobros: 0,
    };
  });
  res.status(201).json(corte);
};

/** POST /api/caja/cortes/cerrar: guarda el efectivo contado, lo cuadra contra el esperado y cierra el turno. */
export const cerrarCorte = async (req: Request, res: Response) => {
  const { efectivo_contado } = validar(CerrarCorte, req.body);
  const idCajero = req.usuario!.id;
  const corte = await transaccion(async (cx) => {
    await bloquearCajero(cx, idCajero);
    const abierto = await corteAbierto(cx, idCajero);
    if (!abierto) throw new ErrorApi(409, "estado_invalido", "No tienes un corte de caja abierto.");
    const idCorte = Number(abierto.id_corte);
    const [fondo] = await filas(cx, "SELECT fondo_inicial FROM corte_caja WHERE id_corte = ?", [idCorte]);
    const cuadre = cuadrarCorte(Number(fondo?.fondo_inicial ?? 0), await desgloseCorte(cx, idCorte), efectivo_contado);
    await ejecutar(
      cx,
      `UPDATE corte_caja SET fin = NOW(), efectivo_esperado = ?, efectivo_contado = ?
        WHERE id_corte = ? AND fin IS NULL`,
      [cuadre.efectivo_esperado, efectivo_contado, idCorte],
    );
    const detalle = await cargarDetalleCorte(cx, idCorte);
    if (!detalle) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el corte cerrado.");
    return detalle;
  });
  const { id_cajero: _idCajero, ...respuesta } = corte;
  res.json(respuesta);
};

/**
 * GET /api/caja/cortes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD: cortes cerrados que iniciaron en ese rango
 * (por omisión, los últimos 30 días). El gerente ve todos; el cajero, solo los suyos.
 */
export const listarCortes = async (req: Request, res: Response) => {
  const filtro = validar(FiltroCortes, req.query);
  if (filtro.desde && filtro.hasta && filtro.desde > filtro.hasta) {
    throw new ErrorApi(422, "estado_invalido", "La fecha inicial no puede ser posterior a la final.");
  }
  const condiciones = ["cc.fin IS NOT NULL"];
  const params: (string | number)[] = [];
  if (filtro.desde) {
    condiciones.push("cc.inicio >= ?");
    params.push(filtro.desde);
  } else if (!filtro.hasta) {
    condiciones.push("cc.inicio >= CURDATE() - INTERVAL 30 DAY");
  }
  if (filtro.hasta) {
    condiciones.push("cc.inicio < ? + INTERVAL 1 DAY");
    params.push(filtro.hasta);
  }
  if (req.usuario!.rol === "cajero") {
    condiciones.push("cc.id_cajero = ?");
    params.push(req.usuario!.id);
  }
  const filasCortes = await filas(
    pool,
    `${SELECT_CORTE} WHERE ${condiciones.join(" AND ")} GROUP BY cc.id_corte ORDER BY cc.inicio DESC, cc.id_corte DESC LIMIT 200`,
    params,
  );
  res.json(filasCortes.map(aCorteResumen));
};

/** GET /api/caja/cortes/:id: detalle de un corte cerrado con el desglose por método de pago. */
export const obtenerCorte = async (req: Request, res: Response) => {
  const idCorte = idDeRuta(req.params.id);
  const detalle = await cargarDetalleCorte(pool, idCorte);
  const ajeno = detalle && req.usuario!.rol === "cajero" && detalle.id_cajero !== req.usuario!.id;
  // Un corte abierto todavía no se muestra: revelaría el efectivo esperado antes del conteo.
  if (!detalle || ajeno || detalle.fin === null) {
    throw new ErrorApi(404, "no_encontrado", "El corte no existe o todavía está abierto.");
  }
  const { id_cajero: _idCajero, ...respuesta } = detalle;
  res.json(respuesta);
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
