import { describe, expect, it } from 'vitest'
import type { EstadoPedido, Mesa } from '../types'
import {
  accionesDePedido,
  coincideConFiltro,
  esPedidoActivo,
  estaSinEntregar,
  filtroListaDesdeConsulta,
  motivoPedidoBloqueado,
  puedeRegistrarPedido,
  sumaAlTotal,
  textoCancelarBloqueado,
} from './reglas'

const ESTADOS: EstadoPedido[] = ['registrado', 'enviado', 'en_preparacion', 'listo', 'entregado', 'cancelado', 'pagado']

describe('accionesDePedido (qué permite cada estado)', () => {
  it('registrado: se puede editar, enviar y cancelar; no entregar', () => {
    expect(accionesDePedido('registrado')).toEqual({ editar: 'permitida', enviar: true, cancelar: 'permitida', entregar: false })
  })

  it('enviado: solo se puede cancelar', () => {
    expect(accionesDePedido('enviado')).toEqual({ editar: 'no_aplica', enviar: false, cancelar: 'permitida', entregar: false })
  })

  it('en_preparacion: cancelar queda bloqueado y exige al gerente', () => {
    const acciones = accionesDePedido('en_preparacion')
    expect(acciones.cancelar).toBe('requiere_gerente')
    expect(textoCancelarBloqueado(acciones.cancelar)).toBe('Requiere autorización del gerente')
    expect(acciones.editar).toBe('no_aplica')
    expect(acciones.enviar).toBe(false)
    expect(acciones.entregar).toBe(false)
  })

  it('listo: solo se puede marcar como entregado', () => {
    expect(accionesDePedido('listo')).toEqual({ editar: 'no_aplica', enviar: false, cancelar: 'no_aplica', entregar: true })
  })

  it.each(['entregado', 'cancelado', 'pagado'] as const)('%s: solo lectura', (estado) => {
    expect(accionesDePedido(estado)).toEqual({ editar: 'no_aplica', enviar: false, cancelar: 'no_aplica', entregar: false })
  })

  it('solo "entregar" está disponible en listo y solo "enviar" en registrado', () => {
    expect(ESTADOS.filter((e) => accionesDePedido(e).entregar)).toEqual(['listo'])
    expect(ESTADOS.filter((e) => accionesDePedido(e).enviar)).toEqual(['registrado'])
  })

  it('con la cuenta por pagar se bloquea editar y cancelar (suposición documentada)', () => {
    expect(accionesDePedido('registrado', true)).toMatchObject({ editar: 'cuenta_por_pagar', cancelar: 'cuenta_por_pagar', enviar: true })
    expect(accionesDePedido('enviado', true).cancelar).toBe('cuenta_por_pagar')
    expect(textoCancelarBloqueado('cuenta_por_pagar')).toContain('cuenta ya fue solicitada')
    // en preparación manda el motivo del gerente, no el de la cuenta
    expect(accionesDePedido('en_preparacion', true).cancelar).toBe('requiere_gerente')
  })

  it('un cancelar permitido no lleva texto de bloqueo', () => {
    expect(textoCancelarBloqueado('permitida')).toBeNull()
    expect(textoCancelarBloqueado('no_aplica')).toBeNull()
  })
})

describe('motivoPedidoBloqueado / puedeRegistrarPedido (mesa y cuenta)', () => {
  const mesa = (cambios: Partial<Mesa>): Pick<Mesa, 'numero' | 'estado' | 'estadoCuenta'> => ({
    numero: 7,
    estado: 'ocupada',
    estadoCuenta: 'abierta',
    ...cambios,
  })

  it('mesa ocupada con cuenta abierta: se puede', () => {
    expect(motivoPedidoBloqueado(mesa({}))).toBeNull()
    expect(puedeRegistrarPedido(mesa({}))).toBe(true)
  })

  it('mesa ocupada sin cuenta todavía: se puede (el primer pedido la abre)', () => {
    expect(puedeRegistrarPedido(mesa({ estadoCuenta: null }))).toBe(true)
  })

  it.each(['libre', 'reservada'] as const)('mesa %s: no se puede', (estado) => {
    expect(motivoPedidoBloqueado(mesa({ estado, estadoCuenta: null }))).toBe('La mesa 7 no está ocupada.')
    expect(puedeRegistrarPedido(mesa({ estado, estadoCuenta: null }))).toBe(false)
  })

  it('cuenta por pagar: no se puede, con su motivo', () => {
    expect(motivoPedidoBloqueado(mesa({ estadoCuenta: 'por_pagar' }))).toBe('La cuenta de la mesa 7 ya fue solicitada.')
  })
})

describe('estados y filtros', () => {
  it('activo = todo menos cancelado y pagado', () => {
    expect(ESTADOS.filter(esPedidoActivo)).toEqual(['registrado', 'enviado', 'en_preparacion', 'listo', 'entregado'])
  })

  it('el filtro "activos" y los filtros por estado', () => {
    expect(coincideConFiltro('entregado', 'activos')).toBe(true)
    expect(coincideConFiltro('cancelado', 'activos')).toBe(false)
    expect(coincideConFiltro('pagado', 'activos')).toBe(false)
    expect(coincideConFiltro('listo', 'listo')).toBe(true)
    expect(coincideConFiltro('enviado', 'listo')).toBe(false)
  })

  it('un valor desconocido de la URL vuelve a "activos"', () => {
    expect(filtroListaDesdeConsulta('en_preparacion')).toBe('en_preparacion')
    expect(filtroListaDesdeConsulta('pagado')).toBe('activos')
    expect(filtroListaDesdeConsulta(undefined)).toBe('activos')
  })

  it('"sin entregar" y "suma al total"', () => {
    expect(ESTADOS.filter(estaSinEntregar)).toEqual(['registrado', 'enviado', 'en_preparacion', 'listo'])
    expect(sumaAlTotal({ estado: 'cancelado' })).toBe(false)
    expect(sumaAlTotal({ estado: 'entregado' })).toBe(true)
  })
})
