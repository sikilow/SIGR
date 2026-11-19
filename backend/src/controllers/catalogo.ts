import type { Request, Response } from "express";
import { z } from "zod";
import { ejecutar, filas, pool, transaccion, type Ejecutor } from "../services/db";
import { ESTADO_PEDIDO_DB, idDeRuta, validar } from "../models/dominio";
import { ErrorApi } from "../utils/errores";
import { MENSAJE_NOTA, MENSAJE_TEXTO_CATALOGO, REGEX_NOTA, REGEX_TEXTO_CATALOGO, textoCatalogo, textoCatalogoOpcional } from "../utils/campos";
import { aMinutos, cargarHorario, INTERVALOS_RESERVACION, NOMBRES_DIA } from "../models/horarioReservacion";
import { guardarCaracteristicasMesa, IdsCaracteristicas, idsCaracteristicasDeMesas } from "../models/caracteristicasMesa";

// Todo este módulo es solo del gerente.

const SELECT_CONFIGURACION = `
  SELECT tolerancia_minutos, recordatorio_minutos, anticipacion_minutos, duracion_reservacion_minutos
    FROM configuracion_reservacion WHERE id = 1`;

/** Configuración + horario por día (horas como "HH:MM"; `dias` va de lunes a domingo). */
async function leerConfiguracionDto(ex: Ejecutor) {
  const [fila] = await filas(ex, SELECT_CONFIGURACION);
  if (!fila) throw new ErrorApi(500, "desconocido", "No existe la configuración de reservaciones. Ejecuta la migración 010.");
  const horario = await cargarHorario(ex);
  return {
    tolerancia_minutos: Number(fila.tolerancia_minutos),
    recordatorio_minutos: Number(fila.recordatorio_minutos),
    anticipacion_minutos: Number(fila.anticipacion_minutos),
    duracion_reservacion_minutos: Number(fila.duracion_reservacion_minutos),
    intervalo_minutos: horario.intervalo_minutos,
    dias: horario.dias,
  };
}

/** GET /api/catalogo/configuracion-reservacion */
export const obtenerConfiguracionReservacion = async (_req: Request, res: Response) => {
  res.json(await leerConfiguracionDto(pool));
};

const HoraHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "la hora debe tener formato HH:MM");
const DiaHorario = z.object({
  abierto: z.boolean(),
  hora_apertura: HoraHHMM,
  hora_ultima_reservacion: HoraHHMM,
}).strict();
const ConfiguracionReservacion = z.object({
  tolerancia_minutos: z.number().int().min(5).max(180),
  recordatorio_minutos: z.number().int().min(1).max(30),
  /** Con cuánto tiempo mínimo antes de la hora se puede reservar (0 = sin mínimo; hasta 24 h). */
  anticipacion_minutos: z.number().int().min(0).max(1440),
  /** Cada cuánto se ofrecen horas (migración 022). */
  intervalo_minutos: z.number().int().refine((n) => (INTERVALOS_RESERVACION as readonly number[]).includes(n), "debe ser 15, 30 o 60"),
  /** Horario de cada día, de lunes a domingo (migración 030). */
  dias: z.array(DiaHorario).length(7, "deben ser siete días, de lunes a domingo").refine((d) => d.some((x) => x.abierto), "abre al menos un día"),
  /** Cuánto ocupa una reservación su mesa al calcular la disponibilidad (migración 023). */
  duracion_reservacion_minutos: z.number().int().min(30).max(360),
}).strict();

/** PATCH /api/catalogo/configuracion-reservacion */
export const actualizarConfiguracionReservacion = async (req: Request, res: Response) => {
  const datos = validar(ConfiguracionReservacion, req.body);
  // La última hora no puede ser antes de la primera (también en un día cerrado: sus horas se conservan).
  datos.dias.forEach((d, i) => {
    if (aMinutos(d.hora_apertura) > aMinutos(d.hora_ultima_reservacion)) {
      throw new ErrorApi(422, "estado_invalido", `Los ${NOMBRES_DIA[i]}, la última hora para reservar no puede ser antes de la primera.`);
    }
  });
  res.json(
    await transaccion(async (cx) => {
      const [existe] = await filas(cx, "SELECT id FROM configuracion_reservacion WHERE id = 1 FOR UPDATE");
      if (!existe) throw new ErrorApi(500, "desconocido", "No existe la configuración de reservaciones. Ejecuta la migración 010.");
      await ejecutar(
        cx,
        `UPDATE configuracion_reservacion
            SET tolerancia_minutos = ?, recordatorio_minutos = ?, anticipacion_minutos = ?,
                intervalo_minutos = ?, duracion_reservacion_minutos = ?
          WHERE id = 1`,
        [datos.tolerancia_minutos, datos.recordatorio_minutos, datos.anticipacion_minutos, datos.intervalo_minutos, datos.duracion_reservacion_minutos],
      );
      for (const [dia, d] of datos.dias.entries()) {
        await ejecutar(
          cx,
          `INSERT INTO horario_reservacion_dia (dia, abierto, hora_apertura, hora_ultima_reservacion) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE abierto = VALUES(abierto), hora_apertura = VALUES(hora_apertura),
                                   hora_ultima_reservacion = VALUES(hora_ultima_reservacion)`,
          [dia, d.abierto, d.hora_apertura, d.hora_ultima_reservacion],
        );
      }
      return leerConfiguracionDto(cx);
    }),
  );
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
         DATE_FORMAT(cmp.eliminado_en, '%Y-%m-%d %H:%i:%s') AS categoria_eliminada_en,
         mp.id_metodo, mp.nombre, mp.es_efectivo, mp.activo,
         DATE_FORMAT(mp.eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en
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
    /** NULL = vigente; con fecha = eliminado (migración 029). */
    eliminado_en: (fila.eliminado_en as string | null) ?? null,
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
    eliminado_en: (primera.categoria_eliminada_en as string | null) ?? null,
    metodos: filasCategoria.filter((fila) => fila.id_metodo !== null).map(metodoPagoDto),
  };
}

/**
 * GET /api/catalogo/metodos-pago[?eliminados=1]: categorías y métodos para Gerencia.
 * Por omisión, lo vigente. Con `eliminados=1`, solo lo eliminado: las categorías eliminadas y los métodos eliminados
 * (agrupados en su categoría, que puede seguir vigente).
 */
