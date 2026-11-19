import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { reporteReservaciones } from "../controllers/reporteReservaciones";
import { listarReservaciones, listarReservacionesPendientes, crearReservacion, editarReservacion, registrarLlegada, obtenerHorarioReservaciones } from "../controllers/hostess";

export const reservacionesRouter = Router();

reservacionesRouter.get("/", requiereAuth("hostess", "gerente"), listarReservaciones);
// Reporte de reservaciones e inasistencias por periodo (solo gerente).
reservacionesRouter.get("/reporte", requiereAuth("gerente"), reporteReservaciones);
reservacionesRouter.get("/horario", requiereAuth("hostess", "gerente"), obtenerHorarioReservaciones);
reservacionesRouter.get("/pendientes", requiereAuth("hostess", "gerente"), listarReservacionesPendientes);
reservacionesRouter.post("/", requiereAuth("hostess", "gerente"), crearReservacion);
reservacionesRouter.patch("/:id", requiereAuth("hostess", "gerente"), editarReservacion);
reservacionesRouter.post("/:id/llegada", requiereAuth("hostess", "gerente"), registrarLlegada);
