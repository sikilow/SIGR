import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { idDeRuta, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { MENSAJE_NOTA, MENSAJE_TEXTO_CATALOGO, REGEX_NOTA, REGEX_TEXTO_CATALOGO, textoCatalogo, textoCatalogoOpcional } from "../utils/campos";
import { aHoraCorta, aMinutos, INTERVALOS_RESERVACION } from "../models/horarioReservacion";
import { guardarCaracteristicasMesa, IdsCaracteristicas, idsCaracteristicasDeMesas } from "../models/caracteristicasMesa";

// Todo este módulo es solo del gerente.

const SELECT_CONFIGURACION = `
  SELECT tolerancia_minutos, recordatorio_minutos, anticipacion_minutos,
         hora_apertura, hora_ultima_reservacion, intervalo_minutos, dias_abiertos, duracion_reservacion_minutos
    FROM configuracion_reservacion WHERE id = 1`;

/** Fila de la base → respuesta (horas como "HH:MM"). */
function aConfiguracionDto(fila: Record<string, unknown>) {
  return {
    tolerancia_minutos: Number(fila.tolerancia_minutos),
    recordatorio_minutos: Number(fila.recordatorio_minutos),
    anticipacion_minutos: Number(fila.anticipacion_minutos),
    hora_apertura: aHoraCorta(fila.hora_apertura),
    hora_ultima_reservacion: aHoraCorta(fila.hora_ultima_reservacion),
    intervalo_minutos: Number(fila.intervalo_minutos),
    dias_abiertos: String(fila.dias_abiertos),
    duracion_reservacion_minutos: Number(fila.duracion_reservacion_minutos),
  };
}

/** GET /api/catalogo/configuracion-reservacion */
export const obtenerConfiguracionReservacion = async (_req: Request, res: Response) => {
  const [configuracion] = await filas(
    pool,
    SELECT_CONFIGURACION,
  );
  if (!configuracion) throw new ErrorApi(500, "desconocido", "No existe la configuración de reservaciones. Ejecuta la migración 010.");
  res.json(aConfiguracionDto(configuracion));
};

const HoraHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "la hora debe tener formato HH:MM");
const ConfiguracionReservacion = z.object({
  tolerancia_minutos: z.number().int().min(5).max(180),
  recordatorio_minutos: z.number().int().min(1).max(30),
  /** Con cuánto tiempo mínimo antes de la hora se puede reservar (0 = sin mínimo; hasta 24 h). */
  anticipacion_minutos: z.number().int().min(0).max(1440),
  /** Horario de reservaciones (migración 022). */
  hora_apertura: HoraHHMM,
  hora_ultima_reservacion: HoraHHMM,
  intervalo_minutos: z.number().int().refine((n) => (INTERVALOS_RESERVACION as readonly number[]).includes(n), "debe ser 15, 30 o 60"),
  dias_abiertos: z.string().regex(/^[01]{7}$/, "siete caracteres 0/1 de lunes a domingo").refine((d) => d !== "0000000", "abre al menos un día"),
  /** Cuánto ocupa una reservación su mesa al calcular la disponibilidad (migración 023). */
  duracion_reservacion_minutos: z.number().int().min(30).max(360),
}).strict().refine(
  (c) => aMinutos(c.hora_apertura) <= aMinutos(c.hora_ultima_reservacion),
  "la última hora para reservar no puede ser antes de la primera",
);

/** PATCH /api/catalogo/configuracion-reservacion */
export const actualizarConfiguracionReservacion = async (req: Request, res: Response) => {
  const datos = validar(ConfiguracionReservacion, req.body);
  await ejecutar(
    pool,
    `UPDATE configuracion_reservacion
        SET tolerancia_minutos = ?, recordatorio_minutos = ?, anticipacion_minutos = ?,
            hora_apertura = ?, hora_ultima_reservacion = ?, intervalo_minutos = ?, dias_abiertos = ?,
            duracion_reservacion_minutos = ?
      WHERE id = 1`,
    [
      datos.tolerancia_minutos, datos.recordatorio_minutos, datos.anticipacion_minutos,
      datos.hora_apertura, datos.hora_ultima_reservacion, datos.intervalo_minutos, datos.dias_abiertos,
      datos.duracion_reservacion_minutos,
    ],
  );
  const [configuracion] = await filas(
    pool,
    SELECT_CONFIGURACION,
  );
  if (!configuracion) throw new ErrorApi(500, "desconocido", "No existe la configuración de reservaciones. Ejecuta la migración 010.");
  res.json(aConfiguracionDto(configuracion));
};

const TipoCategoriaPago = z.enum(["fisico", "digital"]);
const NombreMetodoPago = textoCatalogo(40);
const NuevaCategoriaPago = z.object({ nombre: NombreMetodoPago, tipo: TipoCategoriaPago }).strict();
const CambioCategoriaPago = z.object({ activo: z.boolean() }).strict();
const NuevoMetodoPago = z.object({
  nombre: NombreMetodoPago,
  id_categoria_metodo_pago: z.number().int().positive(),
  es_efectivo: z.boolean().default(false),
}).strict();
const CambioMetodoPago = z.object({
  activo: z.boolean().optional(),
  es_efectivo: z.boolean().optional(),
}).strict().refine((cambio) => cambio.activo !== undefined || cambio.es_efectivo !== undefined);

const SELECT_METODOS_PAGO = `
  SELECT cmp.id_categoria_metodo_pago, cmp.nombre AS categoria, cmp.tipo, cmp.activo AS categoria_activa,
         mp.id_metodo, mp.nombre, mp.es_efectivo, mp.activo
    FROM categoria_metodo_pago cmp
    LEFT JOIN metodo_pago mp ON mp.id_categoria_metodo_pago = cmp.id_categoria_metodo_pago`;

