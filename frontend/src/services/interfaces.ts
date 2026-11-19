// Contratos de la capa de servicios. Las vistas y stores dependen SOLO de estas
// interfaces; `services/index.ts` decide si se usa el mock o la API real.
import type {
  AperturaParaLlevar,
  CambioMesa,
  CanalPedido,
  CategoriaMetodoPagoAdmin,
  CorteCaja,
  CorteDetalle,
  CorteResumen,
  FiltroCortes,
  FiltroDevoluciones,
  FiltroVentas,
  Devolucion,
  DatosReferenciaFiscal,
  ReferenciaFiscal,
  SolicitudDevolucion,
  VentaDetalle,
  VentaListado,
  EstadoCaja,
  CambioProducto,
  ConfiguracionReservacion,
  CambioUsuario,
  CaracteristicaAdmin,
  CategoriaAdmin,
  CategoriaMenu,
  Credenciales,
  Cuenta,
  DisponibilidadProducto,
  FiltroPedidos,
  ItemDisponibilidad,
  LineaNuevoPedido,
  Mesa,
  MesaAdmin,
  MetodoPagoAdmin,
  NuevaMesa,
  NuevoPedido,
  NuevoProducto,
  NuevaMerma,
  Merma,
  ReporteMermas,
  ReporteReservaciones,
  NuevoUsuario,
  PagoCajaEntrada,
  ReporteVentas,
  Pedido,
  ProductoAdmin,
  SeccionAdmin,
  TipoPago,
  Usuario,
  UsuarioAdmin,
  VentaCaja, CambioCliente, ClienteAdmin
} from '../types'
import type { HostessService } from './hostess/interfaces'

export interface AuthService {
  /** POST /auth/login */
  iniciarSesion(credenciales: Credenciales): Promise<Usuario>
  /** POST /auth/logout: cierra la sesión también en el servidor (el token deja de servir). */
  cerrarSesion(): Promise<void>
  /** POST /auth/actividad: avisa que la persona sigue ahí (la API cierra la sesión tras un rato sin actividad). */
  registrarActividad(): Promise<void>
  /** GET /auth/me. Devuelve `null` si no hay sesión activa. */
  obtenerSesion(): Promise<Usuario | null>
  /**
   * POST /auth/recuperar. Pública: manda al correo del empleado un enlace de un solo uso (1 h) para crear contraseña.
   * Responde lo mismo exista o no la cuenta. `enlaceDemo` solo viene en el modo demostración (no hay correo real).
   */
  solicitarRecuperacion(usuarioOCorreo: string): Promise<{ mensaje: string; enlaceDemo?: string }>
  /** GET /auth/restablecer/{token}. Falla con `enlace_invalido` si ya se usó o caducó. */
  validarEnlaceRestablecer(token: string): Promise<{ nombreUsuario: string; nombre: string }>
  /** POST /auth/restablecer. Guarda la contraseña nueva y deja el enlace sin efecto. */
  restablecerContrasena(token: string, contrasena: string): Promise<void>
}

export interface MesasService {
  /** GET /mesas */
  listar(): Promise<Mesa[]>
  /**
   * POST /mesas/para-llevar: abre un pedido para llevar. Ocupa la primera mesa virtual libre de la sección «Para llevar»
   * y le abre la cuenta con el canal. Sin mesas libres falla con `mesa_no_disponible`.
   */
  abrirParaLlevar(idCanal: number, referencia: string | null, claveIdempotencia?: string): Promise<AperturaParaLlevar>
  /** POST /mesas/{id}/liberar-para-llevar: libera una mesa virtual cuya cuenta no tiene pedidos vigentes. */
  liberarParaLlevar(idMesa: number): Promise<void>
}

export interface MenuService {
  /** GET /menu */
  obtenerMenu(): Promise<CategoriaMenu[]>
  /** POST /productos/disponibilidad */
  verificarDisponibilidad(items: ItemDisponibilidad[]): Promise<DisponibilidadProducto[]>
}

