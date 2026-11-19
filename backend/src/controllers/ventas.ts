// Ventas ya cobradas: consultar tickets pasados, reimprimirlos, devoluciones (total o parcial, con motivo) y la referencia
// fiscal para el contador (migración 034). Cajero y gerente consultan y reimprimen; el cajero SOLICITA una devolución y el
// gerente la autoriza (o la registra directamente); solo el gerente guarda la referencia fiscal.
import type { Request, Response } from "express";
import { z } from "zod";
import { idDeRuta, validar } from "../models/dominio";
import {
  calcularLineasDevolucion,
  estadoDevolucionVenta,
  validarPagosDevolucion,
  type LineaVenta,
  type PagoVenta,
} from "../models/devolucion";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { conIdempotencia } from "../services/idempotencia";
import { correo as correoValido, importePositivo, nota, REGEX_NOTA } from "../utils/campos";
import { ErrorApi } from "../utils/errores";

const NO_CANCELADO = "pe.id_estado <> (SELECT id_estado FROM estado_pedido WHERE nombre = 'Cancelado')";

function esFechaISOValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const f = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isFinite(f.getTime()) && f.toISOString().slice(0, 10) === fecha;
}
const FechaISO = z.string().refine(esFechaISOValida, "la fecha debe tener formato AAAA-MM-DD");
const dinero = (n: unknown): number => Math.round(Number(n ?? 0) * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------
// Consultar ventas y tickets
// ---------------------------------------------------------------------------------------------------------------

const FiltroVentas = z.object({
  desde: FechaISO.optional(),
  hasta: FechaISO.optional(),
  /** Número de ticket (id de la venta) o de mesa. */
  q: z.string().trim().max(20).optional(),
});

/**
 * GET /api/caja/ventas?desde&hasta&q: ventas cobradas, las más recientes primero (por omisión, los últimos 7 días; máximo
 * 92 días y 200 ventas). Cajero y gerente ven todas.
 */
export const listarVentas = async (req: Request, res: Response) => {
  const f = validar(FiltroVentas, req.query);
  const condiciones: string[] = [];
  const params: unknown[] = [];
  if (f.desde && f.hasta && f.desde > f.hasta) throw new ErrorApi(422, "estado_invalido", "La fecha inicial no puede ser posterior a la final.");
  if (f.desde) (condiciones.push("v.fecha_hora >= ?"), params.push(f.desde));
  else if (!f.hasta) condiciones.push("v.fecha_hora >= CURDATE() - INTERVAL 6 DAY");
  if (f.hasta) (condiciones.push("v.fecha_hora < ? + INTERVAL 1 DAY"), params.push(f.hasta));
  if (f.desde && f.hasta && Date.parse(f.hasta) - Date.parse(f.desde) > 92 * 86_400_000) {
    throw new ErrorApi(422, "estado_invalido", "El periodo no puede pasar de 92 días.");
  }
  if (f.q) {
    if (!/^\d{1,10}$/.test(f.q)) throw new ErrorApi(422, "estado_invalido", "Busca por número de ticket o de mesa (solo números).");
    condiciones.push("(v.id_venta = ? OR m.numero = ?)");
    params.push(Number(f.q), Number(f.q));
  }
  const donde = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const rows = await filas(
    pool,
    `SELECT v.id_venta, DATE_FORMAT(v.fecha_hora, '%Y-%m-%d %H:%i:%s') AS fecha_hora, v.total,
            m.numero AS mesa_numero, m.zona AS seccion, cp.nombre AS canal, uc.nombre AS cajero,
            (SELECT GROUP_CONCAT(DISTINCT mp.nombre ORDER BY mp.nombre SEPARATOR ', ')
               FROM pago p JOIN metodo_pago mp ON mp.id_metodo = p.id_metodo WHERE p.id_venta = v.id_venta) AS metodos,
            COALESCE((SELECT SUM(d.total) FROM devolucion d WHERE d.id_venta = v.id_venta AND d.estado = 'aprobada'), 0) AS devuelto,
            (SELECT COUNT(*) FROM devolucion d WHERE d.id_venta = v.id_venta AND d.estado = 'pendiente') AS devoluciones_pendientes,
            (SELECT COUNT(*) FROM venta_fiscal vf WHERE vf.id_venta = v.id_venta) AS con_referencia_fiscal
       FROM venta v
       JOIN cuenta c ON c.id_cuenta = v.id_cuenta
       JOIN mesa m ON m.id_mesa = c.id_mesa
       LEFT JOIN canal_pedido cp ON cp.id_canal = c.id_canal
       JOIN usuario uc ON uc.id_usuario = v.id_cajero
       ${donde}
      ORDER BY v.fecha_hora DESC, v.id_venta DESC
      LIMIT 200`,
    params,
  );
  const verFiscal = req.usuario!.rol === "gerente";
  res.json(
    rows.map((r) => {
      const total = dinero(r.total);
      const devuelto = dinero(r.devuelto);
      return {
        id_venta: Number(r.id_venta),
        fecha_hora: r.fecha_hora as string,
        total,
        mesa_numero: Number(r.mesa_numero),
        seccion: (r.seccion as string | null) ?? null,
        canal: (r.canal as string | null) ?? null,
        cajero: String(r.cajero),
        metodos: String(r.metodos ?? ""),
        devuelto,
        estado_devolucion: estadoDevolucionVenta(total, devuelto),
        devoluciones_pendientes: Number(r.devoluciones_pendientes),
        ...(verFiscal ? { con_referencia_fiscal: Number(r.con_referencia_fiscal) > 0 } : {}),
      };
    }),
  );
};

async function lineasDeVenta(ex: Ejecutor, idCuenta: number): Promise<Array<LineaVenta & { presentacion: string | null; indicaciones: string | null; controla_existencia: boolean; id_producto: number }>> {
  const rows = await filas(
    ex,
    `SELECT dp.id_detalle, dp.id_producto, dp.cantidad, dp.precio_unitario, dp.indicaciones,
            pr.nombre, pr.presentacion, pr.controla_existencia,
            COALESCE((SELECT SUM(l.cantidad) FROM devolucion_linea l JOIN devolucion d ON d.id_devolucion = l.id_devolucion
                       WHERE l.id_detalle = dp.id_detalle AND d.estado = 'aprobada'), 0) AS devuelta,
            COALESCE((SELECT SUM(l.cantidad) FROM devolucion_linea l JOIN devolucion d ON d.id_devolucion = l.id_devolucion
                       WHERE l.id_detalle = dp.id_detalle AND d.estado = 'pendiente'), 0) AS pendiente
       FROM detalle_pedido dp
       JOIN pedido pe ON pe.id_pedido = dp.id_pedido AND ${NO_CANCELADO}
       JOIN producto pr ON pr.id_producto = dp.id_producto
      WHERE pe.id_cuenta = ?
      ORDER BY dp.id_detalle`,
    [idCuenta],
  );
  return rows.map((r) => ({
    id_detalle: Number(r.id_detalle),
    id_producto: Number(r.id_producto),
    producto: String(r.nombre),
    presentacion: (r.presentacion as string | null) || null,
    cantidad: Number(r.cantidad),
    precio_unitario: dinero(r.precio_unitario),
    indicaciones: (r.indicaciones as string | null) ?? null,
    controla_existencia: Boolean(r.controla_existencia),
    devuelta: Number(r.devuelta),
    pendiente: Number(r.pendiente),
  }));
}

async function pagosDeVenta(ex: Ejecutor, idVenta: number): Promise<Array<PagoVenta & { es_efectivo: boolean; monto_recibido: number; cambio: number }>> {
  const rows = await filas(
    ex,
    `SELECT p.id_metodo, mp.nombre, mp.es_efectivo, SUM(p.monto) AS monto, SUM(p.monto_recibido) AS recibido, SUM(p.cambio) AS cambio,
            COALESCE((SELECT SUM(dpg.monto) FROM devolucion_pago dpg JOIN devolucion d ON d.id_devolucion = dpg.id_devolucion
                       WHERE dpg.id_metodo = p.id_metodo AND d.id_venta = p.id_venta AND d.estado = 'aprobada'), 0) AS devuelto,
            COALESCE((SELECT SUM(dpg.monto) FROM devolucion_pago dpg JOIN devolucion d ON d.id_devolucion = dpg.id_devolucion
                       WHERE dpg.id_metodo = p.id_metodo AND d.id_venta = p.id_venta AND d.estado = 'pendiente'), 0) AS pendiente
       FROM pago p JOIN metodo_pago mp ON mp.id_metodo = p.id_metodo
      WHERE p.id_venta = ?
      GROUP BY p.id_metodo, mp.nombre, mp.es_efectivo, p.id_venta
      ORDER BY p.id_metodo`,
    [idVenta],
  );
  return rows.map((r) => ({
    id_metodo: Number(r.id_metodo),
    metodo: String(r.nombre),
    es_efectivo: Boolean(r.es_efectivo),
    monto: dinero(r.monto),
    monto_recibido: dinero(r.recibido),
    cambio: dinero(r.cambio),
    devuelto: dinero(r.devuelto),
    pendiente: dinero(r.pendiente),
  }));
}

/** Devoluciones de una venta (o todas, con `idVenta = null`) con sus líneas y cómo se devuelve el dinero. */
async function cargarDevoluciones(ex: Ejecutor, condicion: string, params: unknown[]) {
  const rows = await filas(
    ex,
    `SELECT d.id_devolucion, d.id_venta, d.estado, d.motivo, d.total, d.reponer_inventario,
            DATE_FORMAT(d.solicitado_en, '%Y-%m-%d %H:%i:%s') AS solicitado_en, us.nombre AS solicitante,
            DATE_FORMAT(d.resuelto_en, '%Y-%m-%d %H:%i:%s') AS resuelto_en, ur.nombre AS resolutor, d.nota_resolucion, d.id_corte,
            m.numero AS mesa_numero, v.total AS total_venta
       FROM devolucion d
       JOIN venta v ON v.id_venta = d.id_venta
       JOIN cuenta c ON c.id_cuenta = v.id_cuenta
       JOIN mesa m ON m.id_mesa = c.id_mesa
       JOIN usuario us ON us.id_usuario = d.solicitado_por
       LEFT JOIN usuario ur ON ur.id_usuario = d.resuelto_por
      WHERE ${condicion}
      ORDER BY d.solicitado_en DESC, d.id_devolucion DESC
      LIMIT 200`,
    params,
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => Number(r.id_devolucion));
  const lineas = await filas(
    ex,
    `SELECT l.id_devolucion, l.id_detalle, l.cantidad, l.importe, pr.nombre, pr.presentacion
       FROM devolucion_linea l JOIN detalle_pedido dp ON dp.id_detalle = l.id_detalle JOIN producto pr ON pr.id_producto = dp.id_producto
      WHERE l.id_devolucion IN (?) ORDER BY l.id_linea`,
    [ids],
  );
  const pagos = await filas(
    ex,
    `SELECT dpg.id_devolucion, dpg.id_metodo, mp.nombre, mp.es_efectivo, dpg.monto
       FROM devolucion_pago dpg JOIN metodo_pago mp ON mp.id_metodo = dpg.id_metodo
      WHERE dpg.id_devolucion IN (?) ORDER BY dpg.id_devolucion_pago`,
    [ids],
  );
  return rows.map((r) => ({
    id_devolucion: Number(r.id_devolucion),
    id_venta: Number(r.id_venta),
    mesa_numero: Number(r.mesa_numero),
    total_venta: dinero(r.total_venta),
    estado: String(r.estado),
    motivo: String(r.motivo),
    total: dinero(r.total),
    reponer_inventario: Boolean(r.reponer_inventario),
    solicitado_en: r.solicitado_en as string,
    solicitante: String(r.solicitante),
    resuelto_en: (r.resuelto_en as string | null) ?? null,
    resolutor: (r.resolutor as string | null) ?? null,
    nota_resolucion: (r.nota_resolucion as string | null) ?? null,
    id_corte: r.id_corte === null ? null : Number(r.id_corte),
    lineas: lineas
      .filter((l) => Number(l.id_devolucion) === Number(r.id_devolucion))
      .map((l) => ({ id_detalle: Number(l.id_detalle), producto: String(l.nombre), presentacion: (l.presentacion as string | null) || null, cantidad: Number(l.cantidad), importe: dinero(l.importe) })),
    pagos: pagos
      .filter((p) => Number(p.id_devolucion) === Number(r.id_devolucion))
      .map((p) => ({ id_metodo: Number(p.id_metodo), metodo: String(p.nombre), es_efectivo: Boolean(p.es_efectivo), monto: dinero(p.monto) })),
  }));
}

async function cargarFiscal(ex: Ejecutor, idVenta: number) {
  const [f] = await filas(
    ex,
    `SELECT vf.referencia_contador, vf.rfc, vf.razon_social, vf.regimen_fiscal, vf.codigo_postal, vf.correo, vf.notas,
            u.nombre AS registrado_por, DATE_FORMAT(vf.actualizado_en, '%Y-%m-%d %H:%i:%s') AS actualizado_en
       FROM venta_fiscal vf JOIN usuario u ON u.id_usuario = vf.registrado_por WHERE vf.id_venta = ?`,
    [idVenta],
  );
  if (!f) return null;
  return {
    referencia_contador: String(f.referencia_contador),
    rfc: (f.rfc as string | null) ?? null,
    razon_social: (f.razon_social as string | null) ?? null,
    regimen_fiscal: (f.regimen_fiscal as string | null) ?? null,
    codigo_postal: (f.codigo_postal as string | null) ?? null,
    correo: (f.correo as string | null) ?? null,
    notas: (f.notas as string | null) ?? null,
    registrado_por: String(f.registrado_por),
    actualizado_en: f.actualizado_en as string,
  };
}

/** El ticket completo de una venta con lo que se puede devolver todavía. `verFiscal`: solo el gerente. */
async function cargarVentaDetalle(ex: Ejecutor, idVenta: number, verFiscal: boolean) {
  const [v] = await filas(
    ex,
    `SELECT v.id_venta, v.id_cuenta, DATE_FORMAT(v.fecha_hora, '%Y-%m-%d %H:%i:%s') AS fecha_hora, v.total, uc.nombre AS cajero,
            m.numero AS mesa_numero, m.zona AS seccion, cp.nombre AS canal, c.referencia,
            (SELECT GROUP_CONCAT(DISTINCT um.nombre ORDER BY um.nombre SEPARATOR ', ')
               FROM pedido pe JOIN usuario um ON um.id_usuario = pe.id_mesero WHERE pe.id_cuenta = v.id_cuenta AND ${NO_CANCELADO}) AS meseros
       FROM venta v
       JOIN cuenta c ON c.id_cuenta = v.id_cuenta
       JOIN mesa m ON m.id_mesa = c.id_mesa
       LEFT JOIN canal_pedido cp ON cp.id_canal = c.id_canal
       JOIN usuario uc ON uc.id_usuario = v.id_cajero
      WHERE v.id_venta = ?`,
    [idVenta],
  );
  if (!v) throw new ErrorApi(404, "no_encontrado", "La venta no existe.");
  const lineas = await lineasDeVenta(ex, Number(v.id_cuenta));
  const pagos = await pagosDeVenta(ex, idVenta);
  const devoluciones = await cargarDevoluciones(ex, "d.id_venta = ?", [idVenta]);
  const [reimp] = await filas(
    ex,
    "SELECT COUNT(*) AS n, DATE_FORMAT(MAX(creado_en), '%Y-%m-%d %H:%i:%s') AS ultima FROM venta_reimpresion WHERE id_venta = ?",
    [idVenta],
  );
  const total = dinero(v.total);
  const devuelto = dinero(devoluciones.filter((d) => d.estado === "aprobada").reduce((s, d) => s + d.total, 0));
  return {
    id_venta: Number(v.id_venta),
    id_cuenta: Number(v.id_cuenta),
    fecha_hora: v.fecha_hora as string,
    total,
    cajero: String(v.cajero),
    meseros: String(v.meseros ?? ""),
    mesa_numero: Number(v.mesa_numero),
    seccion: (v.seccion as string | null) ?? null,
    canal: (v.canal as string | null) ?? null,
    referencia: (v.referencia as string | null) ?? null,
    lineas: lineas.map((l) => ({
      id_detalle: l.id_detalle,
      producto: l.producto,
      presentacion: l.presentacion,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      importe: dinero(l.cantidad * l.precio_unitario),
      indicaciones: l.indicaciones,
      devuelta: l.devuelta,
      pendiente: l.pendiente,
    })),
    pagos: pagos.map((p) => ({ id_metodo: p.id_metodo, metodo: p.metodo, es_efectivo: p.es_efectivo, monto: p.monto, monto_recibido: p.monto_recibido, cambio: p.cambio, devuelto: p.devuelto, pendiente: p.pendiente })),
    devoluciones,
    devuelto,
    estado_devolucion: estadoDevolucionVenta(total, devuelto),
    reimpresiones: Number(reimp?.n ?? 0),
    ultima_reimpresion: (reimp?.ultima as string | null) ?? null,
    ...(verFiscal ? { referencia_fiscal: await cargarFiscal(ex, idVenta) } : {}),
  };
}

/** GET /api/caja/ventas/:id: ticket de una venta, con sus devoluciones y lo que se puede devolver todavía. */
export const obtenerVenta = async (req: Request, res: Response) => {
  res.json(await cargarVentaDetalle(pool, idDeRuta(req.params.id), req.usuario!.rol === "gerente"));
};

/** POST /api/caja/ventas/:id/reimpresion: deja constancia de que se reimprimió el ticket (quién y cuándo). */
export const registrarReimpresion = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const [v] = await filas(pool, "SELECT 1 AS x FROM venta WHERE id_venta = ?", [id]);
  if (!v) throw new ErrorApi(404, "no_encontrado", "La venta no existe.");
  await ejecutar(pool, "INSERT INTO venta_reimpresion (id_venta, id_usuario) VALUES (?, ?)", [id, req.usuario!.id]);
  const [r] = await filas(pool, "SELECT COUNT(*) AS n, DATE_FORMAT(MAX(creado_en), '%Y-%m-%d %H:%i:%s') AS ultima FROM venta_reimpresion WHERE id_venta = ?", [id]);
  res.status(201).json({ reimpresiones: Number(r?.n ?? 0), ultima_reimpresion: (r?.ultima as string | null) ?? null });
};

