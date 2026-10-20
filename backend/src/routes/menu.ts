import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { obtenerMenu } from "../controllers/menu";

export const menuRouter = Router();

menuRouter.get("/", requiereAuth(), obtenerMenu);
