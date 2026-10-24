import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aCategoriaMenu,
  aCuenta,
  aDisponibilidad,
  aMesa,
  aPedido,
  aProducto,
  aProductoAdmin,
  aUsuario,
  deActualizacionPedido,
  deCambioProducto,
  deCancelacion,
  deCredenciales,
  deItemsDisponibilidad,
  deNuevoPedido,
  deNuevoProducto,
  deSolicitudPago,
  type CuentaDto,
  type MesaDto,
  type PedidoDto,
} from './mappers'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

// Pedido tal como lo devolvería la API con los nombres exactos de las columnas.
const pedidoDto: PedidoDto = {
  id_pedido: 6,
  id_cuenta: 4,
  id_mesero: 1,
  nombre_mesero: 'Ana Torres',
  estado: 'Pendiente',
  fecha_hora: '2026-10-14 18:30:00',
  id_motivo: null,
  id_mesa: 11,
  mesa_numero: 11,
  motivo_descripcion: null,
  total: 80,
  detalle: [{ id_producto: 14, nombre_producto: 'Café de olla', cantidad: 2, indicaciones: 'Sin azúcar', precio_unitario: 40 }],
}

// Lo mismo, pero como lo entregaría PHP/PDO: todo en texto.
const pedidoPdo = {
  id_pedido: '6',
  id_cuenta: '4',
  id_mesero: '1',
  nombre_mesero: 'Ana Torres',
  estado: 'En preparacion',
  fecha_hora: '2026-10-14 18:30:00',
  id_motivo: null,
  id_mesa: '11',
  mesa_numero: '11',
  motivo_descripcion: null,
  total: '80.00',
  detalle: [{ id_producto: '14', nombre_producto: 'Café de olla', cantidad: '2', indicaciones: null, precio_unitario: '40.00' }],
} satisfies PedidoDto

describe('aMesa', () => {
  it('pasa de snake_case (columnas de la BD) a camelCase', () => {
    const dto: MesaDto = {
      id_mesa: 3, numero: 3, capacidad: 4, estado: 'ocupada',
      estado_cuenta: 'abierta', pedidos_activos: 2, total_cuenta: 470, pedidos_listos: 1,
    }
    expect(aMesa(dto)).toEqual({
      idMesa: 3, numero: 3, capacidad: 4, estado: 'ocupada', zona: null,
      plantaBaja: false, espacioCarriola: false, sinEscaleras: false,
      estadoCuenta: 'abierta', pedidosActivos: 2, totalCuenta: 470, pedidosListos: 1, tipoPagoSolicitado: null,
    })
  })

  it('la sección (mesa.zona) llega recortada; vacía, solo espacios, null o ausente = sin sección (null)', () => {
    const base: MesaDto = {
      id_mesa: 1, numero: 1, capacidad: 2, estado: 'libre',
      estado_cuenta: null, pedidos_activos: 0, total_cuenta: 0, pedidos_listos: 0,
    }
    expect(aMesa({ ...base, zona: 'Terraza' }).zona).toBe('Terraza')
    expect(aMesa({ ...base, zona: '  Barra  ' }).zona).toBe('Barra')
    expect(aMesa({ ...base, zona: '' }).zona).toBeNull()
    expect(aMesa({ ...base, zona: '   ' }).zona).toBeNull()
    expect(aMesa({ ...base, zona: null }).zona).toBeNull()
    expect(aMesa(base).zona).toBeNull()
  })

  it('una mesa libre sin cuenta conserva null y los contadores en 0 (también si PDO manda NULL)', () => {
    const base: MesaDto = {
      id_mesa: 1, numero: 1, capacidad: 2, estado: 'libre',
      estado_cuenta: null, pedidos_activos: 0, total_cuenta: 0, pedidos_listos: 0,
    }
    expect(aMesa(base)).toMatchObject({ estado: 'libre', estadoCuenta: null, pedidosActivos: 0, totalCuenta: 0, pedidosListos: 0 })
    expect(aMesa({ ...base, pedidos_activos: null, total_cuenta: null, pedidos_listos: null })).toMatchObject({
      pedidosActivos: 0, totalCuenta: 0, pedidosListos: 0,
    })
  })

  it('convierte texto de PDO: ids, capacidad y DECIMAL', () => {
    const mesa = aMesa({
      id_mesa: '8', numero: '8', capacidad: '8', estado: 'Ocupada',
      estado_cuenta: 'por_pagar', pedidos_activos: '1', total_cuenta: '480.00', pedidos_listos: '0',
    })
    expect(mesa).toMatchObject({ idMesa: 8, numero: 8, capacidad: 8, estado: 'ocupada', estadoCuenta: 'por_pagar', pedidosActivos: 1, totalCuenta: 480, pedidosListos: 0 })
  })

  it('el tipo de pago solicitado es opcional y solo acepta fisico o digital', () => {
    const base: MesaDto = { id_mesa: 8, numero: 8, capacidad: 8, estado: 'ocupada', estado_cuenta: 'por_pagar', pedidos_activos: 1, total_cuenta: 480, pedidos_listos: 0 }
    expect(aMesa(base).tipoPagoSolicitado).toBeNull()
    expect(aMesa({ ...base, tipo_pago_solicitado: 'digital' }).tipoPagoSolicitado).toBe('digital')
    expect(aMesa({ ...base, tipo_pago_solicitado: null }).tipoPagoSolicitado).toBeNull()
    expect(aMesa({ ...base, tipo_pago_solicitado: 'cripto' }).tipoPagoSolicitado).toBeNull()
  })

  it('un estado de mesa o de cuenta desconocido no rompe: queda "desconocido"', () => {
    const base: MesaDto = { id_mesa: 2, numero: 2, capacidad: 2, estado: 'en limpieza', estado_cuenta: 'anulada', pedidos_activos: 0, total_cuenta: 0, pedidos_listos: 0 }
    expect(aMesa(base)).toMatchObject({ estado: 'desconocido', estadoCuenta: 'desconocido' })
    expect(console.warn).toHaveBeenCalledTimes(2)
  })

  it('la cuenta "activa" nunca es cerrada: se muestra como sin cuenta', () => {
    const mesa = aMesa({ id_mesa: 2, numero: 2, capacidad: 2, estado: 'libre', estado_cuenta: 'cerrada', pedidos_activos: 0, total_cuenta: 0, pedidos_listos: 0 })
    expect(mesa.estadoCuenta).toBeNull()
  })

  it('un id inválido es un error claro, no un NaN silencioso', () => {
    expect(() => aMesa({ id_mesa: 'abc', numero: 1, capacidad: 2, estado: 'libre', estado_cuenta: null, pedidos_activos: 0, total_cuenta: 0, pedidos_listos: 0 })).toThrow(/id_mesa/)
  })
})

