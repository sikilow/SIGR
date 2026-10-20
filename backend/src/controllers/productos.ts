import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../services/db";
import { productosPorId, validar } from "../models/dominio";

const Consulta = z.object({
  items: z.array(z.object({ id_producto: z.number().int().positive() })).max(200),
});

/** POST /api/productos/disponibilidad  { items: [{ id_producto }] }  →  { items: [{ id_producto, disponible }] } */
export const consultarDisponibilidad = async (req: Request, res: Response) => {
  const { items } = validar(Consulta, req.body);
  const ids = [...new Set(items.map((i) => i.id_producto))];
  const productos = await productosPorId(pool, ids);
  res.json({ items: ids.map((id) => ({ id_producto: id, disponible: productos.get(id)?.disponible ?? false })) });
};
