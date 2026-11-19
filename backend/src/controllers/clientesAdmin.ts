// Gestión de clientes por el gerente (fase 3 del eliminado lógico, migración 028): consultar, corregir datos, eliminar
// y restaurar. La hostess sigue usando GET/POST /api/clientes y PATCH (solo correo) de controllers/hostess.ts.
import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { idDeRuta, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { correo as CorreoValido, errorTelefonoLada, lada as LadaValida, LADA_MEXICO, nombrePersona, telefono as TelefonoValido } from "../utils/campos";

export interface ClienteAdminDto {
  id_cliente: number;
  nombre: string;
  telefono: string | null;
  lada: string;
  correo: string | null;
  /** Tiene cuenta en el portal web (contraseña o Google). */
  tiene_cuenta: boolean;
  /** Reservaciones pendientes o confirmadas (bloquean eliminar al cliente). */
  reservaciones_vigentes: number;
  total_reservaciones: number;
  /** NULL = vigente; con fecha = eliminado (migración 028). */
  eliminado_en: string | null;
}

const SELECT_CLIENTE = `
  SELECT c.id_cliente, c.nombre, c.telefono, c.lada, c.correo,
         (cc.id_credencial IS NOT NULL) AS tiene_cuenta,
         (SELECT COUNT(*) FROM reservacion r WHERE r.id_cliente = c.id_cliente AND r.estado IN ('pendiente', 'confirmada')) AS reservaciones_vigentes,
         (SELECT COUNT(*) FROM reservacion r WHERE r.id_cliente = c.id_cliente) AS total_reservaciones,
         DATE_FORMAT(c.eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en
    FROM cliente c
    LEFT JOIN cliente_credencial cc ON cc.id_cliente = c.id_cliente`;

function aDto(f: Record<string, unknown>): ClienteAdminDto {
  return {
    id_cliente: f.id_cliente as number,
    nombre: f.nombre as string,
    telefono: (f.telefono as string | null) ?? null,
    lada: (f.lada as string | null) ?? LADA_MEXICO,
    correo: (f.correo as string | null) ?? null,
    tiene_cuenta: Boolean(f.tiene_cuenta),
    reservaciones_vigentes: Number(f.reservaciones_vigentes),
    total_reservaciones: Number(f.total_reservaciones),
    eliminado_en: (f.eliminado_en as string | null) ?? null,
  };
}

async function cargar(ex: Ejecutor, id: number): Promise<ClienteAdminDto | null> {
  const [f] = await filas(ex, `${SELECT_CLIENTE} WHERE c.id_cliente = ?`, [id]);
  return f ? aDto(f) : null;
}

/** GET /api/clientes/gestion[?eliminados=1]  →  todos los clientes vigentes (o solo los eliminados), por nombre. Solo gerente. */
export const listarClientesGestion = async (req: Request, res: Response) => {
  const eliminados = req.query.eliminados === "1" || req.query.eliminados === "true";
  const rows = await filas(pool, `${SELECT_CLIENTE} WHERE c.eliminado_en IS ${eliminados ? "NOT NULL" : "NULL"} ORDER BY c.nombre, c.id_cliente`);
  res.json(rows.map(aDto));
};

/**
 * El teléfono y el correo siguen ocupados aunque el cliente esté eliminado. Si lo que se quiere guardar choca con uno
 * eliminado, se avisa que hay que restaurarlo en lugar de crear otro.
 */
async function exigirLibres(ex: Ejecutor, datos: { telefono?: string | null | undefined; correo?: string | null | undefined }, idPropio: number): Promise<void> {
  if (datos.telefono) {
    const [otro] = await filas(ex, "SELECT id_cliente, eliminado_en FROM cliente WHERE telefono = ? AND id_cliente <> ? LIMIT 1", [datos.telefono, idPropio]);
    if (otro) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        otro.eliminado_en
          ? "Hay un cliente eliminado con ese teléfono. Restáuralo desde «Eliminados» en lugar de repetirlo."
          : "Ya existe un cliente con ese teléfono.",
      );
    }
  }
  if (datos.correo) {
    const [otro] = await filas(ex, "SELECT id_cliente, eliminado_en FROM cliente WHERE correo = ? AND id_cliente <> ? LIMIT 1", [datos.correo.toLowerCase(), idPropio]);
    if (otro) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        otro.eliminado_en
          ? "Hay un cliente eliminado con ese correo. Restáuralo desde «Eliminados» en lugar de repetirlo."
          : "Ya existe un cliente con ese correo.",
      );
    }
  }
}