describe('aPedido', () => {
  it('mapea el pedido y su detalle; "Pendiente" → pendiente; la fecha es hora local', () => {
    expect(aPedido(pedidoDto)).toEqual({
      idPedido: 6,
      idCuenta: 4,
      idMesero: 1,
      nombreMesero: 'Ana Torres',
      estado: 'pendiente',
      fechaHora: new Date(2026, 9, 14, 18, 30, 0),
      idMotivo: null,
      detalle: [{ idProducto: 14, nombreProducto: 'Café de olla', cantidad: 2, indicaciones: 'Sin azúcar', precioUnitario: 40 }],
      idMesa: 11,
      mesaNumero: 11,
      motivoDescripcion: null,
      total: 80,
    })
  })

  it('convierte texto de PDO: ids, DECIMAL, NULL de indicaciones y estado con nombre del catálogo', () => {
    const pedido = aPedido(pedidoPdo)
    expect(pedido).toMatchObject({ idPedido: 6, idCuenta: 4, idMesero: 1, nombreMesero: 'Ana Torres', idMesa: 11, mesaNumero: 11, estado: 'en_preparacion', total: 80 })
    expect(pedido.detalle).toEqual([{ idProducto: 14, nombreProducto: 'Café de olla', cantidad: 2, indicaciones: '', precioUnitario: 40 }])
  })

  it('el motivo de un pedido cancelado trae id_motivo y su descripción', () => {
    const pedido = aPedido({ ...pedidoDto, estado: 'Cancelado', id_motivo: '3', motivo_descripcion: 'El cliente cambió de opinión' })
    expect(pedido.estado).toBe('cancelado')
    expect(pedido.idMotivo).toBe(3)
    expect(pedido.motivoDescripcion).toBe('El cliente cambió de opinión')
  })

  it('un estado desconocido no rompe y avisa en consola', () => {
    const pedido = aPedido({ ...pedidoDto, estado: 'Archivado' })
    expect(pedido.estado).toBe('desconocido')
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('un pedido sin líneas da un detalle vacío', () => {
    expect(aPedido({ ...pedidoDto, detalle: [] }).detalle).toEqual([])
  })

  it('una fecha imposible es un error claro', () => {
    expect(() => aPedido({ ...pedidoDto, fecha_hora: '0000-00-00 00:00:00' })).toThrow(/fecha_hora/)
  })
})

describe('aCuenta', () => {
  const dto: CuentaDto = {
    id_cuenta: 4,
    id_mesa: 11,
    estado: 'abierta',
    abierta_en: '2026-10-14 18:20:00',
    cerrada_en: null,
    pedidos: [pedidoDto],
    total: 80,
    tipo_pago_solicitado: null,
  }

  it('mapea la cuenta con sus pedidos, sin fecha de cierre y con el tipo de pago en null', () => {
    const cuenta = aCuenta(dto)
    expect(cuenta).toMatchObject({
      idCuenta: 4, idMesa: 11, estado: 'abierta', total: 80,
      abiertaEn: new Date(2026, 9, 14, 18, 20, 0), cerradaEn: null, tipoPagoSolicitado: null,
    })
    expect(cuenta.pedidos).toHaveLength(1)
    expect(cuenta.pedidos[0]?.mesaNumero).toBe(11)
  })

  it('una cuenta por pagar trae el tipo de pago solicitado', () => {
    expect(aCuenta({ ...dto, estado: 'por_pagar', tipo_pago_solicitado: 'digital' })).toMatchObject({
      estado: 'por_pagar',
      tipoPagoSolicitado: 'digital',
    })
  })

  it('convierte texto de PDO y una cuenta cerrada trae cerrada_en', () => {
    const cuenta = aCuenta({ ...dto, id_cuenta: '4', id_mesa: '11', total: '80.00', estado: 'cerrada', cerrada_en: '2026-10-14 19:00:00' })
    expect(cuenta).toMatchObject({ idCuenta: 4, idMesa: 11, total: 80, estado: 'cerrada', cerradaEn: new Date(2026, 9, 14, 19, 0, 0) })
  })
})

describe('menú y disponibilidad', () => {
  it('mapea categorías con sus productos (booleanos y precios como texto de PDO)', () => {
    const categoria = aCategoriaMenu({
      id_categoria: '1',
      nombre: 'Entradas',
      productos: [
        { id_producto: '1', id_categoria: '1', nombre: 'Guacamole', presentacion: 'Porción individual', descripcion: 'Aguacate', precio: '95.00', disponible: '1' },
        { id_producto: 4, id_categoria: 1, nombre: 'Ceviche', descripcion: null, precio: 140, disponible: 0 },
      ],
    })
    expect(categoria.idCategoria).toBe(1)
    expect(categoria.nombre).toBe('Entradas')
    expect(categoria.productos[0]).toEqual({ idProducto: 1, idCategoria: 1, nombre: 'Guacamole', presentacion: 'Porción individual', descripcion: 'Aguacate', precio: 95, disponible: true })
    expect(categoria.productos[1]).toMatchObject({ descripcion: '', disponible: false })
  })

  it('una categoría sin productos da un arreglo vacío', () => {
    expect(aCategoriaMenu({ id_categoria: 9, nombre: 'Vacía', productos: [] }).productos).toEqual([])
  })

  it('mapea la disponibilidad', () => {
    expect(aDisponibilidad({ id_producto: 3, disponible: false })).toEqual({ idProducto: 3, disponible: false })
    expect(aDisponibilidad({ id_producto: '3', disponible: '1' })).toEqual({ idProducto: 3, disponible: true })
  })
})

describe('usuario y rol', () => {
  it('mapea el usuario y normaliza el rol ("Mesero" → mesero)', () => {
    expect(aUsuario({ id_usuario: 1, id_rol: 2, nombre: 'Ana Torres', correo: 'ana@x.mx', activo: true, rol: 'Mesero' })).toEqual({
      idUsuario: 1, idRol: 2, nombre: 'Ana Torres', correo: 'ana@x.mx', activo: true, rol: 'mesero',
    })
  })

  it('convierte texto de PDO: ids y activo como "1"/"0"', () => {
    expect(aUsuario({ id_usuario: '1', id_rol: '2', nombre: 'Ana', correo: 'a@x.mx', activo: '1', rol: 'Mesero' })).toMatchObject({ idUsuario: 1, idRol: 2, activo: true })
    expect(aUsuario({ id_usuario: '9', id_rol: '4', nombre: 'Baja', correo: 'b@x.mx', activo: '0', rol: 'Cajero' })).toMatchObject({ activo: false, rol: 'cajero' })
  })

  it('un rol desconocido queda en null (el guardia del router no lo deja entrar)', () => {
    expect(aUsuario({ id_usuario: 1, id_rol: 9, nombre: 'X', correo: '', activo: true, rol: 'Contador' }).rol).toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('frontend → API (cuerpos de petición)', () => {
  it('un pedido nuevo va con los nombres de las columnas y SIN precios', () => {
    const cuerpo = deNuevoPedido({ idMesa: 11, detalle: [{ idProducto: 14, cantidad: 2, indicaciones: 'Sin azúcar' }] })
    expect(cuerpo).toEqual({ id_mesa: 11, detalle: [{ id_producto: 14, cantidad: 2, indicaciones: 'Sin azúcar' }] })
    expect(JSON.stringify(cuerpo)).not.toMatch(/precio/)
  })

  it('la edición reemplaza el detalle completo, sin precios', () => {
    const cuerpo = deActualizacionPedido([{ idProducto: 5, cantidad: 3, indicaciones: '' }])
    expect(cuerpo).toEqual({ detalle: [{ id_producto: 5, cantidad: 3, indicaciones: '' }] })
    expect(JSON.stringify(cuerpo)).not.toMatch(/precio/)
  })

  it('la cancelación envía la descripcion, sin espacios sobrantes', () => {
    expect(deCancelacion('  Producto agotado ')).toEqual({ descripcion: 'Producto agotado' })
  })

  it('la verificación de disponibilidad envía solo id_producto', () => {
    expect(deItemsDisponibilidad([{ idProducto: 3 }, { idProducto: 7 }])).toEqual({
      items: [{ id_producto: 3 }, { id_producto: 7 }],
    })
  })

  it('el inicio de sesión envía nombre_usuario y contrasena', () => {
    expect(deCredenciales({ nombreUsuario: 'mesero', contrasena: '1234' })).toEqual({ nombre_usuario: 'mesero', contrasena: '1234' })
  })

  it('solicitar el pago envía el tipo (columna propuesta tipo_pago_solicitado)', () => {
    expect(deSolicitudPago('digital')).toEqual({ tipo_pago_solicitado: 'digital' })
  })
})

describe('existencia: productos que la controlan y productos que se preparan al momento', () => {
  const base = { id_producto: 12, id_categoria: 4, nombre: 'Cerveza', descripcion: '', precio: 50, disponible: true }

  it('aProducto conserva la existencia de lo que la controla', () => {
    expect(aProducto({ ...base, existencia: 7 }).existencia).toBe(7)
    expect(aProducto({ ...base, existencia: 0 }).existencia).toBe(0)
  })

  it('aProducto no inventa existencia: null o ausente significa "sin control" (sin tope)', () => {
    expect('existencia' in aProducto({ ...base, existencia: null })).toBe(false)
    expect('existencia' in aProducto(base)).toBe(false)
  })

  it('aProductoAdmin: controla_existencia ausente se interpreta como true (como antes)', () => {
    const dto = { id_producto: 1, id_categoria: 1, categoria: 'Bebidas', nombre: 'Refresco', descripcion: '', precio: 30, activo: true, existencia: 4, stock_minimo: 5, disponible: true }
    expect(aProductoAdmin(dto).controlaExistencia).toBe(true)
    expect(aProductoAdmin({ ...dto, controla_existencia: false }).controlaExistencia).toBe(false)
  })

  it('el alta envía controla_existencia y el PATCH solo lo manda si cambió', () => {
    const nuevo = { idCategoria: 1, nombre: ' Tacos ', presentacion: 'Orden individual', descripcion: 'Con guarnición', precio: 90, activo: true, controlaExistencia: false, existencia: 0, stockMinimo: 0 }
    expect(deNuevoProducto(nuevo).controla_existencia).toBe(false)
    expect(deNuevoProducto(nuevo).presentacion).toBe('Orden individual')
    expect(deCambioProducto({ precio: 95 })).toEqual({ precio: 95 })
    expect(deCambioProducto({ controlaExistencia: true })).toEqual({ controla_existencia: true })
    expect(deCambioProducto({ presentacion: 'Botella de 1 litro' })).toEqual({ presentacion: 'Botella de 1 litro' })
  })
})
