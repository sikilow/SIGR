import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { crearPedido, listarPedidos, obtenerPedido, editarPedido, enviarPedido, cancelarPedido, entregarPedido, cambiarEstadoPedido } from "../controllers/pedidos";

export const pedidosRouter = Router();

pedidosRouter.post("/", requiereAuth("mesero", "gerente"), crearPedido);
pedidosRouter.get("/", requiereAuth(), listarPedidos);
pedidosRouter.get("/:id", requiereAuth(), obtenerPedido);
pedidosRouter.patch("/:id", requiereAuth("mesero", "gerente"), editarPedido);
pedidosRouter.post("/:id/enviar", requiereAuth("mesero", "gerente"), enviarPedido);
pedidosRouter.post("/:id/cancelar", requiereAuth("mesero", "gerente"), cancelarPedido);
pedidosRouter.post("/:id/entregar", requiereAuth("mesero", "gerente"), entregarPedido);
pedidosRouter.patch("/:id/estado", requiereAuth("cocinero", "gerente"), cambiarEstadoPedido);
