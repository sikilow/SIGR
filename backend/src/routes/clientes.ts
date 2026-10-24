import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { actualizarCorreoCliente, listarClientes, registrarCliente } from "../controllers/hostess";

export const clientesRouter = Router();

clientesRouter.get("/", requiereAuth("hostess", "gerente"), listarClientes);
clientesRouter.post("/", requiereAuth("hostess", "gerente"), registrarCliente);
clientesRouter.patch("/:id", requiereAuth("hostess", "gerente"), actualizarCorreoCliente);