export interface PedidosService {
  /**
   * POST /pedidos. El pedido queda en estado `registrado`.
   * `claveIdempotencia` viaja en la cabecera `Idempotency-Key`: los
   * reintentos de la MISMA intención la reutilizan para no duplicar el pedido.
   */
  crear(pedido: NuevoPedido, claveIdempotencia?: string): Promise<Pedido>
  /** GET /pedidos (filtros: id_mesa, estado) */
  listar(filtro?: FiltroPedidos): Promise<Pedido[]>
  /** GET /pedidos/{id} */
  obtener(id: number): Promise<Pedido>
  /**
   * PATCH /pedidos/{id}.
   * Reemplaza el detalle completo de un pedido en estado `registrado`.
   */
  actualizar(id: number, detalle: LineaNuevoPedido[]): Promise<Pedido>
  /** POST /pedidos/{id}/enviar (con `Idempotency-Key`). */
  enviar(id: number, claveIdempotencia?: string): Promise<Pedido>
  /**
   * POST /pedidos/{id}/cancelar (con `Idempotency-Key`). Cuerpo: `{ descripcion }`.
   * El mesero solo cancela en `registrado` o `enviado` (`pendiente` cuenta como `enviado`); en `en_preparacion`
   * falla con `ErrorServicio('requiere_gerente')`. `descripcion` (motivo_cancelacion.descripcion) es texto
   * libre de 5 a 200 caracteres.
   */
  cancelar(id: number, descripcion: string, claveIdempotencia?: string): Promise<Pedido>
  /**
   * POST /pedidos/{id}/entregar.
   * Marca como `entregado` un pedido `listo`; desde otro estado falla con `estado_invalido`.
   */
  entregar(id: number, claveIdempotencia?: string): Promise<Pedido>
  /**
   * PATCH /pedidos/{id}/estado. Cocina: `pendiente`/enviado → `en_preparacion` → `listo`.
   * La API valida que el pedido esté en el estado anterior correcto.
   */
  cambiarEstadoCocina(id: number, estado: 'en_preparacion' | 'listo'): Promise<Pedido>
}

export interface CuentasService {
  /** GET /mesas/{id}/cuenta. Devuelve `null` si la mesa no tiene cuenta activa. */
  obtenerPorMesa(idMesa: number): Promise<Cuenta | null>
  /** POST /cuentas/{id}/solicitar-pago (con `Idempotency-Key`). */
  solicitarPago(idCuenta: number, tipo: TipoPago, idMetodoPagoSolicitado: number | null, claveIdempotencia?: string): Promise<Cuenta>
}

export interface CajaService {
  /** GET /caja/estado */
  obtenerEstado(): Promise<EstadoCaja>
  /** POST /caja/cortes */
  abrirCorte(fondoInicial: number): Promise<CorteCaja>
  /** POST /caja/cortes/cerrar */
  cerrarCorte(efectivoContado: number): Promise<CorteDetalle>
  /** GET /caja/cortes (cajero: los suyos; gerente: todos) */
  listarCortes(filtro?: FiltroCortes): Promise<CorteResumen[]>
  /** GET /caja/cortes/{id} */
  obtenerCorte(idCorte: number): Promise<CorteDetalle>
  /** POST /caja/cuentas/{id}/cobrar */
  cobrar(idCuenta: number, pagos: PagoCajaEntrada[], claveIdempotencia?: string): Promise<VentaCaja>
  /** GET /caja/reportes/ventas?desde&hasta (solo gerente). Fechas AAAA-MM-DD; máximo dos años. */
  reporteVentas(desde: string, hasta: string): Promise<ReporteVentas>

  // ---- Tickets pasados, reimpresión y devoluciones (migración 034). Cajero y gerente, salvo lo que se indica. ----
  /** GET /caja/ventas?desde&hasta&q. Por omisión, los últimos 7 días; máximo 92 días y 200 ventas. */
  listarVentas(filtro?: FiltroVentas): Promise<VentaListado[]>
  /** GET /caja/ventas/{id}: el ticket con sus devoluciones y lo que se puede devolver todavía. */
  obtenerVenta(idVenta: number): Promise<VentaDetalle>
  /** POST /caja/ventas/{id}/reimpresion: deja constancia de quién reimprimió el ticket y cuándo. */
  registrarReimpresion(idVenta: number): Promise<{ reimpresiones: number; ultimaReimpresion: Date | null }>
  /**
   * POST /caja/ventas/{id}/devoluciones. El cajero crea una SOLICITUD (pendiente); el gerente la registra ya aprobada.
   * Falla con `estado_invalido` (422/409) si se pasa de lo vendido, de lo cobrado con un método o no hay caja para el efectivo.
   */
  solicitarDevolucion(idVenta: number, solicitud: SolicitudDevolucion, claveIdempotencia?: string): Promise<Devolucion>
  /** GET /caja/devoluciones (gerente: todas; cajero: las que él pidió). Las pendientes salen siempre. */
  listarDevoluciones(filtro?: FiltroDevoluciones): Promise<Devolucion[]>
  /** POST /caja/devoluciones/{id}/aprobar (solo gerente). El efectivo sale del corte del cajero que la pidió. */
  aprobarDevolucion(idDevolucion: number, nota?: string): Promise<Devolucion>
  /** POST /caja/devoluciones/{id}/rechazar (solo gerente). La nota es obligatoria. */
  rechazarDevolucion(idDevolucion: number, nota: string): Promise<Devolucion>
  /** PUT /caja/ventas/{id}/fiscal (solo gerente): referencia para el contador y datos fiscales opcionales. */
  guardarReferenciaFiscal(idVenta: number, datos: DatosReferenciaFiscal): Promise<ReferenciaFiscal>
  /** DELETE /caja/ventas/{id}/fiscal (solo gerente). */
  quitarReferenciaFiscal(idVenta: number): Promise<void>
}

