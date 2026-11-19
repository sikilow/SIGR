import { Router } from "express";
import { cerrarCorte, cobrarCuenta, estadoCaja, abrirCorte, listarCortes, obtenerCorte } from "../controllers/caja";
import { reporteVentas } from "../controllers/reporteVentas";
import {
  aprobarDevolucion,
  guardarReferenciaFiscal,
  listarDevoluciones,
  listarVentas,
  obtenerVenta,
  quitarReferenciaFiscal,
  rechazarDevolucion,
  registrarReimpresion,
  solicitarDevolucion,
} from "../controllers/ventas";
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

// Tickets pasados y devoluciones (migración 034). Cajero y gerente consultan y reimprimen tickets; el cajero SOLICITA una
// devolución y el gerente la autoriza (o la registra ya aprobada).
cajaRouter.get("/ventas", requiereAuth("cajero", "gerente"), listarVentas);
cajaRouter.get("/ventas/:id", requiereAuth("cajero", "gerente"), obtenerVenta);
cajaRouter.post("/ventas/:id/reimpresion", requiereAuth("cajero", "gerente"), registrarReimpresion);
cajaRouter.post("/ventas/:id/devoluciones", requiereAuth("cajero", "gerente"), solicitarDevolucion);
cajaRouter.get("/devoluciones", requiereAuth("cajero", "gerente"), listarDevoluciones);
cajaRouter.post("/devoluciones/:id/aprobar", requiereAuth("gerente"), aprobarDevolucion);
cajaRouter.post("/devoluciones/:id/rechazar", requiereAuth("gerente"), rechazarDevolucion);
// Referencia para el contador y datos fiscales opcionales del cliente (no se emite factura): solo el gerente.
cajaRouter.put("/ventas/:id/fiscal", requiereAuth("gerente"), guardarReferenciaFiscal);
cajaRouter.delete("/ventas/:id/fiscal", requiereAuth("gerente"), quitarReferenciaFiscal);

// Reporte e historial de ventas por periodo (RF-VEN-003 y RF-VEN-004): solo el gerente.
cajaRouter.get("/reportes/ventas", requiereAuth("gerente"), reporteVentas);
