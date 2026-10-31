import { describe, expect, it } from "vitest";
import {
  fechaLegible,
  plantillaCancelacion,
  plantillaConfirmacion,
  plantillaRecordatorio,
  plantillaVencida,
  type DatosReservacion,
} from "../src/services/plantillasCorreo";

const datos: DatosReservacion = {
  nombre: "Ana",
  fechaHora: "2026-11-01 19:30:00",
  personas: 3,
  mesaNumero: 12,
  toleranciaMinutos: 15,
};

describe("plantillas de correo de reservaciones", () => {
  it("compone la confirmación como una tarjeta con fecha, hora y mesa", () => {
    const correo = plantillaConfirmacion({ ...datos, evento: "creada" });

    expect(correo.asunto).toBe("Reservación registrada");
    expect(correo.texto).toContain("La mesa asignada es la 12.");
    expect(correo.html).toContain("<!doctype html>");
    expect(correo.html).toContain("max-width:600px");
    expect(correo.html).toContain("Domingo 1 de noviembre");
    expect(correo.html).toContain("19:30");
    expect(correo.html).toContain("Mesa 12");
    expect(correo.html).toContain("border-top:4px solid #a63a1f");
  });

  it("usa el acento de atención en el recordatorio", () => {
    const correo = plantillaRecordatorio(datos);

    expect(correo.asunto).toBe("Recordatorio de tu reservación");
    expect(correo.html).toContain("Recordatorio de tu visita");
    expect(correo.html).toContain("border-top:4px solid #8a5a12");
    expect(correo.html).toContain("Domingo 1 de noviembre");
  });

  it("muestra la tolerancia y el acento de aviso en la reservación vencida", () => {
    const correo = plantillaVencida(datos);

    expect(correo.html).toContain("Tolerancia 15 min");
    expect(correo.html).toContain("border-top:4px solid #7a1818");
    expect(correo.html).toContain("La mesa quedó liberada");
  });

  it("mantiene un tono neutro en la cancelación", () => {
    const correo = plantillaCancelacion({ ...datos, mesaNumero: null });

    expect(correo.html).toContain("Reservación cancelada");
    expect(correo.html).toContain("border-top:4px solid #5f6258");
    expect(correo.html).toContain("Domingo 1 de noviembre");
  });

  it("escapa el nombre del cliente antes de insertarlo en el HTML", () => {
    const correo = plantillaConfirmacion({
      ...datos,
      nombre: "Ana <script>alert('x')</script>",
      evento: "confirmada",
    });

    expect(correo.html).toContain("Ana &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(correo.html).not.toContain("<script>alert");
  });

  it("presenta la fecha en español sin cambiar la hora local", () => {
    expect(fechaLegible("2026-11-01 19:30:00")).toBe("domingo 1 de noviembre de 2026 · 19:30");
  });
});