/** Administración de usuarios. Solo el gerente (la API lo valida con 403 `sin_permiso`). */
export interface UsuariosService {
  /** GET /usuarios (activos e inactivos; `eliminados: true` = solo los eliminados) */
  listar(opciones?: { eliminados?: boolean }): Promise<UsuarioAdmin[]>
  /** POST /usuarios. Falla con `estado_invalido` si el usuario o el correo ya existen. */
  crear(usuario: NuevoUsuario): Promise<UsuarioAdmin>
  /** PATCH /usuarios/{id}. Desactivar = `{ activo: false }`: su sesión se cierra de inmediato. */
  actualizar(id: number, cambio: CambioUsuario): Promise<UsuarioAdmin>
  /** DELETE /usuarios/{id}. Eliminado lógico: no entra más, se oculta y se puede restaurar (vuelve inactivo). No a uno mismo, ni al primer gerente, ni al último gerente activo. */
  eliminar(id: number): Promise<UsuarioAdmin>
  /** POST /usuarios/{id}/restaurar. Vuelve vigente pero inactivo. */
  restaurar(id: number): Promise<UsuarioAdmin>
  /** POST /usuarios/{id}/contrasena. El usuario afectado debe proporcionar su contraseña anterior. */
  cambiarContrasena(id: number, contrasena: string, contrasenaActual: string): Promise<void>
  /**
   * POST /usuarios/{id}/restablecer. Manda al correo del usuario un enlace para que él cree su contraseña nueva.
   * Devuelve el correo enmascarado (p. ej. `a***@dominio.com`). Falla con `correo_no_enviado` si el envío falló.
   */
  enviarRestablecimiento(id: number): Promise<string>
}

/** Reportes del gerente que no son de ventas (ver `CajaService.reporteVentas`): reservaciones e inasistencias, y mermas. */
export interface ReportesService {
  /** GET /reservaciones/reporte?desde&hasta. Fechas AAAA-MM-DD; máximo dos años. */
  reporteReservaciones(desde: string, hasta: string): Promise<ReporteReservaciones>
  /**
   * POST /catalogo/mermas (con `Idempotency-Key`). Si el producto controla existencia, la descuenta del inventario;
   * falla con `estado_invalido` si no alcanza, o si el producto está eliminado.
   */
  registrarMerma(merma: NuevaMerma, claveIdempotencia?: string): Promise<Merma>
  /** GET /catalogo/mermas/reporte?desde&hasta. Fechas AAAA-MM-DD; máximo dos años. */
  reporteMermas(desde: string, hasta: string): Promise<ReporteMermas>
}

