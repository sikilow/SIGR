// "Base de datos" en memoria para el mock. Se reinicia al recargar la página.
// PROVISIONAL: datos de ejemplo del restaurante "La Madalena", con la misma forma y los mismos nombres que
// el esquema de la BD (ids numéricos, `fechaHora`, `indicaciones`…). Ver docs/equivalencias-bd.md.
import type { CategoriaMenu, Cuenta, Mesa, MotivoCancelacion, Pedido, Rol, Usuario } from '../../types'

/** Usuario de demostración: además del perfil guarda el acceso (`credenciales.nombre_usuario` y su contraseña). */
export interface UsuarioMock extends Omit<Usuario, 'rol' | 'activo'> {
  /** En el mock todo usuario tiene un rol conocido. */
  rol: Rol
  nombreUsuario: string
  contrasena: string
  /** `false` = desactivado por el gerente (no puede iniciar sesión). Si falta, está activo. */
  activo?: boolean
}

/** Cuenta tal como se guarda: los pedidos se consultan aparte y el total se calcula. */
export type CuentaGuardada = Omit<Cuenta, 'pedidos' | 'total'>

/** Mesa tal como se guarda: el resumen de cuenta y pedidos se calcula al consultarla. */
export type MesaGuardada = Pick<Mesa, 'idMesa' | 'numero' | 'capacidad' | 'estado'>

export interface BaseDatosMock {
  usuarios: UsuarioMock[]
  mesas: MesaGuardada[]
  categorias: CategoriaMenu[]
  cuentas: CuentaGuardada[]
  pedidos: Pedido[]
  /** Tabla `motivo_cancelacion`: cada cancelación crea una fila. */
  motivos: MotivoCancelacion[]
  siguienteIdPedido: number
  siguienteIdCuenta: number
  siguienteIdMotivo: number
}

const ahora = Date.now()
/** Fecha de hace `minutos` minutos. */
const hace = (minutos: number): Date => new Date(ahora - minutos * 60_000)

function crearCategorias(): CategoriaMenu[] {
  return [
    {
      idCategoria: 1,
      nombre: 'Entradas',
      productos: [
        { idProducto: 1, idCategoria: 1, nombre: 'Guacamole con totopos', descripcion: 'Aguacate fresco, cebolla y cilantro', precio: 95, disponible: true },
        { idProducto: 2, idCategoria: 1, nombre: 'Sopa de tortilla', descripcion: 'Caldo de jitomate con aguacate y queso', precio: 85, disponible: true },
        { idProducto: 3, idCategoria: 1, nombre: 'Queso fundido', descripcion: 'Con chorizo y tortillas de harina', precio: 120, disponible: true },
        { idProducto: 4, idCategoria: 1, nombre: 'Ceviche de pescado', descripcion: 'Limón, chile serrano y pepino', precio: 140, disponible: false },
      ],
    },
    {
      idCategoria: 2,
      nombre: 'Platos fuertes',
      productos: [
        { idProducto: 5, idCategoria: 2, nombre: 'Enchiladas verdes', descripcion: 'Pollo deshebrado con crema y queso', precio: 165, disponible: true },
        { idProducto: 6, idCategoria: 2, nombre: 'Arrachera con guarnición', descripcion: '300 g con frijoles y nopales', precio: 285, disponible: true },
        { idProducto: 7, idCategoria: 2, nombre: 'Filete de pescado', descripcion: 'A la veracruzana con arroz', precio: 230, disponible: true },
        { idProducto: 8, idCategoria: 2, nombre: 'Mole poblano', descripcion: 'Pierna de pollo con arroz rojo', precio: 190, disponible: true },
        { idProducto: 16, idCategoria: 2, nombre: 'Tacos al pastor', descripcion: 'Orden de cinco con piña y cilantro', precio: 120, disponible: true },
      ],
    },
    {
      idCategoria: 3,
      nombre: 'Postres',
      productos: [
        { idProducto: 9, idCategoria: 3, nombre: 'Flan napolitano', descripcion: 'Con caramelo casero', precio: 70, disponible: true },
        { idProducto: 10, idCategoria: 3, nombre: 'Churros con chocolate', descripcion: 'Seis piezas con salsa de chocolate', precio: 85, disponible: true },
        { idProducto: 11, idCategoria: 3, nombre: 'Pastel de tres leches', descripcion: 'Rebanada individual', precio: 80, disponible: true },
      ],
    },
    {
      idCategoria: 4,
      nombre: 'Bebidas',
      productos: [
        { idProducto: 12, idCategoria: 4, nombre: 'Agua de horchata', descripcion: 'Jarra de 1 litro', precio: 55, disponible: true },
        { idProducto: 13, idCategoria: 4, nombre: 'Limonada mineral', descripcion: 'Vaso grande', precio: 45, disponible: true },
        { idProducto: 14, idCategoria: 4, nombre: 'Café de olla', descripcion: 'Con canela y piloncillo', precio: 40, disponible: true },
        { idProducto: 15, idCategoria: 4, nombre: 'Cerveza artesanal', descripcion: 'Botella de 355 ml', precio: 75, disponible: true },
      ],
    },
  ]
}

