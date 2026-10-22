import { describe, expect, it } from 'vitest'
import type { EstadoPedido, Pedido } from '../types'
import {
  avisoCancelacionGerente,
  coincideBusquedaPedido,
  coincideEstadoGerente,
  contarPorEstado,
  filtrarPedidosGerente,
  filtrosIniciales,
  gerentePuedeCancelarEstado,
  hayFiltrosExtra,
  motivoNoCancelableGerente,
  normalizarBusquedaPedido,
  opcionesMeseros,
  opcionesMesas,
  ordenarRecientes,
  permisoCancelarGerente,
  textoMostrando,
  unidadesDePedido,
  type FiltrosPedidosGerente,
} from './reglasGerente'
import { accionesDePedido } from './reglas'

/** Pedido mínimo para las pruebas: lo que no se indica no importa a las reglas. */
function pedido(p: Partial<Pedido> & Pick<Pedido, 'idPedido'>): Pedido {
  return {
    idCuenta: 1,
    idMesero: 1,
    nombreMesero: 'Ana Torres',
    estado: 'registrado',
    fechaHora: new Date(2026, 9, 21, 14, 0),
    idMotivo: null,
    detalle: [],
    idMesa: 1,
    mesaNumero: 1,
    motivoDescripcion: null,
    total: 0,
    ...p,
  }
}

const TODOS: FiltrosPedidosGerente = { dia: null, estado: 'todos', idMesa: null, idMesero: null, busqueda: '' }

describe('cancelar como gerente', () => {
  it.each<[EstadoPedido, boolean]>([
    ['registrado', true],
    ['enviado', true],
    ['pendiente', true], // `pendiente` (BD) = enviado a cocina
    ['en_preparacion', true],
    ['listo', false],
    ['entregado', false],
    ['pagado', false],
    ['cancelado', false],
    ['desconocido', false],
  ])('%s → %s', (estado, puede) => {
    expect(gerentePuedeCancelarEstado(estado)).toBe(puede)
    expect(permisoCancelarGerente(estado)).toBe(puede ? 'permitida' : 'estado_final')
    expect(motivoNoCancelableGerente(estado) === null).toBe(puede)
  })

  it('en preparación lo puede cancelar el gerente pero NO el mesero (regla del ERS)', () => {
    expect(permisoCancelarGerente('en_preparacion')).toBe('permitida')
    expect(accionesDePedido('en_preparacion').cancelar).toBe('requiere_gerente')
  })

  it('con la cuenta por pagar se bloquea aunque el estado lo permita (la API responde 409)', () => {
    expect(permisoCancelarGerente('en_preparacion', true)).toBe('cuenta_por_pagar')
    expect(motivoNoCancelableGerente('registrado', true)).toBe('La cuenta ya fue solicitada: no se pueden cancelar pedidos.')
    // Un estado final sigue explicando su propio motivo.
    expect(motivoNoCancelableGerente('entregado', true)).toBe('Ya se entregó en la mesa: no se puede cancelar.')
  })

  it('cada estado no cancelable tiene un motivo visible', () => {
    expect(motivoNoCancelableGerente('listo')).toMatch(/listo para entregar/)
    expect(motivoNoCancelableGerente('pagado')).toMatch(/cobró/)
    expect(motivoNoCancelableGerente('cancelado')).toMatch(/ya está cancelado/)
    expect(motivoNoCancelableGerente('desconocido')).toMatch(/no permite/)
  })

  it('solo avisa de la merma cuando cocina ya lo está preparando', () => {
    expect(avisoCancelacionGerente('en_preparacion')).toMatch(/Cocina ya lo está preparando/)
    expect(avisoCancelacionGerente('registrado')).toBeNull()
    expect(avisoCancelacionGerente('pendiente')).toBeNull()
  })
})

describe('filtro por estado', () => {
  it('«todos» incluye cualquier estado, también uno desconocido', () => {
    expect(coincideEstadoGerente('desconocido', 'todos')).toBe(true)
  })

  it('«activos» excluye cancelados y pagados', () => {
    expect(coincideEstadoGerente('entregado', 'activos')).toBe(true)
    expect(coincideEstadoGerente('cancelado', 'activos')).toBe(false)
    expect(coincideEstadoGerente('pagado', 'activos')).toBe(false)
  })

  it('«enviado» incluye los `pendiente` de la BD', () => {
    expect(coincideEstadoGerente('pendiente', 'enviado')).toBe(true)
    expect(coincideEstadoGerente('registrado', 'enviado')).toBe(false)
  })
})

describe('búsqueda por número de pedido', () => {
  it('acepta «12», «#12» y espacios', () => {
    expect(normalizarBusquedaPedido(' #12 ')).toBe('12')
    expect(normalizarBusquedaPedido('# 7')).toBe('7')
    expect(normalizarBusquedaPedido('007')).toBe('7')
    expect(normalizarBusquedaPedido('   ')).toBe('')
  })

  it('un texto que no es número no coincide con ningún pedido', () => {
    expect(normalizarBusquedaPedido('mesa 3')).toBeNull()
    expect(coincideBusquedaPedido(3, 'mesa 3')).toBe(false)
    expect(coincideBusquedaPedido(12, '12a')).toBe(false)
  })

  it('coincide por el inicio del número', () => {
    expect(coincideBusquedaPedido(12, '1')).toBe(true)
    expect(coincideBusquedaPedido(12, '#12')).toBe(true)
    expect(coincideBusquedaPedido(21, '1')).toBe(false)
    expect(coincideBusquedaPedido(5, '')).toBe(true)
  })
})

