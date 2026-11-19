// ÚNICO lugar donde se traduce entre el JSON de la API y los tipos del frontend.
//  - Las claves del JSON son los nombres EXACTOS de las columnas de la BD (snake_case): `id_mesa`, `fecha_hora`…
//    Los campos que NO son columnas (calculados por la API) se marcan en cada DTO.
//  - PHP/PDO puede devolver INT, DECIMAL y BOOLEAN como texto y los DATETIME sin zona horaria: los DTO
//    admiten esas formas y los helpers de `conversion.ts` las convierten.
//  - Estados y roles llegan con el nombre del catálogo ('En preparacion', 'Mesero') y se normalizan a código.
// Ver docs/equivalencias-bd.md y docs/contrato-api-mesero.md.
import type {
  CambioMesa,
  CanalPedido,
  CambioProducto,
  CaracteristicaAdmin,
  CaracteristicaMesa,
  ConfiguracionReservacion,
  CambioUsuario,
  CategoriaAdmin,
  CategoriaMenu,
  Credenciales,
  Cuenta,
  DisponibilidadProducto,
  ItemDisponibilidad,
  LineaNuevoPedido,
  Mesa,
  MesaAdmin,
  NuevaMesa,
  NuevoPedido,
  NuevoProducto,
  NuevoUsuario,
  Pedido,
  Producto,
  ProductoAdmin,
  SeccionAdmin,
  TipoPago,
  Usuario,
  UsuarioAdmin,
} from '../../types'
import { HORARIO_POR_DEFECTO, type HorarioReservacion, INTERVALOS_RESERVACION } from '../../utils/horarioReservacion'
import { ErrorServicio } from '../errores'
import {
  aBooleano,
  aEstadoCuenta,
  aEstadoMesa,
  aEstadoPedido,
  aNumero,
  aNumeroONulo,
  aRol,
  aTexto,
  aZona,
  normalizarCodigo,
  parseFechaMySQL,
  parseFechaMySQLONula,
} from './conversion'

/** INT o DECIMAL tal como puede llegar desde PDO: número o texto ("12", "120.00"). */
type Numerico = number | string
/** BOOLEAN tal como puede llegar desde PDO: `true`/`false`, `0`/`1` o `"0"`/`"1"`. */
type Booleano = boolean | number | string

// ---------- DTOs: formato de la API ----------

export interface UsuarioDto {
  id_usuario: Numerico
  id_rol: Numerico
  nombre: string
  correo: string
  activo: Booleano
  /** CALCULADO por la API (JOIN con rol.nombre), p. ej. "Mesero". */
  rol: string
}

export interface MesaDto {
  id_mesa: Numerico
  numero: Numerico
  capacidad: Numerico
  /** mesa.estado (CHECK: libre, ocupada o reservada), p. ej. "libre". */
  estado: string
  /** mesa.zona: «sección» del salón (hasta 40 caracteres); `null` si no tiene. Opcional por tolerancia. */
  zona?: string | null
  /** Características activas (catálogo de Gerencia, migración 023). */
  caracteristicas?: CaracteristicaDto[]
  /** seccion.es_para_llevar: mesa virtual de pedidos para llevar. */
  es_para_llevar?: Booleano
  // --- CALCULADOS por la API (no son columnas de `mesa`) ---
  /** Canal y referencia del pedido para llevar de la cuenta activa. */
  canal?: string | null
  referencia?: string | null
  estado_cuenta: string | null
  pedidos_activos: Numerico | null
  total_cuenta: Numerico | null
  pedidos_listos: Numerico | null
  /** cuenta.tipo_pago_solicitado ("fisico" | "digital"), de la cuenta activa. Opcional: si no llega, el panel muestra solo "Cuenta solicitada". */
  tipo_pago_solicitado?: string | null
}