// ---------------------------------------------------------------------------------------------------------------
// Devoluciones
// ---------------------------------------------------------------------------------------------------------------

const MotivoDevolucion = z
  .string()
  .trim()
  .min(5, "El motivo debe tener al menos 5 caracteres")
  .max(200, "El motivo no puede pasar de 200 caracteres")
  .regex(REGEX_NOTA, "solo letras, números, espacios y puntuación común");

const SolicitudDevolucion = z
  .object({
    lineas: z.array(z.object({ id_detalle: z.number().int().positive(), cantidad: z.number().int().positive().max(1000) }).strict()).min(1, "Elige al menos un producto").max(100),
    pagos: z.array(z.object({ id_metodo: z.number().int().positive(), monto: importePositivo(9_999_999_999.99) }).strict()).min(1, "Indica cómo se devuelve el dinero").max(10),
    motivo: MotivoDevolucion,
    reponer_inventario: z.boolean().optional().default(false),
  })
  .strict();

/**
 * Aplica una devolución aprobada: la marca como tal, ubica el corte del que sale el efectivo y repone el inventario si se
 * pidió. Debe llamarse dentro de una transacción con la venta ya bloqueada.
 */
async function aplicarDevolucion(cx: Ejecutor, idDevolucion: number, quien: number, notaResolucion: string | null): Promise<void> {
  const [d] = await filas(cx, "SELECT id_venta, solicitado_por, reponer_inventario FROM devolucion WHERE id_devolucion = ?", [idDevolucion]);
  if (!d) throw new ErrorApi(404, "no_encontrado", "La devolución no existe.");
  const [efectivo] = await filas(
    cx,
    `SELECT COALESCE(SUM(dpg.monto), 0) AS monto
       FROM devolucion_pago dpg JOIN metodo_pago mp ON mp.id_metodo = dpg.id_metodo
      WHERE dpg.id_devolucion = ? AND mp.es_efectivo = 1`,
    [idDevolucion],
  );
  // El dinero sale de la caja del cajero que la pidió: se anota en su corte abierto (baja el efectivo esperado). Si pidió una
  // devolución en efectivo y no tiene caja iniciada, no se puede aprobar. Las que registra el gerente no pasan por una caja.
  const [solicitante] = await filas(cx, "SELECT u.nombre, LOWER(r.nombre) AS rol FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = ?", [d.solicitado_por]);
  let idCorte: number | null = null;
  if (solicitante?.rol === "cajero") {
    const [corte] = await filas(cx, "SELECT id_corte FROM corte_caja WHERE id_cajero = ? AND fin IS NULL ORDER BY id_corte DESC LIMIT 1 FOR UPDATE", [d.solicitado_por]);
    idCorte = corte ? Number(corte.id_corte) : null;
    if (!idCorte && dinero(efectivo?.monto) > 0) {
      throw new ErrorApi(409, "estado_invalido", `${String(solicitante.nombre)} no tiene la caja iniciada: no puede entregar el efectivo de esta devolución. Pídele que inicie caja o cambia el método de devolución.`);
    }
  }
  await ejecutar(
    cx,
    "UPDATE devolucion SET estado = 'aprobada', resuelto_por = ?, resuelto_en = NOW(), nota_resolucion = ?, id_corte = ? WHERE id_devolucion = ? AND estado = 'pendiente'",
    [quien, notaResolucion, idCorte, idDevolucion],
  );
  if (Boolean(d.reponer_inventario)) {
    // Solo los productos que controlan existencia vuelven al inventario (lo que se prepara al momento no se cuenta).
    await ejecutar(
      cx,
      `UPDATE disponibilidadProducto i
         JOIN (SELECT dp.id_producto, SUM(l.cantidad) AS cantidad
                 FROM devolucion_linea l JOIN detalle_pedido dp ON dp.id_detalle = l.id_detalle
                WHERE l.id_devolucion = ? GROUP BY dp.id_producto) x ON x.id_producto = i.id_producto
         JOIN producto pr ON pr.id_producto = i.id_producto AND pr.controla_existencia = 1
          SET i.existencia = i.existencia + x.cantidad`,
      [idDevolucion],
    );
  }
}

