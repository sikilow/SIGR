import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarReservaciones, listarReservacionesPendientes, crearReservacion, editarReservacion, registrarLlegada } from "../controllers/hostess";

export const reservacionesRouter = Router();

reservacionesRouter.get("/", requiereAuth("hostess", "gerente"), listarReservaciones);
reservacionesRouter.get("/pendientes", requiereAuth("hostess", "gerente"), listarReservacionesPendientes);
reservacionesRouter.post("/", requiereAuth("hostess", "gerente"), crearReservacion);
reservacionesRouter.patch("/:id", requiereAuth("hostess", "gerente"), editarReservacion);
reservacionesRouter.post("/:id/llegada", requiereAuth("hostess", "gerente"), registrarLlegada);