export const listarMetodosPago = async (req: Request, res: Response) => {
  const filasPago = await filas(pool, `${SELECT_METODOS_PAGO} ORDER BY cmp.id_categoria_metodo_pago, mp.id_metodo`);
  const eliminados = pideEliminados(req);
  const porCategoria = new Map<number, Array<Record<string, unknown>>>();
  for (const fila of filasPago) {
    const categoriaEliminada = fila.categoria_eliminada_en !== null;
    const metodoEliminado = fila.id_metodo !== null && fila.eliminado_en !== null;
    if (eliminados ? !(categoriaEliminada || metodoEliminado) : categoriaEliminada || metodoEliminado) continue;
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
      WHERE cmp.activo = 1 AND mp.activo = 1 AND cmp.eliminado_en IS NULL AND mp.eliminado_en IS NULL
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
    if (esDuplicado(error)) {
      throw new ErrorApi(409, "estado_invalido", await mensajeRepetido(pool, "categoria_metodo_pago", "nombre", datos.nombre,
        "Ya existe una categoría de pago con ese nombre.", "Hay una categoría de pago eliminada con ese nombre. Restáurala desde «Eliminados» en lugar de crear otra."));
    }
    throw error;
  }
  const [categoria] = await filas(pool, "SELECT id_categoria_metodo_pago, nombre, tipo, activo FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ?", [idCategoria]);
  if (!categoria) throw new ErrorApi(500, "desconocido", "No se pudo recuperar la categoría de pago creada.");
  res.status(201).json({
    id_categoria_metodo_pago: Number(categoria.id_categoria_metodo_pago),
    nombre: String(categoria.nombre),
    tipo: String(categoria.tipo),
    activo: Boolean(categoria.activo),
    eliminado_en: null,
    metodos: [],
  });
};

/** PATCH /api/catalogo/metodos-pago/categorias/:id: activa o desactiva la categoría. */
export const actualizarCategoriaMetodoPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { activo } = validar(CambioCategoriaPago, req.body);
  const categoria = await transaccion(async (cx) => {
    const [actual] = await filas(cx, "SELECT id_categoria_metodo_pago, nombre, tipo, eliminado_en FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ? FOR UPDATE", [id]);
    if (!actual) throw new ErrorApi(404, "no_encontrado", "La categoría de pago no existe.");
    if (actual.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La categoría está eliminada. Restáurala para poder cambiarla.");
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
    `${SELECT_METODOS_PAGO} WHERE cmp.id_categoria_metodo_pago = ? AND mp.eliminado_en IS NULL ORDER BY mp.id_metodo`,
    [id],
  );
  res.json({ ...categoria, eliminado_en: null, metodos: metodos.filter((fila) => fila.id_metodo !== null).map(metodoPagoDto) });
};

/** POST /api/catalogo/metodos-pago: agrega un método a una categoría. */
export const crearMetodoPago = async (req: Request, res: Response) => {
  const datos = validar(NuevoMetodoPago, req.body);
  const [categoria] = await filas(
    pool,
    "SELECT tipo, eliminado_en FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ?",
    [datos.id_categoria_metodo_pago],
  );
  if (!categoria) throw new ErrorApi(404, "no_encontrado", "La categoría de pago no existe.");
  if (categoria.eliminado_en) throw new ErrorApi(422, "estado_invalido", "La categoría de pago está eliminada. Restáurala o elige otra.");
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
    if (esDuplicado(error)) {
      throw new ErrorApi(409, "estado_invalido", await mensajeRepetido(pool, "metodo_pago", "nombre", datos.nombre,
        "Ya existe un método de pago con ese nombre.", "Hay un método de pago eliminado con ese nombre. Restáuralo desde «Eliminados» en lugar de crear otro."));
    }
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
      `SELECT mp.id_metodo, mp.es_efectivo, mp.eliminado_en, cmp.tipo
         FROM metodo_pago mp JOIN categoria_metodo_pago cmp USING (id_categoria_metodo_pago)
        WHERE mp.id_metodo = ? FOR UPDATE`,
      [id],
    );
    if (!actual) throw new ErrorApi(404, "no_encontrado", "El método de pago no existe.");
    if (actual.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El método de pago está eliminado. Restáuralo para poder cambiarlo.");
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

/**
 * DELETE /api/catalogo/metodos-pago/categorias/:id  →  la categoría, ya eliminada (lógico, migración 029; queda
 * también inactiva). Solo si no tiene métodos vigentes.
 */
export const eliminarCategoriaMetodoPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [c] = await filas(cx, "SELECT nombre, eliminado_en FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ? FOR UPDATE", [id]);
    if (!c) throw new ErrorApi(404, "no_encontrado", "La categoría de pago no existe.");
    if (c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La categoría ya está eliminada.");
    const [m] = await filas(cx, "SELECT COUNT(*) AS n FROM metodo_pago WHERE id_categoria_metodo_pago = ? AND eliminado_en IS NULL", [id]);
    if (Number(m?.n ?? 0) > 0) {
      throw new ErrorApi(409, "estado_invalido", `«${String(c.nombre)}» tiene ${Number(m?.n)} método(s) de pago. Elimínalos antes de eliminar la categoría.`);
    }
    await ejecutar(cx, "UPDATE categoria_metodo_pago SET activo = FALSE, eliminado_en = NOW(), eliminado_por = ? WHERE id_categoria_metodo_pago = ? AND eliminado_en IS NULL", [req.usuario?.id ?? null, id]);
  });
  const filasCat = await filas(pool, `${SELECT_METODOS_PAGO} WHERE cmp.id_categoria_metodo_pago = ?`, [id]);
  res.json(categoriaPagoDto(filasCat));
};

/** POST /api/catalogo/metodos-pago/categorias/:id/restaurar  →  la categoría vigente otra vez, pero inactiva. */
export const restaurarCategoriaMetodoPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const [c] = await filas(pool, "SELECT eliminado_en FROM categoria_metodo_pago WHERE id_categoria_metodo_pago = ?", [id]);
  if (!c) throw new ErrorApi(404, "no_encontrado", "La categoría de pago no existe.");
  if (!c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La categoría no está eliminada.");
  await ejecutar(pool, "UPDATE categoria_metodo_pago SET eliminado_en = NULL, eliminado_por = NULL WHERE id_categoria_metodo_pago = ?", [id]);
  const filasCat = await filas(pool, `${SELECT_METODOS_PAGO} WHERE cmp.id_categoria_metodo_pago = ?`, [id]);
  const dto = categoriaPagoDto(filasCat);
  res.json({ ...dto, metodos: dto.metodos.filter((m) => m.eliminado_en === null) });
};

/**
 * DELETE /api/catalogo/metodos-pago/:id  →  el método, ya eliminado (lógico, migración 029; queda también inactivo).
 * No se elimina el método de efectivo (el cuadre de caja lo necesita) ni uno que una cuenta abierta tenga solicitado.
 * Los pagos anteriores lo conservan.
 */
