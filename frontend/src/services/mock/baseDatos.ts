// "Base de datos" en memoria para el mock. Se reinicia al recargar la página.
// PROVISIONAL: datos de ejemplo del restaurante "La Madalena".
import type { CategoriaMenu, Cuenta, Mesa, Pedido, Usuario } from '../../types'

export interface UsuarioMock extends Usuario {
  usuario: string
  contrasena: string
}

/** Cuenta tal como se guarda: los pedidos se consultan aparte y el total se calcula. */
export type CuentaGuardada = Omit<Cuenta, 'pedidos' | 'total'>

/** Mesa tal como se guarda: el resumen de cuenta y pedidos se calcula al consultarla. */
export type MesaGuardada = Pick<Mesa, 'id' | 'numero' | 'capacidad' | 'estado'>

export interface BaseDatosMock {
  usuarios: UsuarioMock[]
  mesas: MesaGuardada[]
  categorias: CategoriaMenu[]
  cuentas: CuentaGuardada[]
  pedidos: Pedido[]
  siguienteIdPedido: number
  siguienteIdCuenta: number
}

const ahora = Date.now()
/** Fecha ISO de hace `minutos` minutos. */
const hace = (minutos: number): string => new Date(ahora - minutos * 60_000).toISOString()

function crearCategorias(): CategoriaMenu[] {
  return [
    {
      id: 1,
      nombre: 'Entradas',
      productos: [
        { id: 1, categoriaId: 1, nombre: 'Guacamole con totopos', descripcion: 'Aguacate fresco, cebolla y cilantro', precio: 95, disponible: true },
        { id: 2, categoriaId: 1, nombre: 'Sopa de tortilla', descripcion: 'Caldo de jitomate con aguacate y queso', precio: 85, disponible: true },
        { id: 3, categoriaId: 1, nombre: 'Queso fundido', descripcion: 'Con chorizo y tortillas de harina', precio: 120, disponible: true },
        { id: 4, categoriaId: 1, nombre: 'Ceviche de pescado', descripcion: 'Limón, chile serrano y pepino', precio: 140, disponible: false },
      ],
    },
    {
      id: 2,
      nombre: 'Platos fuertes',
      productos: [
        { id: 5, categoriaId: 2, nombre: 'Enchiladas verdes', descripcion: 'Pollo deshebrado con crema y queso', precio: 165, disponible: true },
        { id: 6, categoriaId: 2, nombre: 'Arrachera con guarnición', descripcion: '300 g con frijoles y nopales', precio: 285, disponible: true },
        { id: 7, categoriaId: 2, nombre: 'Filete de pescado', descripcion: 'A la veracruzana con arroz', precio: 230, disponible: true },
        { id: 8, categoriaId: 2, nombre: 'Mole poblano', descripcion: 'Pierna de pollo con arroz rojo', precio: 190, disponible: true },
        { id: 16, categoriaId: 2, nombre: 'Tacos al pastor', descripcion: 'Orden de cinco con piña y cilantro', precio: 120, disponible: true },
      ],
    },
    {
      id: 3,
      nombre: 'Postres',
      productos: [
        { id: 9, categoriaId: 3, nombre: 'Flan napolitano', descripcion: 'Con caramelo casero', precio: 70, disponible: true },
        { id: 10, categoriaId: 3, nombre: 'Churros con chocolate', descripcion: 'Seis piezas con salsa de chocolate', precio: 85, disponible: true },
        { id: 11, categoriaId: 3, nombre: 'Pastel de tres leches', descripcion: 'Rebanada individual', precio: 80, disponible: true },
      ],
    },
    {
      id: 4,
      nombre: 'Bebidas',
      productos: [
        { id: 12, categoriaId: 4, nombre: 'Agua de horchata', descripcion: 'Jarra de 1 litro', precio: 55, disponible: true },
        { id: 13, categoriaId: 4, nombre: 'Limonada mineral', descripcion: 'Vaso grande', precio: 45, disponible: true },
        { id: 14, categoriaId: 4, nombre: 'Café de olla', descripcion: 'Con canela y piloncillo', precio: 40, disponible: true },
        { id: 15, categoriaId: 4, nombre: 'Cerveza artesanal', descripcion: 'Botella de 355 ml', precio: 75, disponible: true },
      ],
    },
  ]
}

function crearMesas(): MesaGuardada[] {
  const datos: Array<[Mesa['estado'], number]> = [
    ['libre', 2], ['libre', 4], ['ocupada', 4], ['libre', 4],
    ['ocupada', 6], ['libre', 2], ['reservada', 4], ['ocupada', 8],
    ['libre', 4], ['reservada', 6], ['ocupada', 4], ['ocupada', 2],
  ]
  return datos.map(([estado, capacidad], i) => ({ id: i + 1, numero: i + 1, capacidad, estado }))
}

