import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { listarCategorias, crearCategoria, editarCategoria, borrarCategoria, listarProductos, crearProducto, editarProducto, listarMesasAdmin, crearMesaAdmin, editarMesaAdmin } from "../controllers/catalogo";

export const catalogoRouter = Router();

catalogoRouter.use(requiereAuth("gerente"));

catalogoRouter.get("/categorias", listarCategorias);
catalogoRouter.post("/categorias", crearCategoria);
catalogoRouter.patch("/categorias/:id", editarCategoria);
catalogoRouter.delete("/categorias/:id", borrarCategoria);
catalogoRouter.get("/productos", listarProductos);
catalogoRouter.post("/productos", crearProducto);
catalogoRouter.patch("/productos/:id", editarProducto);
catalogoRouter.get("/mesas", listarMesasAdmin);
catalogoRouter.post("/mesas", crearMesaAdmin);
catalogoRouter.patch("/mesas/:id", editarMesaAdmin);
