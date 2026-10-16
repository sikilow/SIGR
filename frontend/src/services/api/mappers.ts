// ÚNICO lugar donde se traduce entre el JSON de la API (snake_case, PROVISIONAL)
// y los tipos del frontend (camelCase). Si la API cambia de convención, solo se edita este archivo.
import type {
  CambioProducto,
  CambioUsuario,
  CategoriaAdmin,
  CategoriaMenu,
  Cuenta,
  DisponibilidadProducto,
  EstadoCuenta,
  EstadoCuentaActiva,
  EstadoMesa,
  EstadoPedido,
  ItemDisponibilidad,
  LineaNuevoPedido,
  Mesa,
  MotivoCancelacion,
  NuevoPedido,
  NuevoProducto,
  NuevoUsuario,
  Pedido,
  Producto,
  ProductoAdmin,
  Rol,
  TipoPago,
  Usuario,
  UsuarioAdmin,
} from '../../types'

// ---------- DTOs: formato de la API ----------

export interface UsuarioDto {
  id: number
  nombre: string
  rol: Rol
}

export interface MesaDto {
  id: number
  numero: number
  capacidad: number
  estado: EstadoMesa
  // CAMBIO PROPUESTO EN F3 (ver docs/contrato-api-mesero.md)
  estado_cuenta: EstadoCuentaActiva | null
  pedidos_activos: number
  total_cuenta: number
  pedidos_listos: number
  // CAMBIO PROPUESTO EN F6 (opcional: si la API no lo envía, el panel muestra solo "Cuenta solicitada")
  tipo_pago_solicitado?: TipoPago | null
}

export interface ProductoDto {
  id: number
  categoria_id: number
  nombre: string
  descripcion: string
  precio: number
  disponible: boolean
  /** Unidades en inventario; null o ausente = no controla existencia (se prepara al momento). */
  existencia?: number | null
}

export interface CategoriaMenuDto {
  id: number
  nombre: string
  productos: ProductoDto[]
}

export interface DisponibilidadDto {
  producto_id: number
  disponible: boolean
  existencia?: number
}

export interface DetallePedidoDto {
  producto_id: number
  nombre_producto: string
  cantidad: number
  observaciones: string
  precio_unitario: number
}

export interface PedidoDto {
  id: number
  mesa_id: number
  // CAMBIO PROPUESTO EN F5 (ver docs/contrato-api-mesero.md)
  mesa_numero: number
  cuenta_id: number
  mesero_id: number
  estado: EstadoPedido
  detalle: DetallePedidoDto[]
  total: number
  creado_en: string
  // CAMBIO PROPUESTO EN F5: texto libre (5 a 200 caracteres), no un código
  motivo_cancelacion: MotivoCancelacion | null
}

export interface CuentaDto {
  id: number
  mesa_id: number
  estado: EstadoCuenta
  pedidos: PedidoDto[]
  total: number
  abierta_en: string
  tipo_pago_solicitado: TipoPago | null
}

// ---------- API → frontend ----------

export function aUsuario(dto: UsuarioDto): Usuario {
  return { id: dto.id, nombre: dto.nombre, rol: dto.rol }
}

export function aMesa(dto: MesaDto): Mesa {
  return {
    id: dto.id,
    numero: dto.numero,
    capacidad: dto.capacidad,
    estado: dto.estado,
    estadoCuenta: dto.estado_cuenta,
    pedidosActivos: dto.pedidos_activos,
    totalCuenta: dto.total_cuenta,
    tipoPagoSolicitado: dto.tipo_pago_solicitado ?? null,
    pedidosListos: dto.pedidos_listos,
  }
}

export function aProducto(dto: ProductoDto): Producto {
  return {
    id: dto.id,
    categoriaId: dto.categoria_id,
    nombre: dto.nombre,
    descripcion: dto.descripcion,
    precio: dto.precio,
    disponible: dto.disponible,
    ...(dto.existencia != null ? { existencia: dto.existencia } : {}),
  }
}

export function aCategoriaMenu(dto: CategoriaMenuDto): CategoriaMenu {
  return { id: dto.id, nombre: dto.nombre, productos: dto.productos.map(aProducto) }
}

export function aDisponibilidad(dto: DisponibilidadDto): DisponibilidadProducto {
  return {
    productoId: dto.producto_id,
    disponible: dto.disponible,
    ...(dto.existencia !== undefined ? { existencia: dto.existencia } : {}),
  }
}

export function aPedido(dto: PedidoDto): Pedido {
  return {
    id: dto.id,
    mesaId: dto.mesa_id,
    mesaNumero: dto.mesa_numero,
    cuentaId: dto.cuenta_id,
    meseroId: dto.mesero_id,
    estado: dto.estado,
    detalle: dto.detalle.map((d) => ({
      productoId: d.producto_id,
      nombreProducto: d.nombre_producto,
      cantidad: d.cantidad,
      observaciones: d.observaciones,
      precioUnitario: d.precio_unitario,
    })),
    total: dto.total,
    creadoEn: dto.creado_en,
    motivoCancelacion: dto.motivo_cancelacion,
  }
}

export function aCuenta(dto: CuentaDto): Cuenta {
  return {
    id: dto.id,
    mesaId: dto.mesa_id,
    estado: dto.estado,
    pedidos: dto.pedidos.map(aPedido),
    total: dto.total,
    abiertaEn: dto.abierta_en,
    tipoPagoSolicitado: dto.tipo_pago_solicitado,
  }
}

