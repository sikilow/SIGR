import { describe, expect, it } from 'vitest'
import {
  aCategoriaMenu,
  aCuenta,
  aDisponibilidad,
  aMesa,
  aPedido,
  aUsuario,
  deActualizacionPedido,
  deCancelacion,
  deItemsDisponibilidad,
  deNuevoPedido,
  type CuentaDto,
  type MesaDto,
  type PedidoDto,
} from './mappers'

const pedidoDto: PedidoDto = {
  id: 6,
  mesa_id: 11,
  mesa_numero: 11,
  cuenta_id: 4,
  mesero_id: 1,
  estado: 'registrado',
  detalle: [{ producto_id: 14, nombre_producto: 'Café de olla', cantidad: 2, observaciones: 'Sin azúcar', precio_unitario: 40 }],
  total: 80,
  creado_en: '2026-10-14T18:30:00Z',
  motivo_cancelacion: null,
}

describe('aMesa (incluye los 4 campos nuevos de F3)', () => {
  it('pasa de snake_case a camelCase', () => {
    const dto: MesaDto = {
      id: 3, numero: 3, capacidad: 4, estado: 'ocupada',
      estado_cuenta: 'abierta', pedidos_activos: 2, total_cuenta: 470, pedidos_listos: 1,
    }
    expect(aMesa(dto)).toEqual({
      id: 3, numero: 3, capacidad: 4, estado: 'ocupada',
      estadoCuenta: 'abierta', pedidosActivos: 2, totalCuenta: 470, pedidosListos: 1, tipoPagoSolicitado: null,
    })
  })

  it('una mesa sin cuenta activa conserva null y los contadores en 0', () => {
    const dto: MesaDto = {
      id: 1, numero: 1, capacidad: 2, estado: 'libre',
      estado_cuenta: null, pedidos_activos: 0, total_cuenta: 0, pedidos_listos: 0,
    }
    const mesa = aMesa(dto)
    expect(mesa.estadoCuenta).toBeNull()
    expect(mesa).toMatchObject({ pedidosActivos: 0, totalCuenta: 0, pedidosListos: 0 })
  })

  it('el tipo de pago solicitado (F6) es opcional: si la API no lo envía queda en null', () => {
    const base: MesaDto = { id: 8, numero: 8, capacidad: 8, estado: 'ocupada', estado_cuenta: 'por_pagar', pedidos_activos: 1, total_cuenta: 480, pedidos_listos: 0 }
    expect(aMesa(base).tipoPagoSolicitado).toBeNull()
    expect(aMesa({ ...base, tipo_pago_solicitado: 'digital' }).tipoPagoSolicitado).toBe('digital')
    expect(aMesa({ ...base, tipo_pago_solicitado: null }).tipoPagoSolicitado).toBeNull()
  })

  it('una cuenta por pagar se conserva', () => {
    const mesa = aMesa({ id: 8, numero: 8, capacidad: 8, estado: 'ocupada', estado_cuenta: 'por_pagar', pedidos_activos: 1, total_cuenta: 480, pedidos_listos: 0 })
    expect(mesa.estadoCuenta).toBe('por_pagar')
  })
})

describe('aPedido', () => {
  it('mapea el pedido y su detalle (incluye mesa_numero de F5)', () => {
    expect(aPedido(pedidoDto)).toEqual({
      id: 6,
      mesaId: 11,
      mesaNumero: 11,
      cuentaId: 4,
      meseroId: 1,
      estado: 'registrado',
      detalle: [{ productoId: 14, nombreProducto: 'Café de olla', cantidad: 2, observaciones: 'Sin azúcar', precioUnitario: 40 }],
      total: 80,
      creadoEn: '2026-10-14T18:30:00Z',
      motivoCancelacion: null,
    })
  })

  it('el motivo de cancelación es texto libre y se conserva tal cual', () => {
    const pedido = aPedido({ ...pedidoDto, estado: 'cancelado', motivo_cancelacion: 'El cliente cambió de opinión' })
    expect(pedido.estado).toBe('cancelado')
    expect(pedido.motivoCancelacion).toBe('El cliente cambió de opinión')
  })

  it('un pedido sin líneas da un detalle vacío', () => {
    expect(aPedido({ ...pedidoDto, detalle: [] }).detalle).toEqual([])
  })
})

