import { describe, expect, it } from "vitest";
import { hayMesaParaReservacion } from "../src/services/disponibilidadReservacion";

const mesas = [
  { id_mesa: 1, capacidad: 2 },
  { id_mesa: 2, capacidad: 4 },
  { id_mesa: 3, capacidad: 4 },
  { id_mesa: 4, capacidad: 8 },
];

describe("mesas disponibles para una reservación", () => {
  it("hay mesa cuando no hay otras reservaciones comprometidas", () => {
    expect(hayMesaParaReservacion(mesas, [], 8)).toBe(true);
    expect(hayMesaParaReservacion(mesas, [], 2)).toBe(true);
  });

  it("no hay mesa si ninguna alcanza para el grupo", () => {
    expect(hayMesaParaReservacion(mesas, [], 9)).toBe(false);
  });

  it("descuenta las reservaciones que se traslapan: ocupan la mesa más chica que les alcance", () => {
    // Dos grupos de 4 ocupan las dos mesas de 4; un grupo de 3 solo cabría en la de 8.
    const otras = [
      { id_mesa: null, personas: 4, distanciaMinutos: 30 },
      { id_mesa: null, personas: 4, distanciaMinutos: -45 },
    ];
    expect(hayMesaParaReservacion(mesas, otras, 3)).toBe(true);
    // Si además la de 8 ya está comprometida, ya no queda para 3 personas.
    expect(hayMesaParaReservacion(mesas, [...otras, { id_mesa: 4, personas: 6, distanciaMinutos: 10 }], 3)).toBe(false);
  });

  it("las reservaciones con mesa ocupan justo esa mesa", () => {
    const otras = [{ id_mesa: 4, personas: 2, distanciaMinutos: 0 }];
    expect(hayMesaParaReservacion(mesas, otras, 8)).toBe(false);
    expect(hayMesaParaReservacion(mesas, otras, 4)).toBe(true);
  });

  it("las reservaciones fuera de la ventana de 1 h 30 min no estorban", () => {
    const otras = [{ id_mesa: 4, personas: 8, distanciaMinutos: 90 }, { id_mesa: 4, personas: 8, distanciaMinutos: -120 }];
    expect(hayMesaParaReservacion(mesas, otras, 8)).toBe(true);
  });
});
