import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarUsuarios, crearUsuario, editarUsuario, cambiarContrasena } from "../controllers/usuarios";

export const usuariosRouter = Router();

usuariosRouter.use(requiereAuth("gerente"));

usuariosRouter.get("/", listarUsuarios);
usuariosRouter.post("/", crearUsuario);
usuariosRouter.patch("/:id", editarUsuario);
usuariosRouter.post("/:id/contrasena", cambiarContrasena);