const EditarCliente = z
  .object({
    nombre: nombrePersona(100),
    telefono: TelefonoValido,
    lada: LadaValida,
    correo: CorreoValido,
  })
  .strict()
  .partial();

/**
 * PATCH /api/clientes/:id (gerente): corrige nombre, teléfono, lada o correo (cualquier subconjunto). El correo no se
 * puede quitar: es el acceso al portal. Un cliente eliminado no se edita.
 */
export const editarClienteGerente = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const d = validar(EditarCliente, req.body);
  if (Object.keys(d).length === 0) throw new ErrorApi(422, "estado_invalido", "No hay nada que cambiar.");

  await transaccion(async (cx) => {
    const [actual] = await filas(cx, "SELECT telefono, lada, eliminado_en FROM cliente WHERE id_cliente = ? FOR UPDATE", [id]);
    if (!actual) throw new ErrorApi(404, "no_encontrado", "El cliente no existe.");
    if (actual.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El cliente está eliminado. Restáuralo para poder editarlo.");

    // El teléfono se valida con la lada que quedará (la nueva o la que ya tenía).
    if (d.telefono !== undefined || d.lada !== undefined) {
      const telefonoFinal = d.telefono ?? ((actual.telefono as string | null) ?? "");
      const ladaFinal = d.lada ?? ((actual.lada as string | null) ?? LADA_MEXICO);
      const mensaje = telefonoFinal ? errorTelefonoLada(ladaFinal, telefonoFinal) : null;
      if (mensaje) throw new ErrorApi(422, "estado_invalido", `Datos inválidos (telefono: ${mensaje}).`);
    }
    await exigirLibres(cx, { telefono: d.telefono, correo: d.correo }, id);

    const sets: string[] = [];
    const params: unknown[] = [];
    if (d.nombre !== undefined) (sets.push("nombre = ?"), params.push(d.nombre));
    if (d.telefono !== undefined) (sets.push("telefono = ?"), params.push(d.telefono));
    if (d.lada !== undefined) (sets.push("lada = ?"), params.push(d.lada));
    if (d.correo !== undefined) (sets.push("correo = ?"), params.push(d.correo.toLowerCase()));
    await ejecutar(cx, `UPDATE cliente SET ${sets.join(", ")} WHERE id_cliente = ?`, [...params, id]);
  });
  res.json(await cargar(pool, id));
};

/**
 * DELETE /api/clientes/:id  →  el cliente, ya eliminado.
 * «Eliminar» es lógico (migración 028): deja de aparecer en la búsqueda de la hostess y no puede entrar al portal (su
 * sesión se rechaza de inmediato), pero se conserva para el historial. No se puede eliminar con reservaciones
 * pendientes o confirmadas, ni mientras esté en la lista de espera. Se restaura con POST /clientes/:id/restaurar.
 */
export const eliminarCliente = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [c] = await filas(cx, "SELECT nombre, eliminado_en FROM cliente WHERE id_cliente = ? FOR UPDATE", [id]);
    if (!c) throw new ErrorApi(404, "no_encontrado", "El cliente no existe.");
    if (c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El cliente ya está eliminado.");

    const [reservas] = await filas(cx, "SELECT COUNT(*) AS n FROM reservacion WHERE id_cliente = ? AND estado IN ('pendiente', 'confirmada')", [id]);
    if (Number(reservas?.n ?? 0) > 0) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        `${String(c.nombre)} tiene ${Number(reservas?.n)} reservación(es) pendientes o confirmadas. Cancélalas o espera a que pasen antes de eliminarlo.`,
      );
    }
    const [espera] = await filas(cx, "SELECT COUNT(*) AS n FROM lista_espera WHERE id_cliente = ? AND estado = 'esperando'", [id]);
    if (Number(espera?.n ?? 0) > 0) {
      throw new ErrorApi(409, "estado_invalido", `${String(c.nombre)} está en la lista de espera. Quítalo de la lista antes de eliminarlo.`);
    }

    await ejecutar(cx, "UPDATE cliente SET eliminado_en = NOW(), eliminado_por = ? WHERE id_cliente = ? AND eliminado_en IS NULL", [
      req.usuario?.id ?? null,
      id,
    ]);
  });
  res.json(await cargar(pool, id));
};

/** POST /api/clientes/:id/restaurar  →  el cliente vigente otra vez. */
export const restaurarCliente = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const c = await cargar(pool, id);
  if (!c) throw new ErrorApi(404, "no_encontrado", "El cliente no existe.");
  if (!c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El cliente no está eliminado.");
  await ejecutar(pool, "UPDATE cliente SET eliminado_en = NULL, eliminado_por = NULL WHERE id_cliente = ?", [id]);
  res.json(await cargar(pool, id));
};
