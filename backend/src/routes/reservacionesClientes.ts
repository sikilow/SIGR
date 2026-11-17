
import { Router } from "express";
import { requiereCliente } from "../utils/authClientes";

import {
  crearReservacionCliente,
  listarMisReservaciones,
  opcionesMesaCliente,
} from "../controllers/reservacionesClientes";

export const reservacionesClientesRouter = Router();

// Todas las rutas requieren sesion de cliente.
reservacionesClientesRouter.use(requiereCliente);

// Registrar solicitud de reservacion
reservacionesClientesRouter.post(
  "/",
  crearReservacionCliente
);

// Consultar reservaciones del cliente
reservacionesClientesRouter.get(
  "/mis-reservaciones",
  listarMisReservaciones
);

// Secciones y características de mesa que el cliente puede pedir
reservacionesClientesRouter.get(
  "/opciones-mesa",
  opcionesMesaCliente
);
