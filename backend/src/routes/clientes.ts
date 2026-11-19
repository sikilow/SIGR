import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { actualizarCorreoCliente, listarClientes, registrarCliente } from "../controllers/hostess";
import { editarClienteGerente, eliminarCliente, listarClientesGestion, restaurarCliente } from "../controllers/clientesAdmin";

export const clientesRouter = Router();

clientesRouter.get("/", requiereAuth("hostess", "gerente"), listarClientes);
clientesRouter.post("/", requiereAuth("hostess", "gerente"), registrarCliente);
// La hostess solo corrige el correo; el gerente puede corregir todos los datos.
clientesRouter.patch("/:id", requiereAuth("hostess", "gerente"), (req, res) =>
  req.usuario?.rol === "gerente" ? editarClienteGerente(req, res) : actualizarCorreoCliente(req, res),
);

// Gestión de clientes (solo gerente): consultar, eliminar (lógico) y restaurar.
clientesRouter.get("/gestion", requiereAuth("gerente"), listarClientesGestion);
clientesRouter.delete("/:id", requiereAuth("gerente"), eliminarCliente);
clientesRouter.post("/:id/restaurar", requiereAuth("gerente"), restaurarCliente);