function crearPedidos(): Pedido[] {
  const base = { meseroId: 1, motivoCancelacion: null }
  return [
    // Mesa 3 (cuenta 1): un pedido ya entregado y otro listo para entregar
    {
      ...base, id: 1, mesaId: 3, cuentaId: 1, estado: 'entregado', creadoEn: hace(50), total: 330,
      detalle: [
        { productoId: 1, nombreProducto: 'Guacamole con totopos', cantidad: 1, observaciones: '', precioUnitario: 95 },
        { productoId: 8, nombreProducto: 'Mole poblano', cantidad: 1, observaciones: 'Sin ajonjolí', precioUnitario: 190 },
        { productoId: 13, nombreProducto: 'Limonada mineral', cantidad: 1, observaciones: '', precioUnitario: 45 },
      ],
    },
    {
      ...base, id: 2, mesaId: 3, cuentaId: 1, estado: 'listo', creadoEn: hace(12), total: 140,
      detalle: [
        { productoId: 10, nombreProducto: 'Churros con chocolate', cantidad: 1, observaciones: '', precioUnitario: 85 },
        { productoId: 12, nombreProducto: 'Agua de horchata', cantidad: 1, observaciones: 'Poco hielo', precioUnitario: 55 },
      ],
    },
    // Mesa 5 (cuenta 2): en preparación (el mesero ya no puede cancelar)
    {
      ...base, id: 3, mesaId: 5, cuentaId: 2, estado: 'en_preparacion', creadoEn: hace(8), total: 570,
      detalle: [
        { productoId: 6, nombreProducto: 'Arrachera con guarnición', cantidad: 2, observaciones: 'Término medio', precioUnitario: 285 },
      ],
    },
    // Mesa 8 (cuenta 3): todo entregado, cuenta por pagar
    {
      ...base, id: 4, mesaId: 8, cuentaId: 3, estado: 'entregado', creadoEn: hace(75), total: 480,
      detalle: [
        { productoId: 5, nombreProducto: 'Enchiladas verdes', cantidad: 2, observaciones: '', precioUnitario: 165 },
        { productoId: 15, nombreProducto: 'Cerveza artesanal', cantidad: 2, observaciones: '', precioUnitario: 75 },
      ],
    },
    // Mesa 11 (cuenta 4): uno enviado y otro registrado (aún sin enviar)
    {
      ...base, id: 5, mesaId: 11, cuentaId: 4, estado: 'enviado', creadoEn: hace(4), total: 230,
      detalle: [
        { productoId: 7, nombreProducto: 'Filete de pescado', cantidad: 1, observaciones: 'Sin cebolla', precioUnitario: 230 },
      ],
    },
    {
      ...base, id: 6, mesaId: 11, cuentaId: 4, estado: 'registrado', creadoEn: hace(1), total: 80,
      detalle: [
        { productoId: 14, nombreProducto: 'Café de olla', cantidad: 2, observaciones: '', precioUnitario: 40 },
      ],
    },
  ]
}

function crearCuentas(): CuentaGuardada[] {
  return [
    { id: 1, mesaId: 3, estado: 'abierta', abiertaEn: hace(55), tipoPagoSolicitado: null },
    { id: 2, mesaId: 5, estado: 'abierta', abiertaEn: hace(10), tipoPagoSolicitado: null },
    { id: 3, mesaId: 8, estado: 'por_pagar', abiertaEn: hace(90), tipoPagoSolicitado: 'fisico' },
    { id: 4, mesaId: 11, estado: 'abierta', abiertaEn: hace(6), tipoPagoSolicitado: null },
  ]
}

export const baseDatos: BaseDatosMock = {
  // Usuarios de demostración (solo para el mock; nunca credenciales reales)
  usuarios: [
    { id: 1, nombre: 'Ana Torres', rol: 'mesero', usuario: 'mesero', contrasena: '1234' },
    { id: 2, nombre: 'Luis Ramírez', rol: 'gerente', usuario: 'gerente', contrasena: '1234' },
    { id: 3, nombre: 'Marta Solís', rol: 'cajero', usuario: 'cajero', contrasena: '1234' },
  ],
  mesas: crearMesas(),
  categorias: crearCategorias(),
  cuentas: crearCuentas(),
  pedidos: crearPedidos(),
  siguienteIdPedido: 7,
  siguienteIdCuenta: 5,
}