function crearMesas(): MesaGuardada[] {
  const datos: Array<[Mesa['estado'], number]> = [
    ['disponible', 2], ['disponible', 4], ['ocupada', 4], ['disponible', 4],
    ['ocupada', 6], ['disponible', 2], ['reservada', 4], ['ocupada', 8],
    ['disponible', 4], ['reservada', 6], ['ocupada', 4], ['ocupada', 2],
  ]
  return datos.map(([estado, capacidad], i) => ({ idMesa: i + 1, numero: i + 1, capacidad, estado }))
}

function crearPedidos(): Pedido[] {
  const base = { idMesero: 1, idMotivo: null, motivoDescripcion: null }
  // En el mock el número visible de la mesa coincide con su id (`pedido` no tiene `id_mesa`: sale de la cuenta).
  const pedidos: Array<Omit<Pedido, 'mesaNumero'>> = [
    // Mesa 3 (cuenta 1): un pedido ya entregado y otro listo para entregar
    {
      ...base, idPedido: 1, idMesa: 3, idCuenta: 1, estado: 'entregado', fechaHora: hace(50), total: 330,
      detalle: [
        { idProducto: 1, nombreProducto: 'Guacamole con totopos', cantidad: 1, indicaciones: '', precioUnitario: 95 },
        { idProducto: 8, nombreProducto: 'Mole poblano', cantidad: 1, indicaciones: 'Sin ajonjolí', precioUnitario: 190 },
        { idProducto: 13, nombreProducto: 'Limonada mineral', cantidad: 1, indicaciones: '', precioUnitario: 45 },
      ],
    },
    {
      ...base, idPedido: 2, idMesa: 3, idCuenta: 1, estado: 'listo', fechaHora: hace(12), total: 140,
      detalle: [
        { idProducto: 10, nombreProducto: 'Churros con chocolate', cantidad: 1, indicaciones: '', precioUnitario: 85 },
        { idProducto: 12, nombreProducto: 'Agua de horchata', cantidad: 1, indicaciones: 'Poco hielo', precioUnitario: 55 },
      ],
    },
    // Mesa 5 (cuenta 2): en preparación; la simulación lo pasa a "listo" a los 30 s
    {
      ...base, idPedido: 3, idMesa: 5, idCuenta: 2, estado: 'en_preparacion', fechaHora: hace(8), total: 570,
      detalle: [
        { idProducto: 6, nombreProducto: 'Arrachera con guarnición', cantidad: 2, indicaciones: 'Término medio', precioUnitario: 285 },
      ],
    },
    // Mesa 8 (cuenta 3): todo entregado, cuenta por pagar
    {
      ...base, idPedido: 4, idMesa: 8, idCuenta: 3, estado: 'entregado', fechaHora: hace(75), total: 480,
      detalle: [
        { idProducto: 5, nombreProducto: 'Enchiladas verdes', cantidad: 2, indicaciones: '', precioUnitario: 165 },
        { idProducto: 15, nombreProducto: 'Cerveza artesanal', cantidad: 2, indicaciones: '', precioUnitario: 75 },
      ],
    },
    // Mesa 11 (cuenta 4): uno pendiente (enviado a cocina) y otro registrado (aún sin enviar)
    {
      ...base, idPedido: 5, idMesa: 11, idCuenta: 4, estado: 'pendiente', fechaHora: hace(4), total: 230,
      detalle: [
        { idProducto: 7, nombreProducto: 'Filete de pescado', cantidad: 1, indicaciones: 'Sin cebolla', precioUnitario: 230 },
      ],
    },
    {
      ...base, idPedido: 6, idMesa: 11, idCuenta: 4, estado: 'registrado', fechaHora: hace(1), total: 80,
      detalle: [
        { idProducto: 14, nombreProducto: 'Café de olla', cantidad: 2, indicaciones: '', precioUnitario: 40 },
      ],
    },
    // Mesa 12 (cuenta 5): entregado + en preparación (estable varios minutos) + uno CANCELADO con motivo
    {
      ...base, idPedido: 7, idMesa: 12, idCuenta: 5, estado: 'entregado', fechaHora: hace(40), total: 240,
      detalle: [
        { idProducto: 16, nombreProducto: 'Tacos al pastor', cantidad: 2, indicaciones: 'Con poca piña', precioUnitario: 120 },
      ],
    },
    {
      ...base, idPedido: 8, idMesa: 12, idCuenta: 5, estado: 'cancelado', fechaHora: hace(25), total: 140,
      idMotivo: 1, motivoDescripcion: 'El cliente cambió de opinión',
      detalle: [
        { idProducto: 9, nombreProducto: 'Flan napolitano', cantidad: 2, indicaciones: '', precioUnitario: 70 },
      ],
    },
    {
      ...base, idPedido: 9, idMesa: 12, idCuenta: 5, estado: 'en_preparacion', fechaHora: hace(6), total: 315,
      detalle: [
        { idProducto: 2, nombreProducto: 'Sopa de tortilla', cantidad: 1, indicaciones: '', precioUnitario: 85 },
        { idProducto: 7, nombreProducto: 'Filete de pescado', cantidad: 1, indicaciones: '', precioUnitario: 230 },
      ],
    },
    // Mesa 2 (cuenta 6, ya cerrada): pedido pagado
    {
      ...base, idPedido: 10, idMesa: 2, idCuenta: 6, estado: 'pagado', fechaHora: hace(300), total: 190,
      detalle: [
        { idProducto: 8, nombreProducto: 'Mole poblano', cantidad: 1, indicaciones: '', precioUnitario: 190 },
      ],
    },
  ]
  return pedidos.map((p) => ({ ...p, mesaNumero: p.idMesa }))
}