function metodoPagoDto(fila: Record<string, unknown>) {
  return {
    id_metodo: Number(fila.id_metodo),
    nombre: String(fila.nombre),
    id_categoria_metodo_pago: Number(fila.id_categoria_metodo_pago),
    categoria: String(fila.categoria),
    tipo: String(fila.tipo) as "fisico" | "digital",
    es_efectivo: Boolean(fila.es_efectivo),
    activo: Boolean(fila.activo),
  };
}

function categoriaPagoDto(filasCategoria: Array<Record<string, unknown>>) {
  const primera = filasCategoria[0];
  if (!primera) throw new ErrorApi(500, "desconocido", "No se pudo recuperar la categoría de pago.");
  return {
    id_categoria_metodo_pago: Number(primera.id_categoria_metodo_pago),
    nombre: String(primera.categoria),
    tipo: String(primera.tipo) as "fisico" | "digital",
    activo: Boolean(primera.categoria_activa),
    metodos: filasCategoria.filter((fila) => fila.id_metodo !== null).map(metodoPagoDto),
  };
}

/** GET /api/catalogo/metodos-pago: categorías y métodos para Gerencia. */
export const listarMetodosPago = async (_req: Request, res: Response) => {
  const filasPago = await filas(pool, `${SELECT_METODOS_PAGO} ORDER BY cmp.id_categoria_metodo_pago, mp.id_metodo`);
  const porCategoria = new Map<number, Array<Record<string, unknown>>>();
  for (const fila of filasPago) {
    const id = Number(fila.id_categoria_metodo_pago);
    const grupo = porCategoria.get(id) ?? [];
    grupo.push(fila);
    porCategoria.set(id, grupo);
  }
  res.json([...porCategoria.values()].map(categoriaPagoDto));
};

/** GET /api/catalogo/metodos-pago/disponibles: categorías y métodos activos para todo el personal. */
export const listarMetodosPagoDisponibles = async (_req: Request, res: Response) => {
  const metodos = await filas(
    pool,
    `SELECT cmp.id_categoria_metodo_pago, cmp.nombre AS categoria, cmp.tipo,
            mp.id_metodo, mp.nombre, mp.es_efectivo, mp.activo
       FROM categoria_metodo_pago cmp
       JOIN metodo_pago mp ON mp.id_categoria_metodo_pago = cmp.id_categoria_metodo_pago
      WHERE cmp.activo = 1 AND mp.activo = 1
      ORDER BY cmp.id_categoria_metodo_pago, mp.id_metodo`,
  );
  res.json(metodos.map((fila) => metodoPagoDto({ ...fila, categoria_activa: true })));
};

/** POST /api/catalogo/metodos-pago/categorias: crea una categoría física o digital. */
export const crearCategoriaMetodoPago = async (req: Request, res: Response) => {
  const datos = validar(NuevaCategoriaPago, req.body);
  let idCategoria: number;
  try {
    const resultado = await ejecutar(pool, "INSERT INTO categoria_metodo_pago (nombre, tipo) VALUES (?, ?)", [datos.nombre, datos.tipo]);
    idCategoria = resultado.insertId;
  } catch (error) {
    if (esDuplicado(error)) throw new ErrorApi(409, "estado_invalido", "Ya existe una categoría de pago con ese nombre.");
    throw error;
  }
  const [categoria] = await filas(pool, "SELECT id_categoria_metodo_pago, nombre, tipo, activo FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ?", [idCategoria]);
  if (!categoria) throw new ErrorApi(500, "desconocido", "No se pudo recuperar la categoría de pago creada.");
  res.status(201).json({
    id_categoria_metodo_pago: Number(categoria.id_categoria_metodo_pago),
    nombre: String(categoria.nombre),
    tipo: String(categoria.tipo),
    activo: Boolean(categoria.activo),
    metodos: [],
  });
};

/** PATCH /api/catalogo/metodos-pago/categorias/:id: activa o desactiva la categoría. */
export const actualizarCategoriaMetodoPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { activo } = validar(CambioCategoriaPago, req.body);
  const categoria = await transaccion(async (cx) => {
    const [actual] = await filas(cx, "SELECT id_categoria_metodo_pago, nombre, tipo FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ? FOR UPDATE", [id]);
    if (!actual) throw new ErrorApi(404, "no_encontrado", "La categoría de pago no existe.");
    await ejecutar(cx, "UPDATE categoria_metodo_pago SET activo = ? WHERE id_categoria_metodo_pago = ?", [activo, id]);
    return {
      id_categoria_metodo_pago: Number(actual.id_categoria_metodo_pago),
      nombre: String(actual.nombre),
      tipo: String(actual.tipo) as "fisico" | "digital",
      activo,
    };
  });
  const metodos = await filas(
    pool,
    `SELECT cmp.id_categoria_metodo_pago, cmp.nombre AS categoria, cmp.tipo, cmp.activo AS categoria_activa,
            mp.id_metodo, mp.nombre, mp.es_efectivo, mp.activo
       FROM categoria_metodo_pago cmp
       LEFT JOIN metodo_pago mp ON mp.id_categoria_metodo_pago = cmp.id_categoria_metodo_pago
      WHERE cmp.id_categoria_metodo_pago = ? ORDER BY mp.id_metodo`,
    [id],
  );
  res.json({ ...categoria, metodos: metodos.filter((fila) => fila.id_metodo !== null).map(metodoPagoDto) });
};

