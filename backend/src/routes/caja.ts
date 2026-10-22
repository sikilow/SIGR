import { Router } from "express";
import { cerrarCorte, cobrarCuenta, estadoCaja, abrirCorte } from "../controllers/caja";
import { requiereAuth } from "../utils/auth";

export const cajaRouter = Router();

cajaRouter.use(requiereAuth("cajero"));
cajaRouter.get("/estado", estadoCaja);
cajaRouter.post("/cortes", abrirCorte);
cajaRouter.post("/cortes/cerrar", cerrarCorte);
cajaRouter.post("/cuentas/:id/cobrar", cobrarCuenta);