export const eliminarMetodoPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [m] = await filas(cx, "SELECT nombre, es_efectivo, eliminado_en FROM metodo_pago WHERE id_metodo = ? FOR UPDATE", [id]);
    if (!m) throw new ErrorApi(404, "no_encontrado", "El método de pago no existe.");
    if (m.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El método de pago ya está eliminado.");
    if (Boolean(m.es_efectivo)) {
      throw new ErrorApi(409, "estado_invalido", "El método marcado como efectivo no se puede eliminar: el cuadre de caja lo necesita.");
    }
    const [uso] = await filas(cx, "SELECT COUNT(*) AS n FROM cuenta WHERE id_metodo_pago_solicitado = ? AND estado <> 'cerrada'", [id]);
    if (Number(uso?.n ?? 0) > 0) {
      throw new ErrorApi(409, "estado_invalido", `«${String(m.nombre)}» lo tienen solicitado ${Number(uso?.n)} cuenta(s) abiertas. Espera a que se cobren.`);
    }
    await ejecutar(cx, "UPDATE metodo_pago SET activo = FALSE, eliminado_en = NOW(), eliminado_por = ? WHERE id_metodo = ? AND eliminado_en IS NULL", [req.usuario?.id ?? null, id]);
  });
  const [fila] = await filas(pool, `${SELECT_METODOS_PAGO} WHERE mp.id_metodo = ?`, [id]);
  res.json(metodoPagoDto(fila ?? {}));
};

/** POST /api/catalogo/metodos-pago/:id/restaurar  →  el método vigente otra vez, pero inactivo. Su categoría debe estar vigente. */
export const restaurarMetodoPago = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const [m] = await filas(
    pool,
    `SELECT mp.eliminado_en, cmp.eliminado_en AS categoria_eliminada
       FROM metodo_pago mp JOIN categoria_metodo_pago cmp USING (id_categoria_metodo_pago) WHERE mp.id_metodo = ?`,
    [id],
  );
  if (!m) throw new ErrorApi(404, "no_encontrado", "El método de pago no existe.");
  if (!m.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El método de pago no está eliminado.");
  if (m.categoria_eliminada) throw new ErrorApi(409, "estado_invalido", "Su categoría está eliminada. Restaura primero la categoría.");
  await ejecutar(pool, "UPDATE metodo_pago SET eliminado_en = NULL, eliminado_por = NULL WHERE id_metodo = ?", [id]);
  const [fila] = await filas(pool, `${SELECT_METODOS_PAGO} WHERE mp.id_metodo = ?`, [id]);
  res.json(metodoPagoDto(fila ?? {}));
};

// ---------- Canales de pedido (para llevar): mostrador, teléfono, plataformas… ----------
const NombreCanal = textoCatalogo(40);
const NuevoCanal = z.object({ nombre: NombreCanal }).strict();
const CambioCanal = z.object({ activo: z.boolean() }).strict();

function canalDto(fila: Record<string, unknown>) {
  return {
    id_canal: Number(fila.id_canal),
    nombre: String(fila.nombre),
    activo: Boolean(fila.activo),
    /** NULL = vigente; con fecha = eliminado (migración 029). */
    eliminado_en: (fila.eliminado_en as string | null) ?? null,
  };
}

const SELECT_CANAL = "SELECT id_canal, nombre, activo, DATE_FORMAT(eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en FROM canal_pedido";

/** GET /api/catalogo/canales[?eliminados=1]: los canales vigentes (activos e inactivos), o solo los eliminados. */
export const listarCanales = async (req: Request, res: Response) => {
  res.json(
    (await filas(pool, `${SELECT_CANAL} WHERE eliminado_en IS ${pideEliminados(req) ? "NOT NULL" : "NULL"} ORDER BY id_canal`)).map(canalDto),
  );
};

/** GET /api/catalogo/canales/disponibles: los canales activos, para el mesero. */
export const listarCanalesDisponibles = async (_req: Request, res: Response) => {
  res.json((await filas(pool, `${SELECT_CANAL} WHERE activo = TRUE AND eliminado_en IS NULL ORDER BY id_canal`)).map(canalDto));
};

/** POST /api/catalogo/canales */
export const crearCanal = async (req: Request, res: Response) => {
  const { nombre } = validar(NuevoCanal, req.body);
  let id: number;
  try {
    id = (await ejecutar(pool, "INSERT INTO canal_pedido (nombre) VALUES (?)", [nombre])).insertId;
  } catch (error) {
    if (esDuplicado(error)) {
      throw new ErrorApi(409, "estado_invalido", await mensajeRepetido(pool, "canal_pedido", "nombre", nombre,
        "Ya existe un canal con ese nombre.", "Hay un canal eliminado con ese nombre. Restáuralo desde «Eliminados» en lugar de crear otro."));
    }
    throw error;
  }
  const [fila] = await filas(pool, `${SELECT_CANAL} WHERE id_canal = ?`, [id]);
  if (!fila) throw new ErrorApi(500, "desconocido", "No se pudo recuperar el canal creado.");
  res.status(201).json(canalDto(fila));
};

/** PATCH /api/catalogo/canales/:id: activa o desactiva el canal (no se borra: las cuentas anteriores lo conservan). */
export const actualizarCanal = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { activo } = validar(CambioCanal, req.body);
  const [actual] = await filas(pool, `${SELECT_CANAL} WHERE id_canal = ?`, [id]);
  if (!actual) throw new ErrorApi(404, "no_encontrado", "El canal no existe.");
  if (actual.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El canal está eliminado. Restáuralo para poder cambiarlo.");
  await ejecutar(pool, "UPDATE canal_pedido SET activo = ? WHERE id_canal = ?", [activo, id]);
  const [fila] = await filas(pool, `${SELECT_CANAL} WHERE id_canal = ?`, [id]);
  if (!fila) throw new ErrorApi(404, "no_encontrado", "El canal no existe.");
  res.json(canalDto(fila));
};

/**
 * DELETE /api/catalogo/canales/:id  →  el canal, ya eliminado (lógico, migración 029; queda también inactivo).
 * No se puede eliminar mientras una cuenta abierta lo use. Las cuentas anteriores lo conservan.
 */
