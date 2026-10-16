import { Router } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../db";
import { idDeRuta, validar } from "../dominio";
import { ErrorApi } from "../errores";
import { requiereAuth } from "../middlewares/auth";

export const catalogoRouter = Router();

// Todo este módulo es solo del gerente.
catalogoRouter.use(requiereAuth("gerente"));

const Texto = (max: number) => z.string().trim().min(1, "es obligatorio").max(max, `máximo ${max} caracteres`);

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

// ======================= Categorías =======================

/** categoria_menu.* + total_productos (calculado: COUNT de producto.id_categoria). */
interface CategoriaAdminDto {
  id_categoria: number;
  nombre: string;
  total_productos: number;
}

async function cargarCategoria(ex: Ejecutor, id: number): Promise<CategoriaAdminDto | null> {
  const [f] = await filas(
    ex,
    `SELECT c.id_categoria, c.nombre, COUNT(p.id_producto) AS total_productos
       FROM categoria_menu c LEFT JOIN producto p ON p.id_categoria = c.id_categoria
      WHERE c.id_categoria = ? GROUP BY c.id_categoria, c.nombre`,
    [id],
  );
  return f ? { id_categoria: f.id_categoria as number, nombre: f.nombre as string, total_productos: Number(f.total_productos) } : null;
}

/** GET /api/catalogo/categorias */
catalogoRouter.get("/categorias", async (_req, res) => {
  const rows = await filas(
    pool,
    `SELECT c.id_categoria, c.nombre, COUNT(p.id_producto) AS total_productos
       FROM categoria_menu c LEFT JOIN producto p ON p.id_categoria = c.id_categoria
      GROUP BY c.id_categoria, c.nombre ORDER BY c.id_categoria`,
  );
  res.json(
    rows.map((f) => ({ id_categoria: f.id_categoria as number, nombre: f.nombre as string, total_productos: Number(f.total_productos) })),
  );
});

const CategoriaCuerpo = z.object({ nombre: Texto(80) });

/** POST /api/catalogo/categorias  { nombre }  →  201 */
catalogoRouter.post("/categorias", async (req, res) => {
  const { nombre } = validar(CategoriaCuerpo, req.body);
  try {
    const r = await ejecutar(pool, "INSERT INTO categoria_menu (nombre) VALUES (?)", [nombre]);
    res.status(201).json(await cargarCategoria(pool, r.insertId));
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una categoría con ese nombre.");
    throw e;
  }
});

/** PATCH /api/catalogo/categorias/:id  { nombre } */
catalogoRouter.patch("/categorias/:id", async (req, res) => {
  const id = idDeRuta(req.params.id);
  const { nombre } = validar(CategoriaCuerpo, req.body);
  try {
    await ejecutar(pool, "UPDATE categoria_menu SET nombre = ? WHERE id_categoria = ?", [nombre, id]);
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una categoría con ese nombre.");
    throw e;
  }
  const categoria = await cargarCategoria(pool, id);
  if (!categoria) throw new ErrorApi(404, "no_encontrado", "La categoría no existe.");
  res.json(categoria);
});

/**
 * DELETE /api/catalogo/categorias/:id  →  { ok: true }
 * Solo se puede borrar una categoría vacía (los productos de una categoría no se reasignan solos).
 */
catalogoRouter.delete("/categorias/:id", async (req, res) => {
  const id = idDeRuta(req.params.id);
  const categoria = await cargarCategoria(pool, id);
  if (!categoria) throw new ErrorApi(404, "no_encontrado", "La categoría no existe.");
  if (categoria.total_productos > 0) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      `La categoría tiene ${categoria.total_productos} producto(s). Muévelos a otra categoría o desactívalos antes de borrarla.`,
    );
  }
  await ejecutar(pool, "DELETE FROM categoria_menu WHERE id_categoria = ?", [id]);
  res.json({ ok: true });
});

// ======================= Productos + inventario =======================

/** producto.* + categoria (JOIN), existencia y stock_minimo (disponibilidadProducto) y `disponible` calculado. */
interface ProductoAdminDto {
  id_producto: number;
  id_categoria: number;
  /** Calculado: categoria_menu.nombre (JOIN). */
  categoria: string;
  nombre: string;
  descripcion: string;
  precio: number;
  /** El gerente lo tiene activo en el menú (columna producto.disponible). */
  activo: boolean;
  existencia: number;
  stock_minimo: number;
  /** Calculado: lo que ve el mesero (activo Y con existencia > 0). */
  disponible: boolean;
}

const SELECT_PRODUCTO = `
  SELECT p.id_producto, p.id_categoria, c.nombre AS categoria, p.nombre,
         COALESCE(p.descripcion, '') AS descripcion, p.precio, p.disponible AS activo,
         COALESCE(i.existencia, 0) AS existencia, COALESCE(i.stock_minimo, 0) AS stock_minimo
    FROM producto p
    JOIN categoria_menu c ON c.id_categoria = p.id_categoria
    LEFT JOIN disponibilidadProducto i ON i.id_producto = p.id_producto`;

function aProductoDto(f: Record<string, unknown>): ProductoAdminDto {
  const activo = Boolean(f.activo);
  const existencia = Number(f.existencia);
  return {
    id_producto: f.id_producto as number,
    id_categoria: f.id_categoria as number,
    categoria: f.categoria as string,
    nombre: f.nombre as string,
    descripcion: f.descripcion as string,
    precio: Number(f.precio),
    activo,
    existencia,
    stock_minimo: Number(f.stock_minimo),
    disponible: activo && existencia > 0,
  };
}

