// Contratos de la capa de servicios. Las vistas y stores dependen SOLO de estas
// interfaces; `services/index.ts` decide si se usa el mock o la API real.
import type {
  CambioMesa,
  CorteCaja,
  EstadoCaja,
  CambioProducto,
  CambioUsuario,
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
  NuevaMesa,
  NuevoPedido,
  NuevoProducto,
  NuevoUsuario,
  PagoCajaEntrada,
  Pedido,
  ProductoAdmin,
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
}

export interface MesasService {
  /** GET /mesas */
  listar(): Promise<Mesa[]>
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
  solicitarPago(idCuenta: number, tipo: TipoPago, claveIdempotencia?: string): Promise<Cuenta>
}

export interface CajaService {
  /** GET /caja/estado */
  obtenerEstado(): Promise<EstadoCaja>
  /** POST /caja/cortes */
  abrirCorte(): Promise<CorteCaja>
  /** POST /caja/cortes/cerrar */
  cerrarCorte(totalReportado: number): Promise<CorteCaja>
  /** POST /caja/cuentas/{id}/cobrar */
  cobrar(idCuenta: number, pagos: PagoCajaEntrada[], claveIdempotencia?: string): Promise<VentaCaja>
}

/** Administración de usuarios. Solo el gerente (la API lo valida con 403 `sin_permiso`). */
export interface UsuariosService {
  /** GET /usuarios (activos e inactivos) */
  listar(): Promise<UsuarioAdmin[]>
  /** POST /usuarios. Falla con `estado_invalido` si el usuario o el correo ya existen. */
  crear(usuario: NuevoUsuario): Promise<UsuarioAdmin>
  /** PATCH /usuarios/{id}. Desactivar = `{ activo: false }` (los usuarios no se borran). */
  actualizar(id: number, cambio: CambioUsuario): Promise<UsuarioAdmin>
  /** POST /usuarios/{id}/contrasena */
  cambiarContrasena(id: number, contrasena: string): Promise<void>
}

/** Administración del catálogo: categorías, productos e inventario. Solo el gerente. */
export interface CatalogoService {
  /** GET /catalogo/categorias */
  listarCategorias(): Promise<CategoriaAdmin[]>
  /** POST /catalogo/categorias */
  crearCategoria(nombre: string): Promise<CategoriaAdmin>
  /** PATCH /catalogo/categorias/{id} */
  renombrarCategoria(id: number, nombre: string): Promise<CategoriaAdmin>
  /** DELETE /catalogo/categorias/{id}. Solo si no tiene productos (si no, `estado_invalido`). */
  eliminarCategoria(id: number): Promise<void>
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