/**
 * POST /api/caja/ventas/:id/devoluciones  { lineas, pagos, motivo, reponer_inventario? }   (acepta Idempotency-Key)
 * El cajero crea una SOLICITUD (queda `pendiente` hasta que el gerente la autorice); el gerente la registra ya aprobada.
 * Se puede devolver parte de la venta: producto por producto y por cantidad; el dinero se devuelve con los métodos que se
 * usaron al cobrar, sin pasar de lo cobrado con cada uno.
 */
export const solicitarDevolucion = async (req: Request, res: Response) => {
  const idVenta = idDeRuta(req.params.id);
  const datos = validar(SolicitudDevolucion, req.body);
  const esGerente = req.usuario!.rol === "gerente";

  await conIdempotencia(req, res, 201, () =>
    transaccion(async (cx) => {
      // La venta se bloquea: dos devoluciones simultáneas de la misma venta no pueden pasarse de lo vendido ni de lo cobrado.
      const [v] = await filas(cx, "SELECT id_cuenta FROM venta WHERE id_venta = ? FOR UPDATE", [idVenta]);
      if (!v) throw new ErrorApi(404, "no_encontrado", "La venta no existe.");

      const lineas = await lineasDeVenta(cx, Number(v.id_cuenta));
      const calculo = calcularLineasDevolucion(lineas, datos.lineas);
      validarPagosDevolucion(calculo.total, datos.pagos, await pagosDeVenta(cx, idVenta));

      const { insertId } = await ejecutar(
        cx,
        "INSERT INTO devolucion (id_venta, estado, motivo, total, reponer_inventario, solicitado_por) VALUES (?, 'pendiente', ?, ?, ?, ?)",
        [idVenta, datos.motivo, calculo.total, datos.reponer_inventario, req.usuario!.id],
      );
      await cx.query("INSERT INTO devolucion_linea (id_devolucion, id_detalle, cantidad, importe) VALUES ?", [
        calculo.lineas.map((l) => [insertId, l.id_detalle, l.cantidad, l.importe]),
      ]);
      await cx.query("INSERT INTO devolucion_pago (id_devolucion, id_metodo, monto) VALUES ?", [datos.pagos.map((p) => [insertId, p.id_metodo, p.monto])]);
      if (esGerente) await aplicarDevolucion(cx, insertId, req.usuario!.id, null);

      const [creada] = await cargarDevoluciones(cx, "d.id_devolucion = ?", [insertId]);
      return creada;
    }),
  );
};