export interface ProductoDto {
  id_producto: Numerico
  id_categoria: Numerico
  nombre: string
  presentacion?: string | null
  descripcion: string | null
  precio: Numerico
  disponible: Booleano
  /** Unidades en inventario; null o ausente = no controla existencia (se prepara al momento). */
  existencia?: Numerico | null
  /** Umbral de stock bajo configurado en disponibilidadProducto.stock_minimo. */
  stock_minimo?: Numerico | null
}

export interface CategoriaMenuDto {
  id_categoria: Numerico
  nombre: string
  /** CALCULADO por la API: productos de la categoría. */
  productos: ProductoDto[]
}

export interface DisponibilidadDto {
  id_producto: Numerico
  disponible: Booleano
  /** Unidades que quedan (solo cuando la API rechaza por existencia insuficiente). */
  existencia?: Numerico
}

export interface DetallePedidoDto {
  id_producto: Numerico
  /** CALCULADO por la API (JOIN con producto.nombre). */
  nombre_producto: string
  cantidad: Numerico
  indicaciones: string | null
  precio_unitario: Numerico
}

export interface PedidoDto {
  id_pedido: Numerico
  id_cuenta: Numerico
  id_mesero: Numerico
  nombre_mesero: string
  /** CALCULADO por la API (JOIN con estado_pedido.nombre), p. ej. "En preparacion". La columna es `id_estado`. */
  estado: string
  /** DATETIME de MySQL sin zona horaria, p. ej. "2026-10-15 16:34:00". */
  fecha_hora: string
  id_motivo: Numerico | null
  // --- CALCULADOS por la API (no son columnas de `pedido`) ---
  /** `pedido` NO tiene `id_mesa`: sale de cuenta.id_mesa. */
  id_mesa: Numerico
  /** mesa.numero (JOIN). */
  mesa_numero: Numerico
  /** motivo_cancelacion.descripcion (JOIN). */
  motivo_descripcion: string | null
  /** Canal del pedido para llevar (JOIN con canal_pedido). */
  canal?: string | null
  total: Numerico
  detalle: DetallePedidoDto[]
}

export interface CuentaDto {
  id_cuenta: Numerico
  id_mesa: Numerico
  estado: string
  abierta_en: string
  cerrada_en: string | null
  // --- CALCULADOS por la API (no son columnas de `cuenta`) ---
  pedidos: PedidoDto[]
  total: Numerico
  /** cuenta.tipo_pago_solicitado (fisico o digital); NULL mientras no se solicite. */
  tipo_pago_solicitado: string | null
  id_metodo_pago_solicitado: Numerico | null
  id_canal?: Numerico | null
  canal?: string | null
  referencia?: string | null
}

export interface CanalPedidoDto {
  id_canal: Numerico
  nombre: string
  activo: Booleano
}

export interface AperturaParaLlevarDto {
  id_mesa: Numerico
  numero: Numerico
  id_cuenta: Numerico
  id_canal: Numerico
  canal: string
  referencia: string | null
}

// ---------- API → frontend ----------

export function aUsuario(dto: UsuarioDto): Usuario {
  return {
    idUsuario: aNumero(dto.id_usuario, 'id_usuario'),
    idRol: aNumero(dto.id_rol, 'id_rol'),
    nombre: dto.nombre,
    correo: aTexto(dto.correo),
    activo: aBooleano(dto.activo, 'activo'),
    rol: aRol(dto.rol),
  }
}

/** Tipo de pago solicitado: solo `fisico` o `digital`; cualquier otra cosa (o ausente) es `null`. */
function aTipoPago(valor: unknown): TipoPago | null {
  const codigo = normalizarCodigo(valor)
  return codigo === 'fisico' || codigo === 'digital' ? codigo : null
}

