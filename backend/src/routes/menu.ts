import { Router } from "express";
import { pool, filas } from "../db";
import { requiereAuth } from "../middlewares/auth";

export const menuRouter = Router();

interface ProductoMenu {
  id_producto: number;
  id_categoria: number;
  nombre: string;
  descripcion: string;
  precio: number;
  disponible: boolean;
}

/**
 * GET /api/menu  →  [{ id_categoria, nombre, productos: [...] }]  (solo categorías con productos)
 * `disponible` es calculado: producto.disponible (activo en el menú) Y existencia > 0.
 */
menuRouter.get("/", requiereAuth(), async (_req, res) => {
  const rows = await filas(
    pool,
    `SELECT cm.id_categoria, cm.nombre AS categoria,
            p.id_producto, p.nombre, COALESCE(p.descripcion, '') AS descripcion, p.precio,
            (p.disponible AND COALESCE(i.existencia, 0) > 0) AS disponible
       FROM categoria_menu cm
       JOIN producto p ON p.id_categoria = cm.id_categoria
       LEFT JOIN disponibilidadProducto i ON i.id_producto = p.id_producto
      ORDER BY cm.id_categoria, p.id_producto`,
  );

  const categorias = new Map<number, { id_categoria: number; nombre: string; productos: ProductoMenu[] }>();
  for (const r of rows) {
    const id = r.id_categoria as number;
    let categoria = categorias.get(id);
    if (!categoria) {
      categoria = { id_categoria: id, nombre: r.categoria as string, productos: [] };
      categorias.set(id, categoria);
    }
    categoria.productos.push({
      id_producto: r.id_producto as number,
      id_categoria: id,
      nombre: r.nombre as string,
      descripcion: r.descripcion as string,
      precio: Number(r.precio),
      disponible: Boolean(r.disponible),
    });
  }
  res.json([...categorias.values()]);
});
