import { Router } from "express";
import { cerrarCorte, cobrarCuenta, estadoCaja, abrirCorte, listarCortes, obtenerCorte } from "../controllers/caja";
import { requiereAuth } from "../utils/auth";

export const cajaRouter = Router();

// Operación del turno: solo el cajero.
cajaRouter.get("/estado", requiereAuth("cajero"), estadoCaja);
cajaRouter.post("/cortes", requiereAuth("cajero"), abrirCorte);
cajaRouter.post("/cortes/cerrar", requiereAuth("cajero"), cerrarCorte);
cajaRouter.post("/cuentas/:id/cobrar", requiereAuth("cajero"), cobrarCuenta);

// Consulta de cortes cerrados: el gerente ve todos; el cajero, solo los suyos.
cajaRouter.get("/cortes", requiereAuth("cajero", "gerente"), listarCortes);
cajaRouter.get("/cortes/:id", requiereAuth("cajero", "gerente"), obtenerCorte);
