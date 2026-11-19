import { describe, expect, it } from "vitest";
import {
  horarioPorDefecto,
  horasDelDia,
  indiceDia,
  motivoFueraDeHorario,
  textoDiasCerrados,
  type HorarioReservacion,
} from "../src/models/horarioReservacion";

// Lunes cerrado; martes a jueves de 13:00 a 21:30; viernes y sábado abren temprano (11:00) y cierran tarde (23:00);
// domingo de 09:00 a 16:00. Horas cada 30 minutos.
function horario(): HorarioReservacion {
  const h = horarioPorDefecto();
  h.dias[0] = { abierto: false, hora_apertura: "13:00", hora_ultima_reservacion: "21:00" };
  for (const i of [1, 2, 3]) h.dias[i] = { abierto: true, hora_apertura: "13:00", hora_ultima_reservacion: "21:30" };
  for (const i of [4, 5]) h.dias[i] = { abierto: true, hora_apertura: "11:00", hora_ultima_reservacion: "23:00" };
  h.dias[6] = { abierto: true, hora_apertura: "09:00", hora_ultima_reservacion: "16:00" };
  return h;
}

describe("horario de reservaciones por día", () => {
  it("el día de la semana no depende de la zona horaria (0 = lunes)", () => {
    expect(indiceDia("2026-11-16")).toBe(0); // lunes
    expect(indiceDia("2026-11-22")).toBe(6); // domingo
  });

  it("arma las horas de cada día con su propia apertura y cierre", () => {
    expect(horasDelDia(horarioPorDefecto(), 2)).toHaveLength(17); // 13:00 a 21:00 cada 30 min
    expect(horasDelDia(horario(), 1).slice(0, 3)).toEqual(["13:00", "13:30", "14:00"]);
    expect(horasDelDia(horario(), 1).at(-1)).toBe("21:30");
    expect(horasDelDia(horario(), 4)[0]).toBe("11:00");
    expect(horasDelDia(horario(), 4).at(-1)).toBe("23:00");
    expect(horasDelDia(horario(), 6)).toHaveLength(15); // 09:00 a 16:00
    expect(horasDelDia(horario(), 0)).toEqual([]); // cerrado
    expect(horasDelDia({ ...horario(), intervalo_minutos: 60 }, 1)).toEqual(["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"]);
  });

  it("rechaza días cerrados y horas fuera del horario de ese día", () => {
    expect(motivoFueraDeHorario(horario(), "2026-11-16 14:00:00", true)).toMatch(/no recibe reservaciones los lunes/);
    expect(motivoFueraDeHorario(horario(), "2026-11-17 12:30:00", false)).toMatch(/martes.*de 13:00 a 21:30/);
    expect(motivoFueraDeHorario(horario(), "2026-11-17 22:00:00", false)).toMatch(/de 13:00 a 21:30/);
    expect(motivoFueraDeHorario(horario(), "2026-11-17 21:30:00", true)).toBeNull();
  });

  it("un día puede abrir antes o cerrar después que otro", () => {
    // 2026-11-20 es viernes (11:00 a 23:00); 2026-11-17 es martes (13:00 a 21:30).
    expect(motivoFueraDeHorario(horario(), "2026-11-20 11:00:00", true)).toBeNull();
    expect(motivoFueraDeHorario(horario(), "2026-11-20 23:00:00", true)).toBeNull();
    expect(motivoFueraDeHorario(horario(), "2026-11-17 11:00:00", true)).toMatch(/martes/);
    expect(motivoFueraDeHorario(horario(), "2026-11-17 23:00:00", true)).toMatch(/martes/);
    // El domingo cierra temprano: 17:00 sí es válida otro día, pero no ese.
    expect(motivoFueraDeHorario(horario(), "2026-11-22 17:00:00", false)).toMatch(/domingos.*de 09:00 a 16:00/);
    expect(motivoFueraDeHorario(horario(), "2026-11-22 09:00:00", true)).toBeNull();
  });

  it("el portal exige el intervalo contado desde la apertura de ese día; la hostess puede anotar cualquier minuto", () => {
    expect(motivoFueraDeHorario(horario(), "2026-11-17 19:45:00", true)).toMatch(/cada 30 minutos desde las 13:00/);
    expect(motivoFueraDeHorario(horario(), "2026-11-17 19:45:00", false)).toBeNull();
    // Con apertura a las 13:15 las horas del portal son 13:15, 13:45...
    const h = horario();
    h.dias[1] = { abierto: true, hora_apertura: "13:15", hora_ultima_reservacion: "21:00" };
    expect(motivoFueraDeHorario(h, "2026-11-17 13:45:00", true)).toBeNull();
    expect(motivoFueraDeHorario(h, "2026-11-17 14:00:00", true)).toMatch(/desde las 13:15/);
  });

  it("describe los días cerrados", () => {
    expect(textoDiasCerrados(horarioPorDefecto())).toBe("");
    expect(textoDiasCerrados(horario())).toBe("cerrado los lunes");
    const h = horarioPorDefecto();
    for (const i of [0, 1, 6]) h.dias[i]!.abierto = false;
    expect(textoDiasCerrados(h)).toBe("cerrado los lunes, martes y domingos");
  });
});
