import { describe, expect, it } from "vitest";
import {
  HORARIO_POR_DEFECTO,
  horasDelDia,
  indiceDia,
  motivoFueraDeHorario,
  textoDiasCerrados,
  type HorarioReservacion,
} from "../src/models/horarioReservacion";

// Cerrado los lunes; de 13:00 a 21:30 cada 30 minutos.
const horario: HorarioReservacion = { hora_apertura: "13:00", hora_ultima_reservacion: "21:30", intervalo_minutos: 30, dias_abiertos: "0111111" };

describe("horario de reservaciones", () => {
  it("el día de la semana no depende de la zona horaria (0 = lunes)", () => {
    expect(indiceDia("2026-11-16")).toBe(0); // lunes
    expect(indiceDia("2026-11-22")).toBe(6); // domingo
  });

  it("arma las horas del día con el intervalo", () => {
    expect(horasDelDia(HORARIO_POR_DEFECTO)).toHaveLength(17); // 13:00 a 21:00 cada 30 min
    expect(horasDelDia(horario).slice(0, 3)).toEqual(["13:00", "13:30", "14:00"]);
    expect(horasDelDia(horario).at(-1)).toBe("21:30");
    expect(horasDelDia({ ...horario, intervalo_minutos: 60 })).toEqual(["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"]);
  });

  it("rechaza días cerrados y horas fuera del horario", () => {
    expect(motivoFueraDeHorario(horario, "2026-11-16 14:00:00", true)).toMatch(/no recibe reservaciones los lunes/);
    expect(motivoFueraDeHorario(horario, "2026-11-17 12:30:00", false)).toMatch(/de 13:00 a 21:30/);
    expect(motivoFueraDeHorario(horario, "2026-11-17 22:00:00", false)).toMatch(/de 13:00 a 21:30/);
    expect(motivoFueraDeHorario(horario, "2026-11-17 21:30:00", true)).toBeNull();
  });

  it("el portal exige el intervalo; la hostess puede anotar cualquier minuto dentro del horario", () => {
    expect(motivoFueraDeHorario(horario, "2026-11-17 19:45:00", true)).toMatch(/cada 30 minutos/);
    expect(motivoFueraDeHorario(horario, "2026-11-17 19:45:00", false)).toBeNull();
  });

  it("describe los días cerrados", () => {
    expect(textoDiasCerrados("1111111")).toBe("");
    expect(textoDiasCerrados("0111111")).toBe("cerrado los lunes");
    expect(textoDiasCerrados("0011110")).toBe("cerrado los lunes, martes y domingos");
  });
});