/** POST /api/catalogo/metodos-pago: agrega un método a una categoría. */
export const crearMetodoPago = async (req: Request, res: Response) => {
  const datos = validar(NuevoMetodoPago, req.body);
  const [categoria] = await filas(
    pool,
    "SELECT tipo FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ?",
    [datos.id_categoria_metodo_pago],
  );
  if (!categoria) throw new ErrorApi(404, "no_encontrado", "La categoría de pago no existe.");
  if (datos.es_efectivo) {
    if (categoria.tipo !== "fisico") {
      throw new ErrorApi(422, "estado_invalido", "El método de efectivo debe pertenecer a una categoría física.");
    }
    const efectivo = await transaccion(async (cx) => {
      const existentes = await filas(cx, "SELECT id_metodo FROM metodo_pago WHERE es_efectivo = 1 FOR UPDATE");
      if (existentes.length) throw new ErrorApi(409, "estado_invalido", "Ya existe un método marcado como efectivo.");
      const resultado = await ejecutar(cx, "INSERT INTO metodo_pago (nombre, id_categoria_metodo_pago, es_efectivo) VALUES (?, ?, 1)", [
        datos.nombre,
        datos.id_categoria_metodo_pago,
      ]);
      return resultado.insertId;
    }).catch((error: unknown) => {
      if (esDuplicado(error)) throw new ErrorApi(409, "estado_invalido", "Ya existe un método de pago con ese nombre.");
      throw error;
    });
    const [fila] = await filas(pool, `${SELECT_METODOS_PAGO} WHERE mp.id_metodo = ?`, [efectivo]);
    if (!fila) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el método de pago creado.");
    res.status(201).json(metodoPagoDto(fila));
    return;
  }

  let idMetodo: number;
  try {
    const resultado = await ejecutar(
      pool,
      "INSERT INTO metodo_pago (nombre, id_categoria_metodo_pago) VALUES (?, ?)",
      [datos.nombre, datos.id_categoria_metodo_pago],
    );
    idMetodo = resultado.insertId;
  } catch (error) {
    if (esDuplicado(error)) throw new ErrorApi(409, "estado_invalido", "Ya existe un método de pago con ese nombre.");
    throw error;
  }
  const [metodo] = await filas(pool, `${SELECT_METODOS_PAGO} WHERE mp.id_metodo = ?`, [idMetodo]);
  if (!metodo) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el método de pago creado.");
  res.status(201).json(metodoPagoDto(metodo));
};

/** PATCH /api/catalogo/metodos-pago/:id: activa o desactiva un método o su marca de efectivo. */
export const actualizarMetodoPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const cambio = validar(CambioMetodoPago, req.body);
  const datos = await transaccion(async (cx) => {
    const [actual] = await filas(
      cx,
      `SELECT mp.id_metodo, mp.es_efectivo, cmp.tipo
         FROM metodo_pago mp JOIN categoria_metodo_pago cmp USING (id_categoria_metodo_pago)
        WHERE mp.id_metodo = ? FOR UPDATE`,
      [id],
    );
    if (!actual) throw new ErrorApi(404, "no_encontrado", "El método de pago no existe.");
    const esEfectivo = cambio.es_efectivo ?? Boolean(actual.es_efectivo);
    if (esEfectivo && actual.tipo !== "fisico") {
      throw new ErrorApi(422, "estado_invalido", "El método de efectivo debe pertenecer a una categoría física.");
    }
    if (cambio.es_efectivo !== undefined && esEfectivo !== Boolean(actual.es_efectivo)) {
      const [uso] = await filas(cx, "SELECT id_pago FROM pago WHERE id_metodo = ? LIMIT 1 FOR UPDATE", [id]);
      if (uso) throw new ErrorApi(409, "estado_invalido", "No se puede cambiar el cuadre de un método que ya tiene pagos registrados.");
    }
    if (cambio.es_efectivo && !Boolean(actual.es_efectivo)) {
      const existentes = await filas(cx, "SELECT id_metodo FROM metodo_pago WHERE es_efectivo = 1 FOR UPDATE");
      if (existentes.some((fila) => Number(fila.id_metodo) !== id)) {
        throw new ErrorApi(409, "estado_invalido", "Ya existe un método marcado como efectivo.");
      }
    }
    await ejecutar(
      cx,
      "UPDATE metodo_pago SET activo = COALESCE(?, activo), es_efectivo = ? WHERE id_metodo = ?",
      [cambio.activo ?? null, esEfectivo, id],
    );
  });
  const [fila] = await filas(pool, `${SELECT_METODOS_PAGO} WHERE mp.id_metodo = ?`, [id]);
  if (!fila) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el método de pago actualizado.");
  res.json(metodoPagoDto(fila));
};

// ---------- Canales de pedido (para llevar): mostrador, teléfono, plataformas… ----------
const NombreCanal = textoCatalogo(40);
const NuevoCanal = z.object({ nombre: NombreCanal }).strict();
const CambioCanal = z.object({ activo: z.boolean() }).strict();

function canalDto(fila: Record<string, unknown>) {
  return { id_canal: Number(fila.id_canal), nombre: String(fila.nombre), activo: Boolean(fila.activo) };
}

/** GET /api/catalogo/canales: todos los canales, para Gerencia. */
export const listarCanales = async (_req: Request, res: Response) => {
  res.json((await filas(pool, "SELECT id_canal, nombre, activo FROM canal_pedido ORDER BY id_canal")).map(canalDto));
};

/** GET /api/catalogo/canales/disponibles: los canales activos, para el mesero. */
export const listarCanalesDisponibles = async (_req: Request, res: Response) => {
  res.json((await filas(pool, "SELECT id_canal, nombre, activo FROM canal_pedido WHERE activo = TRUE ORDER BY id_canal")).map(canalDto));
};