function crearCuentas(): CuentaGuardada[] {
  return [
    { idCuenta: 1, idMesa: 3, estado: 'abierta', abiertaEn: hace(55), cerradaEn: null, tipoPagoSolicitado: null },
    { idCuenta: 2, idMesa: 5, estado: 'abierta', abiertaEn: hace(10), cerradaEn: null, tipoPagoSolicitado: null },
    { idCuenta: 3, idMesa: 8, estado: 'por_pagar', abiertaEn: hace(90), cerradaEn: null, tipoPagoSolicitado: 'fisico' },
    { idCuenta: 4, idMesa: 11, estado: 'abierta', abiertaEn: hace(6), cerradaEn: null, tipoPagoSolicitado: null },
    { idCuenta: 5, idMesa: 12, estado: 'abierta', abiertaEn: hace(45), cerradaEn: null, tipoPagoSolicitado: null },
    { idCuenta: 6, idMesa: 2, estado: 'cerrada', abiertaEn: hace(320), cerradaEn: hace(280), tipoPagoSolicitado: 'digital' },
  ]
}

export const baseDatos: BaseDatosMock = {
  // Usuarios de demostración (solo para el mock; nunca credenciales reales)
  // `idRol` sigue el orden del catálogo `rol` (Gerente, Mesero, Cocinero, Cajero, Hostess): SUPOSICIÓN, no confirmada.
  usuarios: [
    { idUsuario: 1, idRol: 2, nombre: 'Ana Torres', correo: 'ana.torres@lamadalena.example', activo: true, rol: 'mesero', nombreUsuario: 'mesero', contrasena: '1234' },
    { idUsuario: 2, idRol: 1, nombre: 'Luis Ramírez', correo: 'luis.ramirez@lamadalena.example', activo: true, rol: 'gerente', nombreUsuario: 'gerente', contrasena: '1234' },
    { idUsuario: 3, idRol: 4, nombre: 'Marta Solís', correo: 'marta.solis@lamadalena.example', activo: true, rol: 'cajero', nombreUsuario: 'cajero', contrasena: '1234' },
  ],
  mesas: crearMesas(),
  categorias: crearCategorias(),
  cuentas: crearCuentas(),
  pedidos: crearPedidos(),
  motivos: [{ idMotivo: 1, descripcion: 'El cliente cambió de opinión' }],
  siguienteIdPedido: 11,
  siguienteIdCuenta: 7,
  siguienteIdMotivo: 2,
}