// ---------- frontend → API (cuerpos de petición) ----------

/** Líneas de pedido sin precios (los calcula el servidor). */
function deLineas(detalle: LineaNuevoPedido[]) {
  return detalle.map((d) => ({
    producto_id: d.productoId,
    cantidad: d.cantidad,
    observaciones: d.observaciones,
  }))
}

export function deNuevoPedido(pedido: NuevoPedido) {
  return { mesa_id: pedido.mesaId, detalle: deLineas(pedido.detalle) }
}

/** CAMBIO PROPUESTO EN F4: cuerpo de PATCH /pedidos/{id} (detalle completo). */
export function deActualizacionPedido(detalle: LineaNuevoPedido[]) {
  return { detalle: deLineas(detalle) }
}

/** CAMBIO PROPUESTO EN F5: el motivo es texto libre (ya no un código). */
export function deCancelacion(motivo: MotivoCancelacion) {
  return { motivo: motivo.trim() }
}

export function deItemsDisponibilidad(items: ItemDisponibilidad[]) {
  return { items: items.map((i) => ({ producto_id: i.productoId })) }
}

// ---------- Módulo del gerente ----------

export interface UsuarioAdminDto {
  id: number
  nombre: string
  correo: string
  usuario: string
  rol: Rol
  activo: boolean
  telefono: string | null
  creado_en: string
  ultimo_acceso: string | null
}

export interface CategoriaAdminDto {
  id: number
  nombre: string
  total_productos: number
}

export interface ProductoAdminDto {
  id: number
  categoria_id: number
  categoria: string
  nombre: string
  descripcion: string
  precio: number
  activo: boolean
  existencia: number
  stock_minimo: number
  /** Ausente se interpreta como true (el comportamiento de antes). */
  controla_existencia?: boolean
  disponible: boolean
}

export function aUsuarioAdmin(dto: UsuarioAdminDto): UsuarioAdmin {
  return {
    id: dto.id,
    nombre: dto.nombre,
    correo: dto.correo,
    usuario: dto.usuario,
    rol: dto.rol,
    activo: dto.activo,
    telefono: dto.telefono,
    creadoEn: dto.creado_en,
    ultimoAcceso: dto.ultimo_acceso,
  }
}

export function aCategoriaAdmin(dto: CategoriaAdminDto): CategoriaAdmin {
  return { id: dto.id, nombre: dto.nombre, totalProductos: dto.total_productos }
}

export function aProductoAdmin(dto: ProductoAdminDto): ProductoAdmin {
  return {
    id: dto.id,
    categoriaId: dto.categoria_id,
    categoria: dto.categoria,
    nombre: dto.nombre,
    descripcion: dto.descripcion,
    precio: dto.precio,
    activo: dto.activo,
    existencia: dto.existencia,
    stockMinimo: dto.stock_minimo,
    controlaExistencia: dto.controla_existencia ?? true,
    disponible: dto.disponible,
  }
}

export function deNuevoUsuario(u: NuevoUsuario) {
  return {
    nombre: u.nombre.trim(),
    correo: u.correo.trim(),
    usuario: u.usuario.trim(),
    contrasena: u.contrasena,
    rol: u.rol,
    ...(u.telefono?.trim() ? { telefono: u.telefono.trim() } : {}),
  }
}

/** Solo viajan los campos que cambiaron (PATCH parcial). */
export function deCambioUsuario(c: CambioUsuario) {
  return {
    ...(c.nombre !== undefined ? { nombre: c.nombre.trim() } : {}),
    ...(c.correo !== undefined ? { correo: c.correo.trim() } : {}),
    ...(c.usuario !== undefined ? { usuario: c.usuario.trim() } : {}),
    ...(c.rol !== undefined ? { rol: c.rol } : {}),
    ...(c.activo !== undefined ? { activo: c.activo } : {}),
    ...(c.telefono !== undefined ? { telefono: c.telefono?.trim() ? c.telefono.trim() : null } : {}),
  }
}

export function deNuevoProducto(p: NuevoProducto) {
  return {
    categoria_id: p.categoriaId,
    nombre: p.nombre.trim(),
    descripcion: p.descripcion.trim(),
    precio: p.precio,
    activo: p.activo,
    controla_existencia: p.controlaExistencia,
    existencia: p.existencia,
    stock_minimo: p.stockMinimo,
  }
}

export function deCambioProducto(c: CambioProducto) {
  return {
    ...(c.categoriaId !== undefined ? { categoria_id: c.categoriaId } : {}),
    ...(c.nombre !== undefined ? { nombre: c.nombre.trim() } : {}),
    ...(c.descripcion !== undefined ? { descripcion: c.descripcion.trim() } : {}),
    ...(c.precio !== undefined ? { precio: c.precio } : {}),
    ...(c.activo !== undefined ? { activo: c.activo } : {}),
    ...(c.controlaExistencia !== undefined ? { controla_existencia: c.controlaExistencia } : {}),
    ...(c.existencia !== undefined ? { existencia: c.existencia } : {}),
    ...(c.stockMinimo !== undefined ? { stock_minimo: c.stockMinimo } : {}),
  }
}
