
import { Router } from "express";

import {
  registrarCuentaCliente,
  iniciarSesionCliente,
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
