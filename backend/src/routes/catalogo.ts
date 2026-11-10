import { Router } from "express";
import { requiereAuth } from "../utils/auth";
import { actualizarConfiguracionReservacion, obtenerConfiguracionReservacion, listarCategorias, crearCategoria, editarCategoria, borrarCategoria, listarProductos, crearProducto, editarProducto, listarSeccionesAdmin, crearSeccionAdmin, editarSeccionAdmin, borrarSeccionAdmin, listarMesasAdmin, crearMesaAdmin, editarMesaAdmin, listarMetodosPago, listarMetodosPagoDisponibles, crearCategoriaMetodoPago, actualizarCategoriaMetodoPago, crearMetodoPago, actualizarMetodoPago } from "../controllers/catalogo";

export const catalogoRouter = Router();

catalogoRouter.get("/metodos-pago/disponibles", requiereAuth(), listarMetodosPagoDisponibles);
catalogoRouter.use(requiereAuth("gerente"));

catalogoRouter.get("/categorias", listarCategorias);
catalogoRouter.post("/categorias", crearCategoria);
catalogoRouter.patch("/categorias/:id", editarCategoria);
catalogoRouter.delete("/categorias/:id", borrarCategoria);
catalogoRouter.get("/secciones", listarSeccionesAdmin);
catalogoRouter.post("/secciones", crearSeccionAdmin);
catalogoRouter.patch("/secciones/:nombre", editarSeccionAdmin);
catalogoRouter.delete("/secciones/:nombre", borrarSeccionAdmin);
catalogoRouter.get("/productos", listarProductos);
catalogoRouter.post("/productos", crearProducto);
catalogoRouter.patch("/productos/:id", editarProducto);
catalogoRouter.get("/mesas", listarMesasAdmin);
catalogoRouter.post("/mesas", crearMesaAdmin);
catalogoRouter.patch("/mesas/:id", editarMesaAdmin);
catalogoRouter.get("/configuracion-reservacion", obtenerConfiguracionReservacion);
catalogoRouter.patch("/configuracion-reservacion", actualizarConfiguracionReservacion);
catalogoRouter.get("/metodos-pago", listarMetodosPago);
catalogoRouter.post("/metodos-pago/categorias", crearCategoriaMetodoPago);
catalogoRouter.patch("/metodos-pago/categorias/:id", actualizarCategoriaMetodoPago);
catalogoRouter.post("/metodos-pago", crearMetodoPago);
catalogoRouter.patch("/metodos-pago/:id", actualizarMetodoPago);