const FiltroDevoluciones = z.object({
  estado: z.enum(["pendiente", "aprobada", "rechazada", "todas"]).optional(),
  desde: FechaISO.optional(),
  hasta: FechaISO.optional(),
});

/**
 * GET /api/caja/devoluciones?estado&desde&hasta: el gerente ve todas; el cajero, solo las que él pidió. Las pendientes salen
 * siempre; el resto, de los últimos 30 días si no se indica un periodo.
 */
export const listarDevoluciones = async (req: Request, res: Response) => {
  const f = validar(FiltroDevoluciones, req.query);
  if (f.desde && f.hasta && f.desde > f.hasta) throw new ErrorApi(422, "estado_invalido", "La fecha inicial no puede ser posterior a la final.");
  const condiciones: string[] = [];
  const params: unknown[] = [];
  const estado = f.estado ?? "todas";
  if (estado !== "todas") (condiciones.push("d.estado = ?"), params.push(estado));
  if (estado !== "pendiente") {
    const rango: string[] = [];
    if (f.desde) (rango.push("d.solicitado_en >= ?"), params.push(f.desde));
    else if (!f.hasta) rango.push("d.solicitado_en >= CURDATE() - INTERVAL 30 DAY");
    if (f.hasta) (rango.push("d.solicitado_en < ? + INTERVAL 1 DAY"), params.push(f.hasta));
    // Las pendientes se ven siempre, aunque sean de antes del periodo.
    condiciones.push(`(d.estado = 'pendiente' OR (${rango.join(" AND ") || "1 = 1"}))`);
  }
  if (req.usuario!.rol === "cajero") (condiciones.push("d.solicitado_por = ?"), params.push(req.usuario!.id));
  res.json(await cargarDevoluciones(pool, condiciones.length ? condiciones.join(" AND ") : "1 = 1", params));
};