/** POST /api/catalogo/canales */
export const crearCanal = async (req: Request, res: Response) => {
  const { nombre } = validar(NuevoCanal, req.body);
  let id: number;
  try {
    id = (await ejecutar(pool, "INSERT INTO canal_pedido (nombre) VALUES (?)", [nombre])).insertId;
  } catch (error) {
    if (esDuplicado(error)) throw new ErrorApi(409, "estado_invalido", "Ya existe un canal con ese nombre.");
    throw error;
  }
  const [fila] = await filas(pool, "SELECT id_canal, nombre, activo FROM canal_pedido WHERE id_canal = ?", [id]);
  if (!fila) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el canal creado.");
  res.status(201).json(canalDto(fila));
};

/** PATCH /api/catalogo/canales/:id: activa o desactiva el canal (no se borra: las cuentas anteriores lo conservan). */
export const actualizarCanal = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { activo } = validar(CambioCanal, req.body);
  const r = await ejecutar(pool, "UPDATE canal_pedido SET activo = ? WHERE id_canal = ?", [activo, id]);
  const [fila] = await filas(pool, "SELECT id_canal, nombre, activo FROM canal_pedido WHERE id_canal = ?", [id]);
  if (!fila || (r.affectedRows === 0 && !fila)) throw new ErrorApi(404, "no_encontrado", "El canal no existe.");
  res.json(canalDto(fila));
};

const Texto = textoCatalogo;
const DescripcionProducto = z.string().trim().min(1, "es obligatorio").max(255, "máximo 255 caracteres").regex(REGEX_NOTA, MENSAJE_NOTA).refine(
  (descripcion) => descripcion.toLocaleLowerCase() !== "detalle pendiente de completar",
  "describe la presentación, porción o características del producto",
);

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
export const listarCategorias = async (_req: Request, res: Response) => {
  const rows = await filas(
    pool,
    `SELECT c.id_categoria, c.nombre, COUNT(p.id_producto) AS total_productos
       FROM categoria_menu c LEFT JOIN producto p ON p.id_categoria = c.id_categoria
      GROUP BY c.id_categoria, c.nombre ORDER BY c.id_categoria`,
  );
  res.json(
    rows.map((f) => ({ id_categoria: f.id_categoria as number, nombre: f.nombre as string, total_productos: Number(f.total_productos) })),
  );
};

const CategoriaCuerpo = z.object({ nombre: Texto(80) });

/** POST /api/catalogo/categorias  { nombre }  →  201 */
export const crearCategoria = async (req: Request, res: Response) => {
  const { nombre } = validar(CategoriaCuerpo, req.body);
  try {
    const r = await ejecutar(pool, "INSERT INTO categoria_menu (nombre) VALUES (?)", [nombre]);
    res.status(201).json(await cargarCategoria(pool, r.insertId));
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una categoría con ese nombre.");
    throw e;
  }
};

/** PATCH /api/catalogo/categorias/:id  { nombre } */
export const editarCategoria = async (req: Request, res: Response) => {
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
};

/**
 * DELETE /api/catalogo/categorias/:id  →  { ok: true }
 * Solo se puede borrar una categoría vacía (los productos de una categoría no se reasignan solos).
 */
export const borrarCategoria = async (req: Request, res: Response) => {
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
};

// ======================= Productos + inventario =======================

/** producto.* + categoria (JOIN), existencia y stock_minimo (disponibilidadProducto) y `disponible` calculado. */
interface ProductoAdminDto {
  id_producto: number;
  id_categoria: number;
  /** Calculado: categoria_menu.nombre (JOIN). */
  categoria: string;
  nombre: string;
  presentacion: string;
  descripcion: string;
  precio: number;
  /** El gerente lo tiene activo en el menú (columna producto.disponible). */
  activo: boolean;
  existencia: number;
  stock_minimo: number;
  /** false = se prepara al momento: no tiene existencia que controlar (el mesero puede pedir cualquier cantidad). */
  controla_existencia: boolean;
  /** Calculado: lo que ve el mesero (activo Y, si controla existencia, con existencia > 0). */
  disponible: boolean;
}

const SELECT_PRODUCTO = `
  SELECT p.id_producto, p.id_categoria, c.nombre AS categoria, p.nombre, COALESCE(p.presentacion, '') AS presentacion,
         COALESCE(p.descripcion, '') AS descripcion, p.precio, p.disponible AS activo, p.controla_existencia,
         COALESCE(i.existencia, 0) AS existencia, COALESCE(i.stock_minimo, 0) AS stock_minimo
    FROM producto p
    JOIN categoria_menu c ON c.id_categoria = p.id_categoria
    LEFT JOIN disponibilidadProducto i ON i.id_producto = p.id_producto`;

function aProductoDto(f: Record<string, unknown>): ProductoAdminDto {
  const activo = Boolean(f.activo);
  const existencia = Number(f.existencia);
  const controla = Boolean(f.controla_existencia);
  return {
    id_producto: f.id_producto as number,
    id_categoria: f.id_categoria as number,
    categoria: f.categoria as string,
    nombre: f.nombre as string,
    presentacion: f.presentacion as string,
    descripcion: f.descripcion as string,
    precio: Number(f.precio),
    activo,
    existencia,
    stock_minimo: Number(f.stock_minimo),
    controla_existencia: controla,
    disponible: activo && (!controla || existencia > 0),
  };
}

async function cargarProducto(ex: Ejecutor, id: number): Promise<ProductoAdminDto | null> {
  const [f] = await filas(ex, `${SELECT_PRODUCTO} WHERE p.id_producto = ?`, [id]);
  return f ? aProductoDto(f) : null;
}

async function exigirCategoria(ex: Ejecutor, id: number, bloquear = false): Promise<void> {
  const [f] = await filas(ex, `SELECT 1 AS x FROM categoria_menu WHERE id_categoria = ?${bloquear ? " FOR UPDATE" : ""}`, [id]);
  if (!f) throw new ErrorApi(422, "estado_invalido", "La categoría indicada no existe.");
}

