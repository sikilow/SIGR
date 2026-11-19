
import { Router } from "express";

import {
  registrarCuentaCliente,
  iniciarSesionCliente,
  configuracionGoogle,
  iniciarSesionConGoogle,
  completarRegistroGoogle,
} from "../controllers/authClientes";
import { restablecerContrasenaCliente, solicitarRecuperacionCliente, validarEnlaceCliente } from "../controllers/recuperarCliente";

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

// Recuperar contraseña (migración 033): enlace de un solo uso por correo.
authClientesRouter.post("/recuperar", solicitarRecuperacionCliente);
authClientesRouter.get("/restablecer/:token", validarEnlaceCliente);
authClientesRouter.post("/restablecer", restablecerContrasenaCliente);

// Acceso con Google (migración 020): el botón se dibuja solo si hay GOOGLE_CLIENT_ID configurado.
authClientesRouter.get("/google/config", configuracionGoogle);
authClientesRouter.post("/google", iniciarSesionConGoogle);
authClientesRouter.post("/google/completar", completarRegistroGoogle);
