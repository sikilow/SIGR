// "Base de datos" en memoria para el mock. Se reinicia al recargar la página.
// PROVISIONAL: datos de ejemplo del restaurante "La Madalena", con la misma forma y los mismos nombres que
// el esquema de la BD (ids numéricos, `fechaHora`, `indicaciones`…). Ver docs/equivalencias-bd.md.
import clientesJson from '../../mocks/clientes.json'
import productosJson from '../../mocks/productos.json'
import type { CategoriaMenu, Cliente, Cuenta, ListaEspera, Mesa, MotivoCancelacion, Pedido, Reservacion, Rol, Usuario } from '../../types'

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
export type MesaGuardada = Pick<Mesa, 'idMesa' | 'numero' | 'capacidad' | 'estado'> & {
  /** mesa.zona: «sección» del salón (texto libre). */
  zona: string | null
  /** mesa.activa: `false` = no disponible (no aparece en el panel del mesero ni en el salón de la hostess). */
  activa: boolean
}

/** Reservación tal como se guarda: nombre y teléfono del cliente y número de mesa se calculan al consultarla. */
export type ReservacionGuardada = Omit<Reservacion, 'clienteNombre' | 'clienteTelefono' | 'mesaNumero'>

/** Lista de espera tal como se guarda: nombre y teléfono del cliente se calculan al consultarla. */
export type EsperaGuardada = Omit<ListaEspera, 'clienteNombre' | 'clienteTelefono'>

export interface BaseDatosMock {
  usuarios: UsuarioMock[]
  mesas: MesaGuardada[]
  categorias: CategoriaMenu[]
  cuentas: CuentaGuardada[]
  pedidos: Pedido[]
  /** Tabla `motivo_cancelacion`: cada cancelación crea una fila. */
  motivos: MotivoCancelacion[]
  /** Rol hostess: tablas `cliente`, `reservacion` y `lista_espera`. Las mesas se comparten con el mesero. */
  clientes: Cliente[]
  reservaciones: ReservacionGuardada[]
  listaEspera: EsperaGuardada[]
  siguienteIdPedido: number
  siguienteIdCuenta: number
  siguienteIdMotivo: number
}

const ahora = Date.now()
/** Fecha de hace `minutos` minutos. */
const hace = (minutos: number): Date => new Date(ahora - minutos * 60_000)

/**
 * Fecha de hoy a `minutos` de distancia de ahora (negativos = antes), sin salirse del día en curso: así el mock
 * del Salón (que muestra «las reservaciones del día») no pierde reservaciones cerca de la medianoche.
 */
const hoyEn = (minutos: number): Date => {
  const inicio = new Date(ahora)
  inicio.setHours(0, 0, 0, 0)
  const fin = inicio.getTime() + 24 * 60 * 60_000 - 60_000
  return new Date(Math.min(Math.max(ahora + minutos * 60_000, inicio.getTime()), fin))
}

/** El menú sale de `src/mocks/productos.json`; se clona para que cada reinicio del mock parta de los mismos datos. */
function crearCategorias(): CategoriaMenu[] {
  return structuredClone(productosJson) as CategoriaMenu[]
}

function crearMesas(): MesaGuardada[] {
  // Secciones de ejemplo (RF-MES-007): Salón 1–8, Terraza 9–14, Barra 15–17 y la 18 sin sección, para ver los grupos
  // del Panel y del Salón, incluido «Sin sección».
  const datos: Array<[Mesa['estado'], number, string | null]> = [
    ['libre', 2, 'Salón'], ['libre', 4, 'Salón'], ['ocupada', 4, 'Salón'], ['libre', 4, 'Salón'],
    ['ocupada', 6, 'Salón'], ['libre', 2, 'Salón'], ['reservada', 4, 'Salón'], ['ocupada', 8, 'Salón'],
    ['libre', 4, 'Terraza'], ['reservada', 6, 'Terraza'], ['ocupada', 4, 'Terraza'], ['ocupada', 2, 'Terraza'],
    ['libre', 2, 'Terraza'], ['libre', 2, 'Terraza'], ['libre', 4, 'Barra'], ['libre', 4, 'Barra'], ['libre', 6, 'Barra'],
    ['libre', 8, null],
  ]
  return datos.map(([estado, capacidad, zona], i) => ({ idMesa: i + 1, numero: i + 1, capacidad, estado, zona, activa: true }))
}

