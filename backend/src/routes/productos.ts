import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { productosPorId, validar } from "../dominio";
import { requiereAuth } from "../middlewares/auth";

export const productosRouter = Router();

const Consulta = z.object({
  items: z.array(z.object({ id_producto: z.number().int().positive() })).max(200),
});

/** POST /api/productos/disponibilidad  { items: [{ id_producto }] }  →  { items: [{ id_producto, disponible }] } */
productosRouter.post("/disponibilidad", requiereAuth(), async (req, res) => {
  const { items } = validar(Consulta, req.body);
  const ids = [...new Set(items.map((i) => i.id_producto))];
  const productos = await productosPorId(pool, ids);
  res.json({ items: ids.map((id) => ({ id_producto: id, disponible: productos.get(id)?.disponible ?? false })) });
});
