// Contratos de la capa de servicios. Las vistas y stores dependen SOLO de estas
// interfaces; `services/index.ts` decide si se usa el mock o la API real.
import type {
  CategoriaMenu,
  Credenciales,
  Cuenta,
  DisponibilidadProducto,
  FiltroPedidos,
  ItemDisponibilidad,
  LineaNuevoPedido,
  Mesa,
  MotivoCancelacion,
  NuevoPedido,
  Pedido,
  TipoPago,
  Usuario,
} from '../types'

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
  /** POST /pedidos. El pedido queda en estado `registrado`. */
  crear(pedido: NuevoPedido): Promise<Pedido>
  /** GET /pedidos (filtros: mesa_id, estado) */
  listar(filtro?: FiltroPedidos): Promise<Pedido[]>
  /** GET /pedidos/{id} */
  obtener(id: number): Promise<Pedido>
  /**
   * PATCH /pedidos/{id}  (CAMBIO PROPUESTO EN F4).
   * Reemplaza el detalle completo de un pedido en estado `registrado`.
   */
  actualizar(id: number, detalle: LineaNuevoPedido[]): Promise<Pedido>
  /** POST /pedidos/{id}/enviar */
  enviar(id: number): Promise<Pedido>
  /**
   * POST /pedidos/{id}/cancelar.
   * El mesero solo cancela en `registrado` o `enviado`; en `en_preparacion`
   * falla con `ErrorServicio('requiere_gerente')`.
   */
  cancelar(id: number, motivo: MotivoCancelacion): Promise<Pedido>
}

export interface CuentasService {
  /** GET /mesas/{id}/cuenta. Devuelve `null` si la mesa no tiene cuenta activa. */
  obtenerPorMesa(mesaId: number): Promise<Cuenta | null>
  /** POST /cuentas/{id}/solicitar-pago */
  solicitarPago(cuentaId: number, tipo: TipoPago): Promise<Cuenta>
}

export interface Servicios {
  auth: AuthService
  mesas: MesasService
  menu: MenuService
  pedidos: PedidosService
  cuentas: CuentasService
}
