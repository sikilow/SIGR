import cors from "cors";
import express from "express";
import { ORIGENES_PERMITIDOS, PUERTO } from "./utils/config";
import { ErrorApi, manejarErrores } from "./utils/errores";
import { authRouter } from "./routes/auth";
import { authClientesRouter } from "./routes/authClientes";
import { catalogoRouter } from "./routes/catalogo";
import { clientesRouter } from "./routes/clientes";
import { cuentasRouter } from "./routes/cuentas";
import { cajaRouter } from "./routes/caja";
import { listaEsperaRouter } from "./routes/listaEspera";
import { menuRouter } from "./routes/menu";
import { mesasRouter } from "./routes/mesas";
import { pedidosRouter } from "./routes/pedidos";
import { productosRouter } from "./routes/productos";
import { reservacionesRouter } from "./routes/reservaciones";
import { reservacionesClientesRouter } from "./routes/reservacionesClientes";
import { usuariosRouter } from "./routes/usuarios";
import { iniciarProcesadorReservaciones } from "./services/notificacionesReservacion";
import { esEsquemaIncompleto, esSinConexion, filas, pool } from "./services/db";

const app = express();
app.use(cors({ origin: ORIGENES_PERMITIDOS }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/auth-clientes", authClientesRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/reservaciones", reservacionesRouter);
app.use("/api/reservaciones-clientes", reservacionesClientesRouter);
app.use("/api/lista-espera", listaEsperaRouter);
app.use("/api/mesas", mesasRouter);
app.use("/api/menu", menuRouter);
app.use("/api/productos", productosRouter);
app.use("/api/pedidos", pedidosRouter);
app.use("/api/cuentas", cuentasRouter);
app.use("/api/caja", cajaRouter);
app.use("/api/usuarios", usuariosRouter); // solo gerente
app.use("/api/catalogo", catalogoRouter); // solo gerente

// Cualquier otra ruta de la API: 404 en JSON (no el HTML por defecto de Express)
app.use("/api", () => {
  throw new ErrorApi(404, "no_encontrado", "Ruta no encontrada.");
});

app.use(manejarErrores);

/** Último archivo de database/supabase que la API necesita aplicado; súbelo al agregar una migración. */
const MIGRACION_REQUERIDA = "001_esquema.sql";

async function iniciarAPI(): Promise<void> {
  const faltaMigrar = new Error(
    `Falta aplicar ${MIGRACION_REQUERIDA} a la base de datos: ejecuta \`npm run db:migrar\` en backend/ ` +
      "(consulta docs/actualizar-base-datos.md) y vuelve a iniciar la API.",
  );
  try {
    const [aplicada] = await filas(pool, "SELECT 1 AS ok FROM sigr.migracion WHERE archivo = ?", [MIGRACION_REQUERIDA]);
    if (!aplicada) throw faltaMigrar;
  } catch (error) {
    if (esEsquemaIncompleto(error)) throw new Error(faltaMigrar.message, { cause: error });
    if (!esSinConexion(error)) throw error;
    // Sin red hacia Supabase la API arranca igual: responde 503 "No hay conexión con la base de datos"
    // y vuelve a funcionar sola cuando regresa la conexión (no hace falta reiniciarla).
    console.warn(
      "Aviso: no hay conexión con la base de datos (¿la red bloquea el puerto 5432?). " +
        `La API arranca de todos modos y responderá 503 hasta que se recupere. Detalle: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  app.listen(PUERTO, () => console.log(`API en http://localhost:${PUERTO}`));
  iniciarProcesadorReservaciones();
}

void iniciarAPI().catch((error: unknown) => {
  console.error("No se pudo iniciar la API:", error);
  void pool.end()
    .catch((shutdownError: unknown) => {
      console.error("No se pudo cerrar el pool de la base de datos:", shutdownError);
    })
    .finally(() => {
      process.exitCode = 1;
    });
});
