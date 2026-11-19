import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarUsuarios, crearUsuario, editarUsuario, eliminarUsuario, restaurarUsuario, cambiarContrasena, enviarRestablecimiento } from "../controllers/usuarios";

export const usuariosRouter = Router();

usuariosRouter.use(requiereAuth("gerente"));

usuariosRouter.get("/", listarUsuarios);
usuariosRouter.post("/", crearUsuario);
usuariosRouter.patch("/:id", editarUsuario);
usuariosRouter.delete("/:id", eliminarUsuario);
usuariosRouter.post("/:id/restaurar", restaurarUsuario);
usuariosRouter.post("/:id/contrasena", cambiarContrasena);
usuariosRouter.post("/:id/restablecer", enviarRestablecimiento);