/** Administración del catálogo: categorías, productos e inventario. Solo el gerente. */
export interface CatalogoService {
  /** GET /catalogo/metodos-pago/disponibles. Categorías y métodos activos para el personal. */
  listarMetodosPagoDisponibles(): Promise<MetodoPagoAdmin[]>
  /** GET /catalogo/canales/disponibles. Canales activos para un pedido para llevar (mesero). */
  listarCanalesDisponibles(): Promise<CanalPedido[]>
  /** GET /catalogo/canales. Los canales vigentes (Gerencia); `eliminados: true` = solo los eliminados. */
  listarCanales(opciones?: { eliminados?: boolean }): Promise<CanalPedido[]>
  /** POST /catalogo/canales. Falla con `estado_invalido` si el nombre ya existe. */
  crearCanal(nombre: string): Promise<CanalPedido>
  /** PATCH /catalogo/canales/{id}. Desactivar = `{ activo: false }`. */
  actualizarCanal(idCanal: number, cambio: { activo: boolean }): Promise<CanalPedido>
  /** DELETE /catalogo/canales/{id}. Eliminado lógico; no mientras una cuenta abierta lo use. */
  eliminarCanal(idCanal: number): Promise<CanalPedido>
  /** POST /catalogo/canales/{id}/restaurar (vuelve inactivo). */
  restaurarCanal(idCanal: number): Promise<CanalPedido>
  /** GET /catalogo/configuracion-reservacion */
  obtenerConfiguracionReservacion(): Promise<ConfiguracionReservacion>
  /** PATCH /catalogo/configuracion-reservacion */
  actualizarConfiguracionReservacion(cambio: ConfiguracionReservacion): Promise<ConfiguracionReservacion>
  /** GET /catalogo/metodos-pago. Categorías y métodos vigentes (activos e inactivos); `eliminados: true` = solo lo eliminado. */
  listarMetodosPago(opciones?: { eliminados?: boolean }): Promise<CategoriaMetodoPagoAdmin[]>
  /** POST /catalogo/metodos-pago/categorias */
  crearCategoriaMetodoPago(nombre: string, tipo: 'fisico' | 'digital'): Promise<CategoriaMetodoPagoAdmin>
  /** PATCH /catalogo/metodos-pago/categorias/{id} */
  actualizarCategoriaMetodoPago(id: number, cambio: { activo: boolean }): Promise<CategoriaMetodoPagoAdmin>
  /** DELETE /catalogo/metodos-pago/categorias/{id}. Eliminado lógico; solo sin métodos vigentes. */
  eliminarCategoriaMetodoPago(id: number): Promise<CategoriaMetodoPagoAdmin>
  /** POST /catalogo/metodos-pago/categorias/{id}/restaurar (vuelve inactiva). */
  restaurarCategoriaMetodoPago(id: number): Promise<CategoriaMetodoPagoAdmin>
  /** POST /catalogo/metodos-pago */
  crearMetodoPago(nombre: string, idCategoriaMetodoPago: number, esEfectivo: boolean): Promise<MetodoPagoAdmin>
  /** PATCH /catalogo/metodos-pago/{id} */
  actualizarMetodoPago(id: number, cambio: { activo?: boolean; esEfectivo?: boolean }): Promise<MetodoPagoAdmin>
  /** DELETE /catalogo/metodos-pago/{id}. Eliminado lógico; no el de efectivo ni uno solicitado por una cuenta abierta. */
  eliminarMetodoPago(id: number): Promise<MetodoPagoAdmin>
  /** POST /catalogo/metodos-pago/{id}/restaurar (vuelve inactivo; su categoría debe estar vigente). */
  restaurarMetodoPago(id: number): Promise<MetodoPagoAdmin>
  /** GET /catalogo/categorias (`eliminados: true` = solo las eliminadas) */
  listarCategorias(opciones?: { eliminados?: boolean }): Promise<CategoriaAdmin[]>
  /** POST /catalogo/categorias */
  crearCategoria(nombre: string): Promise<CategoriaAdmin>
  /** PATCH /catalogo/categorias/{id} */
  renombrarCategoria(id: number, nombre: string): Promise<CategoriaAdmin>
  /** DELETE /catalogo/categorias/{id}. Eliminado lógico (se conserva y se puede restaurar). Solo si no tiene productos vigentes (si no, `estado_invalido`). */
  eliminarCategoria(id: number): Promise<void>
  /** POST /catalogo/categorias/{id}/restaurar */
  restaurarCategoria(id: number): Promise<CategoriaAdmin>
  /** GET /catalogo/caracteristicas: catálogo de características de mesa (activas e inactivas); `eliminados: true` = solo las eliminadas. */
  listarCaracteristicas(opciones?: { eliminados?: boolean }): Promise<CaracteristicaAdmin[]>
  /** POST /catalogo/caracteristicas. Nombre único (si no, `estado_invalido`). */
  crearCaracteristica(nombre: string): Promise<CaracteristicaAdmin>
  /** PATCH /catalogo/caracteristicas/{id}: `{ nombre }` o `{ activa }`. */
  actualizarCaracteristica(id: number, cambio: { nombre: string } | { activa: boolean }): Promise<CaracteristicaAdmin>
  /** DELETE /catalogo/caracteristicas/{id}. Eliminado lógico: las mesas y reservaciones que ya la tenían la conservan. */
  eliminarCaracteristica(id: number): Promise<void>
  /** POST /catalogo/caracteristicas/{id}/restaurar (vuelve inactiva). */
  restaurarCaracteristica(id: number): Promise<CaracteristicaAdmin>
  /** GET /catalogo/secciones (`eliminados: true` = solo las eliminadas) */
  listarSecciones(opciones?: { eliminados?: boolean }): Promise<SeccionAdmin[]>
  /** POST /catalogo/secciones */
  crearSeccion(nombre: string): Promise<SeccionAdmin>
  /** PATCH /catalogo/secciones/{nombre} */
  renombrarSeccion(nombre: string, nuevoNombre: string): Promise<SeccionAdmin>
  /** PATCH /catalogo/secciones/{nombre} */
  actualizarSeccion(nombre: string, cambio: { activa: boolean }): Promise<SeccionAdmin>
  /** DELETE /catalogo/secciones/{nombre}. Eliminado lógico; solo sin mesas vigentes y no la de «Para llevar». */
  eliminarSeccion(nombre: string): Promise<void>
  /** POST /catalogo/secciones/{nombre}/restaurar (vuelve inhabilitada). */
  restaurarSeccion(nombre: string): Promise<SeccionAdmin>
  /** GET /catalogo/productos (también los inactivos, con su inventario; `eliminados: true` = solo los eliminados) */
  listarProductos(opciones?: { eliminados?: boolean }): Promise<ProductoAdmin[]>
  /** POST /catalogo/productos */
  crearProducto(producto: NuevoProducto): Promise<ProductoAdmin>
  /** PATCH /catalogo/productos/{id}. Desactivar = `{ activo: false }` (sigue visible para el gerente). */
  actualizarProducto(id: number, cambio: CambioProducto): Promise<ProductoAdmin>
  /** DELETE /catalogo/productos/{id}. Eliminado lógico: deja de mostrarse pero se conserva y se puede restaurar. No si está en un pedido sin entregar. */
  eliminarProducto(id: number): Promise<ProductoAdmin>
  /** POST /catalogo/productos/{id}/restaurar */
  restaurarProducto(id: number): Promise<ProductoAdmin>
  /** GET /catalogo/mesas (también las no disponibles; `eliminados: true` = solo las eliminadas) */
  listarMesas(opciones?: { eliminados?: boolean }): Promise<MesaAdmin[]>
  /** POST /catalogo/mesas */
  crearMesa(mesa: NuevaMesa): Promise<MesaAdmin>
  /** PATCH /catalogo/mesas/{id}. No disponible = `{ activa: false }`. Una mesa ocupada, con cuenta o con reservaciones vigentes no se puede desactivar. */
  actualizarMesa(id: number, cambio: CambioMesa): Promise<MesaAdmin>
  /** DELETE /catalogo/mesas/{id}. Eliminado lógico; mismas condiciones que para dejarla no disponible. */
  eliminarMesa(id: number): Promise<MesaAdmin>
  /** POST /catalogo/mesas/{id}/restaurar (vuelve no disponible; su sección debe estar vigente). */
  restaurarMesa(id: number): Promise<MesaAdmin>
}

/** Gestión de clientes por el gerente (Gerente → Clientes). */
export interface ClientesService {
  /** GET /clientes/gestion (`eliminados: true` = solo los eliminados) */
  listar(opciones?: { eliminados?: boolean }): Promise<ClienteAdmin[]>
  /** PATCH /clientes/{id}: corrige nombre, teléfono, lada o correo (cualquier subconjunto). */
  actualizar(id: number, cambio: CambioCliente): Promise<ClienteAdmin>
  /** DELETE /clientes/{id}. Eliminado lógico; no con reservaciones vigentes ni en la lista de espera. */
  eliminar(id: number): Promise<ClienteAdmin>
  /** POST /clientes/{id}/restaurar */
  restaurar(id: number): Promise<ClienteAdmin>
}

export interface Servicios {
  auth: AuthService
  mesas: MesasService
  menu: MenuService
  pedidos: PedidosService
  cuentas: CuentasService
  caja: CajaService
  usuarios: UsuariosService
  clientes: ClientesService
  catalogo: CatalogoService
  hostess: HostessService
  reportes: ReportesService
}