export const eliminarCanal = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [c] = await filas(cx, "SELECT nombre, eliminado_en FROM canal_pedido WHERE id_canal = ? FOR UPDATE", [id]);
    if (!c) throw new ErrorApi(404, "no_encontrado", "El canal no existe.");
    if (c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El canal ya está eliminado.");
    const [uso] = await filas(cx, "SELECT COUNT(*) AS n FROM cuenta WHERE id_canal = ? AND estado <> 'cerrada'", [id]);
    if (Number(uso?.n ?? 0) > 0) {
      throw new ErrorApi(409, "estado_invalido", `«${String(c.nombre)}» lo usan ${Number(uso?.n)} pedido(s) para llevar que aún no se cobran. Espera a que se cobren.`);
    }
    await ejecutar(cx, "UPDATE canal_pedido SET activo = FALSE, eliminado_en = NOW(), eliminado_por = ? WHERE id_canal = ? AND eliminado_en IS NULL", [req.usuario?.id ?? null, id]);
  });
  const [fila] = await filas(pool, `${SELECT_CANAL} WHERE id_canal = ?`, [id]);
  res.json(canalDto(fila ?? {}));
};

/** POST /api/catalogo/canales/:id/restaurar  →  el canal vigente otra vez, pero inactivo (Gerencia lo activa). */
export const restaurarCanal = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const [c] = await filas(pool, `${SELECT_CANAL} WHERE id_canal = ?`, [id]);
  if (!c) throw new ErrorApi(404, "no_encontrado", "El canal no existe.");
  if (!c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El canal no está eliminado.");
  await ejecutar(pool, "UPDATE canal_pedido SET eliminado_en = NULL, eliminado_por = NULL WHERE id_canal = ?", [id]);
  const [fila] = await filas(pool, `${SELECT_CANAL} WHERE id_canal = ?`, [id]);
  res.json(canalDto(fila ?? {}));
};

const Texto = textoCatalogo;
const DescripcionProducto = z.string().trim().min(1, "es obligatorio").max(255, "máximo 255 caracteres").regex(REGEX_NOTA, MENSAJE_NOTA).refine(
  (descripcion) => descripcion.toLocaleLowerCase() !== "detalle pendiente de completar",
  "describe la presentación, porción o características del producto",
);

/**
 * Mensaje para un dato único repetido (nombre, número…): si el que ya existe está eliminado, se avisa que hay que
 * restaurarlo en lugar de crear otro (migración 029).
 */
async function mensajeRepetido(ex: Ejecutor, tabla: string, columna: string, valor: unknown, existe: string, eliminado: string): Promise<string> {
  const [f] = await filas(ex, `SELECT eliminado_en FROM ${tabla} WHERE ${columna} = ?`, [valor]);
  return f?.eliminado_en ? eliminado : existe;
}

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

// ======================= Categorías =======================

/**
 * categoria_menu.* + total_productos (calculado: COUNT de los productos vigentes de la categoría).
 * `eliminado_en`: NULL = vigente; con fecha = eliminada (migración 026, solo la ve el gerente en «Eliminados»).
 */
interface CategoriaAdminDto {
  id_categoria: number;
  nombre: string;
  total_productos: number;
  eliminado_en: string | null;
}

const SELECT_CATEGORIA = `
  SELECT c.id_categoria, c.nombre, COUNT(p.id_producto) AS total_productos,
         DATE_FORMAT(c.eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en
    FROM categoria_menu c LEFT JOIN producto p ON p.id_categoria = c.id_categoria AND p.eliminado_en IS NULL`;

function aCategoriaDto(f: Record<string, unknown>): CategoriaAdminDto {
  return {
    id_categoria: f.id_categoria as number,
    nombre: f.nombre as string,
    total_productos: Number(f.total_productos),
    eliminado_en: (f.eliminado_en as string | null) ?? null,
  };
}

async function cargarCategoria(ex: Ejecutor, id: number): Promise<CategoriaAdminDto | null> {
  const [f] = await filas(ex, `${SELECT_CATEGORIA} WHERE c.id_categoria = ? GROUP BY c.id_categoria, c.nombre, c.eliminado_en`, [id]);
  return f ? aCategoriaDto(f) : null;
}

/** `?eliminados=1` → solo lo eliminado (para «Eliminados»); si no, solo lo vigente. */
function pideEliminados(req: Request): boolean {
  return req.query.eliminados === "1" || req.query.eliminados === "true";
}

/** GET /api/catalogo/categorias[?eliminados=1] */
export const listarCategorias = async (req: Request, res: Response) => {
  const rows = await filas(
    pool,
    `${SELECT_CATEGORIA}
      WHERE c.eliminado_en IS ${pideEliminados(req) ? "NOT NULL" : "NULL"}
      GROUP BY c.id_categoria, c.nombre, c.eliminado_en ORDER BY c.id_categoria`,
  );
  res.json(rows.map(aCategoriaDto));
};

const CategoriaCuerpo = z.object({ nombre: Texto(80) });

/** POST /api/catalogo/categorias  { nombre }  →  201 */
export const crearCategoria = async (req: Request, res: Response) => {
  const { nombre } = validar(CategoriaCuerpo, req.body);
  try {
    const r = await ejecutar(pool, "INSERT INTO categoria_menu (nombre) VALUES (?)", [nombre]);
    res.status(201).json(await cargarCategoria(pool, r.insertId));
  } catch (e) {
    if (esDuplicado(e)) {
      const [igual] = await filas(pool, "SELECT eliminado_en FROM categoria_menu WHERE nombre = ?", [nombre]);
      throw new ErrorApi(409, "estado_invalido", igual?.eliminado_en
        ? "Ya hay una categoría eliminada con ese nombre. Restáurala desde «Eliminados»."
        : "Ya existe una categoría con ese nombre.");
    }
    throw e;
  }
};

/** PATCH /api/catalogo/categorias/:id  { nombre } */
export const editarCategoria = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const { nombre } = validar(CategoriaCuerpo, req.body);
  const actual = await cargarCategoria(pool, id);
  if (!actual) throw new ErrorApi(404, "no_encontrado", "La categoría no existe.");
  if (actual.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La categoría está eliminada. Restáurala para poder editarla.");
  try {
    await ejecutar(pool, "UPDATE categoria_menu SET nombre = ? WHERE id_categoria = ?", [nombre, id]);
  } catch (e) {
    if (esDuplicado(e)) {
      const [igual] = await filas(pool, "SELECT eliminado_en FROM categoria_menu WHERE nombre = ?", [nombre]);
      throw new ErrorApi(409, "estado_invalido", igual?.eliminado_en
        ? "Ya hay una categoría eliminada con ese nombre. Restáurala desde «Eliminados»."
        : "Ya existe una categoría con ese nombre.");
    }
    throw e;
  }
  const categoria = await cargarCategoria(pool, id);
  if (!categoria) throw new ErrorApi(404, "no_encontrado", "La categoría no existe.");
  res.json(categoria);
};