async function cargarProducto(ex: Ejecutor, id: number): Promise<ProductoAdminDto | null> {
  const [f] = await filas(ex, `${SELECT_PRODUCTO} WHERE p.id_producto = ?`, [id]);
  return f ? aProductoDto(f) : null;
}

async function exigirCategoria(ex: Ejecutor, id: number): Promise<void> {
  const [f] = await filas(ex, "SELECT 1 AS x FROM categoria_menu WHERE id_categoria = ?", [id]);
  if (!f) throw new ErrorApi(422, "estado_invalido", "La categoría indicada no existe.");
}

/** GET /api/catalogo/productos  →  TODOS los productos (también los inactivos) con su inventario. */
catalogoRouter.get("/productos", async (_req, res) => {
  const rows = await filas(pool, `${SELECT_PRODUCTO} ORDER BY c.id_categoria, p.nombre`);
  res.json(rows.map(aProductoDto));
});

// El precio se valida con 2 decimales como máximo (DECIMAL(10,2)).
const Precio = z
  .number()
  .min(0, "no puede ser negativo")
  .max(99_999_999, "es demasiado grande")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "máximo 2 decimales");
const Entero = z.number().int("debe ser un número entero").min(0, "no puede ser negativo").max(1_000_000, "es demasiado grande");

const CrearProducto = z.object({
  id_categoria: z.number().int().positive(),
  nombre: Texto(100),
  descripcion: z.string().trim().max(255).optional(),
  precio: Precio,
  activo: z.boolean().optional(),
  existencia: Entero.optional(),
  stock_minimo: Entero.optional(),
});

/** POST /api/catalogo/productos  →  201. Crea el producto y su fila de inventario en una transacción. */
catalogoRouter.post("/productos", async (req, res) => {
  const d = validar(CrearProducto, req.body);
  const id = await transaccion(async (cx) => {
    await exigirCategoria(cx, d.id_categoria);
    const p = await ejecutar(
      cx,
      "INSERT INTO producto (id_categoria, nombre, descripcion, precio, disponible) VALUES (?, ?, ?, ?, ?)",
      [d.id_categoria, d.nombre, d.descripcion || null, d.precio, d.activo ?? true],
    );
    await ejecutar(cx, "INSERT INTO disponibilidadProducto (id_producto, existencia, stock_minimo) VALUES (?, ?, ?)", [
      p.insertId,
      d.existencia ?? 0,
      d.stock_minimo ?? 0,
    ]);
    return p.insertId;
  });
  res.status(201).json(await cargarProducto(pool, id));
});

const EditarProducto = z
  .object({
    id_categoria: z.number().int().positive(),
    nombre: Texto(100),
    descripcion: z.string().trim().max(255),
    precio: Precio,
    activo: z.boolean(),
    existencia: Entero,
    stock_minimo: Entero,
  })
  .partial();

/**
 * PATCH /api/catalogo/productos/:id  (cualquier subconjunto de campos)
 * Cambiar el precio NO altera pedidos ya hechos: cada detalle_pedido guarda su precio_unitario.
 * Los productos no se borran (hay pedidos que los referencian): se desactivan con `activo: false`.
 */
catalogoRouter.patch("/productos/:id", async (req, res) => {
  const id = idDeRuta(req.params.id);
  const d = validar(EditarProducto, req.body);
  if (Object.keys(d).length === 0) throw new ErrorApi(422, "estado_invalido", "No hay nada que cambiar.");

  await transaccion(async (cx) => {
    const [existe] = await filas(cx, "SELECT 1 AS x FROM producto WHERE id_producto = ? FOR UPDATE", [id]);
    if (!existe) throw new ErrorApi(404, "no_encontrado", "El producto no existe.");
    if (d.id_categoria !== undefined) await exigirCategoria(cx, d.id_categoria);

    const sets: string[] = [];
    const params: unknown[] = [];
    if (d.id_categoria !== undefined) (sets.push("id_categoria = ?"), params.push(d.id_categoria));
    if (d.nombre !== undefined) (sets.push("nombre = ?"), params.push(d.nombre));
    if (d.descripcion !== undefined) (sets.push("descripcion = ?"), params.push(d.descripcion || null));
    if (d.precio !== undefined) (sets.push("precio = ?"), params.push(d.precio));
    if (d.activo !== undefined) (sets.push("disponible = ?"), params.push(d.activo));
    if (sets.length > 0) await ejecutar(cx, `UPDATE producto SET ${sets.join(", ")} WHERE id_producto = ?`, [...params, id]);

    if (d.existencia !== undefined || d.stock_minimo !== undefined) {
      // Si el producto no tenía fila de inventario (por ejemplo, se creó a mano en SQL), se crea aquí.
      await ejecutar(
        cx,
        `INSERT INTO disponibilidadProducto (id_producto, existencia, stock_minimo) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           existencia = COALESCE(?, existencia),
           stock_minimo = COALESCE(?, stock_minimo)`,
        [id, d.existencia ?? 0, d.stock_minimo ?? 0, d.existencia ?? null, d.stock_minimo ?? null],
      );
    }
  });

  res.json(await cargarProducto(pool, id));
});
