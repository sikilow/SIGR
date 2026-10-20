import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarMesas, obtenerCuentaDeMesa, asignarMesa, cambiarEstadoMesa } from "../controllers/mesas";

export const mesasRouter = Router();

mesasRouter.get("/", requiereAuth(), listarMesas);
mesasRouter.get("/:id/cuenta", requiereAuth(), obtenerCuentaDeMesa);
mesasRouter.post("/:id/asignar", requiereAuth("hostess", "gerente"), asignarMesa);
mesasRouter.patch("/:id/estado", requiereAuth("hostess", "gerente"), cambiarEstadoMesa);