/**
 * DELETE /api/catalogo/categorias/:id  →  { ok: true }
 * «Eliminar» es lógico (migración 026): la categoría deja de mostrarse pero se conserva, con quién y cuándo. Solo se
 * puede eliminar una categoría sin productos vigentes (los productos no se reasignan solos). Se restaura con
 * POST /categorias/:id/restaurar.
 */
export const borrarCategoria = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const categoria = await cargarCategoria(pool, id);
  if (!categoria) throw new ErrorApi(404, "no_encontrado", "La categoría no existe.");
  if (categoria.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La categoría ya está eliminada.");
  if (categoria.total_productos > 0) {
    throw new ErrorApi(
      409,
      "estado_invalido",
      `La categoría tiene ${categoria.total_productos} producto(s). Elimínalos o muévelos a otra categoría antes de eliminarla.`,
    );
  }
  await ejecutar(pool, "UPDATE categoria_menu SET eliminado_en = NOW(), eliminado_por = ? WHERE id_categoria = ? AND eliminado_en IS NULL", [
    req.usuario?.id ?? null,
    id,
  ]);
  res.json({ ok: true });
};

/** POST /api/catalogo/categorias/:id/restaurar  →  la categoría vigente otra vez. */
export const restaurarCategoria = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const categoria = await cargarCategoria(pool, id);
  if (!categoria) throw new ErrorApi(404, "no_encontrado", "La categoría no existe.");
  if (!categoria.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La categoría no está eliminada.");
  await ejecutar(pool, "UPDATE categoria_menu SET eliminado_en = NULL, eliminado_por = NULL WHERE id_categoria = ?", [id]);
  res.json(await cargarCategoria(pool, id));
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
  /** Calculado: lo que ve el mesero (activo, no eliminado y, si controla existencia, con existencia > 0). */
  disponible: boolean;
  /** NULL = vigente; con fecha = eliminado (migración 026, solo lo ve el gerente en «Eliminados»). */
  eliminado_en: string | null;
}

const SELECT_PRODUCTO = `
  SELECT p.id_producto, p.id_categoria, c.nombre AS categoria, p.nombre, COALESCE(p.presentacion, '') AS presentacion,
         COALESCE(p.descripcion, '') AS descripcion, p.precio, p.disponible AS activo, p.controla_existencia,
         COALESCE(i.existencia, 0) AS existencia, COALESCE(i.stock_minimo, 0) AS stock_minimo,
         DATE_FORMAT(p.eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en
    FROM producto p
    JOIN categoria_menu c ON c.id_categoria = p.id_categoria
    LEFT JOIN disponibilidadProducto i ON i.id_producto = p.id_producto`;

function aProductoDto(f: Record<string, unknown>): ProductoAdminDto {
  const activo = Boolean(f.activo);
  const existencia = Number(f.existencia);
  const controla = Boolean(f.controla_existencia);
  const eliminadoEn = (f.eliminado_en as string | null) ?? null;
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
    disponible: eliminadoEn === null && activo && (!controla || existencia > 0),
    eliminado_en: eliminadoEn,
  };
}

async function cargarProducto(ex: Ejecutor, id: number): Promise<ProductoAdminDto | null> {
  const [f] = await filas(ex, `${SELECT_PRODUCTO} WHERE p.id_producto = ?`, [id]);
  return f ? aProductoDto(f) : null;
}

async function exigirCategoria(ex: Ejecutor, id: number, bloquear = false): Promise<void> {
  const [f] = await filas(ex, `SELECT eliminado_en FROM categoria_menu WHERE id_categoria = ?${bloquear ? " FOR UPDATE" : ""}`, [id]);
  if (!f) throw new ErrorApi(422, "estado_invalido", "La categoría indicada no existe.");
  if (f.eliminado_en) throw new ErrorApi(422, "estado_invalido", "La categoría indicada está eliminada. Restáurala o elige otra.");
}

/** Mensaje cuando ya hay un producto con la misma categoría, nombre y presentación. */
function mensajeProductoRepetido(eliminado: boolean, otro = false): string {
  if (eliminado) return "Hay un producto eliminado con esa categoría, nombre y presentación. Restáuralo desde «Eliminados» en lugar de crear otro.";
  return otro
    ? "Ya existe otro producto con la misma categoría, nombre y presentación."
    : "Ya existe un producto con esa categoría, nombre y presentación. Búscalo y edita sus datos o existencias.";
}

/** GET /api/catalogo/productos[?eliminados=1]  →  los vigentes (también los inactivos) con su inventario, o solo los eliminados. */
export const listarProductos = async (req: Request, res: Response) => {
  const rows = await filas(
    pool,
    `${SELECT_PRODUCTO} WHERE p.eliminado_en IS ${pideEliminados(req) ? "NOT NULL" : "NULL"} ORDER BY c.id_categoria, p.nombre, p.presentacion`,
  );
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
    const [existente] = await filas(cx, `SELECT p.id_producto, p.eliminado_en
       FROM producto p
      WHERE p.id_categoria = ? AND p.nombre = ? AND COALESCE(p.presentacion, '') = ?
      ORDER BY p.id_producto LIMIT 1 FOR UPDATE`, [d.id_categoria, d.nombre, d.presentacion ?? ""]);
    if (existente) throw new ErrorApi(409, "estado_invalido", mensajeProductoRepetido(Boolean(existente.eliminado_en)));

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
    const [preExiste] = await filas(cx, "SELECT id_categoria, eliminado_en FROM producto WHERE id_producto = ?", [id]);
    if (!preExiste) throw new ErrorApi(404, "no_encontrado", "El producto no existe.");
    if (preExiste.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El producto está eliminado. Restáuralo para poder editarlo.");
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
        `SELECT id_producto, eliminado_en FROM producto
          WHERE id_producto <> ? AND id_categoria = ? AND nombre = ? AND COALESCE(presentacion, '') = ?
          LIMIT 1 FOR UPDATE`,
        [id, categoria, nombre, presentacion],
      );
      if (duplicado) throw new ErrorApi(409, "estado_invalido", mensajeProductoRepetido(Boolean(duplicado.eliminado_en), true));
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

/**
 * DELETE /api/catalogo/productos/:id  →  el producto, ya eliminado.
 * «Eliminar» es lógico (migración 026): el producto deja de mostrarse en el menú y en las listas, pero se conserva para
 * el historial (pedidos y ventas viejos siguen mostrando su nombre). Se registra quién y cuándo. No se puede eliminar
 * mientras esté en un pedido que aún no se entrega. Distinto de «desactivar» (`activo: false`), que lo oculta al
 * personal pero el gerente lo sigue viendo. Se restaura con POST /productos/:id/restaurar.
 */
export const eliminarProducto = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [p] = await filas(cx, "SELECT nombre, eliminado_en FROM producto WHERE id_producto = ? FOR UPDATE", [id]);
    if (!p) throw new ErrorApi(404, "no_encontrado", "El producto no existe.");
    if (p.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El producto ya está eliminado.");

    const sinEntregar = [ESTADO_PEDIDO_DB.registrado, ESTADO_PEDIDO_DB.enviado, ESTADO_PEDIDO_DB.en_preparacion, ESTADO_PEDIDO_DB.listo];
    const [uso] = await filas(
      cx,
      `SELECT COUNT(DISTINCT pe.id_pedido) AS pedidos
         FROM detalle_pedido dp
         JOIN pedido pe ON pe.id_pedido = dp.id_pedido
         JOIN estado_pedido ep ON ep.id_estado = pe.id_estado
        WHERE dp.id_producto = ? AND ep.nombre IN (?)`,
      [id, sinEntregar],
    );
    const pedidos = Number(uso?.pedidos ?? 0);
    if (pedidos > 0) {
      throw new ErrorApi(
        409,
        "estado_invalido",
        `«${String(p.nombre)}» está en ${pedidos} pedido(s) que aún no se entregan. Espera a que se entreguen o cancélalos; mientras tanto puedes desactivarlo.`,
      );
    }
    await ejecutar(cx, "UPDATE producto SET eliminado_en = NOW(), eliminado_por = ? WHERE id_producto = ? AND eliminado_en IS NULL", [
      req.usuario?.id ?? null,
      id,
    ]);
  });
  res.json(await cargarProducto(pool, id));
};