export function aMesa(dto: MesaDto): Mesa {
  // La cuenta "activa" nunca está cerrada: si la API enviara `cerrada`, la mesa se muestra sin cuenta.
  const estadoCuenta = dto.estado_cuenta === null || dto.estado_cuenta === undefined ? null : aEstadoCuenta(dto.estado_cuenta)
  return {
    idMesa: aNumero(dto.id_mesa, 'id_mesa'),
    numero: aNumero(dto.numero, 'numero'),
    capacidad: aNumero(dto.capacidad, 'capacidad'),
    estado: aEstadoMesa(dto.estado),
    zona: aZona(dto.zona),
    caracteristicas: aCaracteristicas(dto.caracteristicas),
    estadoCuenta: estadoCuenta === 'cerrada' ? null : estadoCuenta,
    pedidosActivos: aNumeroONulo(dto.pedidos_activos, 'pedidos_activos') ?? 0,
    totalCuenta: aNumeroONulo(dto.total_cuenta, 'total_cuenta') ?? 0,
    tipoPagoSolicitado: aTipoPago(dto.tipo_pago_solicitado),
    pedidosListos: aNumeroONulo(dto.pedidos_listos, 'pedidos_listos') ?? 0,
    ...(dto.es_para_llevar !== undefined && aBooleano(dto.es_para_llevar, 'es_para_llevar')
      ? { esParaLlevar: true, canal: dto.canal ?? null, referencia: dto.referencia ?? null }
      : {}),
  }
}

export function aProducto(dto: ProductoDto): Producto {
  return {
    idProducto: aNumero(dto.id_producto, 'id_producto'),
    idCategoria: aNumero(dto.id_categoria, 'id_categoria'),
    nombre: dto.nombre,
    ...(dto.presentacion ? { presentacion: dto.presentacion } : {}),
    descripcion: aTexto(dto.descripcion),
    precio: aNumero(dto.precio, 'precio'),
    disponible: aBooleano(dto.disponible, 'disponible'),
    ...(dto.existencia != null ? { existencia: aNumero(dto.existencia, 'existencia') } : {}),
    ...(dto.stock_minimo != null ? { stockMinimo: aNumero(dto.stock_minimo, 'stock_minimo') } : {}),
  }
}

export function aCategoriaMenu(dto: CategoriaMenuDto): CategoriaMenu {
  return {
    idCategoria: aNumero(dto.id_categoria, 'id_categoria'),
    nombre: dto.nombre,
    productos: (dto.productos ?? []).map(aProducto),
  }
}

export function aDisponibilidad(dto: DisponibilidadDto): DisponibilidadProducto {
  return {
    idProducto: aNumero(dto.id_producto, 'id_producto'),
    disponible: aBooleano(dto.disponible, 'disponible'),
    ...(dto.existencia !== undefined ? { existencia: aNumero(dto.existencia, 'existencia') } : {}),
  }
}

export function aPedido(dto: PedidoDto): Pedido {
  return {
    idPedido: aNumero(dto.id_pedido, 'id_pedido'),
    idCuenta: aNumero(dto.id_cuenta, 'id_cuenta'),
    idMesero: aNumero(dto.id_mesero, 'id_mesero'),
    nombreMesero: dto.nombre_mesero,
    estado: aEstadoPedido(dto.estado),
    fechaHora: parseFechaMySQL(dto.fecha_hora, 'fecha_hora'),
    idMotivo: aNumeroONulo(dto.id_motivo, 'id_motivo'),
    detalle: (dto.detalle ?? []).map((d) => ({
      idProducto: aNumero(d.id_producto, 'id_producto'),
      nombreProducto: d.nombre_producto,
      cantidad: aNumero(d.cantidad, 'cantidad'),
      indicaciones: aTexto(d.indicaciones),
      precioUnitario: aNumero(d.precio_unitario, 'precio_unitario'),
    })),
    idMesa: aNumero(dto.id_mesa, 'id_mesa'),
    mesaNumero: aNumero(dto.mesa_numero, 'mesa_numero'),
    ...(dto.canal ? { canal: dto.canal } : {}),
    motivoDescripcion: dto.motivo_descripcion ?? null,
    total: aNumero(dto.total, 'total'),
  }
}

