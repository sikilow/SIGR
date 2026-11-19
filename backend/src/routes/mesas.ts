import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarMesas, obtenerCuentaDeMesa, asignarMesa, cambiarEstadoMesa, abrirParaLlevar, liberarParaLlevar } from "../controllers/mesas";

export const mesasRouter = Router();

mesasRouter.get("/", requiereAuth(), listarMesas);
mesasRouter.post("/para-llevar", requiereAuth("mesero", "hostess", "gerente"), abrirParaLlevar);
mesasRouter.get("/:id/cuenta", requiereAuth(), obtenerCuentaDeMesa);
mesasRouter.post("/:id/liberar-para-llevar", requiereAuth("mesero", "hostess", "gerente"), liberarParaLlevar);
mesasRouter.post("/:id/asignar", requiereAuth("hostess", "gerente"), asignarMesa);
mesasRouter.patch("/:id/estado", requiereAuth("hostess", "gerente"), cambiarEstadoMesa);
