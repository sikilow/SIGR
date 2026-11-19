// Horario de reservaciones (migraciones 022 y 030): cada día de la semana tiene su propio horario (abierto o cerrado,
// primera y última hora para reservar) y un solo intervalo para todo el restaurante (cada cuántos minutos se ofrecen
// horas en el portal). Lo configura Gerencia; lo usan la API (para rechazar reservaciones fuera de horario), el portal
// de clientes y la pantalla de la hostess.
import { filas, type Ejecutor } from "../services/db";
import { ErrorApi } from "../utils/errores";

export const INTERVALOS_RESERVACION = [15, 30, 60] as const;
export type IntervaloReservacion = (typeof INTERVALOS_RESERVACION)[number];

export interface HorarioDia {
  /** ¿Ese día se reciben reservaciones? Las horas se conservan aunque esté cerrado. */
  abierto: boolean;
  /** HH:MM */
  hora_apertura: string;
  /** HH:MM */
  hora_ultima_reservacion: string;
}

export interface HorarioReservacion {
  intervalo_minutos: IntervaloReservacion;
  /** Siete días, de lunes (0) a domingo (6). */
  dias: HorarioDia[];
}

const DIA_POR_DEFECTO: HorarioDia = { abierto: true, hora_apertura: "13:00", hora_ultima_reservacion: "21:00" };

export function horarioPorDefecto(): HorarioReservacion {
  return { intervalo_minutos: 30, dias: Array.from({ length: 7 }, () => ({ ...DIA_POR_DEFECTO })) };
}

export const NOMBRES_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

/** "13:00:00" o "13:00" → minutos desde la medianoche. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Recorta un TIME de MySQL ("13:00:00") a "13:00". */
export function aHoraCorta(hora: unknown): string {
  return String(hora ?? "").slice(0, 5);
}

/** Índice del día (0 = lunes … 6 = domingo) de una fecha AAAA-MM-DD, sin depender de la zona horaria. */
export function indiceDia(dia: string): number {
  const domingoEsCero = new Date(`${dia}T00:00:00Z`).getUTCDay();
  return (domingoEsCero + 6) % 7;
}

/** Texto de los días cerrados: «cerrado los lunes y martes». Vacío si abre todos los días. */
export function textoDiasCerrados(horario: HorarioReservacion): string {
  const cerrados = NOMBRES_DIA.filter((_, i) => !horario.dias[i]?.abierto);
  if (cerrados.length === 0) return "";
  const lista = cerrados.length === 1 ? cerrados[0] : `${cerrados.slice(0, -1).join(", ")} y ${cerrados.at(-1)}`;
  return `cerrado los ${lista}`;
}

/** Horas que se ofrecen un día abierto: de la primera a la última de ESE día, cada `intervalo_minutos`. */
export function horasDelDia(horario: HorarioReservacion, dia: number): string[] {
  const d = horario.dias[dia];
  if (!d || !d.abierto) return [];
  const horas: string[] = [];
  for (let m = aMinutos(d.hora_apertura); m <= aMinutos(d.hora_ultima_reservacion); m += horario.intervalo_minutos) {
    horas.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return horas;
}

/**
 * Motivo por el que una fecha y hora («AAAA-MM-DD HH:MM:SS») queda fuera del horario de ese día, o `null` si está
 * dentro. `exigirIntervalo`: el portal solo acepta las horas que ofrece (13:00, 13:30…, contadas desde la primera hora
 * de ese día); la hostess puede anotar cualquier minuto dentro del horario (por ejemplo, una llamada para las 19:45).
 */
export function motivoFueraDeHorario(horario: HorarioReservacion, fechaHora: string, exigirIntervalo: boolean): string | null {
  const [dia, hora] = fechaHora.split(" ") as [string, string];
  const indice = indiceDia(dia);
  const d = horario.dias[indice];
  if (!d || !d.abierto) {
    return `El restaurante no recibe reservaciones los ${NOMBRES_DIA[indice]}. Elige otro día.`;
  }
  const minutos = aMinutos(hora);
  if (minutos < aMinutos(d.hora_apertura) || minutos > aMinutos(d.hora_ultima_reservacion)) {
    return `Los ${NOMBRES_DIA[indice]} las reservaciones son de ${d.hora_apertura} a ${d.hora_ultima_reservacion}. Elige una hora dentro de ese horario.`;
  }
  if (exigirIntervalo && (minutos - aMinutos(d.hora_apertura)) % horario.intervalo_minutos !== 0) {
    return `Elige una de las horas disponibles (cada ${horario.intervalo_minutos} minutos desde las ${d.hora_apertura}).`;
  }
  return null;
}

/** Lee el horario configurado; lo que falte (base sin migración) usa el predeterminado. */
export async function cargarHorario(ex: Ejecutor): Promise<HorarioReservacion> {
  const horario = horarioPorDefecto();
  const [config] = await filas(ex, "SELECT intervalo_minutos FROM configuracion_reservacion WHERE id = 1");
  if (config) horario.intervalo_minutos = Number(config.intervalo_minutos) as IntervaloReservacion;
  const dias = await filas(ex, "SELECT dia, abierto, hora_apertura, hora_ultima_reservacion FROM horario_reservacion_dia ORDER BY dia");
  for (const fila of dias) {
    const i = Number(fila.dia);
    if (i < 0 || i > 6) continue;
    horario.dias[i] = {
      abierto: Boolean(Number(fila.abierto)),
      hora_apertura: aHoraCorta(fila.hora_apertura),
      hora_ultima_reservacion: aHoraCorta(fila.hora_ultima_reservacion),
    };
  }
  return horario;
}

/** `422 estado_invalido` si la reservación cae en un día cerrado o fuera del horario de ese día. */
export async function exigirHorarioReservacion(ex: Ejecutor, fechaHora: string, exigirIntervalo: boolean): Promise<void> {
  const motivo = motivoFueraDeHorario(await cargarHorario(ex), fechaHora, exigirIntervalo);
  if (motivo) throw new ErrorApi(422, "estado_invalido", motivo);
}