export function aCanalPedido(dto: CanalPedidoDto): CanalPedido {
  return { idCanal: aNumero(dto.id_canal, 'id_canal'), nombre: dto.nombre, activo: aBooleano(dto.activo, 'activo') }
}

export function aCuenta(dto: CuentaDto): Cuenta {
  return {
    idCuenta: aNumero(dto.id_cuenta, 'id_cuenta'),
    idMesa: aNumero(dto.id_mesa, 'id_mesa'),
    estado: aEstadoCuenta(dto.estado),
    abiertaEn: parseFechaMySQL(dto.abierta_en, 'abierta_en'),
    cerradaEn: parseFechaMySQLONula(dto.cerrada_en, 'cerrada_en'),
    pedidos: (dto.pedidos ?? []).map(aPedido),
    total: aNumero(dto.total, 'total'),
    tipoPagoSolicitado: aTipoPago(dto.tipo_pago_solicitado),
    idMetodoPagoSolicitado: aNumeroONulo(dto.id_metodo_pago_solicitado, 'id_metodo_pago_solicitado'),
    ...(dto.canal ? { idCanal: aNumeroONulo(dto.id_canal, 'id_canal'), canal: dto.canal, referencia: dto.referencia ?? null } : {}),
  }
}

// ---------- frontend → API (cuerpos de petición) ----------

export function deCredenciales(credenciales: Credenciales) {
  return { nombre_usuario: credenciales.nombreUsuario, contrasena: credenciales.contrasena }
}

/** Líneas de pedido sin precios (los fija la API con `producto.precio`). */
function deLineas(detalle: LineaNuevoPedido[]) {
  return detalle.map((d) => ({
    id_producto: d.idProducto,
    cantidad: d.cantidad,
    indicaciones: d.indicaciones,
  }))
}

/** Cuerpo de POST /pedidos. `pedido` no tiene `id_mesa`: la API lo usa para resolver (o abrir) la cuenta de la mesa. */
export function deNuevoPedido(pedido: NuevoPedido) {
  return { id_mesa: pedido.idMesa, detalle: deLineas(pedido.detalle) }
}

/** Cuerpo de PATCH /pedidos/{id}: reemplaza el detalle completo. */
export function deActualizacionPedido(detalle: LineaNuevoPedido[]) {
  return { detalle: deLineas(detalle) }
}

/** Cuerpo de POST /pedidos/{id}/cancelar: la `descripcion` de motivo_cancelacion (5 a 200 caracteres). */
export function deCancelacion(descripcion: string) {
  return { descripcion: descripcion.trim() }
}

/** Cuerpo de POST /cuentas/{id}/solicitar-pago: la columna cuenta.tipo_pago_solicitado. */
export function deSolicitudPago(tipo: TipoPago, idMetodoPagoSolicitado: number | null) {
  return { tipo_pago_solicitado: tipo, id_metodo_pago_solicitado: idMetodoPagoSolicitado }
}

export function deItemsDisponibilidad(items: ItemDisponibilidad[]) {
  return { items: items.map((i) => ({ id_producto: i.idProducto })) }
}

// ---------- Módulo del gerente ----------

export interface UsuarioAdminDto {
  id_usuario: Numerico
  es_primer_gerente?: Booleano
  id_rol: Numerico
  nombre: string
  correo: string
  /** credenciales.nombre_usuario */
  nombre_usuario: string
  /** CALCULADO por la API (JOIN con rol.nombre), p. ej. "Mesero". */
  rol: string
  activo: Booleano
  /** perfil_usuario.telefono */
  telefono: string | null
  /** perfil_usuario.lada */
  lada?: string
  creado_en: string
  /** credenciales.ultimo_acceso */
  ultimo_acceso: string | null
}

export interface CategoriaAdminDto {
  id_categoria: Numerico
  nombre: string
  /** CALCULADO por la API: cantidad de productos vigentes de la categoría. */
  total_productos: Numerico
  /** categoria_menu.eliminado_en (migración 026); null = vigente. Una API anterior no lo envía. */
  eliminado_en?: string | null
}

