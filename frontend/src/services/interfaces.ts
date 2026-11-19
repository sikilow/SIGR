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
  NuevoUsuario,
  PagoCajaEntrada,
  ReporteVentas,
  Pedido,
  ProductoAdmin,
  SeccionAdmin,
  TipoPago,
  Usuario,
  UsuarioAdmin,
  VentaCaja,
} from '../types'
import type { HostessService } from './hostess/interfaces'

export interface AuthService {
  /** POST /auth/login */
  iniciarSesion(credenciales: Credenciales): Promise<Usuario>
  /** POST /auth/logout */
  cerrarSesion(): Promise<void>
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
}

/** Administración de usuarios. Solo el gerente (la API lo valida con 403 `sin_permiso`). */
export interface UsuariosService {
  /** GET /usuarios (activos e inactivos) */
  listar(): Promise<UsuarioAdmin[]>
  /** POST /usuarios. Falla con `estado_invalido` si el usuario o el correo ya existen. */
  crear(usuario: NuevoUsuario): Promise<UsuarioAdmin>
  /** PATCH /usuarios/{id}. Desactivar = `{ activo: false }` (los usuarios no se borran). */
  actualizar(id: number, cambio: CambioUsuario): Promise<UsuarioAdmin>
  /** POST /usuarios/{id}/contrasena. El usuario afectado debe proporcionar su contraseña anterior. */
  cambiarContrasena(id: number, contrasena: string, contrasenaActual: string): Promise<void>
  /**
   * POST /usuarios/{id}/restablecer. Manda al correo del usuario un enlace para que él cree su contraseña nueva.
   * Devuelve el correo enmascarado (p. ej. `a***@dominio.com`). Falla con `correo_no_enviado` si el envío falló.
   */
  enviarRestablecimiento(id: number): Promise<string>
}

/** Administración del catálogo: categorías, productos e inventario. Solo el gerente. */
export interface CatalogoService {
  /** GET /catalogo/metodos-pago/disponibles. Categorías y métodos activos para el personal. */
  listarMetodosPagoDisponibles(): Promise<MetodoPagoAdmin[]>
  /** GET /catalogo/canales/disponibles. Canales activos para un pedido para llevar (mesero). */
  listarCanalesDisponibles(): Promise<CanalPedido[]>
  /** GET /catalogo/canales. Todos los canales (Gerencia). */
  listarCanales(): Promise<CanalPedido[]>
  /** POST /catalogo/canales. Falla con `estado_invalido` si el nombre ya existe. */
  crearCanal(nombre: string): Promise<CanalPedido>
  /** PATCH /catalogo/canales/{id}. Los canales no se borran: se desactivan. */
  actualizarCanal(idCanal: number, cambio: { activo: boolean }): Promise<CanalPedido>
  /** GET /catalogo/configuracion-reservacion */
  obtenerConfiguracionReservacion(): Promise<ConfiguracionReservacion>
  /** PATCH /catalogo/configuracion-reservacion */
  actualizarConfiguracionReservacion(cambio: ConfiguracionReservacion): Promise<ConfiguracionReservacion>
  /** GET /catalogo/metodos-pago. Categorías y métodos activos e inactivos. */
  listarMetodosPago(): Promise<CategoriaMetodoPagoAdmin[]>
  /** POST /catalogo/metodos-pago/categorias */
  crearCategoriaMetodoPago(nombre: string, tipo: 'fisico' | 'digital'): Promise<CategoriaMetodoPagoAdmin>
  /** PATCH /catalogo/metodos-pago/categorias/{id} */
  actualizarCategoriaMetodoPago(id: number, cambio: { activo: boolean }): Promise<CategoriaMetodoPagoAdmin>
  /** POST /catalogo/metodos-pago */
  crearMetodoPago(nombre: string, idCategoriaMetodoPago: number, esEfectivo: boolean): Promise<MetodoPagoAdmin>
  /** PATCH /catalogo/metodos-pago/{id} */
  actualizarMetodoPago(id: number, cambio: { activo?: boolean; esEfectivo?: boolean }): Promise<MetodoPagoAdmin>
  /** GET /catalogo/categorias */
  listarCategorias(): Promise<CategoriaAdmin[]>
  /** POST /catalogo/categorias */
  crearCategoria(nombre: string): Promise<CategoriaAdmin>
  /** PATCH /catalogo/categorias/{id} */
  renombrarCategoria(id: number, nombre: string): Promise<CategoriaAdmin>
  /** DELETE /catalogo/categorias/{id}. Solo si no tiene productos (si no, `estado_invalido`). */
  eliminarCategoria(id: number): Promise<void>
  /** GET /catalogo/caracteristicas: catálogo de características de mesa (activas e inactivas). */
  listarCaracteristicas(): Promise<CaracteristicaAdmin[]>
  /** POST /catalogo/caracteristicas. Nombre único (si no, `estado_invalido`). */
  crearCaracteristica(nombre: string): Promise<CaracteristicaAdmin>
  /** PATCH /catalogo/caracteristicas/{id}: `{ nombre }` o `{ activa }`. */
  actualizarCaracteristica(id: number, cambio: { nombre: string } | { activa: boolean }): Promise<CaracteristicaAdmin>
  /** DELETE /catalogo/caracteristicas/{id}. Solo si ninguna mesa ni reservación la usa. */
  eliminarCaracteristica(id: number): Promise<void>
  /** GET /catalogo/secciones */
  listarSecciones(): Promise<SeccionAdmin[]>
  /** POST /catalogo/secciones */
  crearSeccion(nombre: string): Promise<SeccionAdmin>
  /** PATCH /catalogo/secciones/{nombre} */
  renombrarSeccion(nombre: string, nuevoNombre: string): Promise<SeccionAdmin>
  /** PATCH /catalogo/secciones/{nombre} */
  actualizarSeccion(nombre: string, cambio: { activa: boolean }): Promise<SeccionAdmin>
  /** DELETE /catalogo/secciones/{nombre}. Solo si no tiene mesas asignadas. */
  eliminarSeccion(nombre: string): Promise<void>
  /** GET /catalogo/productos (también los inactivos, con su inventario) */
  listarProductos(): Promise<ProductoAdmin[]>
  /** POST /catalogo/productos */
  crearProducto(producto: NuevoProducto): Promise<ProductoAdmin>
  /** PATCH /catalogo/productos/{id}. Desactivar = `{ activo: false }` (los productos no se borran). */
  actualizarProducto(id: number, cambio: CambioProducto): Promise<ProductoAdmin>
  /** GET /catalogo/mesas (también las no disponibles) */
  listarMesas(): Promise<MesaAdmin[]>
  /** POST /catalogo/mesas */
  crearMesa(mesa: NuevaMesa): Promise<MesaAdmin>
  /** PATCH /catalogo/mesas/{id}. No disponible = `{ activa: false }` (las mesas no se borran). Una mesa ocupada, con cuenta o con reservaciones vigentes no se puede desactivar. */
  actualizarMesa(id: number, cambio: CambioMesa): Promise<MesaAdmin>
}

export interface Servicios {
  auth: AuthService
  mesas: MesasService
  menu: MenuService
  pedidos: PedidosService
  cuentas: CuentasService
  caja: CajaService
  usuarios: UsuariosService
  catalogo: CatalogoService
  hostess: HostessService
}