describe('filtrarPedidosGerente', () => {
  const hoy = new Date(2026, 9, 21, 15, 0)
  const pedidos = [
    pedido({ idPedido: 1, fechaHora: new Date(2026, 9, 21, 13, 0), estado: 'entregado', idMesa: 3, mesaNumero: 3 }),
    pedido({ idPedido: 2, fechaHora: new Date(2026, 9, 21, 14, 30), estado: 'en_preparacion', idMesa: 5, mesaNumero: 5, idMesero: 5, nombreMesero: 'Rosa Mesera' }),
    pedido({ idPedido: 3, fechaHora: new Date(2026, 9, 20, 21, 0), estado: 'pagado', idMesa: 3, mesaNumero: 3 }),
    pedido({ idPedido: 4, fechaHora: new Date(2026, 9, 20, 22, 0), estado: 'cancelado', idMesa: 5, mesaNumero: 5, idMesero: 5, nombreMesero: 'Rosa Mesera' }),
    pedido({ idPedido: 12, fechaHora: new Date(2026, 9, 21, 0, 5), estado: 'pendiente', idMesa: 8, mesaNumero: 8 }),
  ]

  it('por defecto muestra solo los de hoy, del más reciente al más antiguo', () => {
    const f = filtrosIniciales(hoy)
    expect(f.dia).toBe('2026-10-21')
    expect(filtrarPedidosGerente(pedidos, f).map((p) => p.idPedido)).toEqual([2, 1, 12])
  })

  it('«todos los días» (dia = null) incluye el historial', () => {
    expect(filtrarPedidosGerente(pedidos, TODOS).map((p) => p.idPedido)).toEqual([2, 1, 12, 4, 3])
  })

  it('el día se compara en hora local, también cerca de la medianoche', () => {
    expect(filtrarPedidosGerente(pedidos, { ...TODOS, dia: '2026-10-20' }).map((p) => p.idPedido)).toEqual([4, 3])
  })

  it('combina mesa, mesero, estado y búsqueda', () => {
    expect(filtrarPedidosGerente(pedidos, { ...TODOS, idMesa: 5 }).map((p) => p.idPedido)).toEqual([2, 4])
    expect(filtrarPedidosGerente(pedidos, { ...TODOS, idMesero: 5, estado: 'activos' }).map((p) => p.idPedido)).toEqual([2])
    expect(filtrarPedidosGerente(pedidos, { ...TODOS, busqueda: '1' }).map((p) => p.idPedido)).toEqual([1, 12])
    expect(filtrarPedidosGerente(pedidos, { ...TODOS, estado: 'enviado' }).map((p) => p.idPedido)).toEqual([12])
  })

  it('cuenta por estado respetando los demás filtros (no el de estado)', () => {
    const conteo = contarPorEstado(pedidos, { ...filtrosIniciales(hoy), estado: 'cancelado' })
    expect(conteo.todos).toBe(3)
    expect(conteo.activos).toBe(3)
    expect(conteo.en_preparacion).toBe(1)
    expect(conteo.enviado).toBe(1)
    expect(conteo.cancelado).toBe(0)
    expect(contarPorEstado(pedidos, TODOS).cancelado).toBe(1)
  })

  it('ofrece las mesas y meseros que aparecen en los pedidos, sin repetir y ordenados', () => {
    expect(opcionesMesas(pedidos)).toEqual([
      { idMesa: 3, numero: 3 },
      { idMesa: 5, numero: 5 },
      { idMesa: 8, numero: 8 },
    ])
    expect(opcionesMeseros(pedidos)).toEqual([
      { idMesero: 1, nombre: 'Ana Torres' },
      { idMesero: 5, nombre: 'Rosa Mesera' },
    ])
  })

  it('detecta si hay filtros además del día', () => {
    expect(hayFiltrosExtra(filtrosIniciales(hoy))).toBe(false)
    expect(hayFiltrosExtra({ ...filtrosIniciales(hoy), busqueda: ' 3 ' })).toBe(true)
    expect(hayFiltrosExtra({ ...filtrosIniciales(hoy), idMesero: 1 })).toBe(true)
  })
})

describe('utilidades de la lista', () => {
  it('ordena por fecha y desempata por número de pedido', () => {
    const misma = new Date(2026, 9, 21, 12, 0)
    const lista = ordenarRecientes([pedido({ idPedido: 1, fechaHora: misma }), pedido({ idPedido: 2, fechaHora: misma })])
    expect(lista.map((p) => p.idPedido)).toEqual([2, 1])
  })

  it('cuenta unidades, no líneas', () => {
    const p = pedido({
      idPedido: 1,
      detalle: [
        { idProducto: 1, nombreProducto: 'A', cantidad: 2, indicaciones: '', precioUnitario: 10 },
        { idProducto: 2, nombreProducto: 'B', cantidad: 3, indicaciones: '', precioUnitario: 10 },
      ],
    })
    expect(unidadesDePedido(p)).toBe(5)
  })

  it('«Mostrando N de M» solo cuando se recorta la lista', () => {
    expect(textoMostrando(8, 23)).toBe('Mostrando 8 de 23 pedidos')
    expect(textoMostrando(0, 1)).toBe('Mostrando 0 de 1 pedido')
    expect(textoMostrando(23, 23)).toBeNull()
  })
})
