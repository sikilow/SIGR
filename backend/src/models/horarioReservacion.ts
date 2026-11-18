// Horario de reservaciones (migración 022): primera y última hora que se pueden reservar, cada cuántos minutos se
// ofrecen horas en el portal y qué días se reciben reservaciones. Lo configura Gerencia; lo usan la API (para rechazar
// reservaciones fuera de horario), el portal de clientes y la pantalla de la hostess.
import { filas, type Ejecutor } from "../services/db";
import { ErrorApi } from "../utils/errores";

export const INTERVALOS_RESERVACION = [15, 30, 60] as const;
export type IntervaloReservacion = (typeof INTERVALOS_RESERVACION)[number];

export interface HorarioReservacion {
  /** HH:MM */
  hora_apertura: string;
  /** HH:MM */
  hora_ultima_reservacion: string;
  intervalo_minutos: IntervaloReservacion;
  /** Siete caracteres '1'/'0', de lunes a domingo. */
  dias_abiertos: string;
}

export const HORARIO_POR_DEFECTO: HorarioReservacion = {
  hora_apertura: "13:00",
  hora_ultima_reservacion: "21:00",
  intervalo_minutos: 30,
  dias_abiertos: "1111111",
};

const NOMBRES_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

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

/** Texto de los días cerrados: «Cerrado los lunes y martes». Vacío si abre todos los días. */
export function textoDiasCerrados(dias: string): string {
  const cerrados = NOMBRES_DIA.filter((_, i) => dias[i] !== "1");
  if (cerrados.length === 0) return "";
  const lista = cerrados.length === 1 ? cerrados[0] : `${cerrados.slice(0, -1).join(", ")} y ${cerrados.at(-1)}`;
  return `cerrado los ${lista}`;
}

/** Horas que se ofrecen en un día abierto: de la apertura a la última, cada `intervalo_minutos`. */
export function horasDelDia(horario: HorarioReservacion): string[] {
  const horas: string[] = [];
  for (let m = aMinutos(horario.hora_apertura); m <= aMinutos(horario.hora_ultima_reservacion); m += horario.intervalo_minutos) {
    horas.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return horas;
}

/**
 * Motivo por el que una fecha y hora («AAAA-MM-DD HH:MM:SS») queda fuera del horario, o `null` si está dentro.
 * `exigirIntervalo`: el portal solo acepta las horas que ofrece (13:00, 13:30…); la hostess puede anotar cualquier
 * minuto dentro del horario (por ejemplo, una llamada para las 19:45).
 */
export function motivoFueraDeHorario(horario: HorarioReservacion, fechaHora: string, exigirIntervalo: boolean): string | null {
  const [dia, hora] = fechaHora.split(" ") as [string, string];
  if (horario.dias_abiertos[indiceDia(dia)] !== "1") {
    return `El restaurante no recibe reservaciones los ${NOMBRES_DIA[indiceDia(dia)]}. Elige otro día.`;
  }
  const minutos = aMinutos(hora);
  if (minutos < aMinutos(horario.hora_apertura) || minutos > aMinutos(horario.hora_ultima_reservacion)) {
    return `Las reservaciones son de ${horario.hora_apertura} a ${horario.hora_ultima_reservacion}. Elige una hora dentro de ese horario.`;
  }
  if (exigirIntervalo && (minutos - aMinutos(horario.hora_apertura)) % horario.intervalo_minutos !== 0) {
    return `Elige una de las horas disponibles (cada ${horario.intervalo_minutos} minutos desde las ${horario.hora_apertura}).`;
  }
  return null;
}

/** Lee el horario configurado; sin fila (base sin migración 010) usa el predeterminado. */
export async function cargarHorario(ex: Ejecutor): Promise<HorarioReservacion> {
  const [fila] = await filas(
    ex,
    "SELECT hora_apertura, hora_ultima_reservacion, intervalo_minutos, dias_abiertos FROM configuracion_reservacion WHERE id = 1",
  );
  if (!fila) return { ...HORARIO_POR_DEFECTO };
  return {
    hora_apertura: aHoraCorta(fila.hora_apertura),
    hora_ultima_reservacion: aHoraCorta(fila.hora_ultima_reservacion),
    intervalo_minutos: Number(fila.intervalo_minutos) as IntervaloReservacion,
    dias_abiertos: String(fila.dias_abiertos),
  };
}

/** `422 estado_invalido` si la reservación cae en un día cerrado o fuera del horario. */
export async function exigirHorarioReservacion(ex: Ejecutor, fechaHora: string, exigirIntervalo: boolean): Promise<void> {
  const motivo = motivoFueraDeHorario(await cargarHorario(ex), fechaHora, exigirIntervalo);
  if (motivo) throw new ErrorApi(422, "estado_invalido", motivo);
}
