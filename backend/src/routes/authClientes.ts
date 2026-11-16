
import { Router } from "express";

import {
  registrarCuentaCliente,
  iniciarSesionCliente,
  configuracionGoogle,
  iniciarSesionConGoogle,
  completarRegistroGoogle,
} from "../controllers/authClientes";

export const authClientesRouter = Router();

// Crear cuenta
authClientesRouter.post(
  "/registro",
  registrarCuentaCliente
);

// Iniciar sesion
authClientesRouter.post(
  "/login",
  iniciarSesionCliente
);

// Acceso con Google (migración 020): el botón se dibuja solo si hay GOOGLE_CLIENT_ID configurado.
authClientesRouter.get("/google/config", configuracionGoogle);
authClientesRouter.post("/google", iniciarSesionConGoogle);
authClientesRouter.post("/google/completar", completarRegistroGoogle);
