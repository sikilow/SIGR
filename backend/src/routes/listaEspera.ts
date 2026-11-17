import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarEspera, agregarEspera, editarEspera } from "../controllers/hostess";

export const listaEsperaRouter = Router();

listaEsperaRouter.get("/", requiereAuth("hostess", "gerente"), listarEspera);
listaEsperaRouter.post("/", requiereAuth("hostess", "gerente"), agregarEspera);
listaEsperaRouter.patch("/:id", requiereAuth("hostess", "gerente"), editarEspera);
