import cors from "cors";
import express from "express";
import { ORIGENES_PERMITIDOS, PUERTO } from "./config";
import { ErrorApi, manejarErrores } from "./errores";
import { authRouter } from "./routes/auth";
import { catalogoRouter } from "./routes/catalogo";
import { cuentasRouter } from "./routes/cuentas";
import { menuRouter } from "./routes/menu";
import { mesasRouter } from "./routes/mesas";
import { pedidosRouter } from "./routes/pedidos";
import { productosRouter } from "./routes/productos";
import { usuariosRouter } from "./routes/usuarios";

const app = express();
app.use(cors({ origin: ORIGENES_PERMITIDOS }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/mesas", mesasRouter);
app.use("/api/menu", menuRouter);
app.use("/api/productos", productosRouter);
app.use("/api/pedidos", pedidosRouter);
app.use("/api/cuentas", cuentasRouter);
app.use("/api/usuarios", usuariosRouter); // solo gerente
app.use("/api/catalogo", catalogoRouter); // solo gerente

// Cualquier otra ruta de la API: 404 en JSON (no el HTML por defecto de Express)
app.use("/api", () => {
  throw new ErrorApi(404, "no_encontrado", "Ruta no encontrada.");
});

app.use(manejarErrores);

app.listen(PUERTO, () => console.log(`API en http://localhost:${PUERTO}`));