/** POST /api/catalogo/productos/:id/restaurar  →  el producto vigente otra vez (sigue con su estado activo/inactivo). */
export const restaurarProducto = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [p] = await filas(
      cx,
      `SELECT p.eliminado_en, c.eliminado_en AS categoria_eliminada
         FROM producto p JOIN categoria_menu c ON c.id_categoria = p.id_categoria
        WHERE p.id_producto = ? FOR UPDATE`,
      [id],
    );
    if (!p) throw new ErrorApi(404, "no_encontrado", "El producto no existe.");
    if (!p.eliminado_en) throw new ErrorApi(409, "estado_invalido", "El producto no está eliminado.");
    if (p.categoria_eliminada) throw new ErrorApi(409, "estado_invalido", "Su categoría está eliminada. Restaura primero la categoría.");
    await ejecutar(cx, "UPDATE producto SET eliminado_en = NULL, eliminado_por = NULL WHERE id_producto = ?", [id]);
  });
  res.json(await cargarProducto(pool, id));
};

// ───────────────────────────── Secciones (solo gerente) ─────────────────────────────

interface SeccionAdminDto {
  nombre: string;
  activa: boolean;
  /** Mesas vigentes de la sección (las eliminadas no cuentan). */
  total_mesas: number;
  /** NULL = vigente; con fecha = eliminada (migración 029). */
  eliminado_en: string | null;
}

const NombreSeccion = Texto(40);
const SELECT_SECCION = `SELECT s.nombre, s.activa, COUNT(m.id_mesa) AS total_mesas,
                                DATE_FORMAT(s.eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en
                         FROM seccion s LEFT JOIN mesa m ON m.zona = s.nombre AND m.eliminado_en IS NULL`;

function aSeccionAdminDto(r: Record<string, unknown>): SeccionAdminDto {
  return {
    nombre: r.nombre as string,
    activa: Boolean(r.activa),
    total_mesas: Number(r.total_mesas),
    eliminado_en: (r.eliminado_en as string | null) ?? null,
  };
}

async function cargarSeccion(ex: Ejecutor, nombre: string): Promise<SeccionAdminDto> {
  const [fila] = await filas(ex, `${SELECT_SECCION} WHERE s.nombre = ? GROUP BY s.nombre, s.activa, s.eliminado_en`, [nombre]);
  if (!fila) throw new ErrorApi(404, "no_encontrado", "La sección no existe.");
  return aSeccionAdminDto(fila);
}

/** GET /api/catalogo/secciones[?eliminados=1]: las vigentes (activas e inhabilitadas), o solo las eliminadas. */
export const listarSeccionesAdmin = async (req: Request, res: Response) => {
  const rows = await filas(
    pool,
    `${SELECT_SECCION} WHERE s.eliminado_en IS ${pideEliminados(req) ? "NOT NULL" : "NULL"} GROUP BY s.nombre, s.activa, s.eliminado_en ORDER BY s.nombre`,
  );
  res.json(rows.map(aSeccionAdminDto));
};

const CrearSeccion = z.object({ nombre: NombreSeccion }).strict();

