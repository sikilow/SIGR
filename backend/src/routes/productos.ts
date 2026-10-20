import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { consultarDisponibilidad } from "../controllers/productos";

export const productosRouter = Router();

productosRouter.post("/disponibilidad", requiereAuth(), consultarDisponibilidad);