const ResolverDevolucion = z.object({ nota: nota(200).optional() }).strict();

async function resolver(req: Request, res: Response, accion: "aprobar" | "rechazar"): Promise<void> {
  const id = idDeRuta(req.params.id);
  const { nota: notaResolucion } = validar(ResolverDevolucion, req.body ?? {});
  const texto = notaResolucion?.trim() || null;
  if (accion === "rechazar" && !texto) throw new ErrorApi(422, "estado_invalido", "Escribe por qué se rechaza la devolución.");
  await transaccion(async (cx) => {
    const [d] = await filas(cx, "SELECT id_venta FROM devolucion WHERE id_devolucion = ?", [id]);
    if (!d) throw new ErrorApi(404, "no_encontrado", "La devolución no existe.");
    // Se bloquea la venta (igual que al solicitar) y luego se revisa el estado: dos autorizaciones simultáneas no la aplican dos veces.
    await filas(cx, "SELECT id_venta FROM venta WHERE id_venta = ? FOR UPDATE", [d.id_venta]);
    const [actual] = await filas(cx, "SELECT estado FROM devolucion WHERE id_devolucion = ? FOR UPDATE", [id]);
    if (actual?.estado !== "pendiente") throw new ErrorApi(409, "estado_invalido", `Esta devolución ya está ${String(actual?.estado)}.`);
    if (accion === "aprobar") {
      await aplicarDevolucion(cx, id, req.usuario!.id, texto);
    } else {
      await ejecutar(cx, "UPDATE devolucion SET estado = 'rechazada', resuelto_por = ?, resuelto_en = NOW(), nota_resolucion = ? WHERE id_devolucion = ? AND estado = 'pendiente'", [req.usuario!.id, texto, id]);
    }
  });
  const [resultado] = await cargarDevoluciones(pool, "d.id_devolucion = ?", [id]);
  res.json(resultado);
}