export interface SeccionAdminDto {
  nombre: string
  activa: Booleano
  total_mesas: Numerico
}

/** Horario de reservaciones tal como lo envía la API (horas "HH:MM"; una API anterior a la 022 no lo envía). */
export interface HorarioReservacionDto {
  hora_apertura?: string
  hora_ultima_reservacion?: string
  intervalo_minutos?: Numerico
  dias_abiertos?: string
}

export interface ConfiguracionReservacionDto extends HorarioReservacionDto {
  tolerancia_minutos: Numerico
  recordatorio_minutos: Numerico
  anticipacion_minutos: Numerico
  /** Migración 023; una API anterior no la envía (se usa 90). */
  duracion_reservacion_minutos?: Numerico
}

/** Característica tal como la envía la API (id y nombre). */
export interface CaracteristicaDto {
  id_caracteristica: Numerico
  nombre: string
}

/** Lista de características de la API; ausente = ninguna. */
export function aCaracteristicas(dto: CaracteristicaDto[] | undefined | null): CaracteristicaMesa[] {
  return (dto ?? []).map((c) => ({ idCaracteristica: aNumero(c.id_caracteristica, 'id_caracteristica'), nombre: aTexto(c.nombre) }))
}

export interface CaracteristicaAdminDto extends CaracteristicaDto {
  activa: unknown
  total_mesas: Numerico
  total_reservaciones: Numerico
}

export function aCaracteristicaAdmin(dto: CaracteristicaAdminDto): CaracteristicaAdmin {
  return {
    idCaracteristica: aNumero(dto.id_caracteristica, 'id_caracteristica'),
    nombre: aTexto(dto.nombre),
    activa: aBooleano(dto.activa, 'activa'),
    totalMesas: aNumero(dto.total_mesas, 'total_mesas'),
    totalReservaciones: aNumero(dto.total_reservaciones, 'total_reservaciones'),
  }
}

/** Horario de la API; lo que falte toma el predeterminado (13:00 a 21:00, cada 30 min, todos los días). */
export function aHorarioReservacion(dto: HorarioReservacionDto): HorarioReservacion {
  const intervalo = Number(dto.intervalo_minutos)
  return {
    horaApertura: dto.hora_apertura?.slice(0, 5) || HORARIO_POR_DEFECTO.horaApertura,
    horaUltima: dto.hora_ultima_reservacion?.slice(0, 5) || HORARIO_POR_DEFECTO.horaUltima,
    intervaloMinutos: (INTERVALOS_RESERVACION as readonly number[]).includes(intervalo)
      ? (intervalo as HorarioReservacion['intervaloMinutos'])
      : HORARIO_POR_DEFECTO.intervaloMinutos,
    diasAbiertos: /^[01]{7}$/.test(dto.dias_abiertos ?? '') ? dto.dias_abiertos! : HORARIO_POR_DEFECTO.diasAbiertos,
  }
}

/** Horario → cuerpo de la API. */
export function deHorarioReservacion(h: HorarioReservacion): Required<HorarioReservacionDto> {
  return {
    hora_apertura: h.horaApertura,
    hora_ultima_reservacion: h.horaUltima,
    intervalo_minutos: h.intervaloMinutos,
    dias_abiertos: h.diasAbiertos,
  }
}

export function aConfiguracionReservacion(dto: ConfiguracionReservacionDto): ConfiguracionReservacion {
  return {
    toleranciaMinutos: aNumero(dto.tolerancia_minutos, 'tolerancia_minutos'),
    recordatorioMinutos: aNumero(dto.recordatorio_minutos, 'recordatorio_minutos'),
    anticipacionMinutos: aNumero(dto.anticipacion_minutos, 'anticipacion_minutos'),
    duracionReservacionMinutos: dto.duracion_reservacion_minutos === undefined ? 90 : aNumero(dto.duracion_reservacion_minutos, 'duracion_reservacion_minutos'),
    ...aHorarioReservacion(dto),
  }
}