/** GET /api/catalogo/productos  →  TODOS los productos (también los inactivos) con su inventario. */
export const listarProductos = async (_req: Request, res: Response) => {
  const rows = await filas(pool, `${SELECT_PRODUCTO} ORDER BY c.id_categoria, p.nombre, p.presentacion`);
  res.json(rows.map(aProductoDto));
};

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
  presentacion: textoCatalogoOpcional(100).optional(),
  descripcion: DescripcionProducto,
  precio: Precio,
  activo: z.boolean().optional(),
  existencia: Entero.optional(),
  stock_minimo: Entero.optional(),
  /** Por defecto true. false = se prepara al momento (sin existencia que contar). */
  controla_existencia: z.boolean().optional(),
});

/** POST /api/catalogo/productos → 201; rechaza variantes ya registradas para que el inventario se edite explícitamente. */
export const crearProducto = async (req: Request, res: Response) => {
  const d = validar(CrearProducto, req.body);
  const id = await transaccion(async (cx) => {
    await exigirCategoria(cx, d.id_categoria, true);
    const [existente] = await filas(cx, `SELECT p.id_producto
       FROM producto p
      WHERE p.id_categoria = ? AND p.nombre = ? AND COALESCE(p.presentacion, '') = ?
      ORDER BY p.id_producto LIMIT 1 FOR UPDATE`, [d.id_categoria, d.nombre, d.presentacion ?? ""]);
    if (existente) {
      throw new ErrorApi(409, "estado_invalido", "Ya existe un producto con esa categoría, nombre y presentación. Búscalo y edita sus datos o existencias.");
    }

    const p = await ejecutar(
      cx,
      "INSERT INTO producto (id_categoria, nombre, presentacion, descripcion, precio, disponible, controla_existencia) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [d.id_categoria, d.nombre, d.presentacion ?? "", d.descripcion, d.precio, d.activo ?? true, d.controla_existencia ?? true],
    );
    await ejecutar(cx, "INSERT INTO disponibilidadProducto (id_producto, existencia, stock_minimo) VALUES (?, ?, ?)", [
      p.insertId,
      d.existencia ?? 0,
      d.stock_minimo ?? 0,
    ]);
    return p.insertId;
  });
  const producto = await cargarProducto(pool, id);
  if (!producto) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el producto guardado.");
  res.status(201).json(producto);
};

const EditarProducto = z
  .object({
    id_categoria: z.number().int().positive(),
    nombre: Texto(100),
    presentacion: textoCatalogoOpcional(100),
    descripcion: DescripcionProducto,
    precio: Precio,
    activo: z.boolean(),
    existencia: Entero,
    stock_minimo: Entero,
    controla_existencia: z.boolean(),
  })
  .partial();

/**
 * PATCH /api/catalogo/productos/:id  (cualquier subconjunto de campos)
 * Cambiar el precio NO altera pedidos ya hechos: cada detalle_pedido guarda su precio_unitario.
 * Los productos no se borran (hay pedidos que los referencian): se desactivan con `activo: false`.
 */
