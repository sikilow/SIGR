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
import { filas, pool } from "./services/db";

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

async function iniciarAPI(): Promise<void> {
  try {
    const [configuracion] = await filas(pool, "SELECT id FROM configuracion_seguridad WHERE id = 1");
    if (!configuracion) {
      throw new Error("Falta completar la configuración creada por la migración 013 en la base SIGR.");
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_NO_SUCH_TABLE"
    ) {
      throw new Error(
        "Falta aplicar database/migrations/013_auditoria_seguridad.sql a la base SIGR. " +
          "Consulta docs/actualizar-base-datos.md y vuelve a iniciar la API.",
        { cause: error },
      );
    }
    throw error;
  }

  // Migraciones posteriores: sin ellas las rutas afectadas responderían 500.
  const migraciones = [
    { archivo: "014_clientes_web.sql", consulta: "SELECT id_cliente FROM cliente_credencial LIMIT 0" },
    { archivo: "015_corte_efectivo.sql", consulta: "SELECT fondo_inicial, efectivo_esperado, efectivo_contado FROM corte_caja LIMIT 0" },
  ];
  for (const { archivo, consulta } of migraciones) {
    try {
      await filas(pool, consulta);
    } catch (error) {
      const codigo = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      if (codigo === "ER_NO_SUCH_TABLE" || codigo === "ER_BAD_FIELD_ERROR") {
        throw new Error(
          `Falta aplicar database/migrations/${archivo} a la base SIGR. ` +
            "Consulta docs/actualizar-base-datos.md y vuelve a iniciar la API.",
          { cause: error },
        );
      }
      throw error;
    }
  }

  app.listen(PUERTO, () => console.log(`API en http://localhost:${PUERTO}`));
  iniciarProcesadorReservaciones();
}

void iniciarAPI().catch((error: unknown) => {
  console.error("No se pudo iniciar la API:", error);
  void pool.end()
    .catch((shutdownError: unknown) => {
      console.error("No se pudo cerrar el pool de MySQL:", shutdownError);
    })
    .finally(() => {
      process.exitCode = 1;
    });
});