export interface MesaAdminDto {
  id_mesa: Numerico
  numero: Numerico
  capacidad: Numerico
  /** mesa.zona: obligatoria después de 009_secciones_mesas.sql; se tolera null para detectar API desactualizada. */
  zona: string | null
  /** Ids de caracteristica_mesa. */
  caracteristicas?: Numerico[]
  /** mesa.activa (BOOLEAN; puede llegar como 0/1). */
  activa: unknown
  estado: string
}

export interface ProductoAdminDto {
  id_producto: Numerico
  id_categoria: Numerico
  /** CALCULADO por la API (JOIN con categoria_menu.nombre). */
  categoria: string
  nombre: string
  presentacion?: string | null
  descripcion: string | null
  precio: Numerico
  /** producto.disponible: el gerente lo tiene activo en el menú. */
  activo: Booleano
  /** disponibilidadProducto.existencia / stock_minimo (tabla fuera del alcance del mesero). */
  existencia: Numerico
  stock_minimo: Numerico
  /** producto.controla_existencia. Ausente se interpreta como true (el comportamiento de antes). */
  controla_existencia?: Booleano
  /** CALCULADO por la API: activo y, si controla existencia, con existencia mayor a 0 (lo que ve el mesero). */
  disponible: Booleano
  /** producto.eliminado_en (migración 026); null = vigente. Una API anterior no lo envía. */
  eliminado_en?: string | null
}

export function aUsuarioAdmin(dto: UsuarioAdminDto): UsuarioAdmin {
  const rol = aRol(dto.rol)
  if (!rol) throw new ErrorServicio('desconocido', `Respuesta inválida de la API: el rol ${JSON.stringify(dto.rol)} no existe.`)
  return {
    idUsuario: aNumero(dto.id_usuario, 'id_usuario'),
    esPrimerGerente: dto.es_primer_gerente === undefined ? false : aBooleano(dto.es_primer_gerente, 'es_primer_gerente'),
    nombre: dto.nombre,
    correo: dto.correo,
    nombreUsuario: dto.nombre_usuario,
    rol,
    activo: aBooleano(dto.activo, 'activo'),
    telefono: dto.telefono ?? null,
    lada: dto.lada ?? undefined,
    creadoEn: parseFechaMySQL(dto.creado_en, 'creado_en'),
    ultimoAcceso: parseFechaMySQLONula(dto.ultimo_acceso, 'ultimo_acceso'),
  }
}

export function aCategoriaAdmin(dto: CategoriaAdminDto): CategoriaAdmin {
  return {
    idCategoria: aNumero(dto.id_categoria, 'id_categoria'),
    nombre: dto.nombre,
    totalProductos: aNumero(dto.total_productos, 'total_productos'),
    eliminadoEn: parseFechaMySQLONula(dto.eliminado_en ?? null, 'eliminado_en'),
  }
}

export function aSeccionAdmin(dto: SeccionAdminDto): SeccionAdmin {
  return {
    nombre: dto.nombre,
    activa: aBooleano(dto.activa, 'activa'),
    totalMesas: aNumero(dto.total_mesas, 'total_mesas'),
  }
}

export function aMesaAdmin(dto: MesaAdminDto): MesaAdmin {
  const zona = aZona(dto.zona)
  if (zona === null) throw new ErrorServicio('desconocido', 'La respuesta de la API contiene una mesa sin sección.')
  return {
    idMesa: aNumero(dto.id_mesa, 'id_mesa'),
    numero: aNumero(dto.numero, 'numero'),
    capacidad: aNumero(dto.capacidad, 'capacidad'),
    zona,
    caracteristicas: (dto.caracteristicas ?? []).map((id) => aNumero(id, 'caracteristicas')),
    activa: aBooleano(dto.activa, 'activa'),
    estado: aEstadoMesa(dto.estado),
  }
}

