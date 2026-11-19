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
// Los datos de la API cambian entre peticiones (métodos de pago, mesas, pedidos…): ningún navegador ni proxy
// (por ejemplo Nginx en el servidor compartido) debe servir una respuesta guardada.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

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
    { archivo: "016_metodo_pago_solicitado.sql", consulta: "SELECT id_metodo_pago_solicitado FROM cuenta LIMIT 0" },
    { archivo: "017_categorias_metodos_pago.sql", consulta: "SELECT mp.activo, mp.id_categoria_metodo_pago, mp.es_efectivo FROM metodo_pago mp JOIN categoria_metodo_pago cmp USING (id_categoria_metodo_pago) LIMIT 0" },
    { archivo: "018_telefono_unico_y_anticipacion_reserva.sql", consulta: "SELECT anticipacion_minutos FROM configuracion_reservacion LIMIT 0" },
    { archivo: "019_pedidos_para_llevar.sql", consulta: "SELECT s.es_para_llevar, c.id_canal, c.referencia FROM seccion s JOIN cuenta c ON 1 = 0 LIMIT 0" },
    { archivo: "019_pedidos_para_llevar.sql", consulta: "SELECT id_canal, nombre, activo FROM canal_pedido LIMIT 0" },
    { archivo: "020_acceso_google_clientes.sql", consulta: "SELECT google_sub FROM cliente_credencial LIMIT 0" },
    { archivo: "021_preferencias_reservacion.sql", consulta: "SELECT pref_zona FROM reservacion LIMIT 0" },
    { archivo: "022_horario_reservaciones.sql", consulta: "SELECT hora_apertura, dias_abiertos FROM configuracion_reservacion LIMIT 0" },
    { archivo: "023_caracteristicas_mesa_y_duracion.sql", consulta: "SELECT id_caracteristica FROM mesa_caracteristica LIMIT 0" },
    { archivo: "023_caracteristicas_mesa_y_duracion.sql", consulta: "SELECT duracion_reservacion_minutos FROM configuracion_reservacion LIMIT 0" },
    { archivo: "024_restablecer_contrasena.sql", consulta: "SELECT token_hash FROM restablecimiento_contrasena LIMIT 0" },
    { archivo: "025_lada_telefono.sql", consulta: "SELECT lada FROM cliente LIMIT 0" },
    { archivo: "025_lada_telefono.sql", consulta: "SELECT lada FROM perfil_usuario LIMIT 0" },
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

  const [telefonoUnico] = await filas(
    pool,
    `SELECT COUNT(*) AS total
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'perfil_usuario' AND index_name = 'uq_perfil_usuario_telefono'`,
  );
  if (Number(telefonoUnico?.total ?? 0) === 0) {
    throw new Error("Falta aplicar database/migrations/018_telefono_unico_y_anticipacion_reserva.sql (teléfono único de usuarios).");
  }

  const [auditoriaCuenta] = await filas(
    pool,
    `SELECT COUNT(*) AS total
       FROM information_schema.triggers
      WHERE trigger_schema = DATABASE()
        AND trigger_name IN ('trg_aud_cuenta_ai', 'trg_aud_cuenta_au', 'trg_aud_cuenta_ad')
        AND action_statement LIKE '%id_metodo_pago_solicitado%'`,
  );
  if (Number(auditoriaCuenta?.total ?? 0) !== 3) {
    throw new Error("Falta aplicar database/migrations/016_metodo_pago_solicitado.sql para actualizar la auditoría de cuenta.");
  }

  const [auditoriaPagos] = await filas(
    pool,
    `SELECT COUNT(*) AS total
       FROM information_schema.triggers
      WHERE trigger_schema = DATABASE()
        AND trigger_name IN (
          'trg_aud_metodo_pago_ai', 'trg_aud_metodo_pago_au', 'trg_aud_metodo_pago_ad',
          'trg_aud_categoria_metodo_pago_ai', 'trg_aud_categoria_metodo_pago_au', 'trg_aud_categoria_metodo_pago_ad'
        )`,
  );
  if (Number(auditoriaPagos?.total ?? 0) !== 6) {
    throw new Error("Falta aplicar database/migrations/017_categorias_metodos_pago.sql para actualizar la auditoría de métodos de pago.");
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
