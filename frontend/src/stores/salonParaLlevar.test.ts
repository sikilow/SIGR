// Pedidos para llevar en el Salón de la hostess: ella los asigna a una mesa virtual y el mesero toma el pedido.
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mesa } from '../types'

const mesa = (numero: number, extra: Partial<Mesa>): Mesa => ({
  idMesa: numero,
  numero,
  capacidad: 4,
  estado: 'libre',
  zona: 'Salón',
  caracteristicas: [],
  estadoCuenta: null,
  pedidosActivos: 0,
  totalCuenta: 0,
  pedidosListos: 0,
  tipoPagoSolicitado: null,
  ...extra,
})

const servicios = vi.hoisted(() => ({
  hostess: { listarMesas: vi.fn(), listarReservaciones: vi.fn(), listarEspera: vi.fn() },
  mesas: { listar: vi.fn(), liberarParaLlevar: vi.fn() },
}))
vi.mock('../services', () => ({ servicios }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  servicios.hostess.listarMesas.mockResolvedValue([])
  servicios.hostess.listarReservaciones.mockResolvedValue([])
  servicios.hostess.listarEspera.mockResolvedValue([])
  servicios.mesas.listar.mockResolvedValue([
    mesa(1, {}),
    mesa(101, { zona: 'Para llevar', esParaLlevar: true, estado: 'ocupada', canal: 'Rappi', referencia: 'Pedro D', estadoCuenta: 'abierta' }),
    mesa(102, { zona: 'Para llevar', esParaLlevar: true, estado: 'libre' }),
  ])
})

describe('Salón de la hostess: pedidos para llevar', () => {
  it('solo lista las mesas virtuales ocupadas, con su canal y referencia', async () => {
    const { useSalonStore } = await import('./salon')
    const store = useSalonStore()
    await store.cargar()
    expect(store.paraLlevar.map((m) => m.numero)).toEqual([101])
    expect(store.paraLlevar[0]).toMatchObject({ canal: 'Rappi', referencia: 'Pedro D' })
    expect(store.errorLateral).toBeNull()
  })

  it('liberar un pedido sin productos llama al servicio y recarga el salón', async () => {
    const { useSalonStore } = await import('./salon')
    const store = useSalonStore()
    await store.cargar()
    servicios.mesas.liberarParaLlevar.mockResolvedValue(undefined)
    servicios.mesas.listar.mockResolvedValue([mesa(101, { zona: 'Para llevar', esParaLlevar: true, estado: 'libre' })])
    await store.liberarParaLlevar(101)
    expect(servicios.mesas.liberarParaLlevar).toHaveBeenCalledWith(101)
    expect(store.paraLlevar).toEqual([])
  })

  it('si el servidor rechaza liberar, el error llega a la pantalla y el salón se recarga', async () => {
    const { useSalonStore } = await import('./salon')
    const store = useSalonStore()
    await store.cargar()
    servicios.mesas.liberarParaLlevar.mockRejectedValue(new Error('El pedido tiene productos: cancélalos o cóbralo en Caja.'))
    await expect(store.liberarParaLlevar(101)).rejects.toThrow(/tiene productos/)
    expect(store.paraLlevar.map((m) => m.numero)).toEqual([101])
  })

  it('si falla la lista de mesas virtuales se avisa sin perder lo demás', async () => {
    const { useSalonStore } = await import('./salon')
    const store = useSalonStore()
    servicios.mesas.listar.mockRejectedValue(new Error('sin conexión'))
    await store.cargar()
    expect(store.errorLateral).toMatch(/sin conexión/)
    expect(store.error).toBeNull()
  })
})
