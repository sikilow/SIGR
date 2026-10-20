import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { solicitarPago } from "../controllers/cuentas";

export const cuentasRouter = Router();

cuentasRouter.post("/:id/solicitar-pago", requiereAuth("mesero", "gerente"), solicitarPago);
