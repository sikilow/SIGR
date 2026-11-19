// Pedidos para llevar de la hostess: ella los asigna a una mesa virtual y el mesero toma el pedido.
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
  mesas: { listar: vi.fn(), liberarParaLlevar: vi.fn() },
}))
vi.mock('../services', () => ({ servicios }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  servicios.mesas.listar.mockResolvedValue([
    mesa(1, {}),
    mesa(101, { zona: 'Para llevar', esParaLlevar: true, estado: 'ocupada', canal: 'Rappi', referencia: 'Pedro D', estadoCuenta: 'abierta' }),
    mesa(102, { zona: 'Para llevar', esParaLlevar: true, estado: 'libre' }),
  ])
})

describe('store de pedidos para llevar (hostess)', () => {
  it('solo lista las mesas virtuales ocupadas, con su canal y referencia', async () => {
    const { useParaLlevarStore } = await import('./paraLlevar')
    const store = useParaLlevarStore()
    await store.cargar()
    expect(store.pedidos.map((m) => m.numero)).toEqual([101])
    expect(store.pedidos[0]).toMatchObject({ canal: 'Rappi', referencia: 'Pedro D' })
    expect(store.error).toBeNull()
    expect(store.ultimaActualizacion).not.toBeNull()
  })

  it('liberar un pedido sin productos llama al servicio y recarga la lista', async () => {
    const { useParaLlevarStore } = await import('./paraLlevar')
    const store = useParaLlevarStore()
    await store.cargar()
    servicios.mesas.liberarParaLlevar.mockResolvedValue(undefined)
    servicios.mesas.listar.mockResolvedValue([mesa(101, { zona: 'Para llevar', esParaLlevar: true, estado: 'libre' })])
    await store.liberar(101)
    expect(servicios.mesas.liberarParaLlevar).toHaveBeenCalledWith(101)
    expect(store.pedidos).toEqual([])
  })

  it('si el servidor rechaza liberar, el error llega a la pantalla y la lista se recarga', async () => {
    const { useParaLlevarStore } = await import('./paraLlevar')
    const store = useParaLlevarStore()
    await store.cargar()
    servicios.mesas.liberarParaLlevar.mockRejectedValue(new Error('El pedido tiene productos: cancélalos o cóbralo en Caja.'))
    await expect(store.liberar(101)).rejects.toThrow(/tiene productos/)
    expect(store.pedidos.map((m) => m.numero)).toEqual([101])
  })

  it('si falla la carga conserva los pedidos anteriores y guarda el error', async () => {
    const { useParaLlevarStore } = await import('./paraLlevar')
    const store = useParaLlevarStore()
    await store.cargar()
    servicios.mesas.listar.mockRejectedValue(new Error('sin conexión'))
    await store.cargar()
    expect(store.error).toMatch(/sin conexión/)
    expect(store.pedidos.map((m) => m.numero)).toEqual([101])
  })
})
