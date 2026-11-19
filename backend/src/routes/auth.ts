import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import {
  iniciarSesion,
  cerrarSesion,
  registrarActividad,
  solicitarRecuperacion,
  validarEnlace,
  restablecerContrasena,
  obtenerPerfil,
} from "../controllers/auth";

export const authRouter = Router();

authRouter.post("/login", iniciarSesion);
authRouter.get("/me", requiereAuth(), obtenerPerfil);
authRouter.post("/logout", requiereAuth(), cerrarSesion);
authRouter.post("/actividad", requiereAuth(), registrarActividad);
authRouter.post("/recuperar", solicitarRecuperacion);
authRouter.get("/restablecer/:token", validarEnlace);
authRouter.post("/restablecer", restablecerContrasena);