function crearPedidos(): Pedido[] {
  const base = { idMesero: 1, nombreMesero: 'Ana Torres', idMotivo: null, motivoDescripcion: null }
  // Segunda mesera (como `mesero2` de database/seed_demo.sql): atiende la mesa 12 y parte del historial, para que la
  // pantalla Pedidos del gerente tenga pedidos de dos meseros. Ana (`mesero`) no puede modificar los de Rosa.
  const rosa = { ...base, idMesero: 5, nombreMesero: 'Rosa Mesera' }
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
    // Mesa 12 (cuenta 5, de Rosa): entregado + en preparación (estable varios minutos) + uno CANCELADO con motivo
    {
      ...rosa, idPedido: 7, idMesa: 12, idCuenta: 5, estado: 'entregado', fechaHora: hace(40), total: 240,
      detalle: [
        { idProducto: 16, nombreProducto: 'Tacos al pastor', cantidad: 2, indicaciones: 'Con poca piña', precioUnitario: 120 },
      ],
    },
    {
      ...rosa, idPedido: 8, idMesa: 12, idCuenta: 5, estado: 'cancelado', fechaHora: hace(25), total: 140,
      idMotivo: 1, motivoDescripcion: 'El cliente cambió de opinión',
      detalle: [
        { idProducto: 9, nombreProducto: 'Flan napolitano', cantidad: 2, indicaciones: '', precioUnitario: 70 },
      ],
    },
    {
      ...rosa, idPedido: 9, idMesa: 12, idCuenta: 5, estado: 'en_preparacion', fechaHora: hace(6), total: 315,
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
    // Historial (cuentas 7 y 8, ya cerradas): pedidos de días anteriores para el filtro por día del gerente.
    {
      ...base, idPedido: 11, idMesa: 4, idCuenta: 7, estado: 'pagado', fechaHora: hace(24 * 60 + 90), total: 380,
      detalle: [
        { idProducto: 16, nombreProducto: 'Tacos al pastor', cantidad: 2, indicaciones: '', precioUnitario: 120 },
        { idProducto: 9, nombreProducto: 'Flan napolitano', cantidad: 2, indicaciones: '', precioUnitario: 70 },
      ],
    },
    {
      ...rosa, idPedido: 12, idMesa: 4, idCuenta: 7, estado: 'cancelado', fechaHora: hace(24 * 60 + 70), total: 85,
      idMotivo: 2, motivoDescripcion: 'Demora excesiva en cocina',
      detalle: [
        { idProducto: 2, nombreProducto: 'Sopa de tortilla', cantidad: 1, indicaciones: 'Sin crema', precioUnitario: 85 },
      ],
    },
    {
      ...rosa, idPedido: 13, idMesa: 6, idCuenta: 8, estado: 'pagado', fechaHora: hace(2 * 24 * 60 + 120), total: 805,
      detalle: [
        { idProducto: 6, nombreProducto: 'Arrachera con guarnición', cantidad: 2, indicaciones: 'Una bien cocida', precioUnitario: 285 },
        { idProducto: 15, nombreProducto: 'Cerveza artesanal', cantidad: 2, indicaciones: '', precioUnitario: 75 },
        { idProducto: 1, nombreProducto: 'Guacamole con totopos', cantidad: 1, indicaciones: '', precioUnitario: 95 },
      ],
    },
    {
      ...base, idPedido: 14, idMesa: 6, idCuenta: 8, estado: 'pagado', fechaHora: hace(2 * 24 * 60 + 60), total: 125,
      detalle: [
        { idProducto: 10, nombreProducto: 'Churros con chocolate', cantidad: 1, indicaciones: '', precioUnitario: 85 },
        { idProducto: 14, nombreProducto: 'Café de olla', cantidad: 1, indicaciones: '', precioUnitario: 40 },
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
    // Historial: cuentas de días anteriores, ya cobradas (no afectan el estado actual de las mesas).
    { idCuenta: 7, idMesa: 4, estado: 'cerrada', abiertaEn: hace(24 * 60 + 100), cerradaEn: hace(24 * 60 + 20), tipoPagoSolicitado: 'fisico' },
    { idCuenta: 8, idMesa: 6, estado: 'cerrada', abiertaEn: hace(2 * 24 * 60 + 130), cerradaEn: hace(2 * 24 * 60), tipoPagoSolicitado: 'digital' },
  ]
}

/** Los clientes salen de `src/mocks/clientes.json`. */
function crearClientes(): Cliente[] {
  return structuredClone(clientesJson) as Cliente[]
}

/**
 * Reservaciones de ejemplo. Misma gente que database/seed_demo.sql, pero las mesas siguen el estado de las mesas del
 * mock (reservadas: 7 y 10; ocupada con reservación que llegó: 8) y «Familia González» es de HOY (en la BD es de
 * mañana) para poder probar sentar una reservación que aún no tiene mesa.
 */
function crearReservaciones(): ReservacionGuardada[] {
  return [
    { idReservacion: 1, idCliente: 1, idMesa: 7, fechaHora: hoyEn(90), personas: 4, estado: 'confirmada', llegadaEn: null },
    { idReservacion: 2, idCliente: 2, idMesa: 10, fechaHora: hoyEn(120), personas: 2, estado: 'confirmada', llegadaEn: null },
    { idReservacion: 3, idCliente: 3, idMesa: null, fechaHora: hoyEn(150), personas: 6, estado: 'pendiente', llegadaEn: null },
    { idReservacion: 4, idCliente: 4, idMesa: 8, fechaHora: hoyEn(-100), personas: 5, estado: 'llego', llegadaEn: hoyEn(-95) },
    { idReservacion: 5, idCliente: 5, idMesa: null, fechaHora: hace(24 * 60), personas: 3, estado: 'cancelada', llegadaEn: null },
  ]
}

function crearListaEspera(): EsperaGuardada[] {
  return [
    { idEspera: 1, idCliente: 6, personas: 3, registradoEn: hace(25), estado: 'esperando' },
    { idEspera: 2, idCliente: 7, personas: 2, registradoEn: hace(10), estado: 'esperando' },
    { idEspera: 3, idCliente: 5, personas: 4, registradoEn: hace(120), estado: 'asignada' },
  ]
}

export const baseDatos: BaseDatosMock = {
  // Usuarios de demostración (solo para el mock; nunca credenciales reales)
  // `idRol` sigue el orden del catálogo `rol` (Gerente, Mesero, Cocinero, Cajero, Hostess): SUPOSICIÓN, no confirmada.
  usuarios: [
    { idUsuario: 1, idRol: 2, nombre: 'Ana Torres', correo: 'ana.torres@lamadalena.example', activo: true, rol: 'mesero', nombreUsuario: 'mesero', contrasena: '1234' },
    { idUsuario: 2, idRol: 1, nombre: 'Luis Ramírez', correo: 'luis.ramirez@lamadalena.example', activo: true, rol: 'gerente', nombreUsuario: 'gerente', contrasena: '1234' },
    { idUsuario: 3, idRol: 4, nombre: 'Marta Solís', correo: 'marta.solis@lamadalena.example', activo: true, rol: 'cajero', nombreUsuario: 'cajero', contrasena: '1234' },
    { idUsuario: 4, idRol: 5, nombre: 'Sofía Mendoza', correo: 'sofia.mendoza@lamadalena.example', activo: true, rol: 'hostess', nombreUsuario: 'hostess', contrasena: '1234' },
    { idUsuario: 5, idRol: 2, nombre: 'Rosa Mesera', correo: 'rosa.mesera@lamadalena.example', activo: true, rol: 'mesero', nombreUsuario: 'mesero2', contrasena: '1234' },
  ],
  mesas: crearMesas(),
  categorias: crearCategorias(),
  cuentas: crearCuentas(),
  pedidos: crearPedidos(),
  motivos: [
    { idMotivo: 1, descripcion: 'El cliente cambió de opinión' },
    { idMotivo: 2, descripcion: 'Demora excesiva en cocina' },
  ],
  clientes: crearClientes(),
  reservaciones: crearReservaciones(),
  listaEspera: crearListaEspera(),
  siguienteIdPedido: 15,
  siguienteIdCuenta: 9,
  siguienteIdMotivo: 3,
}
