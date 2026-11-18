// Características de mesa (migración 023): catálogo que administra Gerencia («Planta baja», «Junto a la ventana»…),
// qué características tiene cada mesa y cuáles pidió el cliente en cada reservación.
import { z } from "zod";
import { ejecutar, filas, type Ejecutor } from "../services/db";
import { ErrorApi } from "../utils/errores";

export interface CaracteristicaDto {
  id_caracteristica: number;
  nombre: string;
}

/** Lista de ids en el cuerpo de una petición (sin repetidos, máximo 30). */
export const IdsCaracteristicas = z.array(z.number().int().positive()).max(30, "máximo 30 características");

/** Características ACTIVAS de cada mesa, ordenadas por nombre. Sin `ids` trae las de todas las mesas. */
export async function caracteristicasDeMesas(ex: Ejecutor, ids?: number[]): Promise<Map<number, CaracteristicaDto[]>> {
  const mapa = new Map<number, CaracteristicaDto[]>();
  if (ids && ids.length === 0) return mapa;
  const filtro = ids ? `AND mc.id_mesa IN (${ids.map(() => "?").join(", ")})` : "";
  const rows = await filas(
    ex,
    `SELECT mc.id_mesa, c.id_caracteristica, c.nombre
       FROM mesa_caracteristica mc
       JOIN caracteristica_mesa c ON c.id_caracteristica = mc.id_caracteristica AND c.activa = TRUE
      WHERE 1 = 1 ${filtro}
      ORDER BY c.nombre`,
    ids ?? [],
  );
  for (const r of rows) {
    const id = Number(r.id_mesa);
    const lista = mapa.get(id) ?? [];
    lista.push({ id_caracteristica: Number(r.id_caracteristica), nombre: String(r.nombre) });
    mapa.set(id, lista);
  }
  return mapa;
}

/** Ids de TODAS las características de cada mesa (también las desactivadas), para el formulario del gerente. */
export async function idsCaracteristicasDeMesas(ex: Ejecutor): Promise<Map<number, number[]>> {
  const mapa = new Map<number, number[]>();
  for (const r of await filas(ex, "SELECT id_mesa, id_caracteristica FROM mesa_caracteristica ORDER BY id_caracteristica")) {
    const id = Number(r.id_mesa);
    mapa.set(id, [...(mapa.get(id) ?? []), Number(r.id_caracteristica)]);
  }
  return mapa;
}

/** Características que pidió el cliente en cada reservación (también las desactivadas: es lo que pidió). */
export async function caracteristicasDeReservaciones(ex: Ejecutor, ids: number[]): Promise<Map<number, CaracteristicaDto[]>> {
  const mapa = new Map<number, CaracteristicaDto[]>();
  if (ids.length === 0) return mapa;
  const rows = await filas(
    ex,
    `SELECT rc.id_reservacion, c.id_caracteristica, c.nombre
       FROM reservacion_caracteristica rc
       JOIN caracteristica_mesa c ON c.id_caracteristica = rc.id_caracteristica
      WHERE rc.id_reservacion IN (${ids.map(() => "?").join(", ")})
      ORDER BY c.nombre`,
    ids,
  );
  for (const r of rows) {
    const id = Number(r.id_reservacion);
    const lista = mapa.get(id) ?? [];
    lista.push({ id_caracteristica: Number(r.id_caracteristica), nombre: String(r.nombre) });
    mapa.set(id, lista);
  }
  return mapa;
}

/** Agrega `pref_caracteristicas` a cada fila de reservación (con `id_reservacion`). */
export async function conCaracteristicasPedidas<T extends Record<string, unknown>>(
  ex: Ejecutor,
  reservaciones: T[],
): Promise<Array<T & { pref_caracteristicas: CaracteristicaDto[] }>> {
  const mapa = await caracteristicasDeReservaciones(ex, reservaciones.map((r) => Number(r.id_reservacion)));
  return reservaciones.map((r) => ({ ...r, pref_caracteristicas: mapa.get(Number(r.id_reservacion)) ?? [] }));
}

/** Agrega `caracteristicas` a cada fila de mesa (con `id_mesa`). */
export async function conCaracteristicasDeMesa<T extends Record<string, unknown>>(
  ex: Ejecutor,
  mesas: T[],
): Promise<Array<T & { caracteristicas: CaracteristicaDto[] }>> {
  const mapa = await caracteristicasDeMesas(ex, mesas.map((m) => Number(m.id_mesa)));
  return mesas.map((m) => ({ ...m, caracteristicas: mapa.get(Number(m.id_mesa)) ?? [] }));
}

/** Rechaza ids que no existen o que están desactivados (`422`). Devuelve los ids sin repetidos. */
async function exigirCaracteristicasActivas(ex: Ejecutor, ids: number[]): Promise<number[]> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return unicos;
  const rows = await filas(
    ex,
    `SELECT id_caracteristica FROM caracteristica_mesa WHERE activa = TRUE AND id_caracteristica IN (${unicos.map(() => "?").join(", ")})`,
    unicos,
  );
  if (rows.length !== unicos.length) {
    throw new ErrorApi(422, "estado_invalido", "Alguna característica no existe o está desactivada. Actualiza la pantalla.");
  }
  return unicos;
}

/** Reemplaza las características de una mesa. */
export async function guardarCaracteristicasMesa(cx: Ejecutor, idMesa: number, ids: number[]): Promise<void> {
  const unicos = await exigirCaracteristicasActivas(cx, ids);
  await ejecutar(cx, "DELETE FROM mesa_caracteristica WHERE id_mesa = ?", [idMesa]);
  for (const id of unicos) {
    await ejecutar(cx, "INSERT INTO mesa_caracteristica (id_mesa, id_caracteristica) VALUES (?, ?)", [idMesa, id]);
  }
}

/** Reemplaza las características que pidió el cliente en una reservación. */
export async function guardarCaracteristicasReservacion(cx: Ejecutor, idReservacion: number, ids: number[]): Promise<void> {
  const unicos = await exigirCaracteristicasActivas(cx, ids);
  await ejecutar(cx, "DELETE FROM reservacion_caracteristica WHERE id_reservacion = ?", [idReservacion]);
  for (const id of unicos) {
    await ejecutar(cx, "INSERT INTO reservacion_caracteristica (id_reservacion, id_caracteristica) VALUES (?, ?)", [idReservacion, id]);
  }
}