export function aProductoAdmin(dto: ProductoAdminDto): ProductoAdmin {
  return {
    idProducto: aNumero(dto.id_producto, 'id_producto'),
    idCategoria: aNumero(dto.id_categoria, 'id_categoria'),
    categoria: dto.categoria,
    nombre: dto.nombre,
    presentacion: dto.presentacion ?? '',
    descripcion: aTexto(dto.descripcion),
    precio: aNumero(dto.precio, 'precio'),
    activo: aBooleano(dto.activo, 'activo'),
    existencia: aNumero(dto.existencia, 'existencia'),
    stockMinimo: aNumero(dto.stock_minimo, 'stock_minimo'),
    controlaExistencia: dto.controla_existencia == null ? true : aBooleano(dto.controla_existencia, 'controla_existencia'),
    disponible: aBooleano(dto.disponible, 'disponible'),
    eliminadoEn: parseFechaMySQLONula(dto.eliminado_en ?? null, 'eliminado_en'),
  }
}

export function deNuevaMesa(m: NuevaMesa) {
  return {
    numero: m.numero,
    capacidad: m.capacidad,
    zona: m.zona.trim(),
    caracteristicas: m.caracteristicas ?? [],
    activa: m.activa,
  }
}

/** Solo viajan los campos que cambiaron (PATCH parcial). */
export function deCambioMesa(c: CambioMesa) {
  return {
    ...(c.numero !== undefined ? { numero: c.numero } : {}),
    ...(c.capacidad !== undefined ? { capacidad: c.capacidad } : {}),
    ...(c.zona !== undefined ? { zona: c.zona.trim() } : {}),
    ...(c.caracteristicas !== undefined ? { caracteristicas: c.caracteristicas } : {}),
    ...(c.activa !== undefined ? { activa: c.activa } : {}),
  }
}

export function deNuevoUsuario(u: NuevoUsuario) {
  return {
    nombre: u.nombre.trim(),
    correo: u.correo.trim(),
    nombre_usuario: u.nombreUsuario.trim(),
    contrasena: u.contrasena,
    rol: u.rol,
    ...(u.telefono?.trim() ? { telefono: u.telefono.trim() } : {}),
    ...(u.lada ? { lada: u.lada } : {}),
  }
}

/** Solo viajan los campos que cambiaron (PATCH parcial). */
export function deCambioUsuario(c: CambioUsuario) {
  return {
    ...(c.nombre !== undefined ? { nombre: c.nombre.trim() } : {}),
    ...(c.correo !== undefined ? { correo: c.correo.trim() } : {}),
    ...(c.nombreUsuario !== undefined ? { nombre_usuario: c.nombreUsuario.trim() } : {}),
    ...(c.rol !== undefined ? { rol: c.rol } : {}),
    ...(c.activo !== undefined ? { activo: c.activo } : {}),
    ...(c.telefono !== undefined ? { telefono: c.telefono?.trim() ? c.telefono.trim() : null } : {}),
    ...(c.lada !== undefined ? { lada: c.lada } : {}),
  }
}

export function deNuevoProducto(p: NuevoProducto) {
  return {
    id_categoria: p.idCategoria,
    nombre: p.nombre.trim(),
    presentacion: p.presentacion.trim(),
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
    ...(c.idCategoria !== undefined ? { id_categoria: c.idCategoria } : {}),
    ...(c.nombre !== undefined ? { nombre: c.nombre.trim() } : {}),
    ...(c.presentacion !== undefined ? { presentacion: c.presentacion.trim() } : {}),
    ...(c.descripcion !== undefined ? { descripcion: c.descripcion.trim() } : {}),
    ...(c.precio !== undefined ? { precio: c.precio } : {}),
    ...(c.activo !== undefined ? { activo: c.activo } : {}),
    ...(c.controlaExistencia !== undefined ? { controla_existencia: c.controlaExistencia } : {}),
    ...(c.existencia !== undefined ? { existencia: c.existencia } : {}),
    ...(c.stockMinimo !== undefined ? { stock_minimo: c.stockMinimo } : {}),
  }
}