/** POST /api/catalogo/secciones { nombre } → 201. */
export const crearSeccionAdmin = async (req: Request, res: Response) => {
  const { nombre } = validar(CrearSeccion, req.body);
  try {
    await ejecutar(pool, "INSERT INTO seccion (nombre) VALUES (?)", [nombre]);
  } catch (e) {
    if (esDuplicado(e)) {
      throw new ErrorApi(409, "estado_invalido", await mensajeRepetido(pool, "seccion", "nombre", nombre,
        "Ya existe una sección con ese nombre.", "Hay una sección eliminada con ese nombre. Restáurala desde «Eliminadas» en lugar de crear otra."));
    }
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
  const [previa] = await filas(pool, "SELECT eliminado_en FROM seccion WHERE nombre = ?", [nombre]);
  if (previa?.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La sección está eliminada. Restáurala para poder cambiarla.");

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

/**
 * DELETE /api/catalogo/secciones/:nombre  →  { ok: true }
 * «Eliminar» es lógico (migración 029; queda también inhabilitada). Solo secciones sin mesas vigentes y que no sean la
 * de «Para llevar» (la usa el sistema). Se restaura con POST /secciones/:nombre/restaurar.
 */
export const borrarSeccionAdmin = async (req: Request, res: Response) => {
  const nombre = validar(NombreSeccion, req.params.nombre);
  await transaccion(async (cx) => {
    const [s] = await filas(cx, "SELECT es_para_llevar, eliminado_en FROM seccion WHERE nombre = ? FOR UPDATE", [nombre]);
    if (!s) throw new ErrorApi(404, "no_encontrado", "La sección no existe.");
    if (s.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La sección ya está eliminada.");
    if (Boolean(s.es_para_llevar)) throw new ErrorApi(409, "estado_invalido", `«${nombre}» la usa el sistema para los pedidos para llevar y no se puede eliminar.`);
    const [mesas] = await filas(cx, "SELECT COUNT(*) AS n FROM mesa WHERE zona = ? AND eliminado_en IS NULL", [nombre]);
    if (Number(mesas?.n ?? 0) > 0) {
      throw new ErrorApi(409, "estado_invalido", `No se puede eliminar «${nombre}» mientras tenga ${Number(mesas?.n)} mesa(s) asignadas. Elimínalas o pásalas a otra sección.`);
    }
    await ejecutar(cx, "UPDATE seccion SET activa = FALSE, eliminado_en = NOW(), eliminado_por = ? WHERE nombre = ? AND eliminado_en IS NULL", [req.usuario?.id ?? null, nombre]);
  });
  res.json({ ok: true });
};

/** POST /api/catalogo/secciones/:nombre/restaurar  →  la sección vigente otra vez, pero inhabilitada (Gerencia la habilita). */
export const restaurarSeccionAdmin = async (req: Request, res: Response) => {
  const nombre = validar(NombreSeccion, req.params.nombre);
  const s = await cargarSeccion(pool, nombre);
  if (!s.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La sección no está eliminada.");
  await ejecutar(pool, "UPDATE seccion SET eliminado_en = NULL, eliminado_por = NULL WHERE nombre = ?", [nombre]);
  res.json(await cargarSeccion(pool, nombre));
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
  /** NULL = vigente; con fecha = eliminada (migración 029). */
  eliminado_en: string | null;
}

const SELECT_MESA_ADMIN = "SELECT id_mesa, numero, capacidad, zona, activa, estado, DATE_FORMAT(eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en FROM mesa";

function aMesaAdminDto(r: Record<string, unknown>, caracteristicas: number[]): MesaAdminDto {
  return {
    id_mesa: r.id_mesa as number,
    numero: r.numero as number,
    capacidad: r.capacidad as number,
    zona: (r.zona as string | null) ?? null,
    caracteristicas,
    activa: Boolean(r.activa),
    estado: r.estado as string,
    eliminado_en: (r.eliminado_en as string | null) ?? null,
  };
}

async function cargarMesaAdmin(ex: Ejecutor, id: number): Promise<MesaAdminDto> {
  const [fila] = await filas(ex, `${SELECT_MESA_ADMIN} WHERE id_mesa = ?`, [id]);
  if (!fila) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
  return aMesaAdminDto(fila, (await idsCaracteristicasDeMesas(ex)).get(id) ?? []);
}

/** GET /api/catalogo/mesas[?eliminados=1]: las mesas vigentes (también las no disponibles), o solo las eliminadas. */
export const listarMesasAdmin = async (req: Request, res: Response) => {
  const rows = await filas(pool, `${SELECT_MESA_ADMIN} WHERE eliminado_en IS ${pideEliminados(req) ? "NOT NULL" : "NULL"} ORDER BY numero`);
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
    if (esDuplicado(e)) {
      throw new ErrorApi(409, "estado_invalido", await mensajeRepetido(pool, "mesa", "numero", d.numero,
        `Ya existe la mesa ${d.numero}.`, `Hay una mesa ${d.numero} eliminada. Restáurala desde «Eliminadas» en lugar de crear otra.`));
    }
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
 * Una mesa solo se puede dejar de usar (no disponible o eliminada) si está libre, sin cuenta abierta y sin reservaciones
 * vigentes: primero hay que liberarla o cancelar esas reservaciones.
 */
async function exigirMesaSinUso(cx: Ejecutor, id: number, mesa: Record<string, unknown>, destino: string): Promise<void> {
  if (mesa.estado !== "libre") {
    throw new ErrorApi(409, "estado_invalido", `La mesa ${mesa.numero} está ${mesa.estado}: libérala antes de ${destino}.`);
  }
  const [cuenta] = await filas(cx, "SELECT 1 AS x FROM cuenta WHERE id_mesa = ? AND estado <> 'cerrada' LIMIT 1", [id]);
  if (cuenta) {
    throw new ErrorApi(409, "estado_invalido", `La mesa ${mesa.numero} tiene una cuenta abierta: hay que cerrarla antes.`);
  }
  const [reserva] = await filas(cx, "SELECT 1 AS x FROM reservacion WHERE id_mesa = ? AND estado IN ('pendiente', 'confirmada') LIMIT 1", [id]);
  if (reserva) {
    throw new ErrorApi(409, "estado_invalido", `La mesa ${mesa.numero} tiene reservaciones vigentes: cancélalas o cámbialas de mesa antes.`);
  }
}

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
      const [mesa] = await filas(cx, "SELECT numero, estado, activa, eliminado_en FROM mesa WHERE id_mesa = ? FOR UPDATE", [id]);
      if (!mesa) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
      if (mesa.eliminado_en) throw new ErrorApi(409, "estado_invalido", `La mesa ${mesa.numero} está eliminada. Restáurala para poder cambiarla.`);
      if (d.zona !== undefined) await exigirSeccionActiva(cx, d.zona);

      if (d.activa === false && Boolean(mesa.activa)) await exigirMesaSinUso(cx, id, mesa, "marcarla como no disponible");

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
    if (esDuplicado(e)) {
      throw new ErrorApi(409, "estado_invalido", await mensajeRepetido(pool, "mesa", "numero", d.numero,
        `Ya existe la mesa ${d.numero}.`, `Hay una mesa ${d.numero} eliminada. Restáurala desde «Eliminadas» en lugar de repetir el número.`));
    }
    throw e;
  }

  res.json(await cargarMesaAdmin(pool, id));
};

/**
 * DELETE /api/catalogo/mesas/:id  →  la mesa, ya eliminada (lógico, migración 029; queda también no disponible).
 * Mismas condiciones que para marcarla no disponible. Las cuentas y reservaciones anteriores la conservan.
 */
export const eliminarMesaAdmin = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  await transaccion(async (cx) => {
    const [mesa] = await filas(cx, "SELECT numero, estado, eliminado_en FROM mesa WHERE id_mesa = ? FOR UPDATE", [id]);
    if (!mesa) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
    if (mesa.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La mesa ya está eliminada.");
    await exigirMesaSinUso(cx, id, mesa, "eliminarla");
    await ejecutar(cx, "UPDATE mesa SET activa = FALSE, eliminado_en = NOW(), eliminado_por = ? WHERE id_mesa = ? AND eliminado_en IS NULL", [req.usuario?.id ?? null, id]);
  });
  res.json(await cargarMesaAdmin(pool, id));
};

/** POST /api/catalogo/mesas/:id/restaurar  →  la mesa vigente otra vez, pero no disponible. Su sección debe estar vigente. */
export const restaurarMesaAdmin = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const [mesa] = await filas(
    pool,
    "SELECT m.eliminado_en, s.eliminado_en AS seccion_eliminada FROM mesa m LEFT JOIN seccion s ON s.nombre = m.zona WHERE m.id_mesa = ?",
    [id],
  );
  if (!mesa) throw new ErrorApi(404, "no_encontrado", "La mesa no existe.");
  if (!mesa.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La mesa no está eliminada.");
  if (mesa.seccion_eliminada) throw new ErrorApi(409, "estado_invalido", "Su sección está eliminada. Restaura primero la sección o pasa la mesa a otra.");
  await ejecutar(pool, "UPDATE mesa SET eliminado_en = NULL, eliminado_por = NULL WHERE id_mesa = ?", [id]);
  res.json(await cargarMesaAdmin(pool, id));
};

// ───────────────────────────── Características de mesa (solo gerente) ─────────────────────────────
// Catálogo de características que Gerencia asigna a las mesas («Planta baja», «Junto a la ventana»…). El cliente y la
// hostess las piden en la reservación. Desactivar una la oculta para nuevas asignaciones y del portal, sin borrarla de
// las mesas; borrar solo se permite si ninguna mesa ni reservación la usa.

const NombreCaracteristica = textoCatalogo(40);

const SELECT_CARACTERISTICA = `
  SELECT c.id_caracteristica, c.nombre, c.activa,
         (SELECT COUNT(*) FROM mesa_caracteristica mc JOIN mesa m ON m.id_mesa = mc.id_mesa
           WHERE mc.id_caracteristica = c.id_caracteristica AND m.eliminado_en IS NULL) AS total_mesas,
         (SELECT COUNT(*) FROM reservacion_caracteristica rc WHERE rc.id_caracteristica = c.id_caracteristica) AS total_reservaciones,
         DATE_FORMAT(c.eliminado_en, '%Y-%m-%d %H:%i:%s') AS eliminado_en
    FROM caracteristica_mesa c`;

function aCaracteristicaAdmin(r: Record<string, unknown>) {
  return {
    id_caracteristica: Number(r.id_caracteristica),
    nombre: String(r.nombre),
    activa: Boolean(r.activa),
    total_mesas: Number(r.total_mesas),
    total_reservaciones: Number(r.total_reservaciones),
    /** NULL = vigente; con fecha = eliminada (migración 029). */
    eliminado_en: (r.eliminado_en as string | null) ?? null,
  };
}

async function cargarCaracteristica(ex: Ejecutor, id: number) {
  const [fila] = await filas(ex, `${SELECT_CARACTERISTICA} WHERE c.id_caracteristica = ?`, [id]);
  if (!fila) throw new ErrorApi(404, "no_encontrado", "La característica no existe.");
  return aCaracteristicaAdmin(fila);
}

/** GET /api/catalogo/caracteristicas[?eliminados=1]: las vigentes (activas e inactivas) con cuántas mesas y reservaciones las usan, o solo las eliminadas. */
export const listarCaracteristicas = async (req: Request, res: Response) => {
  const rows = await filas(pool, `${SELECT_CARACTERISTICA} WHERE c.eliminado_en IS ${pideEliminados(req) ? "NOT NULL" : "NULL"} ORDER BY c.nombre`);
  res.json(rows.map(aCaracteristicaAdmin));
};

/** POST /api/catalogo/caracteristicas { nombre } → 201. */
export const crearCaracteristica = async (req: Request, res: Response) => {
  const { nombre } = validar(z.object({ nombre: NombreCaracteristica }).strict(), req.body);
  try {
    const r = await ejecutar(pool, "INSERT INTO caracteristica_mesa (nombre) VALUES (?)", [nombre]);
    res.status(201).json(await cargarCaracteristica(pool, r.insertId));
  } catch (e) {
    if (esDuplicado(e)) {
      throw new ErrorApi(409, "estado_invalido", await mensajeRepetido(pool, "caracteristica_mesa", "nombre", nombre,
        "Ya existe una característica con ese nombre.", "Hay una característica eliminada con ese nombre. Restáurala desde «Eliminadas» en lugar de crear otra."));
    }
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
  const previa = await cargarCaracteristica(pool, id);
  if (previa.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La característica está eliminada. Restáurala para poder cambiarla.");
  try {
    if ("nombre" in cambio) await ejecutar(pool, "UPDATE caracteristica_mesa SET nombre = ? WHERE id_caracteristica = ?", [cambio.nombre, id]);
    else await ejecutar(pool, "UPDATE caracteristica_mesa SET activa = ? WHERE id_caracteristica = ?", [cambio.activa, id]);
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApi(409, "estado_invalido", "Ya existe una característica con ese nombre.");
    throw e;
  }
  res.json(await cargarCaracteristica(pool, id));
};

/**
 * DELETE /api/catalogo/caracteristicas/:id  →  { ok: true }
 * «Eliminar» es lógico (migración 029; queda también inactiva): deja de ofrecerse en el portal, la hostess y los
 * formularios de mesas, pero las mesas y reservaciones que ya la tenían la conservan. Se restaura con
 * POST /caracteristicas/:id/restaurar.
 */
export const borrarCaracteristica = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const c = await cargarCaracteristica(pool, id);
  if (c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La característica ya está eliminada.");
  await ejecutar(pool, "UPDATE caracteristica_mesa SET activa = FALSE, eliminado_en = NOW(), eliminado_por = ? WHERE id_caracteristica = ? AND eliminado_en IS NULL", [req.usuario?.id ?? null, id]);
  res.json({ ok: true });
};

/** POST /api/catalogo/caracteristicas/:id/restaurar  →  la característica vigente otra vez, pero inactiva (Gerencia la activa). */
export const restaurarCaracteristica = async (req: Request, res: Response) => {
  const id = idDeRuta(req.params.id);
  const c = await cargarCaracteristica(pool, id);
  if (!c.eliminado_en) throw new ErrorApi(409, "estado_invalido", "La característica no está eliminada.");
  await ejecutar(pool, "UPDATE caracteristica_mesa SET eliminado_en = NULL, eliminado_por = NULL WHERE id_caracteristica = ?", [id]);
  res.json(await cargarCaracteristica(pool, id));
};