describe('aCuenta', () => {
  const dto: CuentaDto = {
    id: 4,
    mesa_id: 11,
    estado: 'abierta',
    pedidos: [pedidoDto],
    total: 80,
    abierta_en: '2026-10-14T18:20:00Z',
    tipo_pago_solicitado: null,
  }

  it('mapea la cuenta con sus pedidos y deja el tipo de pago en null', () => {
    const cuenta = aCuenta(dto)
    expect(cuenta).toMatchObject({ id: 4, mesaId: 11, estado: 'abierta', total: 80, abiertaEn: '2026-10-14T18:20:00Z', tipoPagoSolicitado: null })
    expect(cuenta.pedidos).toHaveLength(1)
    expect(cuenta.pedidos[0]?.mesaNumero).toBe(11)
  })

  it('una cuenta por pagar trae el tipo de pago solicitado', () => {
    expect(aCuenta({ ...dto, estado: 'por_pagar', tipo_pago_solicitado: 'digital' })).toMatchObject({
      estado: 'por_pagar',
      tipoPagoSolicitado: 'digital',
    })
  })
})

describe('menú y disponibilidad', () => {
  it('mapea categorías con sus productos', () => {
    const categoria = aCategoriaMenu({
      id: 1,
      nombre: 'Entradas',
      productos: [
        { id: 1, categoria_id: 1, nombre: 'Guacamole', descripcion: 'Aguacate', precio: 95, disponible: true },
        { id: 4, categoria_id: 1, nombre: 'Ceviche', descripcion: '', precio: 140, disponible: false },
      ],
    })
    expect(categoria.nombre).toBe('Entradas')
    expect(categoria.productos[0]).toEqual({ id: 1, categoriaId: 1, nombre: 'Guacamole', descripcion: 'Aguacate', precio: 95, disponible: true })
    expect(categoria.productos[1]?.disponible).toBe(false)
  })

  it('una categoría sin productos da un arreglo vacío', () => {
    expect(aCategoriaMenu({ id: 9, nombre: 'Vacía', productos: [] }).productos).toEqual([])
  })

  it('mapea la disponibilidad y el usuario', () => {
    expect(aDisponibilidad({ producto_id: 3, disponible: false })).toEqual({ productoId: 3, disponible: false })
    expect(aUsuario({ id: 1, nombre: 'Ana Torres', rol: 'mesero' })).toEqual({ id: 1, nombre: 'Ana Torres', rol: 'mesero' })
  })
})

describe('frontend → API (cuerpos de petición)', () => {
  it('un pedido nuevo va en snake_case y sin precios', () => {
    expect(deNuevoPedido({ mesaId: 11, detalle: [{ productoId: 14, cantidad: 2, observaciones: 'Sin azúcar' }] })).toEqual({
      mesa_id: 11,
      detalle: [{ producto_id: 14, cantidad: 2, observaciones: 'Sin azúcar' }],
    })
  })

  it('la edición reemplaza el detalle completo', () => {
    expect(deActualizacionPedido([{ productoId: 5, cantidad: 3, observaciones: '' }])).toEqual({
      detalle: [{ producto_id: 5, cantidad: 3, observaciones: '' }],
    })
  })

  it('la cancelación envía el motivo de texto libre, sin espacios sobrantes', () => {
    expect(deCancelacion('  Producto agotado ')).toEqual({ motivo: 'Producto agotado' })
  })

  it('la verificación de disponibilidad envía solo producto_id', () => {
    expect(deItemsDisponibilidad([{ productoId: 3 }, { productoId: 7 }])).toEqual({
      items: [{ producto_id: 3 }, { producto_id: 7 }],
    })
  })
})