export const editarProducto = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const d = validar(EditarProducto, req.body);
  if (Object.keys(d).length === 0) throw new ErrorApi(422, "estado_invalido", "No hay nada que cambiar.");

  await transaccion(async (cx) => {
    const [preExiste] = await filas(cx, "SELECT id_categoria FROM producto WHERE id_producto = ?", [id]);
    if (!preExiste) throw new ErrorApi(404, "no_encontrado", "El producto no existe.");
    const categoriaObjetivo = d.id_categoria ?? Number(preExiste.id_categoria);
    const categoriasBloqueo = [...new Set([Number(preExiste.id_categoria), categoriaObjetivo])].sort((a, b) => a - b);
    for (const idCategoria of categoriasBloqueo) await exigirCategoria(cx, idCategoria, true);
    const [existe] = await filas(cx, "SELECT id_categoria, nombre, presentacion FROM producto WHERE id_producto = ? FOR UPDATE", [id]);
    if (!existe) throw new ErrorApi(404, "no_encontrado", "El producto no existe.");
    if (Number(existe.id_categoria) !== Number(preExiste.id_categoria) || (d.id_categoria === undefined && Number(existe.id_categoria) !== categoriaObjetivo)) {
      throw new ErrorApi(409, "estado_invalido", "El producto cambió de categoría durante la edición. Vuelve a cargarlo.");
    }

    const categoria = d.id_categoria ?? Number(existe.id_categoria);
    const nombre = d.nombre ?? String(existe.nombre);
    const presentacion = d.presentacion ?? String(existe.presentacion ?? "");
    const cambioIdentidad = categoria !== Number(existe.id_categoria) || nombre !== existe.nombre || presentacion !== String(existe.presentacion ?? "");
    if (cambioIdentidad) {
      const [duplicado] = await filas(
        cx,
        `SELECT id_producto FROM producto
          WHERE id_producto <> ? AND id_categoria = ? AND nombre = ? AND COALESCE(presentacion, '') = ?
          LIMIT 1 FOR UPDATE`,
        [id, categoria, nombre, presentacion],
      );
      if (duplicado) throw new ErrorApi(409, "estado_invalido", "Ya existe otro producto con la misma categoría, nombre y presentación.");
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (d.id_categoria !== undefined) (sets.push("id_categoria = ?"), params.push(d.id_categoria));
    if (d.nombre !== undefined) (sets.push("nombre = ?"), params.push(d.nombre));
    if (d.presentacion !== undefined) (sets.push("presentacion = ?"), params.push(d.presentacion));
    if (d.descripcion !== undefined) (sets.push("descripcion = ?"), params.push(d.descripcion));
    if (d.precio !== undefined) (sets.push("precio = ?"), params.push(d.precio));
    if (d.activo !== undefined) (sets.push("disponible = ?"), params.push(d.activo));
    if (d.controla_existencia !== undefined) (sets.push("controla_existencia = ?"), params.push(d.controla_existencia));
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
};

// ───────────────────────────── Secciones (solo gerente) ─────────────────────────────

interface SeccionAdminDto {
  nombre: string;
  activa: boolean;
  total_mesas: number;
}

const NombreSeccion = Texto(40);
const SELECT_SECCION = `SELECT s.nombre, s.activa, COUNT(m.id_mesa) AS total_mesas
                         FROM seccion s LEFT JOIN mesa m ON m.zona = s.nombre`;

function aSeccionAdminDto(r: Record<string, unknown>): SeccionAdminDto {
  return {
    nombre: r.nombre as string,
    activa: Boolean(r.activa),
    total_mesas: Number(r.total_mesas),
  };
}

async function cargarSeccion(ex: Ejecutor, nombre: string): Promise<SeccionAdminDto> {
  const [fila] = await filas(ex, `${SELECT_SECCION} WHERE s.nombre = ? GROUP BY s.nombre, s.activa`, [nombre]);
  if (!fila) throw new ErrorApi(404, "no_encontrado", "La sección no existe.");
  return aSeccionAdminDto(fila);
}

/** GET /api/catalogo/secciones: activas e inhabilitadas. */
export const listarSeccionesAdmin = async (_req: Request, res: Response) => {
  const rows = await filas(pool, `${SELECT_SECCION} GROUP BY s.nombre, s.activa ORDER BY s.nombre`);
  res.json(rows.map(aSeccionAdminDto));
};

const CrearSeccion = z.object({ nombre: NombreSeccion }).strict();

/** POST /api/catalogo/secciones { nombre } → 201. */
export const crearSeccionAdmin = async (req: Request, res: Response) => {
  const { nombre } = validar(CrearSeccion, req.body);
  try {
    await ejecutar(pool, "INSERT INTO seccion (nombre) VALUES (?)", [nombre]);
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una sección con ese nombre.");
    throw e;
  }
  res.status(201).json(await cargarSeccion(pool, nombre));
};

const CambioSeccion = z.union([
  z.object({ nombre: NombreSeccion }).strict(),
  z.object({ activa: z.boolean() }).strict(),
]);

/** PATCH /api/catalogo/secciones/:nombre: renombra en cascada o cambia disponibilidad. */
export const editarSeccionAdmin = async (req: Request, res: Response) => {
  const nombre = validar(NombreSeccion, req.params.nombre);
  const cambio = validar(CambioSeccion, req.body);
  let nombreFinal = nombre;

  if ("nombre" in cambio) {
    nombreFinal = cambio.nombre;
    try {
      await transaccion(async (cx) => {
        const [seccion] = await filas(cx, "SELECT nombre FROM seccion WHERE nombre = ? FOR UPDATE", [nombre]);
        if (!seccion) throw new ErrorApi(404, "no_encontrado", "La sección no existe.");
        await ejecutar(cx, "UPDATE seccion SET nombre = ? WHERE nombre = ?", [nombreFinal, nombre]);
        await ejecutar(cx, "UPDATE mesa SET zona = ? WHERE zona = ?", [nombreFinal, nombre]);
      });
    } catch (e) {
      if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una sección con ese nombre.");
      throw e;
    }
  } else {
    await transaccion(async (cx) => {
      const [seccion] = await filas(cx, "SELECT nombre, activa FROM seccion WHERE nombre = ? FOR UPDATE", [nombre]);
      if (!seccion) throw new ErrorApi(404, "no_encontrado", "La sección no existe.");
      if (!cambio.activa && Boolean(seccion.activa)) {
        const [ocupacion] = await filas(
          cx,
          `SELECT m.numero
             FROM mesa m
            WHERE m.zona = ?
              AND (m.estado <> 'libre'
                   OR EXISTS (SELECT 1 FROM cuenta c WHERE c.id_mesa = m.id_mesa AND c.estado <> 'cerrada')
                   OR EXISTS (SELECT 1 FROM reservacion r WHERE r.id_mesa = m.id_mesa AND r.estado IN ('pendiente', 'confirmada')))
            LIMIT 1`,
          [nombre],
        );
        if (ocupacion) {
          throw new ErrorApi(409, "estado_invalido", `No se puede inhabilitar «${nombre}» mientras la mesa ${ocupacion.numero} esté ocupada, tenga una cuenta abierta o una reservación vigente.`);
        }
      }
      await ejecutar(cx, "UPDATE seccion SET activa = ? WHERE nombre = ?", [cambio.activa, nombre]);
    });
  }

  res.json(await cargarSeccion(pool, nombreFinal));
};

/** DELETE /api/catalogo/secciones/:nombre: solo secciones sin mesas asignadas. */
export const borrarSeccionAdmin = async (req: Request, res: Response) => {
  const nombre = validar(NombreSeccion, req.params.nombre);
  const resultado = await ejecutar(
    pool,
    "DELETE FROM seccion WHERE nombre = ? AND NOT EXISTS (SELECT 1 FROM mesa WHERE zona = ?)",
    [nombre, nombre],
  );
  if (resultado.affectedRows === 0) {
    const [seccion] = await filas(pool, "SELECT nombre FROM seccion WHERE nombre = ?", [nombre]);
    if (!seccion) throw new ErrorApi(404, "no_encontrado", "La sección no existe.");
    throw new ErrorApi(409, "estado_invalido", `No se puede borrar «${nombre}» mientras tenga mesas asignadas.`);
  }
  res.json({ ok: true });
};

// ───────────────────────────── Mesas (solo gerente) ─────────────────────────────
// `activa = false` significa «mesa no disponible»: desaparece del Panel de mesas y del Salón
// (GET /api/mesas solo trae las activas) y no se puede sentar, reservar ni cambiar de estado.
// Las mesas no se borran (tienen cuentas y reservaciones ligadas): se marcan como no disponibles.

interface MesaAdminDto {
  id_mesa: number;
  numero: number;
  capacidad: number;
  zona: string | null; // «sección» del salón; texto libre
  /** Ids de caracteristica_mesa (también las desactivadas, para no perderlas al editar). */
  caracteristicas: number[];
  activa: boolean;
  estado: string; // libre | ocupada | reservada (ocupación actual)
}

const SELECT_MESA_ADMIN = "SELECT id_mesa, numero, capacidad, zona, activa, estado FROM mesa";

function aMesaAdminDto(r: Record<string, unknown>, caracteristicas: number[]): MesaAdminDto {
  return {
    id_mesa: r.id_mesa as number,
    numero: r.numero as number,
    capacidad: r.capacidad as number,
    zona: (r.zona as string | null) ?? null,
    caracteristicas,
    activa: Boolean(r.activa),
    estado: r.estado as string,
  };
}

async function cargarMesaAdmin(ex: Ejecutor, id: number): Promise<MesaAdminDto> {
  const [fila] = await filas(ex, `${SELECT_MESA_ADMIN} WHERE id_mesa = ?`, [id]);
  if (!fila) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
  return aMesaAdminDto(fila, (await idsCaracteristicasDeMesas(ex)).get(id) ?? []);
}

/** GET /api/catalogo/mesas: todas las mesas, también las no disponibles. */
export const listarMesasAdmin = async (_req: Request, res: Response) => {
  const rows = await filas(pool, `${SELECT_MESA_ADMIN} ORDER BY numero`);
  const caracteristicas = await idsCaracteristicasDeMesas(pool);
  res.json(rows.map((r) => aMesaAdminDto(r, caracteristicas.get(Number(r.id_mesa)) ?? [])));
};

const NumeroMesa = z.number().int().min(1, "debe ser mayor a 0").max(999, "máximo 999");
const CapacidadMesa = z.number().int().min(1, "debe ser mayor a 0").max(50, "máximo 50 personas");
const ZonaMesa = z.string().trim().max(40, "máximo 40 caracteres").regex(REGEX_TEXTO_CATALOGO, MENSAJE_TEXTO_CATALOGO);

const CrearMesa = z.object({
  numero: NumeroMesa,
  capacidad: CapacidadMesa,
  zona: ZonaMesa.min(1, "la sección es obligatoria"),
  caracteristicas: IdsCaracteristicas.default([]),
  activa: z.boolean().optional(),
});

async function exigirSeccionActiva(ex: Ejecutor, zona: string): Promise<void> {
  const [seccion] = await filas(ex, "SELECT nombre FROM seccion WHERE nombre = ? AND activa = TRUE FOR UPDATE", [zona]);
  if (!seccion) throw new ErrorApi(409, "estado_invalido", `La sección «${zona}» no existe o está inhabilitada.`);
}

/** POST /api/catalogo/mesas { numero, capacidad, zona, activa? } → 201. La mesa nace `libre`. */
export const crearMesaAdmin = async (req: Request, res: Response) => {
  const d = validar(CrearMesa, req.body);
  let id: number;
  try {
    const r = await transaccion(async (cx) => {
      await exigirSeccionActiva(cx, d.zona);
      const insertada = await ejecutar(cx, "INSERT INTO mesa (numero, capacidad, zona, activa) VALUES (?, ?, ?, ?)", [
        d.numero,
        d.capacidad,
        d.zona,
        d.activa ?? true,
      ]);
      await guardarCaracteristicasMesa(cx, insertada.insertId, d.caracteristicas);
      return insertada;
    });
    id = r.insertId;
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", `Ya existe la mesa ${d.numero}.`);
    throw e;
  }
  res.status(201).json(await cargarMesaAdmin(pool, id));
};

const EditarMesa = z
  .object({
    numero: NumeroMesa,
    capacidad: CapacidadMesa,
    zona: ZonaMesa.min(1, "la sección es obligatoria"),
    caracteristicas: IdsCaracteristicas,
    activa: z.boolean(),
  })
  .partial();

/**
 * PATCH /api/catalogo/mesas/:id  (cualquier subconjunto de campos)
 * No se puede marcar como no disponible una mesa ocupada o reservada, con una cuenta abierta o con
 * reservaciones vigentes: primero hay que liberarla o cancelar esas reservaciones.
 */
export const editarMesaAdmin = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const d = validar(EditarMesa, req.body);
  if (Object.keys(d).length === 0) throw new ErrorApi(422, "estado_invalido", "No hay nada que cambiar.");

  try {
    await transaccion(async (cx) => {
      const [mesa] = await filas(cx, "SELECT numero, estado, activa FROM mesa WHERE id_mesa = ? FOR UPDATE", [id]);
      if (!mesa) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
      if (d.zona !== undefined) await exigirSeccionActiva(cx, d.zona);

      if (d.activa === false && Boolean(mesa.activa)) {
        if (mesa.estado !== "libre") {
          throw new ErrorApi(409, "estado_invalido", `La mesa ${mesa.numero} está ${mesa.estado}: libérala antes de marcarla como no disponible.`);
        }
        const [cuenta] = await filas(cx, "SELECT 1 AS x FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' LIMIT 1", [id]);
        if (cuenta) {
          throw new ErrorApi(409, "estado_invalido", `La mesa ${mesa.numero} tiene una cuenta abierta: hay que cerrarla antes.`);
        }
        const [reserva] = await filas(
          cx,
          "SELECT 1 AS x FROM reservacion WHERE id_mesa = ? AND estado IN ('pendiente', 'confirmada') LIMIT 1",
          [id],
        );
        if (reserva) {
          throw new ErrorApi(409, "estado_invalido", `La mesa ${mesa.numero} tiene reservaciones vigentes: cancélalas o cámbialas de mesa antes.`);
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      if (d.numero !== undefined) (sets.push("numero = ?"), params.push(d.numero));
      if (d.capacidad !== undefined) (sets.push("capacidad = ?"), params.push(d.capacidad));
      if (d.zona !== undefined) (sets.push("zona = ?"), params.push(d.zona));
      if (d.activa !== undefined) (sets.push("activa = ?"), params.push(d.activa));
      if (sets.length > 0) await ejecutar(cx, `UPDATE mesa SET ${sets.join(", ")} WHERE id_mesa = ?`, [...params, id]);
      if (d.caracteristicas !== undefined) {
        // Las desactivadas que ya tenía la mesa se conservan aunque el formulario no las muestre.
        const [inactivas] = await filas(
          cx,
          `SELECT GROUP_CONCAT(mc.id_caracteristica) AS ids
             FROM mesa_caracteristica mc JOIN caracteristica_mesa c USING (id_caracteristica)
            WHERE mc.id_mesa = ? AND c.activa = FALSE`,
          [id],
        );
        const conservar = String(inactivas?.ids ?? "").split(",").filter(Boolean).map(Number);
        const activas = d.caracteristicas.filter((c) => !conservar.includes(c));
        await guardarCaracteristicasMesa(cx, id, activas);
        for (const c of conservar) {
          await ejecutar(cx, "INSERT IGNORE INTO mesa_caracteristica (id_mesa, id_caracteristica) VALUES (?, ?)", [id, c]);
        }
      }
    });
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", `Ya existe la mesa ${d.numero}.`);
    throw e;
  }

  res.json(await cargarMesaAdmin(pool, id));
};

// ───────────────────────────── Características de mesa (solo gerente) ─────────────────────────────
// Catálogo de características que Gerencia asigna a las mesas («Planta baja», «Junto a la ventana»…). El cliente y la
// hostess las piden en la reservación. Desactivar una la oculta para nuevas asignaciones y del portal, sin borrarla de
// las mesas; borrar solo se permite si ninguna mesa ni reservación la usa.

const NombreCaracteristica = textoCatalogo(40);

const SELECT_CARACTERISTICA = `
  SELECT c.id_caracteristica, c.nombre, c.activa,
         (SELECT COUNT(*) FROM mesa_caracteristica mc WHERE mc.id_caracteristica = c.id_caracteristica) AS total_mesas,
         (SELECT COUNT(*) FROM reservacion_caracteristica rc WHERE rc.id_caracteristica = c.id_caracteristica) AS total_reservaciones
    FROM caracteristica_mesa c`;

function aCaracteristicaAdmin(r: Record<string, unknown>) {
  return {
    id_caracteristica: Number(r.id_caracteristica),
    nombre: String(r.nombre),
    activa: Boolean(r.activa),
    total_mesas: Number(r.total_mesas),
    total_reservaciones: Number(r.total_reservaciones),
  };
}

async function cargarCaracteristica(ex: Ejecutor, id: number) {
  const [fila] = await filas(ex, `${SELECT_CARACTERISTICA} WHERE c.id_caracteristica = ?`, [id]);
  if (!fila) throw new ErrorApi(404, "no_encontrado", "La característica no existe.");
  return aCaracteristicaAdmin(fila);
}

/** GET /api/catalogo/caracteristicas: activas e inactivas, con cuántas mesas y reservaciones las usan. */
export const listarCaracteristicas = async (_req: Request, res: Response) => {
  const rows = await filas(pool, `${SELECT_CARACTERISTICA} ORDER BY c.nombre`);
  res.json(rows.map(aCaracteristicaAdmin));
};

/** POST /api/catalogo/caracteristicas { nombre } → 201. */
export const crearCaracteristica = async (req: Request, res: Response) => {
  const { nombre } = validar(z.object({ nombre: NombreCaracteristica }).strict(), req.body);
  try {
    const r = await ejecutar(pool, "INSERT INTO caracteristica_mesa (nombre) VALUES (?)", [nombre]);
    res.status(201).json(await cargarCaracteristica(pool, r.insertId));
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una característica con ese nombre.");
    throw e;
  }
};

/** PATCH /api/catalogo/caracteristicas/:id { nombre } o { activa }. */
export const editarCaracteristica = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const cambio = validar(
    z.union([z.object({ nombre: NombreCaracteristica }).strict(), z.object({ activa: z.boolean() }).strict()]),
    req.body,
  );
  await cargarCaracteristica(pool, id);
  try {
    if ("nombre" in cambio) await ejecutar(pool, "UPDATE caracteristica_mesa SET nombre = ? WHERE id_caracteristica = ?", [cambio.nombre, id]);
    else await ejecutar(pool, "UPDATE caracteristica_mesa SET activa = ? WHERE id_caracteristica = ?", [cambio.activa, id]);
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una característica con ese nombre.");
    throw e;
  }
  res.json(await cargarCaracteristica(pool, id));
};

/** DELETE /api/catalogo/caracteristicas/:id: solo si ninguna mesa ni reservación la usa (si no, desactivarla). */
export const borrarCaracteristica = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const c = await cargarCaracteristica(pool, id);
  if (c.total_mesas > 0 || c.total_reservaciones > 0) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      `«${c.nombre}» está en ${c.total_mesas} ${c.total_mesas === 1 ? "mesa" : "mesas"} y ${c.total_reservaciones} ` +
        `${c.total_reservaciones === 1 ? "reservación" : "reservaciones"}. Quítala de las mesas o desactívala.`,
    );
  }
  await ejecutar(pool, "DELETE FROM caracteristica_mesa WHERE id_caracteristica = ?", [id]);
  res.json({ ok: true });
};
