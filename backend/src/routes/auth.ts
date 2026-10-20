import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { iniciarSesion, obtenerPerfil } from "../controllers/auth";

export const authRouter = Router();

authRouter.post("/login", iniciarSesion);
authRouter.get("/me", requiereAuth(), obtenerPerfil);