/** POST /api/caja/devoluciones/:id/aprobar { nota? }: el gerente autoriza; el efectivo sale del corte del cajero. */
export const aprobarDevolucion = (req: Request, res: Response) => resolver(req, res, "aprobar");
/** POST /api/caja/devoluciones/:id/rechazar { nota }: el gerente la rechaza (la nota es obligatoria). */
export const rechazarDevolucion = (req: Request, res: Response) => resolver(req, res, "rechazar");

// ---------------------------------------------------------------------------------------------------------------
// Referencia fiscal (solo gerente)
// ---------------------------------------------------------------------------------------------------------------

/** Texto opcional: vacío = no se capturó. */
const opcional = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), esquema.optional());

const ReferenciaFiscal = z
  .object({
    /** Id de referencia para el contador. No se emite factura: solo se guarda para ubicarla. */
    referencia_contador: z.string().trim().min(1, "escribe la referencia para el contador").max(60, "máximo 60 caracteres").regex(/^[\p{L}\p{N} .\-_/#]+$/u, "solo letras, números, espacios y . - _ / #"),
    rfc: opcional(z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "RFC no válido (12 o 13 caracteres)")),
    razon_social: opcional(nota(160)),
    regimen_fiscal: opcional(z.string().trim().regex(/^[0-9A-Za-z]{1,10}$/, "régimen no válido")),
    codigo_postal: opcional(z.string().trim().regex(/^\d{5}$/, "el código postal lleva 5 dígitos")),
    correo: opcional(correoValido),
    notas: opcional(nota(200)),
  })
  .strict();

/**
 * PUT /api/caja/ventas/:id/fiscal: el gerente guarda la referencia para el contador y, si quiere, los datos fiscales del
 * cliente (todo opcional salvo la referencia). No se emite factura. Si ya había una, se reemplaza.
 */
export const guardarReferenciaFiscal = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const d = validar(ReferenciaFiscal, req.body);
  const [v] = await filas(pool, "SELECT 1 AS x FROM venta WHERE id_venta = ?", [id]);
  if (!v) throw new ErrorApi(404, "no_encontrado", "La venta no existe.");
  await ejecutar(
    pool,
    `INSERT INTO venta_fiscal (id_venta, referencia_contador, rfc, razon_social, regimen_fiscal, codigo_postal, correo, notas, registrado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE referencia_contador = VALUES(referencia_contador), rfc = VALUES(rfc), razon_social = VALUES(razon_social),
       regimen_fiscal = VALUES(regimen_fiscal), codigo_postal = VALUES(codigo_postal), correo = VALUES(correo), notas = VALUES(notas),
       registrado_por = VALUES(registrado_por)`,
    [id, d.referencia_contador, d.rfc ?? null, d.razon_social ?? null, d.regimen_fiscal ?? null, d.codigo_postal ?? null, d.correo?.toLowerCase() ?? null, d.notas ?? null, req.usuario!.id],
  );
  res.json(await cargarFiscal(pool, id));
};

/** DELETE /api/caja/ventas/:id/fiscal: quita la referencia fiscal de la venta. */
export const quitarReferenciaFiscal = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const r = await ejecutar(pool, "DELETE FROM venta_fiscal WHERE id_venta = ?", [id]);
  if (r.affectedRows === 0) throw new ErrorApi(404, "no_encontrado", "Esa venta no tiene referencia fiscal.");
  res.json({ ok: true });
};
